"use strict";
// Feature: snapback-productivity-suite, Property 17: Task CRUD Round-Trip
// Feature: snapback-productivity-suite, Property 18: XP Award Correctness
// Feature: snapback-productivity-suite, Property 19: Badge Award Threshold Crossing
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const TaskManagerService_js_1 = require("./TaskManagerService.js");
const LocalStore_js_1 = require("../store/LocalStore.js");
// ─── Arbitraries ─────────────────────────────────────────────────────────────
const arbPriority = fast_check_1.default.oneof(fast_check_1.default.constant('low'), fast_check_1.default.constant('medium'), fast_check_1.default.constant('high'));
// ─── Property 17: Task CRUD Round-Trip ───────────────────────────────────────
(0, vitest_1.describe)('Property 17: Task CRUD Round-Trip', () => {
    (0, vitest_1.it)('creating a task and querying returns equivalent fields', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.string({ minLength: 1, maxLength: 128 }), arbPriority, fast_check_1.default.option(fast_check_1.default.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }), (title, priority, dueDate) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const svc = new TaskManagerService_js_1.TaskManagerService(store);
            const created = svc.createTask({
                title,
                priority,
                dueDate,
                completed: false,
                completedDuringDeepWork: false,
            });
            const tasks = store.queryTasks();
            const found = tasks.find((t) => t.id === created.id);
            const ok = found !== undefined &&
                found.title === title &&
                found.priority === priority &&
                found.dueDate === dueDate &&
                found.completed === false;
            store.close();
            return ok;
        }), { numRuns: 100 });
    });
});
// ─── Property 18: XP Award Correctness ───────────────────────────────────────
(0, vitest_1.describe)('Property 18: XP Award Correctness', () => {
    (0, vitest_1.it)('awards correct XP for any priority and deep work combination', () => {
        fast_check_1.default.assert(fast_check_1.default.property(arbPriority, fast_check_1.default.boolean(), (priority, duringDeepWork) => {
            const xp = (0, TaskManagerService_js_1.computeXP)(priority, duringDeepWork);
            const expected = {
                low: { normal: 10, deep: 15 },
                medium: { normal: 25, deep: 37 },
                high: { normal: 50, deep: 75 },
            };
            const key = duringDeepWork ? 'deep' : 'normal';
            return xp === expected[priority][key];
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('completeTask awards correct XP via the service', () => {
        fast_check_1.default.assert(fast_check_1.default.property(arbPriority, fast_check_1.default.boolean(), (priority, duringDeepWork) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const svc = new TaskManagerService_js_1.TaskManagerService(store);
            const task = svc.createTask({
                title: 'Test task',
                priority,
                completed: false,
                completedDuringDeepWork: false,
            });
            const xpEvent = svc.completeTask(task.id, duringDeepWork);
            const expectedXP = (0, TaskManagerService_js_1.computeXP)(priority, duringDeepWork);
            const ok = xpEvent.xpAmount === expectedXP &&
                xpEvent.multiplierApplied === duringDeepWork &&
                xpEvent.taskId === task.id;
            store.close();
            return ok;
        }), { numRuns: 100 });
    });
});
// ─── Property 19: Badge Award Threshold Crossing ─────────────────────────────
(0, vitest_1.describe)('Property 19: Badge Award Threshold Crossing', () => {
    (0, vitest_1.it)('badges are awarded exactly once when XP crosses threshold', () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.integer({ min: 1, max: 20 }), (taskCount) => {
            const store = new LocalStore_js_1.LocalStore(':memory:');
            const svc = new TaskManagerService_js_1.TaskManagerService(store);
            // Create and complete high-priority tasks (50 XP each)
            for (let i = 0; i < taskCount; i++) {
                const task = svc.createTask({
                    title: `Task ${i}`,
                    priority: 'high',
                    completed: false,
                    completedDuringDeepWork: false,
                });
                svc.completeTask(task.id, false);
            }
            const totalXP = svc.getTotalXP();
            const badges = svc.getBadges();
            // Verify: each badge is awarded at most once
            const awardedBadges = badges.filter((b) => b.awardedAt != null);
            const awardedIds = awardedBadges.map((b) => b.id);
            const uniqueIds = new Set(awardedIds);
            if (awardedIds.length !== uniqueIds.size) {
                store.close();
                return false; // duplicate badge award
            }
            // Verify: badges are awarded iff XP >= threshold
            for (const badge of badges) {
                const shouldBeAwarded = totalXP >= badge.xpThreshold;
                const isAwarded = badge.awardedAt != null;
                if (shouldBeAwarded !== isAwarded) {
                    store.close();
                    return false;
                }
            }
            store.close();
            return true;
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('completing the same task twice does not double-award badges', () => {
        const store = new LocalStore_js_1.LocalStore(':memory:');
        const svc = new TaskManagerService_js_1.TaskManagerService(store);
        // Create 3 high-priority tasks to get 150 XP (crosses 100 threshold)
        const tasks = [];
        for (let i = 0; i < 3; i++) {
            tasks.push(svc.createTask({
                title: `Task ${i}`,
                priority: 'high',
                completed: false,
                completedDuringDeepWork: false,
            }));
        }
        // Complete all
        for (const t of tasks) {
            svc.completeTask(t.id, false);
        }
        const badgesBefore = svc.getBadges();
        const starterBefore = badgesBefore.find((b) => b.id === 'badge-starter');
        (0, vitest_1.expect)(starterBefore?.awardedAt).toBeDefined();
        const awardedAtBefore = starterBefore.awardedAt;
        // Create and complete another task — should not re-award starter badge
        const extra = svc.createTask({
            title: 'Extra',
            priority: 'low',
            completed: false,
            completedDuringDeepWork: false,
        });
        svc.completeTask(extra.id, false);
        const badgesAfter = svc.getBadges();
        const starterAfter = badgesAfter.find((b) => b.id === 'badge-starter');
        // awardedAt should not have changed (idempotent)
        (0, vitest_1.expect)(starterAfter?.awardedAt).toBe(awardedAtBefore);
        store.close();
    });
});
// ─── Unit Tests ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('TaskManagerService — unit tests', () => {
    let store;
    let svc;
    (0, vitest_1.beforeEach)(() => {
        store = new LocalStore_js_1.LocalStore(':memory:');
        svc = new TaskManagerService_js_1.TaskManagerService(store);
    });
    (0, vitest_1.afterEach)(() => {
        store.close();
    });
    (0, vitest_1.it)('createTask returns a task with generated id and order', () => {
        const task = svc.createTask({
            title: 'Write tests',
            priority: 'high',
            completed: false,
            completedDuringDeepWork: false,
        });
        (0, vitest_1.expect)(task.id).toBeTruthy();
        (0, vitest_1.expect)(task.title).toBe('Write tests');
        (0, vitest_1.expect)(task.priority).toBe('high');
        (0, vitest_1.expect)(task.xpAwarded).toBe(0);
        (0, vitest_1.expect)(task.order).toBe(0);
    });
    (0, vitest_1.it)('createTask auto-increments order', () => {
        const t1 = svc.createTask({ title: 'A', priority: 'low', completed: false, completedDuringDeepWork: false });
        const t2 = svc.createTask({ title: 'B', priority: 'low', completed: false, completedDuringDeepWork: false });
        (0, vitest_1.expect)(t2.order).toBe(t1.order + 1);
    });
    (0, vitest_1.it)('updateTask persists changes', () => {
        const task = svc.createTask({ title: 'Original', priority: 'low', completed: false, completedDuringDeepWork: false });
        const updated = svc.updateTask(task.id, { title: 'Updated', priority: 'high' });
        (0, vitest_1.expect)(updated.title).toBe('Updated');
        (0, vitest_1.expect)(updated.priority).toBe('high');
        const tasks = store.queryTasks();
        (0, vitest_1.expect)(tasks[0]?.title).toBe('Updated');
    });
    (0, vitest_1.it)('updateTask throws for non-existent task', () => {
        (0, vitest_1.expect)(() => svc.updateTask('nonexistent', { title: 'X' })).toThrow('Task not found');
    });
    (0, vitest_1.it)('deleteTask removes the task', () => {
        const task = svc.createTask({ title: 'Delete me', priority: 'low', completed: false, completedDuringDeepWork: false });
        svc.deleteTask(task.id);
        (0, vitest_1.expect)(store.queryTasks()).toHaveLength(0);
    });
    (0, vitest_1.it)('reorderTasks updates sort order', () => {
        const t1 = svc.createTask({ title: 'A', priority: 'low', completed: false, completedDuringDeepWork: false });
        const t2 = svc.createTask({ title: 'B', priority: 'low', completed: false, completedDuringDeepWork: false });
        const t3 = svc.createTask({ title: 'C', priority: 'low', completed: false, completedDuringDeepWork: false });
        svc.reorderTasks([t3.id, t1.id, t2.id]);
        const tasks = store.queryTasks();
        (0, vitest_1.expect)(tasks[0]?.id).toBe(t3.id);
        (0, vitest_1.expect)(tasks[1]?.id).toBe(t1.id);
        (0, vitest_1.expect)(tasks[2]?.id).toBe(t2.id);
    });
    (0, vitest_1.it)('completeTask marks task as completed with correct XP', () => {
        const task = svc.createTask({ title: 'Do it', priority: 'medium', completed: false, completedDuringDeepWork: false });
        const xpEvent = svc.completeTask(task.id, false);
        (0, vitest_1.expect)(xpEvent.xpAmount).toBe(25);
        (0, vitest_1.expect)(xpEvent.multiplierApplied).toBe(false);
        const tasks = store.queryTasks();
        (0, vitest_1.expect)(tasks[0]?.completed).toBe(true);
        (0, vitest_1.expect)(tasks[0]?.xpAwarded).toBe(25);
    });
    (0, vitest_1.it)('completeTask applies 1.5x multiplier during deep work', () => {
        const task = svc.createTask({ title: 'Focus task', priority: 'medium', completed: false, completedDuringDeepWork: false });
        const xpEvent = svc.completeTask(task.id, true);
        (0, vitest_1.expect)(xpEvent.xpAmount).toBe(37); // floor(25 * 1.5)
        (0, vitest_1.expect)(xpEvent.multiplierApplied).toBe(true);
    });
    (0, vitest_1.it)('completeTask throws for non-existent task', () => {
        (0, vitest_1.expect)(() => svc.completeTask('nonexistent', false)).toThrow('Task not found');
    });
    (0, vitest_1.it)('getTotalXP sums all XP events', () => {
        const t1 = svc.createTask({ title: 'A', priority: 'high', completed: false, completedDuringDeepWork: false });
        const t2 = svc.createTask({ title: 'B', priority: 'low', completed: false, completedDuringDeepWork: false });
        svc.completeTask(t1.id, false); // 50 XP
        svc.completeTask(t2.id, true); // 15 XP
        (0, vitest_1.expect)(svc.getTotalXP()).toBe(65);
    });
    (0, vitest_1.it)('getBadges returns all badge definitions', () => {
        const badges = svc.getBadges();
        (0, vitest_1.expect)(badges.length).toBe(4);
        (0, vitest_1.expect)(badges.map((b) => b.name)).toContain('Starter');
        (0, vitest_1.expect)(badges.map((b) => b.name)).toContain('Flow Master');
    });
    (0, vitest_1.it)('badges are awarded when XP crosses threshold', () => {
        // Need 100 XP for Starter badge: 2 high-priority tasks = 100 XP
        const t1 = svc.createTask({ title: 'A', priority: 'high', completed: false, completedDuringDeepWork: false });
        const t2 = svc.createTask({ title: 'B', priority: 'high', completed: false, completedDuringDeepWork: false });
        svc.completeTask(t1.id, false); // 50 XP
        svc.completeTask(t2.id, false); // 50 XP → total 100
        const badges = svc.getBadges();
        const starter = badges.find((b) => b.name === 'Starter');
        (0, vitest_1.expect)(starter?.awardedAt).toBeDefined();
        const focused = badges.find((b) => b.name === 'Focused');
        (0, vitest_1.expect)(focused?.awardedAt).toBeUndefined(); // 500 XP needed
    });
    (0, vitest_1.it)('computeXP returns correct values for all combinations', () => {
        (0, vitest_1.expect)((0, TaskManagerService_js_1.computeXP)('low', false)).toBe(10);
        (0, vitest_1.expect)((0, TaskManagerService_js_1.computeXP)('low', true)).toBe(15);
        (0, vitest_1.expect)((0, TaskManagerService_js_1.computeXP)('medium', false)).toBe(25);
        (0, vitest_1.expect)((0, TaskManagerService_js_1.computeXP)('medium', true)).toBe(37);
        (0, vitest_1.expect)((0, TaskManagerService_js_1.computeXP)('high', false)).toBe(50);
        (0, vitest_1.expect)((0, TaskManagerService_js_1.computeXP)('high', true)).toBe(75);
    });
});
