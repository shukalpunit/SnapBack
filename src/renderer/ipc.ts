/**
 * IPC bridge — typed wrappers for Electron IPC calls from renderer to main.
 *
 * In production, these call `window.electronAPI.invoke(channel, ...args)`.
 * For development/testing, they can be stubbed with mock data.
 */

// ─── Types (mirrored from main process for renderer use) ─────────────────────

export type Classification = 'deep_work' | 'shallow_work' | 'distraction_loop';

export interface AppTimeSummary {
  appName: string;
  totalDurationMs: number;
}

export interface DailySummary {
  date: string;
  totalTrackedMs: number;
  deepWorkMs: number;
  shallowWorkMs: number;
  distractionLoopMs: number;
}

export interface SevenDayTrendEntry {
  date: string;
  deepWorkMs: number;
}

export interface HeatMapCell {
  cellIndex: number;
  startTime: number;
  endTime: number;
  classification: Classification | null;
  hasData: boolean;
}

export interface TooltipData {
  appName: string;
  classification: Classification;
  durationMs: number;
}

export interface CalendarEventInfo {
  title: string;
  startTime: number;
  endTime: number;
}

export interface TaskInfo {
  id: string;
  title: string;
  dueDate?: number;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  xpAwarded: number;
  order: number;
}

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  xpThreshold: number;
  awardedAt?: number;
}

// ─── IPC Interface ───────────────────────────────────────────────────────────

export interface SnapBackIPC {
  getDailySummary(date: string): Promise<DailySummary>;
  getSevenDayTrend(): Promise<SevenDayTrendEntry[]>;
  getAppTimeByDateRange(from: number, to: number): Promise<AppTimeSummary[]>;
  getHeatMapCells(date: string): Promise<HeatMapCell[]>;
  getHeatMapTooltip(cellIndex: number, date: string): Promise<TooltipData | null>;
  getActiveCalendarEvent(timestamp: number): Promise<CalendarEventInfo | null>;
  exportWeeklyReportPDF(targetDir: string): Promise<void>;
  // Task Manager
  getTasks(): Promise<TaskInfo[]>;
  createTask(title: string, priority: 'low' | 'medium' | 'high', dueDate?: number): Promise<TaskInfo>;
  updateTask(id: string, updates: Partial<TaskInfo>): Promise<TaskInfo>;
  deleteTask(id: string): Promise<void>;
  completeTask(id: string, duringDeepWork: boolean): Promise<{ xpAmount: number }>;
  reorderTasks(orderedIds: string[]): Promise<void>;
  getTotalXP(): Promise<number>;
  getBadges(): Promise<BadgeInfo[]>;
  // Settings
  getSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>): Promise<AppSettings>;
  authorizeCalendar(): Promise<void>;
  revokeCalendar(): Promise<void>;
  deleteAllData(): Promise<void>;
}

export interface AppSettings {
  language: string;
  darkMode: boolean;
  colorBlindMode: boolean;
  reducedMotion: boolean;
  ghostBarEnabled: boolean;
  ghostBarPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  calendarAuthorized: boolean;
}

/**
 * Get the IPC bridge. In Electron, this comes from the preload script.
 * Falls back to a stub for development outside Electron.
 */
export function getIPC(): SnapBackIPC {
  if (typeof window !== 'undefined' && (window as any).snapbackAPI) {
    return (window as any).snapbackAPI as SnapBackIPC;
  }

  // Dev stub — returns empty/mock data
  return {
    async getDailySummary() {
      return { date: new Date().toISOString().slice(0, 10), totalTrackedMs: 0, deepWorkMs: 0, shallowWorkMs: 0, distractionLoopMs: 0 };
    },
    async getSevenDayTrend() { return []; },
    async getAppTimeByDateRange() { return []; },
    async getHeatMapCells() { return []; },
    async getHeatMapTooltip() { return null; },
    async getActiveCalendarEvent() { return null; },
    async exportWeeklyReportPDF() {},
    async getTasks() { return []; },
    async createTask(title: string, priority: 'low' | 'medium' | 'high') {
      return { id: 'stub', title, priority, completed: false, xpAwarded: 0, order: 0 };
    },
    async updateTask(_id: string, updates: Partial<TaskInfo>) { return { id: _id, title: '', priority: 'low' as const, completed: false, xpAwarded: 0, order: 0, ...updates }; },
    async deleteTask() {},
    async completeTask() { return { xpAmount: 0 }; },
    async reorderTasks() {},
    async getTotalXP() { return 0; },
    async getBadges() { return []; },
    async getSettings() {
      return { language: 'en', darkMode: false, colorBlindMode: false, reducedMotion: false, ghostBarEnabled: true, ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false };
    },
    async updateSettings(updates: Partial<AppSettings>) {
      return { language: 'en', darkMode: false, colorBlindMode: false, reducedMotion: false, ghostBarEnabled: true, ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false, ...updates };
    },
    async authorizeCalendar() {},
    async revokeCalendar() {},
    async deleteAllData() {},
  };
}
