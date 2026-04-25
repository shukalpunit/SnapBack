/**
 * IPC bridge — typed wrappers for Electron IPC calls from renderer to main.
 *
 * In production (Electron), uses window.snapbackAPI from the preload script.
 * In browser dev mode, returns static demo data inline — no external modules.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Classification = 'deep_work' | 'shallow_work' | 'distraction_loop';

export interface AppTimeSummary { appName: string; totalDurationMs: number; }
export interface DailySummary { date: string; totalTrackedMs: number; deepWorkMs: number; shallowWorkMs: number; distractionLoopMs: number; }
export interface SevenDayTrendEntry { date: string; deepWorkMs: number; }
export interface HeatMapCell { cellIndex: number; startTime: number; endTime: number; classification: Classification | null; hasData: boolean; }
export interface TooltipData { appName: string; classification: Classification; durationMs: number; }
export interface CalendarEventInfo { title: string; startTime: number; endTime: number; }
export interface TaskInfo { id: string; title: string; dueDate?: number; priority: 'low' | 'medium' | 'high'; completed: boolean; xpAwarded: number; order: number; }
export interface BadgeInfo { id: string; name: string; description: string; xpThreshold: number; awardedAt?: number; }

export interface SnapBackIPC {
  getDailySummary(date: string): Promise<DailySummary>;
  getSevenDayTrend(): Promise<SevenDayTrendEntry[]>;
  getAppTimeByDateRange(from: number, to: number): Promise<AppTimeSummary[]>;
  getHeatMapCells(date: string): Promise<HeatMapCell[]>;
  getHeatMapTooltip(cellIndex: number, date: string): Promise<TooltipData | null>;
  getActiveCalendarEvent(timestamp: number): Promise<CalendarEventInfo | null>;
  exportWeeklyReportPDF(targetDir: string): Promise<void>;
  getTasks(): Promise<TaskInfo[]>;
  createTask(title: string, priority: 'low' | 'medium' | 'high', dueDate?: number): Promise<TaskInfo>;
  updateTask(id: string, updates: Partial<TaskInfo>): Promise<TaskInfo>;
  deleteTask(id: string): Promise<void>;
  completeTask(id: string, duringDeepWork: boolean): Promise<{ xpAmount: number }>;
  reorderTasks(orderedIds: string[]): Promise<void>;
  getTotalXP(): Promise<number>;
  getBadges(): Promise<BadgeInfo[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings>;
  authorizeCalendar(): Promise<void>;
  revokeCalendar(): Promise<void>;
  deleteAllData(): Promise<void>;
}

export interface AppSettings {
  language: string; darkMode: boolean; colorBlindMode: boolean; reducedMotion: boolean;
  ghostBarEnabled: boolean; ghostBarPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  calendarAuthorized: boolean;
}

// ─── Static Demo Data (one week) ────────────────────────────────────────────

function daysAgoStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const WEEK_DATA: Record<string, DailySummary> = {
  [daysAgoStr(6)]: { date: daysAgoStr(6), totalTrackedMs: 25200000, deepWorkMs: 12600000, shallowWorkMs: 9000000, distractionLoopMs: 3600000 },
  [daysAgoStr(5)]: { date: daysAgoStr(5), totalTrackedMs: 28800000, deepWorkMs: 16200000, shallowWorkMs: 9000000, distractionLoopMs: 3600000 },
  [daysAgoStr(4)]: { date: daysAgoStr(4), totalTrackedMs: 21600000, deepWorkMs: 10800000, shallowWorkMs: 7200000, distractionLoopMs: 3600000 },
  [daysAgoStr(3)]: { date: daysAgoStr(3), totalTrackedMs: 30600000, deepWorkMs: 18000000, shallowWorkMs: 9000000, distractionLoopMs: 3600000 },
  [daysAgoStr(2)]: { date: daysAgoStr(2), totalTrackedMs: 27000000, deepWorkMs: 14400000, shallowWorkMs: 9000000, distractionLoopMs: 3600000 },
  [daysAgoStr(1)]: { date: daysAgoStr(1), totalTrackedMs: 23400000, deepWorkMs: 11700000, shallowWorkMs: 7200000, distractionLoopMs: 4500000 },
  [daysAgoStr(0)]: { date: daysAgoStr(0), totalTrackedMs: 19800000, deepWorkMs: 10800000, shallowWorkMs: 5400000, distractionLoopMs: 3600000 },
};

// Heatmap: generate 96 cells per day with realistic patterns
function seededRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function makeHeatMapCells(date: string): HeatMapCell[] {
  const dayStart = new Date(date + 'T00:00:00').getTime();
  const cells: HeatMapCell[] = [];
  const seed = date.split('-').reduce((a, b) => a + Number(b), 0);

  for (let i = 0; i < 96; i++) {
    const hour = Math.floor(i / 4);
    const cStart = dayStart + i * 900000;
    const cEnd = cStart + 900000;

    if (hour < 7 || hour >= 22) {
      cells.push({ cellIndex: i, startTime: cStart, endTime: cEnd, classification: null, hasData: false });
      continue;
    }
    if (hour === 12 && (i % 4) < 3) {
      cells.push({ cellIndex: i, startTime: cStart, endTime: cEnd, classification: null, hasData: false });
      continue;
    }

    const r = seededRand(seed + i * 7);
    let cls: Classification;
    if (hour >= 8 && hour < 12) cls = r < 0.55 ? 'deep_work' : r < 0.85 ? 'shallow_work' : 'distraction_loop';
    else if (hour >= 13 && hour < 17) cls = r < 0.3 ? 'deep_work' : r < 0.7 ? 'shallow_work' : 'distraction_loop';
    else cls = r < 0.15 ? 'deep_work' : r < 0.5 ? 'shallow_work' : 'distraction_loop';

    const hasData = seededRand(seed + i * 13) < 0.85;
    cells.push({ cellIndex: i, startTime: cStart, endTime: cEnd, classification: hasData ? cls : null, hasData });
  }
  return cells;
}

const TOOLTIP_APPS: Record<Classification, string[]> = {
  deep_work: ['VS Code', 'Terminal', 'Figma', 'IntelliJ'],
  shallow_work: ['Chrome', 'Slack', 'Notion', 'Outlook', 'Google Docs'],
  distraction_loop: ['YouTube', 'Discord', 'Reddit', 'Twitter'],
};

function makeTooltip(cellIndex: number, date: string): TooltipData | null {
  const cells = makeHeatMapCells(date);
  const cell = cells[cellIndex];
  if (!cell || !cell.hasData || !cell.classification) return null;
  const apps = TOOLTIP_APPS[cell.classification];
  const app = apps[Math.floor(seededRand(cellIndex * 31 + 7) * apps.length)]!;
  return { appName: app, classification: cell.classification, durationMs: Math.round((3 + seededRand(cellIndex * 17) * 12) * 60000) };
}

const STATIC_TASKS: TaskInfo[] = [
  { id: 't1', title: 'Implement user authentication flow', priority: 'high', completed: true, xpAwarded: 75, order: 0 },
  { id: 't2', title: 'Write unit tests for Classifier', priority: 'high', completed: true, xpAwarded: 75, order: 1 },
  { id: 't3', title: 'Design settings page layout', priority: 'medium', completed: true, xpAwarded: 25, order: 2 },
  { id: 't4', title: 'Fix heatmap tooltip positioning', priority: 'medium', completed: false, xpAwarded: 0, order: 3 },
  { id: 't5', title: 'Add keyboard shortcuts for navigation', priority: 'low', completed: false, xpAwarded: 0, order: 4 },
  { id: 't6', title: 'Optimize SQLite query performance', priority: 'high', completed: false, xpAwarded: 0, order: 5 },
  { id: 't7', title: 'Add CSV export feature', priority: 'low', completed: false, xpAwarded: 0, order: 6 },
  { id: 't8', title: 'Review CalendarSync refactor PR', priority: 'medium', completed: false, xpAwarded: 0, order: 7 },
];

let tasks = [...STATIC_TASKS];

const BADGES: BadgeInfo[] = [
  { id: 'badge-starter', name: 'Starter', description: 'Earned 100 XP', xpThreshold: 100, awardedAt: Date.now() - 86400000 * 3 },
  { id: 'badge-focused', name: 'Focused', description: 'Earned 500 XP', xpThreshold: 500 },
  { id: 'badge-deep-worker', name: 'Deep Worker', description: 'Earned 1000 XP', xpThreshold: 1000 },
  { id: 'badge-flow-master', name: 'Flow Master', description: 'Earned 5000 XP', xpThreshold: 5000 },
];

const BASE_XP: Record<string, number> = { low: 10, medium: 25, high: 50 };

// ─── Static IPC Implementation ───────────────────────────────────────────────

function createStaticIPC(): SnapBackIPC {
  return {
    async getDailySummary(date: string) {
      return WEEK_DATA[date] ?? { date, totalTrackedMs: 0, deepWorkMs: 0, shallowWorkMs: 0, distractionLoopMs: 0 };
    },
    async getSevenDayTrend() {
      const entries: SevenDayTrendEntry[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = daysAgoStr(i);
        const s = WEEK_DATA[d];
        entries.push({ date: d, deepWorkMs: s?.deepWorkMs ?? 0 });
      }
      return entries;
    },
    async getAppTimeByDateRange() {
      return [
        { appName: 'VS Code', totalDurationMs: 14400000 },
        { appName: 'Chrome', totalDurationMs: 7200000 },
        { appName: 'Slack', totalDurationMs: 3600000 },
        { appName: 'Terminal', totalDurationMs: 3600000 },
        { appName: 'Notion', totalDurationMs: 2700000 },
        { appName: 'Figma', totalDurationMs: 1800000 },
        { appName: 'YouTube', totalDurationMs: 1200000 },
        { appName: 'Discord', totalDurationMs: 900000 },
      ];
    },
    async getHeatMapCells(date: string) { return makeHeatMapCells(date); },
    async getHeatMapTooltip(cellIndex: number, date: string) { return makeTooltip(cellIndex, date); },
    async getActiveCalendarEvent() { return null; },
    async exportWeeklyReportPDF() {},
    async getTasks() { return [...tasks].sort((a, b) => a.order - b.order); },
    async createTask(title: string, priority: 'low' | 'medium' | 'high', dueDate?: number) {
      const t: TaskInfo = { id: `t-${Date.now()}`, title, priority, dueDate, completed: false, xpAwarded: 0, order: tasks.length };
      tasks.push(t);
      return t;
    },
    async updateTask(id: string, updates: Partial<TaskInfo>) {
      const i = tasks.findIndex(t => t.id === id);
      if (i >= 0) tasks[i] = { ...tasks[i]!, ...updates, id };
      return tasks[i]!;
    },
    async deleteTask(id: string) { tasks = tasks.filter(t => t.id !== id); },
    async completeTask(id: string, duringDeepWork: boolean) {
      const i = tasks.findIndex(t => t.id === id);
      if (i < 0) return { xpAmount: 0 };
      const base = BASE_XP[tasks[i]!.priority] ?? 10;
      const xp = duringDeepWork ? Math.floor(base * 1.5) : base;
      tasks[i] = { ...tasks[i]!, completed: true, xpAwarded: xp };
      return { xpAmount: xp };
    },
    async reorderTasks(ids: string[]) {
      ids.forEach((id, idx) => { const t = tasks.find(x => x.id === id); if (t) t.order = idx; });
    },
    async getTotalXP() { return tasks.reduce((s, t) => s + t.xpAwarded, 0); },
    async getBadges() {
      const xp = tasks.reduce((s, t) => s + t.xpAwarded, 0);
      return BADGES.map(b => ({ ...b, awardedAt: xp >= b.xpThreshold ? (b.awardedAt ?? Date.now()) : undefined }));
    },
    async getSettings() {
      return { language: 'en', darkMode: false, colorBlindMode: false, reducedMotion: false, ghostBarEnabled: true, ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false };
    },
    async updateSettings(updates: Partial<AppSettings>) {
      return { language: 'en', darkMode: false, colorBlindMode: false, reducedMotion: false, ghostBarEnabled: true, ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false, ...updates };
    },
    async authorizeCalendar() {},
    async revokeCalendar() {},
    async deleteAllData() { tasks = []; },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

let _ipc: SnapBackIPC | null = null;

export function getIPC(): SnapBackIPC {
  if (typeof window !== 'undefined' && (window as any).snapbackAPI) {
    return (window as any).snapbackAPI as SnapBackIPC;
  }
  if (!_ipc) _ipc = createStaticIPC();
  return _ipc;
}
