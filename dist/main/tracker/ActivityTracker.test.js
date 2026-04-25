"use strict";
// Feature: snapback-productivity-suite, Property 1: Poll Interval Constraint
// Feature: snapback-productivity-suite, Property 2: Idle Time Exclusion
// Validates: Requirements 1.1, 1.2, 1.3, 1.4
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const ActivityTracker_js_1 = require("./ActivityTracker.js");
const LocalStore_js_1 = require("../store/LocalStore.js");
// ─── Mock factories ──────────────────────────────────────────────────────────
function mockActiveWindow(appName = 'VSCode', title = 'main.ts') {
    return async () => ({
        title,
        owner: { name: appName },
    });
}
function mockIdleTime(ms = 0) {
    return () => ms;
}
function mockIdleTimeSequence(values) {
    let i = 0;
    return () => {
        const val = values[Math.min(i, values.length - 1)];
        i++;
        return val;
    };
}
// ─── Property 1: Poll Interval Constraint ────────────────────────────────────
(0, vitest_1.describe)('Property 1: Poll Interval Constraint', () => {
    (0, vitest_1.it)('clamps pollIntervalMs to ≤5000 for any input value', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: -10000, max: 100000 }), (rawInterval) => {
            const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: rawInterval }, mockActiveWindow(), mockIdleTime());
            const config = tracker.getConfig();
            return config.pollIntervalMs >= 1 && config.pollIntervalMs <= 5000;
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('preserves pollIntervalMs when ≤5000 and ≥1', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: 1, max: 5000 }), (interval) => {
            const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: interval }, mockActiveWindow(), mockIdleTime());
            return tracker.getConfig().pollIntervalMs === interval;
        }), { numRuns: 100 });
    });
});
// ─── Property 2: Idle Time Exclusion ─────────────────────────────────────────
(0, vitest_1.describe)('Property 2: Idle Time Exclusion', () => {
    (0, vitest_1.it)('emits isIdle=true ticks when idle time exceeds threshold', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.integer({ min: 120_000, max: 1_000_000 }), async (idleMs) => {
            const ticks = [];
            const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000, idleThresholdMs: 120_000 }, mockActiveWindow(), mockIdleTime(idleMs));
            tracker.onTick((t) => ticks.push(t));
            await tracker.poll();
            return ticks.length === 1 && ticks[0].isIdle === true;
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('emits isIdle=false ticks when idle time is below threshold', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.integer({ min: 0, max: 119_999 }), async (idleMs) => {
            const ticks = [];
            const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000, idleThresholdMs: 120_000 }, mockActiveWindow(), mockIdleTime(idleMs));
            tracker.onTick((t) => ticks.push(t));
            await tracker.poll();
            return ticks.length === 1 && ticks[0].isIdle === false;
        }), { numRuns: 100 });
    });
});
// ─── Unit Tests ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('ActivityTracker — unit tests', () => {
    let store;
    (0, vitest_1.beforeEach)(() => {
        store = new LocalStore_js_1.LocalStore(':memory:');
    });
    (0, vitest_1.afterEach)(() => {
        store.close();
    });
    (0, vitest_1.it)('emits a tick with correct appName and windowTitle', async () => {
        const ticks = [];
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, mockActiveWindow('Chrome', 'Google'), mockIdleTime(0), store);
        tracker.onTick((t) => ticks.push(t));
        await tracker.poll();
        (0, vitest_1.expect)(ticks).toHaveLength(1);
        (0, vitest_1.expect)(ticks[0].appName).toBe('Chrome');
        (0, vitest_1.expect)(ticks[0].windowTitle).toBe('Google');
        (0, vitest_1.expect)(ticks[0].isIdle).toBe(false);
    });
    (0, vitest_1.it)('detects app switch and records timestamp', async () => {
        let currentApp = 'VSCode';
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, async () => ({ title: 'file.ts', owner: { name: currentApp } }), mockIdleTime(0), store);
        tracker.onTick(() => { });
        await tracker.poll(); // VSCode
        (0, vitest_1.expect)(tracker.getLastSwitchTimestamp()).toBeNull();
        currentApp = 'Chrome';
        await tracker.poll(); // Switch to Chrome
        (0, vitest_1.expect)(tracker.getLastSwitchTimestamp()).not.toBeNull();
        (0, vitest_1.expect)(typeof tracker.getLastSwitchTimestamp()).toBe('number');
    });
    (0, vitest_1.it)('transitions to idle state when idle time exceeds threshold', async () => {
        let idleMs = 0;
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000, idleThresholdMs: 120_000 }, mockActiveWindow(), () => idleMs, store);
        tracker.onTick(() => { });
        await tracker.poll();
        (0, vitest_1.expect)(tracker.isIdle()).toBe(false);
        idleMs = 130_000;
        await tracker.poll();
        (0, vitest_1.expect)(tracker.isIdle()).toBe(true);
        idleMs = 0;
        await tracker.poll();
        (0, vitest_1.expect)(tracker.isIdle()).toBe(false);
    });
    (0, vitest_1.it)('logs to audit log when active window API fails', async () => {
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, async () => { throw new Error('OS API failure'); }, mockIdleTime(0), store);
        tracker.onTick(() => { });
        await tracker.poll(); // Should not throw
        const db = store._db();
        const rows = db.prepare("SELECT * FROM audit_log WHERE event_type = 'active_window_api_failure'").all();
        (0, vitest_1.expect)(rows).toHaveLength(1);
    });
    (0, vitest_1.it)('skips tick when active window returns undefined', async () => {
        const ticks = [];
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, async () => undefined, mockIdleTime(0), store);
        tracker.onTick((t) => ticks.push(t));
        await tracker.poll();
        (0, vitest_1.expect)(ticks).toHaveLength(0);
    });
    (0, vitest_1.it)('buffers ticks and respects max buffer size of 60', async () => {
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, mockActiveWindow(), mockIdleTime(0), store);
        tracker.onTick(() => { });
        // Poll 70 times — buffer should cap at 60
        for (let i = 0; i < 70; i++) {
            await tracker.poll();
        }
        const buffer = tracker.drainBuffer();
        (0, vitest_1.expect)(buffer).toHaveLength(60);
    });
    (0, vitest_1.it)('drainBuffer returns ticks and clears the buffer', async () => {
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, mockActiveWindow(), mockIdleTime(0));
        tracker.onTick(() => { });
        await tracker.poll();
        await tracker.poll();
        const drained = tracker.drainBuffer();
        (0, vitest_1.expect)(drained).toHaveLength(2);
        (0, vitest_1.expect)(tracker.drainBuffer()).toHaveLength(0);
    });
    (0, vitest_1.it)('start() and stop() control the polling lifecycle', () => {
        vitest_1.vi.useFakeTimers();
        const ticks = [];
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 100 }, mockActiveWindow(), mockIdleTime(0));
        tracker.onTick((t) => ticks.push(t));
        tracker.start();
        // Advance time — polls are async so ticks may not appear synchronously
        // but the timer should be set
        tracker.stop();
        // After stop, no more ticks should be emitted
        vitest_1.vi.advanceTimersByTime(500);
        const countAfterStop = ticks.length;
        vitest_1.vi.advanceTimersByTime(500);
        (0, vitest_1.expect)(ticks.length).toBe(countAfterStop);
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('start() is idempotent', () => {
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, mockActiveWindow(), mockIdleTime(0));
        tracker.start();
        tracker.start(); // should not create a second timer
        tracker.stop();
    });
    (0, vitest_1.it)('offTick removes a handler', async () => {
        const ticks = [];
        const handler = (t) => ticks.push(t);
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, mockActiveWindow(), mockIdleTime(0));
        tracker.onTick(handler);
        await tracker.poll();
        (0, vitest_1.expect)(ticks).toHaveLength(1);
        tracker.offTick(handler);
        await tracker.poll();
        (0, vitest_1.expect)(ticks).toHaveLength(1); // no new tick
    });
    (0, vitest_1.it)('defaults pollIntervalMs to 5000 when not provided', () => {
        const tracker = new ActivityTracker_js_1.ActivityTracker({}, mockActiveWindow(), mockIdleTime(0));
        (0, vitest_1.expect)(tracker.getConfig().pollIntervalMs).toBe(5000);
    });
    (0, vitest_1.it)('defaults idleThresholdMs to 120000 when not provided', () => {
        const tracker = new ActivityTracker_js_1.ActivityTracker({}, mockActiveWindow(), mockIdleTime(0));
        (0, vitest_1.expect)(tracker.getConfig().idleThresholdMs).toBe(120_000);
    });
    (0, vitest_1.it)('handles idle time provider throwing without crashing', async () => {
        const ticks = [];
        const tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 1000 }, mockActiveWindow(), () => { throw new Error('idle API broken'); });
        tracker.onTick((t) => ticks.push(t));
        await tracker.poll(); // should not throw
        (0, vitest_1.expect)(ticks).toHaveLength(1);
        (0, vitest_1.expect)(ticks[0].isIdle).toBe(false); // assumes not idle on failure
    });
});
