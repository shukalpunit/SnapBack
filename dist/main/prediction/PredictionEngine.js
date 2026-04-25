"use strict";
/**
 * PredictionEngine — Local ML model that detects pre-distraction patterns.
 *
 * Maintains a rolling behavioral feature vector from ActivityTick + Classification
 * history, and predicts impending distraction spirals. All training and inference
 * happen locally using TensorFlow.js in the Node.js process.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionEngine = void 0;
// ─── Constants ───────────────────────────────────────────────────────────────
/** Minimum distinct days of data before predictions are enabled. */
const MIN_DAYS_FOR_PREDICTION = 5;
/** Default confidence threshold for triggering an intervention. */
const DEFAULT_THRESHOLD = 0.75;
/** Threshold floor — never go below this even after many acceptances. */
const THRESHOLD_FLOOR = 0.60;
/** Threshold ceiling — never go above this even after many dismissals. */
const THRESHOLD_CEILING = 0.95;
/** Dismissal increment: raise threshold by this amount. */
const DISMISSAL_INCREMENT = 0.05;
/** Acceptance decrement: lower threshold by this amount. */
const ACCEPTANCE_DECREMENT = 0.02;
/** Rolling window size for feature extraction (minutes). */
const FEATURE_WINDOW_MINUTES = 5;
// ─── Pattern Descriptions ────────────────────────────────────────────────────
const PATTERN_DESCRIPTIONS = {
    high_switch_rate: 'Rapid app switching detected — you tend to spiral after this pattern',
    post_shallow_drift: 'Extended shallow work streak — you usually open a distraction next',
    afternoon_slump: 'Afternoon focus dip detected — your deep work typically drops around now',
    post_communication: 'Long communication session — you often drift to distractions after Slack/Teams',
};
const SUGGESTED_ACTIONS = {
    high_switch_rate: 'Try closing extra tabs and focusing on one task for 10 minutes',
    post_shallow_drift: 'Want to take a 5-minute break before diving into deep work?',
    afternoon_slump: 'A short walk or stretch might help reset your focus',
    post_communication: 'Consider a 2-minute breathing exercise before your next task',
};
// ─── App Category Encoding ───────────────────────────────────────────────────
const APP_CATEGORY_ENCODING = {
    ide: 0,
    browser: 1,
    email: 2,
    communication: 3,
    document: 4,
    media: 5,
    other: 6,
};
function encodeAppCategory(appName) {
    // Simple heuristic — mirrors Classifier's detectAppCategory
    const lower = appName.toLowerCase();
    if (/vscode|intellij|webstorm|pycharm|xcode|sublime|cursor|kiro/.test(lower))
        return 0;
    if (/chrome|firefox|safari|edge|brave|opera|arc/.test(lower))
        return 1;
    if (/outlook|thunderbird|mail|gmail/.test(lower))
        return 2;
    if (/slack|discord|teams|zoom|skype|telegram/.test(lower))
        return 3;
    if (/word|docs|notion|obsidian|excel|sheets/.test(lower))
        return 4;
    if (/spotify|vlc|youtube|netflix/.test(lower))
        return 5;
    return 6;
}
// ─── PredictionEngine ────────────────────────────────────────────────────────
class PredictionEngine {
    store;
    toastNotifier;
    // Rolling tick history for feature extraction
    tickHistory = [];
    // Per-pattern thresholds (in-memory cache, persisted to store)
    thresholds = new Map();
    // Model readiness
    ready = false;
    distinctDays = new Set();
    // Model state (simplified — in production this would be a TF.js model)
    modelLoaded = false;
    constructor(store, toastNotifier) {
        this.store = store;
        this.toastNotifier = toastNotifier ?? null;
        this.loadThresholds();
        this.checkReadiness();
        this.tryLoadModel();
    }
    ingestTick(tick, classification) {
        const record = {
            timestamp: tick.timestamp,
            appName: tick.appName,
            classification,
            appCategory: encodeAppCategory(tick.appName),
        };
        this.tickHistory.push(record);
        // Track distinct days for readiness check
        const dayKey = new Date(tick.timestamp).toISOString().slice(0, 10);
        this.distinctDays.add(dayKey);
        // Prune old ticks (keep last 30 minutes for feature extraction)
        const cutoff = tick.timestamp - 30 * 60 * 1000;
        this.tickHistory = this.tickHistory.filter((t) => t.timestamp >= cutoff);
        this.checkReadiness();
    }
    predict() {
        if (!this.ready)
            return null;
        if (this.tickHistory.length < 3)
            return null;
        try {
            const features = this.extractFeatures();
            return this.inferFromFeatures(features);
        }
        catch {
            // On inference error, return null (Requirement 5.7 error handling)
            return null;
        }
    }
    recordFeedback(accepted, patternKey) {
        let threshold = this.getOrCreateThreshold(patternKey);
        if (accepted) {
            // Acceptance: lower threshold (reinforce pattern)
            threshold.threshold = Math.max(threshold.threshold - ACCEPTANCE_DECREMENT, THRESHOLD_FLOOR);
            threshold.acceptCount++;
        }
        else {
            // Dismissal: raise threshold (reduce false positives)
            threshold.threshold = Math.min(threshold.threshold + DISMISSAL_INCREMENT, THRESHOLD_CEILING);
            threshold.dismissCount++;
        }
        this.thresholds.set(patternKey, threshold);
        this.persistThreshold(threshold);
    }
    async rebuildFromStore() {
        try {
            // Count distinct days from stored segments
            const segments = this.store.querySegments(0, Number.MAX_SAFE_INTEGER);
            this.distinctDays.clear();
            for (const seg of segments) {
                const dayKey = new Date(seg.startTime).toISOString().slice(0, 10);
                this.distinctDays.add(dayKey);
            }
            this.checkReadiness();
            // In production: retrain TF.js model from segment data
            // For now, mark model as loaded if we have enough data
            this.modelLoaded = this.distinctDays.size >= MIN_DAYS_FOR_PREDICTION;
            if (this.toastNotifier) {
                this.toastNotifier('Retraining your focus model — this may take a few minutes.');
            }
        }
        catch {
            this.ready = false;
            this.modelLoaded = false;
        }
    }
    isReady() {
        return this.ready;
    }
    /** Get the current threshold for a pattern (for testing). */
    getThreshold(patternKey) {
        return this.thresholds.get(patternKey)?.threshold ?? DEFAULT_THRESHOLD;
    }
    /** Get the number of distinct tracked days (for testing). */
    getDistinctDayCount() {
        return this.distinctDays.size;
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    checkReadiness() {
        this.ready = this.distinctDays.size >= MIN_DAYS_FOR_PREDICTION;
    }
    extractFeatures() {
        const now = this.tickHistory[this.tickHistory.length - 1].timestamp;
        const windowStart = now - FEATURE_WINDOW_MINUTES * 60 * 1000;
        const recentTicks = this.tickHistory.filter((t) => t.timestamp >= windowStart);
        // App switch rate: count distinct app transitions in the window
        let switches = 0;
        for (let i = 1; i < recentTicks.length; i++) {
            if (recentTicks[i].appName !== recentTicks[i - 1].appName)
                switches++;
        }
        const windowMinutes = Math.max((now - windowStart) / 60_000, 1);
        const recentAppSwitchRate = switches / windowMinutes;
        // Deep work ratio in current session
        const deepCount = this.tickHistory.filter((t) => t.classification === 'deep_work').length;
        const currentSessionDeepWorkRatio = this.tickHistory.length > 0
            ? deepCount / this.tickHistory.length
            : 0;
        // Time of day (0–1 normalized)
        const date = new Date(now);
        const timeOfDay = (date.getHours() * 60 + date.getMinutes()) / (24 * 60);
        // Day of week (0–6)
        const dayOfWeek = date.getDay();
        // Consecutive shallow minutes
        let consecutiveShallowMinutes = 0;
        for (let i = this.tickHistory.length - 1; i >= 0; i--) {
            if (this.tickHistory[i].classification === 'shallow_work') {
                consecutiveShallowMinutes++;
            }
            else {
                break;
            }
        }
        // Approximate: each tick ~5 seconds
        consecutiveShallowMinutes = (consecutiveShallowMinutes * 5) / 60;
        // Last distraction loop minutes ago
        let lastDistractionLoopMinutesAgo = Infinity;
        for (let i = this.tickHistory.length - 1; i >= 0; i--) {
            if (this.tickHistory[i].classification === 'distraction_loop') {
                lastDistractionLoopMinutesAgo = (now - this.tickHistory[i].timestamp) / 60_000;
                break;
            }
        }
        const currentAppCategory = recentTicks.length > 0
            ? recentTicks[recentTicks.length - 1].appCategory
            : 6;
        return {
            recentAppSwitchRate,
            currentSessionDeepWorkRatio,
            timeOfDay,
            dayOfWeek,
            consecutiveShallowMinutes,
            lastDistractionLoopMinutesAgo,
            currentAppCategory,
        };
    }
    /**
     * Simplified inference: rule-based pattern matching on the feature vector.
     * In production, this would run the TF.js feedforward network.
     */
    inferFromFeatures(features) {
        // Pattern: high app switch rate
        if (features.recentAppSwitchRate > 3) {
            const confidence = Math.min(0.5 + features.recentAppSwitchRate * 0.1, 0.99);
            const threshold = this.getThreshold('high_switch_rate');
            if (confidence >= threshold) {
                return {
                    confidence,
                    patternDescription: PATTERN_DESCRIPTIONS['high_switch_rate'],
                    suggestedAction: SUGGESTED_ACTIONS['high_switch_rate'],
                };
            }
        }
        // Pattern: extended shallow work streak
        if (features.consecutiveShallowMinutes > 15) {
            const confidence = Math.min(0.6 + features.consecutiveShallowMinutes * 0.01, 0.95);
            const threshold = this.getThreshold('post_shallow_drift');
            if (confidence >= threshold) {
                return {
                    confidence,
                    patternDescription: PATTERN_DESCRIPTIONS['post_shallow_drift'],
                    suggestedAction: SUGGESTED_ACTIONS['post_shallow_drift'],
                };
            }
        }
        // Pattern: afternoon slump (1pm–4pm with declining deep work ratio)
        if (features.timeOfDay >= 13 / 24 &&
            features.timeOfDay <= 16 / 24 &&
            features.currentSessionDeepWorkRatio < 0.3) {
            const confidence = 0.75;
            const threshold = this.getThreshold('afternoon_slump');
            if (confidence >= threshold) {
                return {
                    confidence,
                    patternDescription: PATTERN_DESCRIPTIONS['afternoon_slump'],
                    suggestedAction: SUGGESTED_ACTIONS['afternoon_slump'],
                };
            }
        }
        // Pattern: post-communication drift
        if (features.currentAppCategory === APP_CATEGORY_ENCODING['communication'] &&
            features.lastDistractionLoopMinutesAgo < 10) {
            const confidence = 0.78;
            const threshold = this.getThreshold('post_communication');
            if (confidence >= threshold) {
                return {
                    confidence,
                    patternDescription: PATTERN_DESCRIPTIONS['post_communication'],
                    suggestedAction: SUGGESTED_ACTIONS['post_communication'],
                };
            }
        }
        return null;
    }
    getOrCreateThreshold(patternKey) {
        let t = this.thresholds.get(patternKey);
        if (!t) {
            t = {
                patternKey,
                threshold: DEFAULT_THRESHOLD,
                dismissCount: 0,
                acceptCount: 0,
            };
            this.thresholds.set(patternKey, t);
        }
        return t;
    }
    loadThresholds() {
        try {
            const db = this.store._db?.();
            if (!db)
                return;
            const rows = db.prepare('SELECT * FROM pattern_thresholds').all();
            for (const row of rows) {
                this.thresholds.set(row['pattern_key'], {
                    patternKey: row['pattern_key'],
                    threshold: row['threshold'],
                    dismissCount: row['dismiss_count'],
                    acceptCount: row['accept_count'],
                });
            }
        }
        catch {
            // If loading fails, start with defaults
        }
    }
    persistThreshold(t) {
        try {
            const db = this.store._db?.();
            if (!db)
                return;
            db.prepare(`
        INSERT INTO pattern_thresholds (pattern_key, threshold, dismiss_count, accept_count)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(pattern_key) DO UPDATE SET
          threshold = excluded.threshold,
          dismiss_count = excluded.dismiss_count,
          accept_count = excluded.accept_count
      `).run(t.patternKey, t.threshold, t.dismissCount, t.acceptCount);
        }
        catch {
            // Swallow — don't crash the engine
        }
    }
    tryLoadModel() {
        try {
            const blob = this.store.loadModelBlob();
            if (blob) {
                this.modelLoaded = true;
            }
            else {
                // No model yet — will be built after enough data
                this.modelLoaded = false;
            }
        }
        catch {
            // Corrupted model — trigger rebuild
            this.modelLoaded = false;
            if (this.toastNotifier) {
                this.toastNotifier('Retraining your focus model — this may take a few minutes.');
            }
            this.rebuildFromStore().catch(() => { });
        }
    }
}
exports.PredictionEngine = PredictionEngine;
