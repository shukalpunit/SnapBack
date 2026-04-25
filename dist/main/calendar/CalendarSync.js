"use strict";
/**
 * CalendarSync — Google Calendar API integration (opt-in).
 *
 * Handles OAuth 2.0 authorization, event fetching, caching in LocalStore,
 * active event lookup, and revocation with 30-second deadline. Tokens are
 * stored in the OS keychain via keytar, never in the LocalStore.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarSync = void 0;
const node_crypto_1 = require("node:crypto");
// ─── Constants ───────────────────────────────────────────────────────────────
const KEYCHAIN_SERVICE = 'snapback-calendar-sync';
const KEYCHAIN_ACCOUNT_ACCESS = 'google-access-token';
const KEYCHAIN_ACCOUNT_REFRESH = 'google-refresh-token';
/** Revocation deadline in milliseconds. */
const REVOCATION_DEADLINE_MS = 30_000;
// ─── CalendarSync ────────────────────────────────────────────────────────────
class CalendarSync {
    store;
    keychain;
    apiClient;
    bannerNotifier;
    authFlowTrigger;
    networkGuardHook;
    authorized = false;
    constructor(store, keychain, apiClient, options) {
        this.store = store;
        this.keychain = keychain;
        this.apiClient = apiClient;
        this.bannerNotifier = options?.bannerNotifier ?? null;
        this.authFlowTrigger = options?.authFlowTrigger ?? null;
        this.networkGuardHook = options?.networkGuardHook ?? null;
    }
    async authorize() {
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
    async fetchEvents(fromDate, toDate) {
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
        }
        catch (err) {
            // API error or network unavailability — show banner, use cached data
            this.showBanner('Calendar sync failed — showing cached events.');
            return this.getCachedEvents(fromDate, toDate);
        }
    }
    async revokeAuthorization() {
        const startTime = Date.now();
        // Delete calendar events from LocalStore within 30 seconds
        try {
            this.store.deleteAllCalendarEvents();
        }
        catch {
            // Retry once
            const elapsed = Date.now() - startTime;
            if (elapsed < REVOCATION_DEADLINE_MS) {
                try {
                    this.store.deleteAllCalendarEvents();
                }
                catch (retryErr) {
                    // Log critical audit event
                    this.store.insertAuditLog({
                        id: (0, node_crypto_1.randomUUID)(),
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
        }
        catch {
            // Best effort — tokens may already be gone
        }
        this.authorized = false;
        // Remove Google Calendar API from NetworkGuard allowlist
        this.networkGuardHook?.revoke();
    }
    getActiveEvent(timestamp) {
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
    isAuthorized() {
        return this.authorized;
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    getCachedEvents(fromDate, toDate) {
        return this.store.queryCalendarEvents(fromDate.getTime(), toDate.getTime());
    }
    showBanner(message) {
        if (this.bannerNotifier) {
            this.bannerNotifier(message);
        }
    }
}
exports.CalendarSync = CalendarSync;
