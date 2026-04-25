"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityTracker = void 0;
const node_events_1 = require("node:events");
const node_crypto_1 = require("node:crypto");
/** Maximum allowed poll interval in milliseconds. */
const MAX_POLL_INTERVAL_MS = 5000;
/** Default idle threshold: 2 minutes. */
const DEFAULT_IDLE_THRESHOLD_MS = 120_000;
/** Maximum buffer size: 60 seconds worth of ticks at 1-second intervals. */
const MAX_BUFFER_SIZE = 60;
class ActivityTracker {
    config;
    emitter = new node_events_1.EventEmitter();
    timer = null;
    running = false;
    getActiveWindow;
    getIdleTime;
    store;
    // Idle state tracking
    isCurrentlyIdle = false;
    idleStartTime = null;
    // App switch tracking
    lastAppName = null;
    lastSwitchTimestamp = null;
    // Tick buffer for store write failures
    tickBuffer = [];
    constructor(config, getActiveWindow, getIdleTime, store) {
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
    getConfig() {
        return { ...this.config };
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        this.timer = setInterval(() => {
            this.poll().catch(() => {
                // poll() handles its own errors; this is a safety net
            });
        }, this.config.pollIntervalMs);
    }
    stop() {
        if (!this.running)
            return;
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    onTick(handler) {
        this.emitter.on('tick', handler);
    }
    /** Remove a tick handler. */
    offTick(handler) {
        this.emitter.off('tick', handler);
    }
    /** Manually trigger a single poll cycle (useful for testing). */
    async poll() {
        const now = Date.now();
        // Check idle state
        let idleMs;
        try {
            idleMs = this.getIdleTime();
        }
        catch {
            // If idle detection fails, assume not idle
            idleMs = 0;
        }
        const isIdle = idleMs >= this.config.idleThresholdMs;
        // Handle idle state transitions
        if (isIdle && !this.isCurrentlyIdle) {
            this.isCurrentlyIdle = true;
            this.idleStartTime = now;
        }
        else if (!isIdle && this.isCurrentlyIdle) {
            this.isCurrentlyIdle = false;
            this.idleStartTime = null;
        }
        // If idle, emit an idle tick but don't accumulate time
        if (isIdle) {
            const tick = {
                timestamp: now,
                appName: this.lastAppName ?? '',
                windowTitle: '',
                isIdle: true,
            };
            this.emitTick(tick);
            return;
        }
        // Get active window
        let windowResult;
        try {
            windowResult = await this.getActiveWindow();
        }
        catch (err) {
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
        const tick = {
            timestamp: now,
            appName,
            windowTitle,
            isIdle: false,
        };
        this.emitTick(tick);
    }
    emitTick(tick) {
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
    drainBuffer() {
        const ticks = [...this.tickBuffer];
        this.tickBuffer = [];
        return ticks;
    }
    /** Get the timestamp of the last app switch (for testing). */
    getLastSwitchTimestamp() {
        return this.lastSwitchTimestamp;
    }
    /** Whether the tracker considers the user currently idle. */
    isIdle() {
        return this.isCurrentlyIdle;
    }
    logAuditError(eventType, detail) {
        if (!this.store)
            return;
        try {
            const entry = {
                id: (0, node_crypto_1.randomUUID)(),
                timestamp: Date.now(),
                eventType,
                detail,
            };
            this.store.insertAuditLog(entry);
        }
        catch {
            // If audit logging itself fails, swallow — don't crash the tracker
        }
    }
}
exports.ActivityTracker = ActivityTracker;
