"use strict";
// Feature: snapback-productivity-suite — Time Block Scheduler
// Validates: Peak hour analysis, task-to-slot pairing, calendar conflict avoidance
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const TimeBlockScheduler_js_1 = require("./TimeBlockScheduler.js");
const LocalStore_js_1 = require("../store/LocalStore.js");
// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeSegment(id, appName, classification, startTime, endTime) {
    return {
        id, appName, windowTitle: 'w', appCategory: 'ide',
        startTime, endTime, tickCount: 10,
        inputSignals: { keystrokeCount: 100, mouseClickCount: 10, scrollEventCount: 5 },
        classification, isManualOverride: false,
    };
}
function makeTask(id, title, priority, order) {
    return {
        id, title, priority, completed: false, completedDuringDeepWork: false,
        xpAwarded: 0, order,
    };
}
function makeCalEvent(id, start, end, title = 'Meeting') {
    return { id, title, startTime: start, endTime: end, calendarId: 'primary', syncedAt: Date.now() };
}
// ─── Property Tests ──────────────────────────────────────────────────────────
(0, vitest_1.describe)('TimeBlockScheduler — property tests', () => {
    (0, vitest_1.it)('analyzeProductivityByHour always returns exactly 24 slots', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.date({ min: new Date('2026-02-01'), max: new Date('2026-12-31') }), (refDate) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const scheduler = new TimeBlockScheduler_js_1.TimeBlockScheduler(store);
            const slots = scheduler.analyzeProductivityByHour(refDate);
            store.close();
            return slots.length === 24;
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('all productivity scores are between 0 and 1', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.date({ min: new Date('2026-02-01'), max: new Date('2026-12-31') }), (refDate) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const scheduler = new TimeBlockScheduler_js_1.TimeBlockScheduler(store);
            const slots = scheduler.analyzeProductivityByHour(refDate);
            store.close();
            return slots.every((s) => s.score >= 0 && s.score <= 1);
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('suggestions never exceed the number of incomplete tasks', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: 0, max: 10 }), (taskCount) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const scheduler = new TimeBlockScheduler_js_1.TimeBlockScheduler(store);
            for (let i = 0; i < taskCount; i++) {
                store.insertTask(makeTask(`t-${i}`, `Task ${i}`, 'high', i));
            }
            const suggestions = scheduler.generateSuggestions('2026-06-15');
            store.close();
            return suggestions.length <= taskCount;
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('no two suggestions overlap in time', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: 1, max: 8 }), (taskCount) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const scheduler = new TimeBlockScheduler_js_1.TimeBlockScheduler(store);
            for (let i = 0; i < taskCount; i++) {
                store.insertTask(makeTask(`t-${i}`, `Task ${i}`, 'high', i));
            }
            const suggestions = scheduler.generateSuggestions('2026-06-15');
            for (let i = 0; i < suggestions.length; i++) {
                for (let j = i + 1; j < suggestions.length; j++) {
                    const a = suggestions[i];
                    const b = suggestions[j];
                    const overlap = Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime);
                    if (overlap > 0) {
                        store.close();
                        return false;
                    }
                }
            }
            store.close();
            return true;
        }), { numRuns: 50 });
    });
});
// ─── Unit Tests ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('TimeBlockScheduler — unit tests', () => {
    let store;
    let scheduler;
    (0, vitest_1.beforeEach)(() => {
        store = new LocalStore_js_1.LocalStore(':memory:');
        scheduler = new TimeBlockScheduler_js_1.TimeBlockScheduler(store);
    });
    (0, vitest_1.afterEach)(() => {
        store.close();
    });
    (0, vitest_1.it)('returns empty slots with zero scores when no historical data', () => {
        const slots = scheduler.analyzeProductivityByHour();
        (0, vitest_1.expect)(slots).toHaveLength(24);
        (0, vitest_1.expect)(slots.every((s) => s.score === 0)).toBe(true);
    });
    (0, vitest_1.it)('identifies peak hours from historical deep work data', () => {
        const refDate = new Date('2026-06-20T12:00:00Z');
        // Simulate 5 days of deep work from 9–11 AM
        for (let d = 1; d <= 5; d++) {
            const date = new Date(refDate);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);
            const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();
            // 2 hours of deep work: 9:00–11:00
            store.insertSegment(makeSegment(`seg-${d}`, 'VSCode', 'deep_work', dayStart + 9 * 3600_000, dayStart + 11 * 3600_000));
        }
        const slots = scheduler.analyzeProductivityByHour(refDate);
        const hour9 = slots.find((s) => s.hour === 9);
        const hour10 = slots.find((s) => s.hour === 10);
        const hour3am = slots.find((s) => s.hour === 3);
        (0, vitest_1.expect)(hour9.score).toBeGreaterThan(0.5);
        (0, vitest_1.expect)(hour10.score).toBeGreaterThan(0.5);
        (0, vitest_1.expect)(hour3am.score).toBe(0);
    });
    (0, vitest_1.it)('getPeakHours filters to working hours and minimum score', () => {
        const refDate = new Date('2026-06-20T12:00:00Z');
        for (let d = 1; d <= 5; d++) {
            const date = new Date(refDate);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);
            const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();
            store.insertSegment(makeSegment(`seg-${d}`, 'VSCode', 'deep_work', dayStart + 10 * 3600_000, dayStart + 12 * 3600_000));
        }
        const peaks = scheduler.getPeakHours(refDate);
        (0, vitest_1.expect)(peaks.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(peaks.every((p) => p.hour >= 7 && p.hour < 21)).toBe(true);
        (0, vitest_1.expect)(peaks.every((p) => p.score >= 0.3)).toBe(true);
        // Should be sorted by score descending
        for (let i = 1; i < peaks.length; i++) {
            (0, vitest_1.expect)(peaks[i].score).toBeLessThanOrEqual(peaks[i - 1].score);
        }
    });
    (0, vitest_1.it)('generates suggestions pairing high-priority tasks with peak hours', () => {
        const refDate = new Date('2026-06-20T12:00:00Z');
        // Historical data: peak at 10 AM
        for (let d = 1; d <= 5; d++) {
            const date = new Date(refDate);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);
            const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();
            store.insertSegment(makeSegment(`seg-${d}`, 'VSCode', 'deep_work', dayStart + 10 * 3600_000, dayStart + 11 * 3600_000));
        }
        // Tasks
        store.insertTask(makeTask('t-low', 'Low task', 'low', 2));
        store.insertTask(makeTask('t-high', 'High task', 'high', 0));
        store.insertTask(makeTask('t-med', 'Medium task', 'medium', 1));
        const suggestions = scheduler.generateSuggestions('2026-06-20', 60, refDate);
        (0, vitest_1.expect)(suggestions.length).toBeGreaterThan(0);
        // First suggestion should be the high-priority task at the peak hour
        (0, vitest_1.expect)(suggestions[0].taskPriority).toBe('high');
        (0, vitest_1.expect)(suggestions[0].taskTitle).toBe('High task');
    });
    (0, vitest_1.it)('avoids calendar conflicts', () => {
        const refDate = new Date('2026-06-20T12:00:00Z');
        const targetDate = '2026-06-20';
        const dayStart = new Date(targetDate + 'T00:00:00.000Z').getTime();
        // Historical: peak at 10 AM and 11 AM
        for (let d = 1; d <= 5; d++) {
            const date = new Date(refDate);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);
            const ds = new Date(dateStr + 'T00:00:00.000Z').getTime();
            store.insertSegment(makeSegment(`seg-${d}a`, 'VSCode', 'deep_work', ds + 10 * 3600_000, ds + 11 * 3600_000));
            store.insertSegment(makeSegment(`seg-${d}b`, 'VSCode', 'deep_work', ds + 11 * 3600_000, ds + 12 * 3600_000));
        }
        // Existing calendar event at 10 AM
        store.upsertCalendarEvent(makeCalEvent('meeting-1', dayStart + 10 * 3600_000, dayStart + 11 * 3600_000, 'Team Standup'));
        store.insertTask(makeTask('t-1', 'Important task', 'high', 0));
        const suggestions = scheduler.generateSuggestions(targetDate, 60, refDate);
        // Should NOT schedule at 10 AM (conflict), should use 11 AM instead
        (0, vitest_1.expect)(suggestions.length).toBe(1);
        const suggestedHour = new Date(suggestions[0].startTime).getUTCHours();
        (0, vitest_1.expect)(suggestedHour).not.toBe(10);
    });
    (0, vitest_1.it)('generates default suggestions when no historical data exists', () => {
        store.insertTask(makeTask('t-1', 'Task A', 'high', 0));
        store.insertTask(makeTask('t-2', 'Task B', 'medium', 1));
        const suggestions = scheduler.generateSuggestions('2026-06-20');
        (0, vitest_1.expect)(suggestions.length).toBe(2);
        (0, vitest_1.expect)(suggestions[0].reason).toContain('No historical data');
    });
    (0, vitest_1.it)('returns empty suggestions when no incomplete tasks exist', () => {
        const completedTask = {
            id: 't-done', title: 'Done', priority: 'high', completed: true,
            completedAt: Date.now(), completedDuringDeepWork: false, xpAwarded: 50, order: 0,
        };
        store.insertTask(completedTask);
        const suggestions = scheduler.generateSuggestions('2026-06-20');
        (0, vitest_1.expect)(suggestions).toHaveLength(0);
    });
    (0, vitest_1.it)('toCalendarBlocks converts suggestions to calendar format', () => {
        store.insertTask(makeTask('t-1', 'Write docs', 'high', 0));
        const suggestions = scheduler.generateSuggestions('2026-06-20');
        const blocks = scheduler.toCalendarBlocks(suggestions);
        (0, vitest_1.expect)(blocks.length).toBe(suggestions.length);
        if (blocks.length > 0) {
            (0, vitest_1.expect)(blocks[0].title).toContain('Write docs');
            (0, vitest_1.expect)(blocks[0].title).toContain('⚡');
            (0, vitest_1.expect)(blocks[0].description).toContain('SnapBack Time Block');
            (0, vitest_1.expect)(blocks[0].description).toContain('high');
        }
    });
    (0, vitest_1.it)('completed tasks are excluded from suggestions', () => {
        store.insertTask(makeTask('t-1', 'Done task', 'high', 0));
        store.insertTask({ ...makeTask('t-2', 'Active task', 'medium', 1) });
        // Complete the first task
        const db = store._db();
        db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?').run('t-1');
        const suggestions = scheduler.generateSuggestions('2026-06-20');
        (0, vitest_1.expect)(suggestions.every((s) => s.taskId !== 't-1')).toBe(true);
    });
});
