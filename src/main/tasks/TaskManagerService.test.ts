// Feature: snapback-productivity-suite, Property 17: Task CRUD Round-Trip
// Feature: snapback-productivity-suite, Property 18: XP Award Correctness
// Feature: snapback-productivity-suite, Property 19: Badge Award Threshold Crossing
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { TaskManagerService, computeXP } from './TaskManagerService.js';
import { LocalStore } from '../store/LocalStore.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const arbPriority = fc.oneof(
  fc.constant<'low' | 'medium' | 'high'>('low'),
  fc.constant<'low' | 'medium' | 'high'>('medium'),
  fc.constant<'low' | 'medium' | 'high'>('high')
);

// ─── Property 17: Task CRUD Round-Trip ───────────────────────────────────────

describe('Property 17: Task CRUD Round-Trip', () => {
  it('creating a task and querying returns equivalent fields', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 128 }),
        arbPriority,
        fc.option(fc.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
        (title, priority, dueDate) => {
          const store = new LocalStore(':memory:');
          const svc = new TaskManagerService(store);

          const created = svc.createTask({
            title,
            priority,
            dueDate,
            completed: false,
            completedDuringDeepWork: false,
          });

          const tasks = store.queryTasks();
          const found = tasks.find((t) => t.id === created.id);

          const ok =
            found !== undefined &&
            found.title === title &&
            found.priority === priority &&
            found.dueDate === dueDate &&
            found.completed === false;

          store.close();
          return ok;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 18: XP Award Correctness ───────────────────────────────────────

describe('Property 18: XP Award Correctness', () => {
  it('awards correct XP for any priority and deep work combination', () => {
    fc.assert(
      fc.property(
        arbPriority,
        fc.boolean(),
        (priority, duringDeepWork) => {
          const xp = computeXP(priority, duringDeepWork);

          const expected: Record<string, Record<string, number>> = {
            low:    { normal: 10, deep: 15 },
            medium: { normal: 25, deep: 37 },
            high:   { normal: 50, deep: 75 },
          };

          const key = duringDeepWork ? 'deep' : 'normal';
          return xp === expected[priority]![key]!;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('completeTask awards correct XP via the service', () => {
    fc.assert(
      fc.property(
        arbPriority,
        fc.boolean(),
        (priority, duringDeepWork) => {
          const store = new LocalStore(':memory:');
          const svc = new TaskManagerService(store);

          const task = svc.createTask({
            title: 'Test task',
            priority,
            completed: false,
            completedDuringDeepWork: false,
          });

          const xpEvent = svc.completeTask(task.id, duringDeepWork);
          const expectedXP = computeXP(priority, duringDeepWork);

          const ok =
            xpEvent.xpAmount === expectedXP &&
            xpEvent.multiplierApplied === duringDeepWork &&
            xpEvent.taskId === task.id;

          store.close();
          return ok;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 19: Badge Award Threshold Crossing ─────────────────────────────

describe('Property 19: Badge Award Threshold Crossing', () => {
  it('badges are awarded exactly once when XP crosses threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (taskCount) => {
          const store = new LocalStore(':memory:');
          const svc = new TaskManagerService(store);

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
        }
      ),
      { numRuns: 50 }
    );
  });

  it('completing the same task twice does not double-award badges', () => {
    const store = new LocalStore(':memory:');
    const svc = new TaskManagerService(store);

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
    expect(starterBefore?.awardedAt).toBeDefined();
    const awardedAtBefore = starterBefore!.awardedAt;

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
    expect(starterAfter?.awardedAt).toBe(awardedAtBefore);

    store.close();
  });
});

// ─── Unit Tests ──────────────────────────────────────────────────────────────

describe('TaskManagerService — unit tests', () => {
  let store: LocalStore;
  let svc: TaskManagerService;

  beforeEach(() => {
    store = new LocalStore(':memory:');
    svc = new TaskManagerService(store);
  });

  afterEach(() => {
    store.close();
  });

  it('createTask returns a task with generated id and order', () => {
    const task = svc.createTask({
      title: 'Write tests',
      priority: 'high',
      completed: false,
      completedDuringDeepWork: false,
    });

    expect(task.id).toBeTruthy();
    expect(task.title).toBe('Write tests');
    expect(task.priority).toBe('high');
    expect(task.xpAwarded).toBe(0);
    expect(task.order).toBe(0);
  });

  it('createTask auto-increments order', () => {
    const t1 = svc.createTask({ title: 'A', priority: 'low', completed: false, completedDuringDeepWork: false });
    const t2 = svc.createTask({ title: 'B', priority: 'low', completed: false, completedDuringDeepWork: false });
    expect(t2.order).toBe(t1.order + 1);
  });

  it('updateTask persists changes', () => {
    const task = svc.createTask({ title: 'Original', priority: 'low', completed: false, completedDuringDeepWork: false });
    const updated = svc.updateTask(task.id, { title: 'Updated', priority: 'high' });

    expect(updated.title).toBe('Updated');
    expect(updated.priority).toBe('high');

    const tasks = store.queryTasks();
    expect(tasks[0]?.title).toBe('Updated');
  });

  it('updateTask throws for non-existent task', () => {
    expect(() => svc.updateTask('nonexistent', { title: 'X' })).toThrow('Task not found');
  });

  it('deleteTask removes the task', () => {
    const task = svc.createTask({ title: 'Delete me', priority: 'low', completed: false, completedDuringDeepWork: false });
    svc.deleteTask(task.id);
    expect(store.queryTasks()).toHaveLength(0);
  });

  it('reorderTasks updates sort order', () => {
    const t1 = svc.createTask({ title: 'A', priority: 'low', completed: false, completedDuringDeepWork: false });
    const t2 = svc.createTask({ title: 'B', priority: 'low', completed: false, completedDuringDeepWork: false });
    const t3 = svc.createTask({ title: 'C', priority: 'low', completed: false, completedDuringDeepWork: false });

    svc.reorderTasks([t3.id, t1.id, t2.id]);

    const tasks = store.queryTasks();
    expect(tasks[0]?.id).toBe(t3.id);
    expect(tasks[1]?.id).toBe(t1.id);
    expect(tasks[2]?.id).toBe(t2.id);
  });

  it('completeTask marks task as completed with correct XP', () => {
    const task = svc.createTask({ title: 'Do it', priority: 'medium', completed: false, completedDuringDeepWork: false });
    const xpEvent = svc.completeTask(task.id, false);

    expect(xpEvent.xpAmount).toBe(25);
    expect(xpEvent.multiplierApplied).toBe(false);

    const tasks = store.queryTasks();
    expect(tasks[0]?.completed).toBe(true);
    expect(tasks[0]?.xpAwarded).toBe(25);
  });

  it('completeTask applies 1.5x multiplier during deep work', () => {
    const task = svc.createTask({ title: 'Focus task', priority: 'medium', completed: false, completedDuringDeepWork: false });
    const xpEvent = svc.completeTask(task.id, true);

    expect(xpEvent.xpAmount).toBe(37); // floor(25 * 1.5)
    expect(xpEvent.multiplierApplied).toBe(true);
  });

  it('completeTask throws for non-existent task', () => {
    expect(() => svc.completeTask('nonexistent', false)).toThrow('Task not found');
  });

  it('getTotalXP sums all XP events', () => {
    const t1 = svc.createTask({ title: 'A', priority: 'high', completed: false, completedDuringDeepWork: false });
    const t2 = svc.createTask({ title: 'B', priority: 'low', completed: false, completedDuringDeepWork: false });

    svc.completeTask(t1.id, false); // 50 XP
    svc.completeTask(t2.id, true);  // 15 XP

    expect(svc.getTotalXP()).toBe(65);
  });

  it('getBadges returns all badge definitions', () => {
    const badges = svc.getBadges();
    expect(badges.length).toBe(4);
    expect(badges.map((b) => b.name)).toContain('Starter');
    expect(badges.map((b) => b.name)).toContain('Flow Master');
  });

  it('badges are awarded when XP crosses threshold', () => {
    // Need 100 XP for Starter badge: 2 high-priority tasks = 100 XP
    const t1 = svc.createTask({ title: 'A', priority: 'high', completed: false, completedDuringDeepWork: false });
    const t2 = svc.createTask({ title: 'B', priority: 'high', completed: false, completedDuringDeepWork: false });

    svc.completeTask(t1.id, false); // 50 XP
    svc.completeTask(t2.id, false); // 50 XP → total 100

    const badges = svc.getBadges();
    const starter = badges.find((b) => b.name === 'Starter');
    expect(starter?.awardedAt).toBeDefined();

    const focused = badges.find((b) => b.name === 'Focused');
    expect(focused?.awardedAt).toBeUndefined(); // 500 XP needed
  });

  it('computeXP returns correct values for all combinations', () => {
    expect(computeXP('low', false)).toBe(10);
    expect(computeXP('low', true)).toBe(15);
    expect(computeXP('medium', false)).toBe(25);
    expect(computeXP('medium', true)).toBe(37);
    expect(computeXP('high', false)).toBe(50);
    expect(computeXP('high', true)).toBe(75);
  });
});
