"use strict";
// Feature: snapback-productivity-suite, Property 22: Network Guard Blocks Non-Allowlisted Endpoints
// Validates: Requirements 9.2, 9.5
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const NetworkGuard_js_1 = require("./NetworkGuard.js");
const LocalStore_js_1 = require("../store/LocalStore.js");
// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeGuard() {
    const store = new LocalStore_js_1.LocalStore(':memory:');
    const guard = new NetworkGuard_js_1.NetworkGuard(store);
    return { store, guard };
}
// ─── Property 22: Network Guard Blocks Non-Allowlisted Endpoints ─────────────
(0, vitest_1.describe)('Property 22: Network Guard Blocks Non-Allowlisted Endpoints', () => {
    (0, vitest_1.it)('blocks any URL whose hostname is not in the allowlist and logs an audit entry', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.webUrl({ withFragments: false, withQueryParameters: false }), (url) => {
            const { store, guard } = makeGuard();
            // Allowlist is empty — no Calendar Sync authorized
            const allowed = guard.isAllowed(url);
            if (allowed) {
                // If somehow allowed with empty allowlist, that's a failure
                store.close();
                return false;
            }
            // Simulate what install() would do: check and log
            guard.install();
            try {
                // Attempt via https.request would throw
                const https = require('node:https');
                try {
                    https.request(url);
                    // Should have thrown
                    store.close();
                    return false;
                }
                catch (err) {
                    if (!(err instanceof NetworkGuard_js_1.NetworkGuardBlockedError)) {
                        // Some other error (e.g. DNS) — still acceptable since guard blocked first
                        // But we need to verify the audit log was written
                    }
                }
            }
            finally {
                guard.uninstall();
            }
            // Verify audit log entry was created
            const db = store._db();
            const rows = db.prepare("SELECT * FROM audit_log WHERE event_type = 'blocked_connection'").all();
            const hasEntry = rows.length >= 1;
            store.close();
            return hasEntry;
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('allows connections to allowlisted hosts', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.domain(), (hostname) => {
            const { store, guard } = makeGuard();
            guard.addAllowedHost(hostname);
            const url = `https://${hostname}/some/path`;
            const result = guard.isAllowed(url);
            store.close();
            return result === true;
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('blocks connections after a host is removed from the allowlist', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.domain(), (hostname) => {
            const { store, guard } = makeGuard();
            guard.addAllowedHost(hostname);
            guard.removeAllowedHost(hostname);
            const url = `https://${hostname}/path`;
            const result = guard.isAllowed(url);
            store.close();
            return result === false;
        }), { numRuns: 100 });
    });
});
// ─── Unit Tests ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('NetworkGuard — unit tests', () => {
    let store;
    let guard;
    (0, vitest_1.beforeEach)(() => {
        store = new LocalStore_js_1.LocalStore(':memory:');
        guard = new NetworkGuard_js_1.NetworkGuard(store);
    });
    (0, vitest_1.afterEach)(() => {
        guard.uninstall();
        store.close();
    });
    (0, vitest_1.it)('starts with an empty allowlist', () => {
        (0, vitest_1.expect)(guard.getAllowlist().size).toBe(0);
    });
    (0, vitest_1.it)('isAllowed returns false for any URL when allowlist is empty', () => {
        (0, vitest_1.expect)(guard.isAllowed('https://example.com')).toBe(false);
        (0, vitest_1.expect)(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(false);
    });
    (0, vitest_1.it)('isAllowed returns true after adding a host', () => {
        guard.addAllowedHost('www.googleapis.com');
        (0, vitest_1.expect)(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(true);
    });
    (0, vitest_1.it)('isAllowed is case-insensitive', () => {
        guard.addAllowedHost('WWW.GOOGLEAPIS.COM');
        (0, vitest_1.expect)(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(true);
    });
    (0, vitest_1.it)('removeAllowedHost revokes access', () => {
        guard.addAllowedHost('www.googleapis.com');
        guard.removeAllowedHost('www.googleapis.com');
        (0, vitest_1.expect)(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(false);
    });
    (0, vitest_1.it)('authorizeCalendar adds Google Calendar host', () => {
        guard.authorizeCalendar();
        (0, vitest_1.expect)(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(true);
    });
    (0, vitest_1.it)('revokeCalendar removes Google Calendar host', () => {
        guard.authorizeCalendar();
        guard.revokeCalendar();
        (0, vitest_1.expect)(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(false);
    });
    (0, vitest_1.it)('isAllowed returns false for malformed URLs', () => {
        (0, vitest_1.expect)(guard.isAllowed('not-a-url')).toBe(false);
        (0, vitest_1.expect)(guard.isAllowed('')).toBe(false);
    });
    (0, vitest_1.it)('install() patches https.request to throw on blocked URLs', () => {
        guard.install();
        const https = require('node:https');
        (0, vitest_1.expect)(() => {
            https.request('https://evil.example.com/steal-data');
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
    (0, vitest_1.it)('install() patches http.request to throw on blocked URLs', () => {
        guard.install();
        const http = require('node:http');
        (0, vitest_1.expect)(() => {
            http.request('http://evil.example.com/steal-data');
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
    (0, vitest_1.it)('install() patches https.get to throw on blocked URLs', () => {
        guard.install();
        const https = require('node:https');
        (0, vitest_1.expect)(() => {
            https.get('https://evil.example.com/steal-data');
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
    (0, vitest_1.it)('install() patches http.get to throw on blocked URLs', () => {
        guard.install();
        const http = require('node:http');
        (0, vitest_1.expect)(() => {
            http.get('http://evil.example.com/steal-data');
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
    (0, vitest_1.it)('blocked connection is logged to audit_log with event_type=blocked_connection', () => {
        guard.install();
        const https = require('node:https');
        try {
            https.request('https://tracker.example.com/beacon');
        }
        catch {
            // expected
        }
        const db = store._db();
        const rows = db.prepare("SELECT * FROM audit_log WHERE event_type = 'blocked_connection'").all();
        (0, vitest_1.expect)(rows).toHaveLength(1);
        (0, vitest_1.expect)(rows[0]['detail']).toBe('https://tracker.example.com/beacon');
    });
    (0, vitest_1.it)('allowed connections pass through without throwing', () => {
        guard.addAllowedHost('www.googleapis.com');
        guard.install();
        const https = require('node:https');
        // This should NOT throw — it will create a real request object.
        // We attach an error handler and destroy immediately to avoid unhandled socket errors.
        (0, vitest_1.expect)(() => {
            const req = https.request('https://www.googleapis.com/calendar/v3/events');
            req.on('error', () => { }); // suppress socket hang up
            req.destroy();
        }).not.toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
    (0, vitest_1.it)('uninstall() restores original http/https methods', () => {
        const https = require('node:https');
        const originalRequest = https.request;
        guard.install();
        (0, vitest_1.expect)(https.request).not.toBe(originalRequest);
        guard.uninstall();
        (0, vitest_1.expect)(https.request).toBe(originalRequest);
    });
    (0, vitest_1.it)('install() is idempotent — calling twice does not double-patch', () => {
        guard.install();
        guard.install(); // second call should be a no-op
        const https = require('node:https');
        (0, vitest_1.expect)(() => {
            https.request('https://evil.example.com');
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
        guard.uninstall();
        // After single uninstall, originals should be restored
        (0, vitest_1.expect)(() => {
            const req = https.request('https://evil.example.com');
            req.on('error', () => { }); // suppress socket hang up
            req.destroy();
        }).not.toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
    (0, vitest_1.it)('handles options-object style requests', () => {
        guard.install();
        const https = require('node:https');
        (0, vitest_1.expect)(() => {
            https.request({ hostname: 'evil.example.com', path: '/data', method: 'GET' });
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
        // Verify audit log
        const db = store._db();
        const rows = db.prepare("SELECT * FROM audit_log WHERE event_type = 'blocked_connection'").all();
        (0, vitest_1.expect)(rows.length).toBeGreaterThanOrEqual(1);
    });
    (0, vitest_1.it)('handles URL object style requests', () => {
        guard.install();
        const https = require('node:https');
        const url = new URL('https://evil.example.com/track');
        (0, vitest_1.expect)(() => {
            https.request(url);
        }).toThrow(NetworkGuard_js_1.NetworkGuardBlockedError);
    });
});
