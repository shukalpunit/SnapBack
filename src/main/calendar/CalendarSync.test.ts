// Feature: snapback-productivity-suite, Property 20: Calendar Event Active Lookup
// Feature: snapback-productivity-suite, Property 21: Calendar Revocation Completeness
// Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { CalendarSync, type KeychainProvider, type CalendarAPIClient } from './CalendarSync.js';
import { LocalStore } from '../store/LocalStore.js';
import type { CalendarEvent } from '../types.js';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function mockKeychain(): KeychainProvider {
  const store = new Map<string, string>();
  return {
    async getPassword(_service: string, account: string) {
      return store.get(account) ?? null;
    },
    async setPassword(_service: string, account: string, password: string) {
      store.set(account, password);
    },
    async deletePassword(_service: string, account: string) {
      return store.delete(account);
    },
  };
}

function mockAPIClient(events: CalendarEvent[] = []): CalendarAPIClient {
  return {
    async fetchEvents() { return events; },
    async refreshToken() { return 'new-token'; },
  };
}

function mockFailingAPIClient(): CalendarAPIClient {
  return {
    async fetchEvents() { throw new Error('Network error'); },
    async refreshToken() { throw new Error('Network error'); },
  };
}

function makeEvent(id: string, start: number, end: number, title = 'Meeting'): CalendarEvent {
  return { id, title, startTime: start, endTime: end, calendarId: 'primary', syncedAt: Date.now() };
}

// ─── Property 20: Calendar Event Active Lookup ───────────────────────────────

describe('Property 20: Calendar Event Active Lookup', () => {
  it('returns the event when timestamp falls within [startTime, endTime)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (startTime, duration) => {
          const store = new LocalStore(':memory:');
          const keychain = mockKeychain();
          const sync = new CalendarSync(store, keychain, mockAPIClient());

          const endTime = startTime + duration;
          const event = makeEvent('evt-1', startTime, endTime);
          store.upsertCalendarEvent(event);

          // Any timestamp in [startTime, endTime) should return the event
          const midpoint = startTime + Math.floor(duration / 2);
          const result = sync.getActiveEvent(midpoint);

          const atStart = sync.getActiveEvent(startTime);

          store.close();
          return (
            result !== null &&
            result.id === 'evt-1' &&
            atStart !== null &&
            atStart.id === 'evt-1'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null when timestamp is outside all events', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 500_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (startTime, duration) => {
          const store = new LocalStore(':memory:');
          const keychain = mockKeychain();
          const sync = new CalendarSync(store, keychain, mockAPIClient());

          const endTime = startTime + duration;
          store.upsertCalendarEvent(makeEvent('evt-1', startTime, endTime));

          // Timestamp at endTime (exclusive) should return null
          const atEnd = sync.getActiveEvent(endTime);
          // Timestamp before start should return null
          const beforeStart = sync.getActiveEvent(startTime - 1);

          store.close();
          return atEnd === null && beforeStart === null;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 21: Calendar Revocation Completeness ───────────────────────────

describe('Property 21: Calendar Revocation Completeness', () => {
  it('after revokeAuthorization, queryCalendarEvents returns empty for any range', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 64 }),
            startTime: fc.integer({ min: 1000, max: 1_000_000 }),
            endTime: fc.integer({ min: 1_000_001, max: 2_000_000 }),
            calendarId: fc.constant('primary'),
            syncedAt: fc.integer({ min: 1000, max: 2_000_000 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (events) => {
          const store = new LocalStore(':memory:');
          const keychain = mockKeychain();
          const sync = new CalendarSync(store, keychain, mockAPIClient());

          // Populate
          for (const evt of events) {
            store.upsertCalendarEvent(evt);
          }

          await sync.revokeAuthorization();

          const result = store.queryCalendarEvents(0, Number.MAX_SAFE_INTEGER);
          store.close();
          return result.length === 0;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Unit Tests ──────────────────────────────────────────────────────────────

describe('CalendarSync — unit tests', () => {
  let store: LocalStore;
  let keychain: KeychainProvider;

  beforeEach(() => {
    store = new LocalStore(':memory:');
    keychain = mockKeychain();
  });

  afterEach(() => {
    store.close();
  });

  it('authorize stores tokens in keychain and sets authorized flag', async () => {
    const sync = new CalendarSync(store, keychain, mockAPIClient(), {
      authFlowTrigger: async () => ({ accessToken: 'at-123', refreshToken: 'rt-456' }),
    });

    await sync.authorize();

    expect(sync.isAuthorized()).toBe(true);
    expect(await keychain.getPassword('snapback-calendar-sync', 'google-access-token')).toBe('at-123');
    expect(await keychain.getPassword('snapback-calendar-sync', 'google-refresh-token')).toBe('rt-456');
  });

  it('authorize calls networkGuardHook.authorize', async () => {
    const authorizeFn = vi.fn();
    const sync = new CalendarSync(store, keychain, mockAPIClient(), {
      authFlowTrigger: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
      networkGuardHook: { authorize: authorizeFn, revoke: vi.fn() },
    });

    await sync.authorize();
    expect(authorizeFn).toHaveBeenCalledOnce();
  });

  it('authorize throws when user declines', async () => {
    const sync = new CalendarSync(store, keychain, mockAPIClient(), {
      authFlowTrigger: async () => null,
    });

    await expect(sync.authorize()).rejects.toThrow('declined');
  });

  it('authorize throws when no auth flow trigger configured', async () => {
    const sync = new CalendarSync(store, keychain, mockAPIClient());
    await expect(sync.authorize()).rejects.toThrow('No auth flow trigger');
  });

  it('fetchEvents stores events in LocalStore', async () => {
    const events = [
      makeEvent('e1', 1000, 2000, 'Standup'),
      makeEvent('e2', 3000, 4000, 'Review'),
    ];
    await keychain.setPassword('snapback-calendar-sync', 'google-access-token', 'token');

    const sync = new CalendarSync(store, keychain, mockAPIClient(events));
    const result = await sync.fetchEvents(new Date(0), new Date(5000));

    expect(result).toHaveLength(2);
    const stored = store.queryCalendarEvents(0, 5000);
    expect(stored).toHaveLength(2);
  });

  it('fetchEvents falls back to cached data on API error', async () => {
    // Pre-populate cache
    store.upsertCalendarEvent(makeEvent('cached-1', 1000, 2000, 'Cached Meeting'));
    await keychain.setPassword('snapback-calendar-sync', 'google-access-token', 'token');

    const bannerMessages: string[] = [];
    const sync = new CalendarSync(store, keychain, mockFailingAPIClient(), {
      bannerNotifier: (msg) => bannerMessages.push(msg),
    });

    const result = await sync.fetchEvents(new Date(0), new Date(3000));

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Cached Meeting');
    expect(bannerMessages).toHaveLength(1);
    expect(bannerMessages[0]).toContain('failed');
  });

  it('fetchEvents shows banner when not authorized', async () => {
    const bannerMessages: string[] = [];
    const sync = new CalendarSync(store, keychain, mockAPIClient(), {
      bannerNotifier: (msg) => bannerMessages.push(msg),
    });

    await sync.fetchEvents(new Date(0), new Date(5000));
    expect(bannerMessages).toHaveLength(1);
    expect(bannerMessages[0]).toContain('not authorized');
  });

  it('revokeAuthorization deletes all calendar events', async () => {
    store.upsertCalendarEvent(makeEvent('e1', 1000, 2000));
    store.upsertCalendarEvent(makeEvent('e2', 3000, 4000));

    const sync = new CalendarSync(store, keychain, mockAPIClient());
    await sync.revokeAuthorization();

    expect(store.queryCalendarEvents(0, Number.MAX_SAFE_INTEGER)).toHaveLength(0);
  });

  it('revokeAuthorization clears keychain tokens', async () => {
    await keychain.setPassword('snapback-calendar-sync', 'google-access-token', 'at');
    await keychain.setPassword('snapback-calendar-sync', 'google-refresh-token', 'rt');

    const sync = new CalendarSync(store, keychain, mockAPIClient());
    await sync.revokeAuthorization();

    expect(await keychain.getPassword('snapback-calendar-sync', 'google-access-token')).toBeNull();
    expect(await keychain.getPassword('snapback-calendar-sync', 'google-refresh-token')).toBeNull();
  });

  it('revokeAuthorization calls networkGuardHook.revoke', async () => {
    const revokeFn = vi.fn();
    const sync = new CalendarSync(store, keychain, mockAPIClient(), {
      networkGuardHook: { authorize: vi.fn(), revoke: revokeFn },
    });

    await sync.revokeAuthorization();
    expect(revokeFn).toHaveBeenCalledOnce();
  });

  it('revokeAuthorization sets authorized to false', async () => {
    const sync = new CalendarSync(store, keychain, mockAPIClient(), {
      authFlowTrigger: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
    });

    await sync.authorize();
    expect(sync.isAuthorized()).toBe(true);

    await sync.revokeAuthorization();
    expect(sync.isAuthorized()).toBe(false);
  });

  it('getActiveEvent returns event when timestamp is within range', () => {
    store.upsertCalendarEvent(makeEvent('e1', 1000, 2000, 'Standup'));
    const sync = new CalendarSync(store, keychain, mockAPIClient());

    expect(sync.getActiveEvent(1500)?.title).toBe('Standup');
    expect(sync.getActiveEvent(1000)?.title).toBe('Standup'); // inclusive start
  });

  it('getActiveEvent returns null at endTime (exclusive)', () => {
    store.upsertCalendarEvent(makeEvent('e1', 1000, 2000));
    const sync = new CalendarSync(store, keychain, mockAPIClient());

    expect(sync.getActiveEvent(2000)).toBeNull();
  });

  it('getActiveEvent returns null when no events match', () => {
    const sync = new CalendarSync(store, keychain, mockAPIClient());
    expect(sync.getActiveEvent(5000)).toBeNull();
  });
});
