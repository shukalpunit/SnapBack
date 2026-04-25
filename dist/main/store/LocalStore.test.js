"use strict";
// Feature: snapback-productivity-suite, Property 23: Data Deletion Completeness
// Feature: snapback-productivity-suite, Property 6: Manual Override Round-Trip
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const LocalStore_js_1 = require("./LocalStore.js");
// ─── Arbitraries ─────────────────────────────────────────────────────────────
const arbClassification = fast_check_1.default.oneof(fast_check_1.default.constant('deep_work'), fast_check_1.default.constant('shallow_work'), fast_check_1.default.constant('distraction_loop'));
const arbAppCategory = fast_check_1.default.oneof(fast_check_1.default.constant('ide'), fast_check_1.default.constant('browser'), fast_check_1.default.constant('email'), fast_check_1.default.constant('communication'), fast_check_1.default.constant('document'), fast_check_1.default.constant('media'), fast_check_1.default.constant('other'));
const arbSegment = fast_check_1.default.record({
    id: fast_check_1.default.uuid(),
    appName: fast_check_1.default.string({ minLength: 1, maxLength: 64 }),
    windowTitle: fast_check_1.default.string({ minLength: 0, maxLength: 128 }),
    appCategory: arbAppCategory,
    startTime: fast_check_1.default.integer({ min: 1_000_000, max: 2_000_000_000 }),
    endTime: fast_check_1.default.integer({ min: 2_000_000_001, max: 3_000_000_000 }),
    tickCount: fast_check_1.default.integer({ min: 1, max: 1000 }),
    inputSignals: fast_check_1.default.record({
        keystrokeCount: fast_check_1.default.integer({ min: 0, max: 10000 }),
        mouseClickCount: fast_check_1.default.integer({ min: 0, max: 10000 }),
        scrollEventCount: fast_check_1.default.integer({ min: 0, max: 10000 }),
    }),
    classification: arbClassification,
    isManualOverride: fast_check_1.default.boolean(),
});
const arbPriority = fast_check_1.default.oneof(fast_check_1.default.constant('low'), fast_check_1.default.constant('medium'), fast_check_1.default.constant('high'));
const arbTask = fast_check_1.default.record({
    id: fast_check_1.default.uuid(),
    title: fast_check_1.default.string({ minLength: 1, maxLength: 128 }),
    dueDate: fast_check_1.default.option(fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
    priority: arbPriority,
    completed: fast_check_1.default.boolean(),
    completedAt: fast_check_1.default.option(fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
    completedDuringDeepWork: fast_check_1.default.boolean(),
    xpAwarded: fast_check_1.default.integer({ min: 0, max: 1000 }),
    order: fast_check_1.default.integer({ min: 0, max: 1000 }),
});
const arbXPEvent = (taskId) => fast_check_1.default.record({
    id: fast_check_1.default.uuid(),
    taskId: fast_check_1.default.constant(taskId),
    xpAmount: fast_check_1.default.integer({ min: 1, max: 1000 }),
    timestamp: fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }),
    multiplierApplied: fast_check_1.default.boolean(),
});
const arbBadge = fast_check_1.default.record({
    id: fast_check_1.default.uuid(),
    name: fast_check_1.default.string({ minLength: 1, maxLength: 64 }),
    description: fast_check_1.default.string({ minLength: 1, maxLength: 256 }),
    xpThreshold: fast_check_1.default.integer({ min: 1, max: 10000 }),
    awardedAt: fast_check_1.default.option(fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
});
const arbCalendarEvent = fast_check_1.default.record({
    id: fast_check_1.default.uuid(),
    title: fast_check_1.default.string({ minLength: 1, maxLength: 128 }),
    startTime: fast_check_1.default.integer({ min: 1_000_000, max: 2_000_000_000 }),
    endTime: fast_check_1.default.integer({ min: 2_000_000_001, max: 3_000_000_000 }),
    calendarId: fast_check_1.default.uuid(),
    syncedAt: fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }),
});
const arbPaceRecord = fast_check_1.default.record({
    activityKey: fast_check_1.default.string({ minLength: 1, maxLength: 64 }),
    bestPaceScore: fast_check_1.default.float({ min: 0, max: 1, noNaN: true }),
    sessionCount: fast_check_1.default.integer({ min: 0, max: 10000 }),
    lastUpdated: fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }),
});
const arbAuditEntry = fast_check_1.default.record({
    id: fast_check_1.default.uuid(),
    timestamp: fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }),
    eventType: fast_check_1.default.string({ minLength: 1, maxLength: 64 }),
    detail: fast_check_1.default.option(fast_check_1.default.string({ minLength: 0, maxLength: 256 }), { nil: undefined }),
});
// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeStore() {
    return new LocalStore_js_1.LocalStore(':memory:');
}
// ─── Property 23: Data Deletion Completeness ─────────────────────────────────
// Validates: Requirements 9.4
(0, vitest_1.describe)('Property 23: Data Deletion Completeness', () => {
    (0, vitest_1.it)('after deleteAllData(), all tables return zero rows for any populated store', () => {
        fast_check_1.default.assert(fast_check_1.default.property(arbSegment, arbTask, arbBadge, arbCalendarEvent, arbPaceRecord, arbAuditEntry, (segment, task, badge, calEvent, paceRecord, auditEntry) => {
            const store = makeStore();
            // Populate every table
            store.insertSegment(segment);
            store.insertTask(task);
            const xpEvent = {
                id: crypto.randomUUID(),
                taskId: task.id,
                xpAmount: 10,
                timestamp: Date.now(),
                multiplierApplied: false,
            };
            store.insertXPEvent(xpEvent);
            store.upsertBadge(badge);
            store.upsertCalendarEvent(calEvent);
            store.upsertPaceRecord(paceRecord);
            store.insertAuditLog(auditEntry);
            store.saveModelBlob(Buffer.from('test-model-data'));
            // Delete all data
            store.deleteAllData();
            // Verify every table is empty
            const db = store._db();
            const tables = [
                'segments',
                'tasks',
                'xp_events',
                'badges',
                'calendar_events',
                'pace_records',
                'audit_log',
                'model_store',
                'pattern_thresholds',
            ];
            for (const table of tables) {
                const count = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get().n;
                if (count !== 0) {
                    store.close();
                    return false;
                }
            }
            store.close();
            return true;
        }), { numRuns: 100 });
    });
});
// ─── Property 6: Manual Override Round-Trip ───────────────────────────────────
// Validates: Requirements 2.7
(0, vitest_1.describe)('Property 6: Manual Override Round-Trip', () => {
    (0, vitest_1.it)('overrideSegmentClassification persists the new classification with is_manual_override=true', () => {
        fast_check_1.default.assert(fast_check_1.default.property(arbSegment, arbClassification, (segment, targetClassification) => {
            const store = makeStore();
            store.insertSegment(segment);
            store.overrideSegmentClassification(segment.id, targetClassification);
            // Query back — use a wide time range to ensure the segment is found
            const results = store.querySegments(0, Number.MAX_SAFE_INTEGER);
            const found = results.find((s) => s.id === segment.id);
            const ok = found !== undefined &&
                found.classification === targetClassification &&
                found.isManualOverride === true;
            store.close();
            return ok;
        }), { numRuns: 100 });
    });
});
// ─── Unit tests ───────────────────────────────────────────────────────────────
(0, vitest_1.describe)('LocalStore — unit tests', () => {
    let store;
    (0, vitest_1.beforeEach)(() => {
        store = makeStore();
    });
    (0, vitest_1.afterEach)(() => {
        store.close();
    });
    (0, vitest_1.it)('passes PRAGMA integrity_check on a fresh database', () => {
        // If integrity check fails, the constructor throws — so reaching here means it passed.
        (0, vitest_1.expect)(store).toBeDefined();
    });
    (0, vitest_1.it)('insertSegment and querySegments round-trip', () => {
        const seg = {
            id: 'seg-1',
            appName: 'VSCode',
            windowTitle: 'main.ts',
            appCategory: 'ide',
            startTime: 1000,
            endTime: 2000,
            tickCount: 10,
            inputSignals: { keystrokeCount: 100, mouseClickCount: 5, scrollEventCount: 3 },
            classification: 'deep_work',
            isManualOverride: false,
        };
        store.insertSegment(seg);
        const results = store.querySegments(0, 3000);
        (0, vitest_1.expect)(results).toHaveLength(1);
        (0, vitest_1.expect)(results[0]).toMatchObject({
            id: 'seg-1',
            appName: 'VSCode',
            classification: 'deep_work',
            isManualOverride: false,
        });
    });
    (0, vitest_1.it)('insertTask and queryTasks round-trip', () => {
        const task = {
            id: 'task-1',
            title: 'Write tests',
            priority: 'high',
            completed: false,
            completedDuringDeepWork: false,
            xpAwarded: 0,
            order: 0,
        };
        store.insertTask(task);
        const tasks = store.queryTasks();
        (0, vitest_1.expect)(tasks).toHaveLength(1);
        (0, vitest_1.expect)(tasks[0]?.title).toBe('Write tests');
        (0, vitest_1.expect)(tasks[0]?.priority).toBe('high');
    });
    (0, vitest_1.it)('updateTask persists changes', () => {
        const task = {
            id: 'task-2',
            title: 'Original',
            priority: 'low',
            completed: false,
            completedDuringDeepWork: false,
            xpAwarded: 0,
            order: 0,
        };
        store.insertTask(task);
        store.updateTask({ ...task, title: 'Updated', completed: true });
        const tasks = store.queryTasks();
        (0, vitest_1.expect)(tasks[0]?.title).toBe('Updated');
        (0, vitest_1.expect)(tasks[0]?.completed).toBe(true);
    });
    (0, vitest_1.it)('deleteTask removes the row', () => {
        const task = {
            id: 'task-3',
            title: 'To delete',
            priority: 'medium',
            completed: false,
            completedDuringDeepWork: false,
            xpAwarded: 0,
            order: 0,
        };
        store.insertTask(task);
        store.deleteTask('task-3');
        (0, vitest_1.expect)(store.queryTasks()).toHaveLength(0);
    });
    (0, vitest_1.it)('upsertPaceRecord and getPaceRecord round-trip', () => {
        const record = {
            activityKey: 'vscode:typescript',
            bestPaceScore: 0.85,
            sessionCount: 5,
            lastUpdated: Date.now(),
        };
        store.upsertPaceRecord(record);
        const fetched = store.getPaceRecord('vscode:typescript');
        (0, vitest_1.expect)(fetched).not.toBeNull();
        (0, vitest_1.expect)(fetched?.bestPaceScore).toBeCloseTo(0.85);
        (0, vitest_1.expect)(fetched?.sessionCount).toBe(5);
    });
    (0, vitest_1.it)('getPaceRecord returns null for unknown key', () => {
        (0, vitest_1.expect)(store.getPaceRecord('nonexistent')).toBeNull();
    });
    (0, vitest_1.it)('saveModelBlob and loadModelBlob round-trip', () => {
        const blob = Buffer.from('fake-model-weights');
        store.saveModelBlob(blob);
        const loaded = store.loadModelBlob();
        (0, vitest_1.expect)(loaded).not.toBeNull();
        (0, vitest_1.expect)(loaded?.toString()).toBe('fake-model-weights');
    });
    (0, vitest_1.it)('loadModelBlob returns null when no model stored', () => {
        (0, vitest_1.expect)(store.loadModelBlob()).toBeNull();
    });
    (0, vitest_1.it)('upsertCalendarEvent and queryCalendarEvents round-trip', () => {
        const event = {
            id: 'cal-1',
            title: 'Team standup',
            startTime: 1000,
            endTime: 2000,
            calendarId: 'primary',
            syncedAt: Date.now(),
        };
        store.upsertCalendarEvent(event);
        const results = store.queryCalendarEvents(0, 3000);
        (0, vitest_1.expect)(results).toHaveLength(1);
        (0, vitest_1.expect)(results[0]?.title).toBe('Team standup');
    });
    (0, vitest_1.it)('deleteAllCalendarEvents clears calendar table', () => {
        const event = {
            id: 'cal-2',
            title: 'Meeting',
            startTime: 1000,
            endTime: 2000,
            calendarId: 'primary',
            syncedAt: Date.now(),
        };
        store.upsertCalendarEvent(event);
        store.deleteAllCalendarEvents();
        (0, vitest_1.expect)(store.queryCalendarEvents(0, 3000)).toHaveLength(0);
    });
    (0, vitest_1.it)('insertAuditLog persists entries', () => {
        const entry = {
            id: 'audit-1',
            timestamp: Date.now(),
            eventType: 'blocked_connection',
            detail: 'https://example.com',
        };
        store.insertAuditLog(entry);
        const db = store._db();
        const count = db.prepare('SELECT COUNT(*) as n FROM audit_log').get().n;
        (0, vitest_1.expect)(count).toBe(1);
    });
    (0, vitest_1.it)('deleteAllData empties all tables', () => {
        const task = {
            id: 'task-del',
            title: 'Delete me',
            priority: 'low',
            completed: false,
            completedDuringDeepWork: false,
            xpAwarded: 0,
            order: 0,
        };
        store.insertTask(task);
        store.saveModelBlob(Buffer.from('data'));
        store.deleteAllData();
        (0, vitest_1.expect)(store.queryTasks()).toHaveLength(0);
        (0, vitest_1.expect)(store.loadModelBlob()).toBeNull();
    });
});
