/**
 * ActivityTracker — OS-level foreground app polling and idle detection.
 *
 * Polls the active window at configurable intervals (≤5000ms), detects idle
 * state, and emits ActivityTick events via registered handlers. On OS API
 * failure, logs to the audit log and skips the tick without crashing.
 * Buffers up to 60 seconds of ticks in memory if the store write fails.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  ActivityTick,
  ActivityTrackerConfig,
  IActivityTracker,
  ILocalStore,
  AuditLogEntry,
} from '../types.js';

/** Maximum allowed poll interval in milliseconds. */
const MAX_POLL_INTERVAL_MS = 5000;

/** Default idle threshold: 2 minutes. */
const DEFAULT_IDLE_THRESHOLD_MS = 120_000;

/** Maximum buffer size: 60 seconds worth of ticks at 1-second intervals. */
const MAX_BUFFER_SIZE = 60;

/**
 * Function signature for the OS-level active window provider.
 * In production this wraps `active-win`; in tests it can be injected.
 */
export interface ActiveWindowResult {
  title: string;
  owner: { name: string };
}

export type ActiveWindowProvider = () => Promise<ActiveWindowResult | undefined>;

/**
 * Function signature for the OS-level idle time provider.
 * Returns the number of milliseconds since the last user input.
 * In production this wraps OS-specific APIs; in tests it can be injected.
 */
export type IdleTimeProvider = () => number;

export class ActivityTracker implements IActivityTracker {
  private config: ActivityTrackerConfig;
  private emitter = new EventEmitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private getActiveWindow: ActiveWindowProvider;
  private getIdleTime: IdleTimeProvider;
  private store: ILocalStore | null;

  // Idle state tracking
  private isCurrentlyIdle = false;
  private idleStartTime: number | null = null;

  // App switch tracking
  private lastAppName: string | null = null;
  private lastSwitchTimestamp: number | null = null;

  // Tick buffer for store write failures
  private tickBuffer: ActivityTick[] = [];

  constructor(
    config: Partial<ActivityTrackerConfig>,
    getActiveWindow: ActiveWindowProvider,
    getIdleTime: IdleTimeProvider,
    store?: ILocalStore
  ) {
    // Clamp pollIntervalMs to MAX_POLL_INTERVAL_MS
    const rawInterval = config.pollIntervalMs ?? MAX_POLL_INTERVAL_MS;
    const pollIntervalMs = Math.min(Math.max(rawInterval, 1), MAX_POLL_INTERVAL_MS);

    this.config = {
      pollIntervalMs,
      idleThresholdMs: config.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS,
    };

    this.getActiveWindow = getActiveWindow;
    this.getIdleTime = getIdleTime;
    this.store = store ?? null;
  }

  /** Get the effective (clamped) config. */
  getConfig(): Readonly<ActivityTrackerConfig> {
    return { ...this.config };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      this.poll().catch(() => {
        // poll() handles its own errors; this is a safety net
      });
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onTick(handler: (tick: ActivityTick) => void): void {
    this.emitter.on('tick', handler);
  }

  /** Remove a tick handler. */
  offTick(handler: (tick: ActivityTick) => void): void {
    this.emitter.off('tick', handler);
  }

  /** Manually trigger a single poll cycle (useful for testing). */
  async poll(): Promise<void> {
    const now = Date.now();

    // Check idle state
    let idleMs: number;
    try {
      idleMs = this.getIdleTime();
    } catch {
      // If idle detection fails, assume not idle
      idleMs = 0;
    }

    const isIdle = idleMs >= this.config.idleThresholdMs;

    // Handle idle state transitions
    if (isIdle && !this.isCurrentlyIdle) {
      this.isCurrentlyIdle = true;
      this.idleStartTime = now;
    } else if (!isIdle && this.isCurrentlyIdle) {
      this.isCurrentlyIdle = false;
      this.idleStartTime = null;
    }

    // If idle, emit an idle tick but don't accumulate time
    if (isIdle) {
      const tick: ActivityTick = {
        timestamp: now,
        appName: this.lastAppName ?? '',
        windowTitle: '',
        isIdle: true,
      };
      this.emitTick(tick);
      return;
    }

    // Get active window
    let windowResult: ActiveWindowResult | undefined;
    try {
      windowResult = await this.getActiveWindow();
    } catch (err) {
      // Log to audit and skip this tick (Requirement: on OS API failure)
      this.logAuditError('active_window_api_failure', String(err));
      return;
    }

    if (!windowResult) {
      // No active window (e.g., desktop focused) — skip
      return;
    }

    const appName = windowResult.owner?.name ?? '';
    const windowTitle = windowResult.title ?? '';

    // Detect app switch
    if (this.lastAppName !== null && appName !== this.lastAppName) {
      this.lastSwitchTimestamp = now;
    }
    this.lastAppName = appName;

    const tick: ActivityTick = {
      timestamp: now,
      appName,
      windowTitle,
      isIdle: false,
    };

    this.emitTick(tick);
  }

  private emitTick(tick: ActivityTick): void {
    // Buffer the tick
    this.tickBuffer.push(tick);

    // Drop oldest if buffer exceeds max size
    while (this.tickBuffer.length > MAX_BUFFER_SIZE) {
      this.tickBuffer.shift();
      this.logAuditError('tick_buffer_overflow', 'Dropped oldest tick due to buffer overflow');
    }

    // Emit to handlers
    this.emitter.emit('tick', tick);
  }

  /** Drain the tick buffer (for consumers that batch-process ticks). */
  drainBuffer(): ActivityTick[] {
    const ticks = [...this.tickBuffer];
    this.tickBuffer = [];
    return ticks;
  }

  /** Get the timestamp of the last app switch (for testing). */
  getLastSwitchTimestamp(): number | null {
    return this.lastSwitchTimestamp;
  }

  /** Whether the tracker considers the user currently idle. */
  isIdle(): boolean {
    return this.isCurrentlyIdle;
  }

  private logAuditError(eventType: string, detail: string): void {
    if (!this.store) return;
    try {
      const entry: AuditLogEntry = {
        id: randomUUID(),
        timestamp: Date.now(),
        eventType,
        detail,
      };
      this.store.insertAuditLog(entry);
    } catch {
      // If audit logging itself fails, swallow — don't crash the tracker
    }
  }
}
