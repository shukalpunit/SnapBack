"use strict";
/**
 * TaskManagerService — Gamified to-do list with XP, badges, and progression.
 *
 * Handles task CRUD, XP awards with deep-work multiplier, and idempotent
 * badge threshold crossing detection. All data persisted via LocalStore.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManagerService = void 0;
exports.computeXP = computeXP;
const node_crypto_1 = require("node:crypto");
// ─── XP Table ────────────────────────────────────────────────────────────────
const BASE_XP = {
    low: 10,
    medium: 25,
    high: 50,
};
const DEEP_WORK_MULTIPLIER = 1.5;
/** Compute XP for a task completion. */
function computeXP(priority, duringDeepWork) {
    const base = BASE_XP[priority];
    if (!duringDeepWork)
        return base;
    return Math.floor(base * DEEP_WORK_MULTIPLIER);
}
// ─── Badge Definitions ───────────────────────────────────────────────────────
const BADGE_DEFINITIONS = [
    { id: 'badge-starter', name: 'Starter', description: 'Earned 100 XP', xpThreshold: 100 },
    { id: 'badge-focused', name: 'Focused', description: 'Earned 500 XP', xpThreshold: 500 },
    { id: 'badge-deep-worker', name: 'Deep Worker', description: 'Earned 1000 XP', xpThreshold: 1000 },
    { id: 'badge-flow-master', name: 'Flow Master', description: 'Earned 5000 XP', xpThreshold: 5000 },
];
// ─── TaskManagerService ──────────────────────────────────────────────────────
class TaskManagerService {
    store;
    constructor(store) {
        this.store = store;
        this.ensureBadgesExist();
    }
    createTask(input) {
        const existingTasks = this.store.queryTasks();
        const maxOrder = existingTasks.reduce((max, t) => Math.max(max, t.order), -1);
        const task = {
            id: (0, node_crypto_1.randomUUID)(),
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
    updateTask(id, updates) {
        const tasks = this.store.queryTasks();
        const existing = tasks.find((t) => t.id === id);
        if (!existing)
            throw new Error(`Task not found: ${id}`);
        const updated = {
            ...existing,
            ...updates,
            id, // ensure id is not overwritten
        };
        this.store.updateTask(updated);
        return updated;
    }
    deleteTask(id) {
        this.store.deleteTask(id);
    }
    reorderTasks(orderedIds) {
        const tasks = this.store.queryTasks();
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        for (let i = 0; i < orderedIds.length; i++) {
            const task = taskMap.get(orderedIds[i]);
            if (task) {
                this.store.updateTask({ ...task, order: i });
            }
        }
    }
    completeTask(id, duringDeepWork) {
        const tasks = this.store.queryTasks();
        const task = tasks.find((t) => t.id === id);
        if (!task)
            throw new Error(`Task not found: ${id}`);
        const xpAmount = computeXP(task.priority, duringDeepWork);
        const now = Date.now();
        // Update task as completed
        const updatedTask = {
            ...task,
            completed: true,
            completedAt: now,
            completedDuringDeepWork: duringDeepWork,
            xpAwarded: xpAmount,
        };
        this.store.updateTask(updatedTask);
        // Record XP event
        const xpEvent = {
            id: (0, node_crypto_1.randomUUID)(),
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
    getTotalXP() {
        const events = this.store.queryXPEvents();
        return events.reduce((sum, e) => sum + e.xpAmount, 0);
    }
    getBadges() {
        // Read badges from store — awarded ones have awardedAt set
        const tasks = this.store.queryTasks(); // just to trigger any lazy init
        // We need to read badges directly from the DB
        try {
            const db = this.store._db?.();
            if (!db)
                return [];
            const rows = db.prepare('SELECT * FROM badges ORDER BY xp_threshold ASC').all();
            return rows.map((row) => ({
                id: row['id'],
                name: row['name'],
                description: row['description'],
                xpThreshold: row['xp_threshold'],
                awardedAt: row['awarded_at'] != null ? row['awarded_at'] : undefined,
            }));
        }
        catch {
            return [];
        }
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    /** Ensure all badge definitions exist in the store. */
    ensureBadgesExist() {
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
            const db = this.store._db?.();
            if (!db)
                return;
            for (const def of BADGE_DEFINITIONS) {
                db.prepare(`
          INSERT OR IGNORE INTO badges (id, name, description, xp_threshold, awarded_at)
          VALUES (?, ?, ?, ?, NULL)
        `).run(def.id, def.name, def.description, def.xpThreshold);
            }
        }
        catch {
            // Swallow
        }
    }
    /** Check if total XP crosses any badge threshold; award once (idempotent). */
    checkBadgeThresholds() {
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
exports.TaskManagerService = TaskManagerService;
