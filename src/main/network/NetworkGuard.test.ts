// Feature: snapback-productivity-suite, Property 22: Network Guard Blocks Non-Allowlisted Endpoints
// Validates: Requirements 9.2, 9.5

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { NetworkGuard, NetworkGuardBlockedError } from './NetworkGuard.js';
import { LocalStore } from '../store/LocalStore.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGuard() {
  const store = new LocalStore(':memory:');
  const guard = new NetworkGuard(store);
  return { store, guard };
}

// ─── Property 22: Network Guard Blocks Non-Allowlisted Endpoints ─────────────

describe('Property 22: Network Guard Blocks Non-Allowlisted Endpoints', () => {
  it('blocks any URL whose hostname is not in the allowlist and logs an audit entry', () => {
    fc.assert(
      fc.property(
        fc.webUrl({ withFragments: false, withQueryParameters: false }),
        (url: string) => {
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
            } catch (err: unknown) {
              if (!(err instanceof NetworkGuardBlockedError)) {
                // Some other error (e.g. DNS) — still acceptable since guard blocked first
                // But we need to verify the audit log was written
              }
            }
          } finally {
            guard.uninstall();
          }

          // Verify audit log entry was created
          const db = store._db();
          const rows = db.prepare(
            "SELECT * FROM audit_log WHERE event_type = 'blocked_connection'"
          ).all() as Array<Record<string, unknown>>;

          const hasEntry = rows.length >= 1;
          store.close();
          return hasEntry;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('allows connections to allowlisted hosts', () => {
    fc.assert(
      fc.property(
        fc.domain(),
        (hostname: string) => {
          const { store, guard } = makeGuard();

          guard.addAllowedHost(hostname);
          const url = `https://${hostname}/some/path`;
          const result = guard.isAllowed(url);

          store.close();
          return result === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('blocks connections after a host is removed from the allowlist', () => {
    fc.assert(
      fc.property(
        fc.domain(),
        (hostname: string) => {
          const { store, guard } = makeGuard();

          guard.addAllowedHost(hostname);
          guard.removeAllowedHost(hostname);
          const url = `https://${hostname}/path`;
          const result = guard.isAllowed(url);

          store.close();
          return result === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests ──────────────────────────────────────────────────────────────

describe('NetworkGuard — unit tests', () => {
  let store: LocalStore;
  let guard: NetworkGuard;

  beforeEach(() => {
    store = new LocalStore(':memory:');
    guard = new NetworkGuard(store);
  });

  afterEach(() => {
    guard.uninstall();
    store.close();
  });

  it('starts with an empty allowlist', () => {
    expect(guard.getAllowlist().size).toBe(0);
  });

  it('isAllowed returns false for any URL when allowlist is empty', () => {
    expect(guard.isAllowed('https://example.com')).toBe(false);
    expect(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(false);
  });

  it('isAllowed returns true after adding a host', () => {
    guard.addAllowedHost('www.googleapis.com');
    expect(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(true);
  });

  it('isAllowed is case-insensitive', () => {
    guard.addAllowedHost('WWW.GOOGLEAPIS.COM');
    expect(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(true);
  });

  it('removeAllowedHost revokes access', () => {
    guard.addAllowedHost('www.googleapis.com');
    guard.removeAllowedHost('www.googleapis.com');
    expect(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(false);
  });

  it('authorizeCalendar adds Google Calendar host', () => {
    guard.authorizeCalendar();
    expect(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(true);
  });

  it('revokeCalendar removes Google Calendar host', () => {
    guard.authorizeCalendar();
    guard.revokeCalendar();
    expect(guard.isAllowed('https://www.googleapis.com/calendar/v3/events')).toBe(false);
  });

  it('isAllowed returns false for malformed URLs', () => {
    expect(guard.isAllowed('not-a-url')).toBe(false);
    expect(guard.isAllowed('')).toBe(false);
  });

  it('install() patches https.request to throw on blocked URLs', () => {
    guard.install();
    const https = require('node:https');

    expect(() => {
      https.request('https://evil.example.com/steal-data');
    }).toThrow(NetworkGuardBlockedError);
  });

  it('install() patches http.request to throw on blocked URLs', () => {
    guard.install();
    const http = require('node:http');

    expect(() => {
      http.request('http://evil.example.com/steal-data');
    }).toThrow(NetworkGuardBlockedError);
  });

  it('install() patches https.get to throw on blocked URLs', () => {
    guard.install();
    const https = require('node:https');

    expect(() => {
      https.get('https://evil.example.com/steal-data');
    }).toThrow(NetworkGuardBlockedError);
  });

  it('install() patches http.get to throw on blocked URLs', () => {
    guard.install();
    const http = require('node:http');

    expect(() => {
      http.get('http://evil.example.com/steal-data');
    }).toThrow(NetworkGuardBlockedError);
  });

  it('blocked connection is logged to audit_log with event_type=blocked_connection', () => {
    guard.install();
    const https = require('node:https');

    try {
      https.request('https://tracker.example.com/beacon');
    } catch {
      // expected
    }

    const db = store._db();
    const rows = db.prepare(
      "SELECT * FROM audit_log WHERE event_type = 'blocked_connection'"
    ).all() as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    expect(rows[0]!['detail']).toBe('https://tracker.example.com/beacon');
  });

  it('allowed connections pass through without throwing', () => {
    guard.addAllowedHost('www.googleapis.com');
    guard.install();
    const https = require('node:https');

    // This should NOT throw — it will create a real request object.
    // We attach an error handler and destroy immediately to avoid unhandled socket errors.
    expect(() => {
      const req = https.request('https://www.googleapis.com/calendar/v3/events');
      req.on('error', () => {}); // suppress socket hang up
      req.destroy();
    }).not.toThrow(NetworkGuardBlockedError);
  });

  it('uninstall() restores original http/https methods', () => {
    const https = require('node:https');
    const originalRequest = https.request;

    guard.install();
    expect(https.request).not.toBe(originalRequest);

    guard.uninstall();
    expect(https.request).toBe(originalRequest);
  });

  it('install() is idempotent — calling twice does not double-patch', () => {
    guard.install();
    guard.install(); // second call should be a no-op

    const https = require('node:https');
    expect(() => {
      https.request('https://evil.example.com');
    }).toThrow(NetworkGuardBlockedError);

    guard.uninstall();

    // After single uninstall, originals should be restored
    expect(() => {
      const req = https.request('https://evil.example.com');
      req.on('error', () => {}); // suppress socket hang up
      req.destroy();
    }).not.toThrow(NetworkGuardBlockedError);
  });

  it('handles options-object style requests', () => {
    guard.install();
    const https = require('node:https');

    expect(() => {
      https.request({ hostname: 'evil.example.com', path: '/data', method: 'GET' });
    }).toThrow(NetworkGuardBlockedError);

    // Verify audit log
    const db = store._db();
    const rows = db.prepare(
      "SELECT * FROM audit_log WHERE event_type = 'blocked_connection'"
    ).all() as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('handles URL object style requests', () => {
    guard.install();
    const https = require('node:https');

    const url = new URL('https://evil.example.com/track');
    expect(() => {
      https.request(url);
    }).toThrow(NetworkGuardBlockedError);
  });
});
