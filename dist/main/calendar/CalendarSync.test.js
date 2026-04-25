"use strict";
// Feature: snapback-productivity-suite, Property 20: Calendar Event Active Lookup
// Feature: snapback-productivity-suite, Property 21: Calendar Revocation Completeness
// Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const CalendarSync_js_1 = require("./CalendarSync.js");
const LocalStore_js_1 = require("../store/LocalStore.js");
// ─── Mock Factories ──────────────────────────────────────────────────────────
function mockKeychain() {
    const store = new Map();
    return {
        async getPassword(_service, account) {
            return store.get(account) ?? null;
        },
        async setPassword(_service, account, password) {
            store.set(account, password);
        },
        async deletePassword(_service, account) {
            return store.delete(account);
        },
    };
}
function mockAPIClient(events = []) {
    return {
        async fetchEvents() { return events; },
        async refreshToken() { return 'new-token'; },
    };
}
function mockFailingAPIClient() {
    return {
        async fetchEvents() { throw new Error('Network error'); },
        async refreshToken() { throw new Error('Network error'); },
    };
}
function makeEvent(id, start, end, title = 'Meeting') {
    return { id, title, startTime: start, endTime: end, calendarId: 'primary', syncedAt: Date.now() };
}
// ─── Property 20: Calendar Event Active Lookup ───────────────────────────────
(0, vitest_1.describe)('Property 20: Calendar Event Active Lookup', () => {
    (0, vitest_1.it)('returns the event when timestamp falls within [startTime, endTime)', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: 1000, max: 1_000_000 }), fast_check_1.default.integer({ min: 1, max: 100_000 }), (startTime, duration) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const keychain = mockKeychain();
            const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
            const endTime = startTime + duration;
            const event = makeEvent('evt-1', startTime, endTime);
            store.upsertCalendarEvent(event);
            // Any timestamp in [startTime, endTime) should return the event
            const midpoint = startTime + Math.floor(duration / 2);
            const result = sync.getActiveEvent(midpoint);
            const atStart = sync.getActiveEvent(startTime);
            store.close();
            return (result !== null &&
                result.id === 'evt-1' &&
                atStart !== null &&
                atStart.id === 'evt-1');
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('returns null when timestamp is outside all events', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: 1000, max: 500_000 }), fast_check_1.default.integer({ min: 1, max: 100_000 }), (startTime, duration) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const keychain = mockKeychain();
            const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
            const endTime = startTime + duration;
            store.upsertCalendarEvent(makeEvent('evt-1', startTime, endTime));
            // Timestamp at endTime (exclusive) should return null
            const atEnd = sync.getActiveEvent(endTime);
            // Timestamp before start should return null
            const beforeStart = sync.getActiveEvent(startTime - 1);
            store.close();
            return atEnd === null && beforeStart === null;
        }), { numRuns: 100 });
    });
});
// ─── Property 21: Calendar Revocation Completeness ───────────────────────────
(0, vitest_1.describe)('Property 21: Calendar Revocation Completeness', () => {
    (0, vitest_1.it)('after revokeAuthorization, queryCalendarEvents returns empty for any range', () => {
        fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.array(fast_check_1.default.record({
            id: fast_check_1.default.uuid(),
            title: fast_check_1.default.string({ minLength: 1, maxLength: 64 }),
            startTime: fast_check_1.default.integer({ min: 1000, max: 1_000_000 }),
            endTime: fast_check_1.default.integer({ min: 1_000_001, max: 2_000_000 }),
            calendarId: fast_check_1.default.constant('primary'),
            syncedAt: fast_check_1.default.integer({ min: 1000, max: 2_000_000 }),
        }), { minLength: 1, maxLength: 10 }), async (events) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const keychain = mockKeychain();
            const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
            // Populate
            for (const evt of events) {
                store.upsertCalendarEvent(evt);
            }
            await sync.revokeAuthorization();
            const result = store.queryCalendarEvents(0, Number.MAX_SAFE_INTEGER);
            store.close();
            return result.length === 0;
        }), { numRuns: 50 });
    });
});
// ─── Unit Tests ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('CalendarSync — unit tests', () => {
    let store;
    let keychain;
    (0, vitest_1.beforeEach)(() => {
        store = new LocalStore_js_1.LocalStore(':memory:');
        keychain = mockKeychain();
    });
    (0, vitest_1.afterEach)(() => {
        store.close();
    });
    (0, vitest_1.it)('authorize stores tokens in keychain and sets authorized flag', async () => {
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(), {
            authFlowTrigger: async () => ({ accessToken: 'at-123', refreshToken: 'rt-456' }),
        });
        await sync.authorize();
        (0, vitest_1.expect)(sync.isAuthorized()).toBe(true);
        (0, vitest_1.expect)(await keychain.getPassword('snapback-calendar-sync', 'google-access-token')).toBe('at-123');
        (0, vitest_1.expect)(await keychain.getPassword('snapback-calendar-sync', 'google-refresh-token')).toBe('rt-456');
    });
    (0, vitest_1.it)('authorize calls networkGuardHook.authorize', async () => {
        const authorizeFn = vitest_1.vi.fn();
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(), {
            authFlowTrigger: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
            networkGuardHook: { authorize: authorizeFn, revoke: vitest_1.vi.fn() },
        });
        await sync.authorize();
        (0, vitest_1.expect)(authorizeFn).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('authorize throws when user declines', async () => {
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(), {
            authFlowTrigger: async () => null,
        });
        await (0, vitest_1.expect)(sync.authorize()).rejects.toThrow('declined');
    });
    (0, vitest_1.it)('authorize throws when no auth flow trigger configured', async () => {
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
        await (0, vitest_1.expect)(sync.authorize()).rejects.toThrow('No auth flow trigger');
    });
    (0, vitest_1.it)('fetchEvents stores events in LocalStore', async () => {
        const events = [
            makeEvent('e1', 1000, 2000, 'Standup'),
            makeEvent('e2', 3000, 4000, 'Review'),
        ];
        await keychain.setPassword('snapback-calendar-sync', 'google-access-token', 'token');
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(events));
        const result = await sync.fetchEvents(new Date(0), new Date(5000));
        (0, vitest_1.expect)(result).toHaveLength(2);
        const stored = store.queryCalendarEvents(0, 5000);
        (0, vitest_1.expect)(stored).toHaveLength(2);
    });
    (0, vitest_1.it)('fetchEvents falls back to cached data on API error', async () => {
        // Pre-populate cache
        store.upsertCalendarEvent(makeEvent('cached-1', 1000, 2000, 'Cached Meeting'));
        await keychain.setPassword('snapback-calendar-sync', 'google-access-token', 'token');
        const bannerMessages = [];
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockFailingAPIClient(), {
            bannerNotifier: (msg) => bannerMessages.push(msg),
        });
        const result = await sync.fetchEvents(new Date(0), new Date(3000));
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0].title).toBe('Cached Meeting');
        (0, vitest_1.expect)(bannerMessages).toHaveLength(1);
        (0, vitest_1.expect)(bannerMessages[0]).toContain('failed');
    });
    (0, vitest_1.it)('fetchEvents shows banner when not authorized', async () => {
        const bannerMessages = [];
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(), {
            bannerNotifier: (msg) => bannerMessages.push(msg),
        });
        await sync.fetchEvents(new Date(0), new Date(5000));
        (0, vitest_1.expect)(bannerMessages).toHaveLength(1);
        (0, vitest_1.expect)(bannerMessages[0]).toContain('not authorized');
    });
    (0, vitest_1.it)('revokeAuthorization deletes all calendar events', async () => {
        store.upsertCalendarEvent(makeEvent('e1', 1000, 2000));
        store.upsertCalendarEvent(makeEvent('e2', 3000, 4000));
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
        await sync.revokeAuthorization();
        (0, vitest_1.expect)(store.queryCalendarEvents(0, Number.MAX_SAFE_INTEGER)).toHaveLength(0);
    });
    (0, vitest_1.it)('revokeAuthorization clears keychain tokens', async () => {
        await keychain.setPassword('snapback-calendar-sync', 'google-access-token', 'at');
        await keychain.setPassword('snapback-calendar-sync', 'google-refresh-token', 'rt');
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
        await sync.revokeAuthorization();
        (0, vitest_1.expect)(await keychain.getPassword('snapback-calendar-sync', 'google-access-token')).toBeNull();
        (0, vitest_1.expect)(await keychain.getPassword('snapback-calendar-sync', 'google-refresh-token')).toBeNull();
    });
    (0, vitest_1.it)('revokeAuthorization calls networkGuardHook.revoke', async () => {
        const revokeFn = vitest_1.vi.fn();
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(), {
            networkGuardHook: { authorize: vitest_1.vi.fn(), revoke: revokeFn },
        });
        await sync.revokeAuthorization();
        (0, vitest_1.expect)(revokeFn).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('revokeAuthorization sets authorized to false', async () => {
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient(), {
            authFlowTrigger: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        });
        await sync.authorize();
        (0, vitest_1.expect)(sync.isAuthorized()).toBe(true);
        await sync.revokeAuthorization();
        (0, vitest_1.expect)(sync.isAuthorized()).toBe(false);
    });
    (0, vitest_1.it)('getActiveEvent returns event when timestamp is within range', () => {
        store.upsertCalendarEvent(makeEvent('e1', 1000, 2000, 'Standup'));
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
        (0, vitest_1.expect)(sync.getActiveEvent(1500)?.title).toBe('Standup');
        (0, vitest_1.expect)(sync.getActiveEvent(1000)?.title).toBe('Standup'); // inclusive start
    });
    (0, vitest_1.it)('getActiveEvent returns null at endTime (exclusive)', () => {
        store.upsertCalendarEvent(makeEvent('e1', 1000, 2000));
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
        (0, vitest_1.expect)(sync.getActiveEvent(2000)).toBeNull();
    });
    (0, vitest_1.it)('getActiveEvent returns null when no events match', () => {
        const sync = new CalendarSync_js_1.CalendarSync(store, keychain, mockAPIClient());
        (0, vitest_1.expect)(sync.getActiveEvent(5000)).toBeNull();
    });
});
