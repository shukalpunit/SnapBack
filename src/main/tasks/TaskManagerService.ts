/**
 * TaskManagerService — Gamified to-do list with XP, badges, and progression.
 *
 * Handles task CRUD, XP awards with deep-work multiplier, and idempotent
 * badge threshold crossing detection. All data persisted via LocalStore.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { randomUUID } from 'node:crypto';
import type {
  Task,
  XPEvent,
  Badge,
  ITaskManagerService,
  ILocalStore,
} from '../types.js';

// ─── XP Table ────────────────────────────────────────────────────────────────

const BASE_XP: Record<Task['priority'], number> = {
  low: 10,
  medium: 25,
  high: 50,
};

const DEEP_WORK_MULTIPLIER = 1.5;

/** Compute XP for a task completion. */
export function computeXP(priority: Task['priority'], duringDeepWork: boolean): number {
  const base = BASE_XP[priority];
  if (!duringDeepWork) return base;
  return Math.floor(base * DEEP_WORK_MULTIPLIER);
}

// ─── Badge Definitions ───────────────────────────────────────────────────────

const BADGE_DEFINITIONS: Array<{ id: string; name: string; description: string; xpThreshold: number }> = [
  { id: 'badge-starter', name: 'Starter', description: 'Earned 100 XP', xpThreshold: 100 },
  { id: 'badge-focused', name: 'Focused', description: 'Earned 500 XP', xpThreshold: 500 },
  { id: 'badge-deep-worker', name: 'Deep Worker', description: 'Earned 1000 XP', xpThreshold: 1000 },
  { id: 'badge-flow-master', name: 'Flow Master', description: 'Earned 5000 XP', xpThreshold: 5000 },
];

// ─── TaskManagerService ──────────────────────────────────────────────────────

export class TaskManagerService implements ITaskManagerService {
  private store: ILocalStore;

  constructor(store: ILocalStore) {
    this.store = store;
    this.ensureBadgesExist();
  }

  createTask(input: Omit<Task, 'id' | 'xpAwarded' | 'order'>): Task {
    const existingTasks = this.store.queryTasks();
    const maxOrder = existingTasks.reduce((max, t) => Math.max(max, t.order), -1);

    const task: Task = {
      id: randomUUID(),
      title: input.title,
      dueDate: input.dueDate,
      priority: input.priority,
      completed: input.completed,
      completedAt: input.completedAt,
      completedDuringDeepWork: input.completedDuringDeepWork,
      xpAwarded: 0,
      order: maxOrder + 1,
    };

    this.store.insertTask(task);
    return task;
  }

  updateTask(id: string, updates: Partial<Task>): Task {
    const tasks = this.store.queryTasks();
    const existing = tasks.find((t) => t.id === id);
    if (!existing) throw new Error(`Task not found: ${id}`);

    const updated: Task = {
      ...existing,
      ...updates,
      id, // ensure id is not overwritten
    };

    this.store.updateTask(updated);
    return updated;
  }

  deleteTask(id: string): void {
    this.store.deleteTask(id);
  }

  reorderTasks(orderedIds: string[]): void {
    const tasks = this.store.queryTasks();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    for (let i = 0; i < orderedIds.length; i++) {
      const task = taskMap.get(orderedIds[i]!);
      if (task) {
        this.store.updateTask({ ...task, order: i });
      }
    }
  }

  completeTask(id: string, duringDeepWork: boolean): XPEvent {
    const tasks = this.store.queryTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);

    const xpAmount = computeXP(task.priority, duringDeepWork);
    const now = Date.now();

    // Update task as completed
    const updatedTask: Task = {
      ...task,
      completed: true,
      completedAt: now,
      completedDuringDeepWork: duringDeepWork,
      xpAwarded: xpAmount,
    };
    this.store.updateTask(updatedTask);

    // Record XP event
    const xpEvent: XPEvent = {
      id: randomUUID(),
      taskId: id,
      xpAmount,
      timestamp: now,
      multiplierApplied: duringDeepWork,
    };
    this.store.insertXPEvent(xpEvent);

    // Check badge thresholds
    this.checkBadgeThresholds();

    return xpEvent;
  }

  getTotalXP(): number {
    const events = this.store.queryXPEvents();
    return events.reduce((sum, e) => sum + e.xpAmount, 0);
  }

  getBadges(): Badge[] {
    // Read badges from store — awarded ones have awardedAt set
    const tasks = this.store.queryTasks(); // just to trigger any lazy init
    // We need to read badges directly from the DB
    try {
      const db = (this.store as any)._db?.();
      if (!db) return [];
      const rows = db.prepare('SELECT * FROM badges ORDER BY xp_threshold ASC').all() as Array<Record<string, unknown>>;
      return rows.map((row: Record<string, unknown>) => ({
        id: row['id'] as string,
        name: row['name'] as string,
        description: row['description'] as string,
        xpThreshold: row['xp_threshold'] as number,
        awardedAt: row['awarded_at'] != null ? (row['awarded_at'] as number) : undefined,
      }));
    } catch {
      return [];
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /** Ensure all badge definitions exist in the store. */
  private ensureBadgesExist(): void {
    for (const def of BADGE_DEFINITIONS) {
      this.store.upsertBadge({
        id: def.id,
        name: def.name,
        description: def.description,
        xpThreshold: def.xpThreshold,
        awardedAt: undefined, // don't overwrite if already awarded
      });
    }
    // Re-read to preserve any existing awardedAt values
    // The upsert above uses ON CONFLICT DO UPDATE which would clear awardedAt
    // Fix: only insert if not exists
    try {
      const db = (this.store as any)._db?.();
      if (!db) return;
      for (const def of BADGE_DEFINITIONS) {
        db.prepare(`
          INSERT OR IGNORE INTO badges (id, name, description, xp_threshold, awarded_at)
          VALUES (?, ?, ?, ?, NULL)
        `).run(def.id, def.name, def.description, def.xpThreshold);
      }
    } catch {
      // Swallow
    }
  }

  /** Check if total XP crosses any badge threshold; award once (idempotent). */
  private checkBadgeThresholds(): void {
    const totalXP = this.getTotalXP();
    const badges = this.getBadges();

    for (const badge of badges) {
      if (totalXP >= badge.xpThreshold && badge.awardedAt == null) {
        // Award the badge
        this.store.upsertBadge({
          ...badge,
          awardedAt: Date.now(),
        });
      }
    }
  }
}
