/**
 * CalendarSync — Google Calendar API integration (opt-in).
 *
 * Handles OAuth 2.0 authorization, event fetching, caching in LocalStore,
 * active event lookup, and revocation with 30-second deadline. Tokens are
 * stored in the OS keychain via keytar, never in the LocalStore.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { randomUUID } from 'node:crypto';
import type {
  CalendarEvent,
  ICalendarSync,
  ILocalStore,
} from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Abstraction over keytar for OS keychain access (injectable for testing). */
export interface KeychainProvider {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/** Abstraction over the Google Calendar API HTTP calls (injectable for testing). */
export interface CalendarAPIClient {
  fetchEvents(token: string, fromDate: Date, toDate: Date): Promise<CalendarEvent[]>;
  refreshToken(refreshToken: string): Promise<string>;
}

/** Callback for displaying non-blocking UI banners. */
export type BannerNotifier = (message: string) => void;

/** Callback for triggering the OAuth authorization flow in the renderer. */
export type AuthFlowTrigger = () => Promise<{ accessToken: string; refreshToken: string } | null>;

// ─── Constants ───────────────────────────────────────────────────────────────

const KEYCHAIN_SERVICE = 'snapback-calendar-sync';
const KEYCHAIN_ACCOUNT_ACCESS = 'google-access-token';
const KEYCHAIN_ACCOUNT_REFRESH = 'google-refresh-token';

/** Revocation deadline in milliseconds. */
const REVOCATION_DEADLINE_MS = 30_000;

// ─── CalendarSync ────────────────────────────────────────────────────────────

export class CalendarSync implements ICalendarSync {
  private store: ILocalStore;
  private keychain: KeychainProvider;
  private apiClient: CalendarAPIClient;
  private bannerNotifier: BannerNotifier | null;
  private authFlowTrigger: AuthFlowTrigger | null;
  private networkGuardHook: { authorize: () => void; revoke: () => void } | null;

  private authorized = false;

  constructor(
    store: ILocalStore,
    keychain: KeychainProvider,
    apiClient: CalendarAPIClient,
    options?: {
      bannerNotifier?: BannerNotifier;
      authFlowTrigger?: AuthFlowTrigger;
      networkGuardHook?: { authorize: () => void; revoke: () => void };
    }
  ) {
    this.store = store;
    this.keychain = keychain;
    this.apiClient = apiClient;
    this.bannerNotifier = options?.bannerNotifier ?? null;
    this.authFlowTrigger = options?.authFlowTrigger ?? null;
    this.networkGuardHook = options?.networkGuardHook ?? null;
  }

  async authorize(): Promise<void> {
    if (!this.authFlowTrigger) {
      throw new Error('No auth flow trigger configured');
    }

    const result = await this.authFlowTrigger();
    if (!result) {
      throw new Error('Authorization was declined by the user');
    }

    await this.keychain.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS, result.accessToken);
    await this.keychain.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_REFRESH, result.refreshToken);

    this.authorized = true;

    // Add Google Calendar API to NetworkGuard allowlist
    this.networkGuardHook?.authorize();
  }

  async fetchEvents(fromDate: Date, toDate: Date): Promise<CalendarEvent[]> {
    const token = await this.keychain.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS);
    if (!token) {
      this.showBanner('Calendar sync not authorized — please authorize in Settings.');
      return this.getCachedEvents(fromDate, toDate);
    }

    try {
      const events = await this.apiClient.fetchEvents(token, fromDate, toDate);

      // Upsert into LocalStore
      for (const event of events) {
        this.store.upsertCalendarEvent({
          ...event,
          syncedAt: Date.now(),
        });
      }

      return events;
    } catch (err) {
      // API error or network unavailability — show banner, use cached data
      this.showBanner('Calendar sync failed — showing cached events.');
      return this.getCachedEvents(fromDate, toDate);
    }
  }

  async revokeAuthorization(): Promise<void> {
    const startTime = Date.now();

    // Delete calendar events from LocalStore within 30 seconds
    try {
      this.store.deleteAllCalendarEvents();
    } catch {
      // Retry once
      const elapsed = Date.now() - startTime;
      if (elapsed < REVOCATION_DEADLINE_MS) {
        try {
          this.store.deleteAllCalendarEvents();
        } catch (retryErr) {
          // Log critical audit event
          this.store.insertAuditLog({
            id: randomUUID(),
            timestamp: Date.now(),
            eventType: 'calendar_revocation_failed',
            detail: String(retryErr),
          });
        }
      }
    }

    // Clear tokens from keychain
    try {
      await this.keychain.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS);
      await this.keychain.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_REFRESH);
    } catch {
      // Best effort — tokens may already be gone
    }

    this.authorized = false;

    // Remove Google Calendar API from NetworkGuard allowlist
    this.networkGuardHook?.revoke();
  }

  getActiveEvent(timestamp: number): CalendarEvent | null {
    // Query events that overlap the given timestamp
    // We query a wide range and filter for startTime ≤ t < endTime
    const events = this.store.queryCalendarEvents(0, Number.MAX_SAFE_INTEGER);
    for (const event of events) {
      if (event.startTime <= timestamp && timestamp < event.endTime) {
        return event;
      }
    }
    return null;
  }

  /** Check if Calendar Sync is currently authorized. */
  isAuthorized(): boolean {
    return this.authorized;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private getCachedEvents(fromDate: Date, toDate: Date): CalendarEvent[] {
    return this.store.queryCalendarEvents(fromDate.getTime(), toDate.getTime());
  }

  private showBanner(message: string): void {
    if (this.bannerNotifier) {
      this.bannerNotifier(message);
    }
  }
}
