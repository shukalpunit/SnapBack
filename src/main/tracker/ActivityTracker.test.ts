// Feature: snapback-productivity-suite, Property 1: Poll Interval Constraint
// Feature: snapback-productivity-suite, Property 2: Idle Time Exclusion
// Validates: Requirements 1.1, 1.2, 1.3, 1.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  ActivityTracker,
  type ActiveWindowResult,
  type ActiveWindowProvider,
  type IdleTimeProvider,
} from './ActivityTracker.js';
import { LocalStore } from '../store/LocalStore.js';
import type { ActivityTick } from '../types.js';

// ─── Mock factories ──────────────────────────────────────────────────────────

function mockActiveWindow(
  appName = 'VSCode',
  title = 'main.ts'
): ActiveWindowProvider {
  return async () => ({
    title,
    owner: { name: appName },
  });
}

function mockIdleTime(ms = 0): IdleTimeProvider {
  return () => ms;
}

function mockIdleTimeSequence(values: number[]): IdleTimeProvider {
  let i = 0;
  return () => {
    const val = values[Math.min(i, values.length - 1)]!;
    i++;
    return val;
  };
}

// ─── Property 1: Poll Interval Constraint ────────────────────────────────────

describe('Property 1: Poll Interval Constraint', () => {
  it('clamps pollIntervalMs to ≤5000 for any input value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 100000 }),
        (rawInterval) => {
          const tracker = new ActivityTracker(
            { pollIntervalMs: rawInterval },
            mockActiveWindow(),
            mockIdleTime()
          );
          const config = tracker.getConfig();
          return config.pollIntervalMs >= 1 && config.pollIntervalMs <= 5000;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('preserves pollIntervalMs when ≤5000 and ≥1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        (interval) => {
          const tracker = new ActivityTracker(
            { pollIntervalMs: interval },
            mockActiveWindow(),
            mockIdleTime()
          );
          return tracker.getConfig().pollIntervalMs === interval;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Idle Time Exclusion ─────────────────────────────────────────

describe('Property 2: Idle Time Exclusion', () => {
  it('emits isIdle=true ticks when idle time exceeds threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 120_000, max: 1_000_000 }),
        async (idleMs) => {
          const ticks: ActivityTick[] = [];
          const tracker = new ActivityTracker(
            { pollIntervalMs: 1000, idleThresholdMs: 120_000 },
            mockActiveWindow(),
            mockIdleTime(idleMs)
          );
          tracker.onTick((t) => ticks.push(t));

          await tracker.poll();

          return ticks.length === 1 && ticks[0]!.isIdle === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('emits isIdle=false ticks when idle time is below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 119_999 }),
        async (idleMs) => {
          const ticks: ActivityTick[] = [];
          const tracker = new ActivityTracker(
            { pollIntervalMs: 1000, idleThresholdMs: 120_000 },
            mockActiveWindow(),
            mockIdleTime(idleMs)
          );
          tracker.onTick((t) => ticks.push(t));

          await tracker.poll();

          return ticks.length === 1 && ticks[0]!.isIdle === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests ──────────────────────────────────────────────────────────────

describe('ActivityTracker — unit tests', () => {
  let store: LocalStore;

  beforeEach(() => {
    store = new LocalStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('emits a tick with correct appName and windowTitle', async () => {
    const ticks: ActivityTick[] = [];
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      mockActiveWindow('Chrome', 'Google'),
      mockIdleTime(0),
      store
    );
    tracker.onTick((t) => ticks.push(t));

    await tracker.poll();

    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.appName).toBe('Chrome');
    expect(ticks[0]!.windowTitle).toBe('Google');
    expect(ticks[0]!.isIdle).toBe(false);
  });

  it('detects app switch and records timestamp', async () => {
    let currentApp = 'VSCode';
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      async () => ({ title: 'file.ts', owner: { name: currentApp } }),
      mockIdleTime(0),
      store
    );
    tracker.onTick(() => {});

    await tracker.poll(); // VSCode
    expect(tracker.getLastSwitchTimestamp()).toBeNull();

    currentApp = 'Chrome';
    await tracker.poll(); // Switch to Chrome
    expect(tracker.getLastSwitchTimestamp()).not.toBeNull();
    expect(typeof tracker.getLastSwitchTimestamp()).toBe('number');
  });

  it('transitions to idle state when idle time exceeds threshold', async () => {
    let idleMs = 0;
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000, idleThresholdMs: 120_000 },
      mockActiveWindow(),
      () => idleMs,
      store
    );
    tracker.onTick(() => {});

    await tracker.poll();
    expect(tracker.isIdle()).toBe(false);

    idleMs = 130_000;
    await tracker.poll();
    expect(tracker.isIdle()).toBe(true);

    idleMs = 0;
    await tracker.poll();
    expect(tracker.isIdle()).toBe(false);
  });

  it('logs to audit log when active window API fails', async () => {
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      async () => { throw new Error('OS API failure'); },
      mockIdleTime(0),
      store
    );
    tracker.onTick(() => {});

    await tracker.poll(); // Should not throw

    const db = store._db();
    const rows = db.prepare(
      "SELECT * FROM audit_log WHERE event_type = 'active_window_api_failure'"
    ).all();
    expect(rows).toHaveLength(1);
  });

  it('skips tick when active window returns undefined', async () => {
    const ticks: ActivityTick[] = [];
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      async () => undefined,
      mockIdleTime(0),
      store
    );
    tracker.onTick((t) => ticks.push(t));

    await tracker.poll();
    expect(ticks).toHaveLength(0);
  });

  it('buffers ticks and respects max buffer size of 60', async () => {
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      mockActiveWindow(),
      mockIdleTime(0),
      store
    );
    tracker.onTick(() => {});

    // Poll 70 times — buffer should cap at 60
    for (let i = 0; i < 70; i++) {
      await tracker.poll();
    }

    const buffer = tracker.drainBuffer();
    expect(buffer).toHaveLength(60);
  });

  it('drainBuffer returns ticks and clears the buffer', async () => {
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      mockActiveWindow(),
      mockIdleTime(0)
    );
    tracker.onTick(() => {});

    await tracker.poll();
    await tracker.poll();

    const drained = tracker.drainBuffer();
    expect(drained).toHaveLength(2);
    expect(tracker.drainBuffer()).toHaveLength(0);
  });

  it('start() and stop() control the polling lifecycle', () => {
    vi.useFakeTimers();

    const ticks: ActivityTick[] = [];
    const tracker = new ActivityTracker(
      { pollIntervalMs: 100 },
      mockActiveWindow(),
      mockIdleTime(0)
    );
    tracker.onTick((t) => ticks.push(t));

    tracker.start();
    // Advance time — polls are async so ticks may not appear synchronously
    // but the timer should be set
    tracker.stop();

    // After stop, no more ticks should be emitted
    vi.advanceTimersByTime(500);
    const countAfterStop = ticks.length;
    vi.advanceTimersByTime(500);
    expect(ticks.length).toBe(countAfterStop);

    vi.useRealTimers();
  });

  it('start() is idempotent', () => {
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      mockActiveWindow(),
      mockIdleTime(0)
    );

    tracker.start();
    tracker.start(); // should not create a second timer
    tracker.stop();
  });

  it('offTick removes a handler', async () => {
    const ticks: ActivityTick[] = [];
    const handler = (t: ActivityTick) => ticks.push(t);
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      mockActiveWindow(),
      mockIdleTime(0)
    );

    tracker.onTick(handler);
    await tracker.poll();
    expect(ticks).toHaveLength(1);

    tracker.offTick(handler);
    await tracker.poll();
    expect(ticks).toHaveLength(1); // no new tick
  });

  it('defaults pollIntervalMs to 5000 when not provided', () => {
    const tracker = new ActivityTracker(
      {},
      mockActiveWindow(),
      mockIdleTime(0)
    );
    expect(tracker.getConfig().pollIntervalMs).toBe(5000);
  });

  it('defaults idleThresholdMs to 120000 when not provided', () => {
    const tracker = new ActivityTracker(
      {},
      mockActiveWindow(),
      mockIdleTime(0)
    );
    expect(tracker.getConfig().idleThresholdMs).toBe(120_000);
  });

  it('handles idle time provider throwing without crashing', async () => {
    const ticks: ActivityTick[] = [];
    const tracker = new ActivityTracker(
      { pollIntervalMs: 1000 },
      mockActiveWindow(),
      () => { throw new Error('idle API broken'); }
    );
    tracker.onTick((t) => ticks.push(t));

    await tracker.poll(); // should not throw
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.isIdle).toBe(false); // assumes not idle on failure
  });
});
