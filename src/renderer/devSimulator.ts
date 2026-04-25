/**
 * Dev Simulator — generates realistic activity data for browser-based development.
 *
 * When running outside Electron (no window.snapbackAPI), this module provides
 * simulated data so the dashboard, heatmap, and tasks pages render with
 * meaningful visualizations instead of empty states.
 *
 * Data is seeded deterministically so it's consistent across page reloads.
 */

import type {
  Classification,
  DailySummary,
  SevenDayTrendEntry,
  HeatMapCell,
  TooltipData,
  AppTimeSummary,
  TaskInfo,
  BadgeInfo,
  AppSettings,
  SnapBackIPC,
} from './ipc.js';

// ─── Seeded random ───────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── App simulation data ─────────────────────────────────────────────────────

const APPS: Array<{ name: string; category: Classification; weight: number }> = [
  { name: 'VS Code', category: 'deep_work', weight: 35 },
  { name: 'Chrome', category: 'shallow_work', weight: 20 },
  { name: 'Slack', category: 'shallow_work', weight: 10 },
  { name: 'Terminal', category: 'deep_work', weight: 10 },
  { name: 'Notion', category: 'shallow_work', weight: 8 },
  { name: 'Discord', category: 'distraction_loop', weight: 5 },
  { name: 'YouTube', category: 'distraction_loop', weight: 4 },
  { name: 'Spotify', category: 'distraction_loop', weight: 3 },
  { name: 'Outlook', category: 'shallow_work', weight: 3 },
  { name: 'Figma', category: 'deep_work', weight: 2 },
];

// ─── In-memory task store ────────────────────────────────────────────────────

let nextTaskOrder = 0;

const INITIAL_TASKS: TaskInfo[] = [
  { id: 't1', title: 'Implement user authentication flow', priority: 'high', completed: true, xpAwarded: 75, order: 0 },
  { id: 't2', title: 'Write unit tests for Classifier', priority: 'high', completed: true, xpAwarded: 75, order: 1 },
  { id: 't3', title: 'Design settings page layout', priority: 'medium', completed: true, xpAwarded: 25, order: 2 },
  { id: 't4', title: 'Fix heatmap tooltip positioning', priority: 'medium', completed: false, xpAwarded: 0, order: 3 },
  { id: 't5', title: 'Add keyboard shortcuts for navigation', priority: 'low', completed: false, xpAwarded: 0, order: 4 },
  { id: 't6', title: 'Optimize SQLite query performance', priority: 'high', completed: false, xpAwarded: 0, order: 5 },
  { id: 't7', title: 'Add export to CSV feature', priority: 'low', completed: false, xpAwarded: 0, order: 6 },
  { id: 't8', title: 'Review PR #42 — CalendarSync refactor', priority: 'medium', completed: false, xpAwarded: 0, order: 7 },
];

let taskStore = [...INITIAL_TASKS];
nextTaskOrder = taskStore.length;

const BADGES: BadgeInfo[] = [
  { id: 'badge-starter', name: 'Starter', description: 'Earned 100 XP', xpThreshold: 100, awardedAt: Date.now() - 86400000 * 3 },
  { id: 'badge-focused', name: 'Focused', description: 'Earned 500 XP', xpThreshold: 500, awardedAt: undefined },
  { id: 'badge-deep-worker', name: 'Deep Worker', description: 'Earned 1000 XP', xpThreshold: 1000, awardedAt: undefined },
  { id: 'badge-flow-master', name: 'Flow Master', description: 'Earned 5000 XP', xpThreshold: 5000, awardedAt: undefined },
];

// ─── Data generators ─────────────────────────────────────────────────────────

function generateDailySummary(date: string): DailySummary {
  const seed = dateToSeed(date);
  const rand = seededRandom(seed);

  // Simulate 5–8 hours of tracked time
  const totalHours = 5 + rand() * 3;
  const totalTrackedMs = totalHours * 3600000;

  // Distribution: ~45% deep, ~35% shallow, ~20% distraction
  const deepRatio = 0.35 + rand() * 0.25;
  const distractionRatio = 0.1 + rand() * 0.15;
  const shallowRatio = 1 - deepRatio - distractionRatio;

  return {
    date,
    totalTrackedMs: Math.round(totalTrackedMs),
    deepWorkMs: Math.round(totalTrackedMs * deepRatio),
    shallowWorkMs: Math.round(totalTrackedMs * shallowRatio),
    distractionLoopMs: Math.round(totalTrackedMs * distractionRatio),
  };
}

function generateSevenDayTrend(): SevenDayTrendEntry[] {
  const entries: SevenDayTrendEntry[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const summary = generateDailySummary(dateStr);
    entries.push({ date: dateStr, deepWorkMs: summary.deepWorkMs });
  }
  return entries;
}

function generateHeatMapCells(date: string): HeatMapCell[] {
  const seed = dateToSeed(date);
  const rand = seededRandom(seed);
  const dayStart = new Date(date + 'T00:00:00').getTime();
  const cells: HeatMapCell[] = [];

  for (let i = 0; i < 96; i++) {
    const hour = Math.floor(i / 4);
    const cellStart = dayStart + i * 15 * 60 * 1000;
    const cellEnd = cellStart + 15 * 60 * 1000;

    // No activity before 7am or after 10pm
    if (hour < 7 || hour >= 22) {
      cells.push({ cellIndex: i, startTime: cellStart, endTime: cellEnd, classification: null, hasData: false });
      continue;
    }

    // Lunch break (12:00–12:45) — mostly inactive
    if (hour === 12 && (i % 4) < 3) {
      const hasData = rand() > 0.7;
      cells.push({
        cellIndex: i, startTime: cellStart, endTime: cellEnd,
        classification: hasData ? 'distraction_loop' : null,
        hasData,
      });
      continue;
    }

    // Morning (7–12): mostly deep work
    // Afternoon (13–17): mix of shallow and deep
    // Evening (17–22): mostly shallow/distraction
    const r = rand();
    let classification: Classification;
    if (hour >= 7 && hour < 12) {
      classification = r < 0.6 ? 'deep_work' : r < 0.85 ? 'shallow_work' : 'distraction_loop';
    } else if (hour >= 13 && hour < 17) {
      classification = r < 0.35 ? 'deep_work' : r < 0.75 ? 'shallow_work' : 'distraction_loop';
    } else {
      classification = r < 0.15 ? 'deep_work' : r < 0.55 ? 'shallow_work' : 'distraction_loop';
    }

    // ~85% chance of having data during work hours
    const hasData = rand() < 0.85;
    cells.push({
      cellIndex: i, startTime: cellStart, endTime: cellEnd,
      classification: hasData ? classification : null,
      hasData,
    });
  }

  return cells;
}

function generateTooltip(cellIndex: number, date: string): TooltipData | null {
  const cells = generateHeatMapCells(date);
  const cell = cells[cellIndex];
  if (!cell || !cell.hasData || !cell.classification) return null;

  const seed = dateToSeed(date) + cellIndex;
  const rand = seededRandom(seed);

  // Pick an app matching the classification
  const matching = APPS.filter((a) => a.category === cell.classification);
  const app = matching[Math.floor(rand() * matching.length)] ?? APPS[0]!;

  return {
    appName: app.name,
    classification: cell.classification,
    durationMs: Math.round((5 + rand() * 10) * 60 * 1000), // 5–15 minutes
  };
}

function generateAppTime(): AppTimeSummary[] {
  const rand = seededRandom(42);
  return APPS.map((app) => ({
    appName: app.name,
    totalDurationMs: Math.round(app.weight * (0.5 + rand() * 1.5) * 60 * 60 * 1000 / 10),
  })).sort((a, b) => b.totalDurationMs - a.totalDurationMs);
}

function dateToSeed(date: string): number {
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = ((hash << 5) - hash + date.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) + 1;
}

// ─── XP helpers ──────────────────────────────────────────────────────────────

const BASE_XP: Record<string, number> = { low: 10, medium: 25, high: 50 };

function computeTotalXP(): number {
  return taskStore.reduce((sum, t) => sum + t.xpAwarded, 0);
}

function checkBadges(): BadgeInfo[] {
  const totalXP = computeTotalXP();
  return BADGES.map((b) => ({
    ...b,
    awardedAt: totalXP >= b.xpThreshold ? (b.awardedAt ?? Date.now()) : undefined,
  }));
}

// ─── Simulated IPC ───────────────────────────────────────────────────────────

export function createDevIPC(): SnapBackIPC {
  return {
    async getDailySummary(date: string) {
      return generateDailySummary(date);
    },

    async getSevenDayTrend() {
      return generateSevenDayTrend();
    },

    async getAppTimeByDateRange() {
      return generateAppTime();
    },

    async getHeatMapCells(date: string) {
      return generateHeatMapCells(date);
    },

    async getHeatMapTooltip(cellIndex: number, date: string) {
      return generateTooltip(cellIndex, date);
    },

    async getActiveCalendarEvent() {
      return null;
    },

    async exportWeeklyReportPDF() {},

    async getTasks() {
      return [...taskStore].sort((a, b) => a.order - b.order);
    },

    async createTask(title: string, priority: 'low' | 'medium' | 'high', dueDate?: number) {
      const task: TaskInfo = {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        priority,
        dueDate,
        completed: false,
        xpAwarded: 0,
        order: nextTaskOrder++,
      };
      taskStore.push(task);
      return task;
    },

    async updateTask(id: string, updates: Partial<TaskInfo>) {
      const idx = taskStore.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error(`Task not found: ${id}`);
      taskStore[idx] = { ...taskStore[idx]!, ...updates, id };
      return taskStore[idx]!;
    },

    async deleteTask(id: string) {
      taskStore = taskStore.filter((t) => t.id !== id);
    },

    async completeTask(id: string, duringDeepWork: boolean) {
      const idx = taskStore.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error(`Task not found: ${id}`);
      const task = taskStore[idx]!;
      const base = BASE_XP[task.priority] ?? 10;
      const xpAmount = duringDeepWork ? Math.floor(base * 1.5) : base;
      taskStore[idx] = { ...task, completed: true, xpAwarded: xpAmount };
      return { xpAmount };
    },

    async reorderTasks(orderedIds: string[]) {
      for (let i = 0; i < orderedIds.length; i++) {
        const task = taskStore.find((t) => t.id === orderedIds[i]);
        if (task) task.order = i;
      }
    },

    async getTotalXP() {
      return computeTotalXP();
    },

    async getBadges() {
      return checkBadges();
    },

    async getSettings() {
      return {
        language: 'en', darkMode: false, colorBlindMode: false,
        reducedMotion: false, ghostBarEnabled: true,
        ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false,
      };
    },

    async updateSettings(updates: Partial<AppSettings>) {
      return {
        language: 'en', darkMode: false, colorBlindMode: false,
        reducedMotion: false, ghostBarEnabled: true,
        ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false,
        ...updates,
      };
    },

    async authorizeCalendar() {},
    async revokeCalendar() {},
    async deleteAllData() {
      taskStore = [];
    },
  };
}
