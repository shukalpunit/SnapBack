/**
 * BrowserTracker — Real activity tracking for browser-based deployment.
 *
 * Captures actual user activity using browser APIs:
 * - document.visibilityState for focus/idle detection
 * - mouse/keyboard events for input signal tracking
 * - Page title and URL for "app" identification
 * - Periodic polling to build real classified segments
 *
 * Data is stored in localStorage and served through the same IPC interface
 * so all dashboard/heatmap/task visualizations show real user data.
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

// ─── Storage Keys ────────────────────────────────────────────────────────────

const SEGMENTS_KEY = 'snapback-segments';
const TASKS_KEY = 'snapback-tasks';
const XP_KEY = 'snapback-xp-events';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoredSegment {
  id: string;
  appName: string;
  windowTitle: string;
  classification: Classification;
  startTime: number;
  endTime: number;
  keystrokeCount: number;
  mouseClickCount: number;
  scrollEventCount: number;
}

interface XPEventStored {
  id: string;
  taskId: string;
  xpAmount: number;
  timestamp: number;
}

// ─── Persistence Helpers ─────────────────────────────────────────────────────

function loadSegments(): StoredSegment[] {
  try {
    const raw = localStorage.getItem(SEGMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSegments(segments: StoredSegment[]): void {
  try { localStorage.setItem(SEGMENTS_KEY, JSON.stringify(segments)); } catch {}
}

function loadTasks(): TaskInfo[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTasks(tasks: TaskInfo[]): void {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {}
}

function loadXPEvents(): XPEventStored[] {
  try {
    const raw = localStorage.getItem(XP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveXPEvents(events: XPEventStored[]): void {
  try { localStorage.setItem(XP_KEY, JSON.stringify(events)); } catch {}
}

// ─── Activity Tracking State ─────────────────────────────────────────────────

let trackingStarted = false;
let currentSegmentStart = 0;
let currentAppName = '';
let currentWindowTitle = '';
let keystrokeCount = 0;
let mouseClickCount = 0;
let scrollEventCount = 0;
let isIdle = false;
let lastActivityTime = Date.now();

const IDLE_THRESHOLD_MS = 120_000; // 2 minutes
const POLL_INTERVAL_MS = 5_000;    // 5 seconds
const SEGMENT_FLUSH_MS = 10_000;   // flush segment every 10 seconds for responsive UI

// ─── Classification Logic ────────────────────────────────────────────────────

function classifySegment(
  durationMs: number,
  keystrokes: number,
  clicks: number,
  appName: string
): Classification {
  const lowerApp = appName.toLowerCase();

  // SnapBack itself counts as shallow work (productivity tool usage)
  const isSelfApp = /snapback|localhost/i.test(lowerApp);

  // Deep work indicators: code editors, documentation, long focused sessions
  const isDeepApp = /vscode|code|github|stackoverflow|docs|notion|figma|terminal/i.test(lowerApp);
  // Distraction indicators: social media, entertainment
  const isDistractionApp = /youtube|reddit|twitter|x\.com|instagram|tiktok|facebook|netflix|twitch|discord/i.test(lowerApp);

  // Self-app: shallow work (reviewing your own productivity)
  if (isSelfApp) {
    // If lots of interaction (clicking tasks, navigating), still shallow
    return keystrokes > 30 || clicks > 15 ? 'shallow_work' : 'shallow_work';
  }

  // Short visit + distraction app = distraction loop
  if (isDistractionApp && durationMs < 90_000) {
    return 'distraction_loop';
  }

  // Long session + high input + productive app = deep work
  if (durationMs >= 300_000 && (keystrokes > 30 || clicks > 15) && isDeepApp) {
    return 'deep_work';
  }

  // Long session + high input (any app) = deep work
  if (durationMs >= 600_000 && keystrokes > 100) {
    return 'deep_work';
  }

  // Distraction app regardless of duration
  if (isDistractionApp) {
    return 'distraction_loop';
  }

  // Default
  return 'shallow_work';
}

function detectAppFromPage(): { appName: string; windowTitle: string } {
  const title = document.title || 'Unknown';
  const url = window.location.href;

  // Try to extract a meaningful app name from the page
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    // Map common hostnames to app names
    const hostMap: Record<string, string> = {
      'localhost': 'SnapBack (Dev)',
      'github.com': 'GitHub',
      'stackoverflow.com': 'Stack Overflow',
      'google.com': 'Google',
      'youtube.com': 'YouTube',
      'reddit.com': 'Reddit',
      'twitter.com': 'Twitter',
      'x.com': 'Twitter',
      'notion.so': 'Notion',
      'figma.com': 'Figma',
      'slack.com': 'Slack',
      'discord.com': 'Discord',
      'mail.google.com': 'Gmail',
      'docs.google.com': 'Google Docs',
    };
    const appName = hostMap[hostname] || hostname;
    return { appName, windowTitle: title };
  } catch {
    return { appName: title, windowTitle: title };
  }
}

// ─── Segment Management ──────────────────────────────────────────────────────

function flushCurrentSegment(): void {
  if (!currentSegmentStart || isIdle) return;

  const now = Date.now();
  const duration = now - currentSegmentStart;
  if (duration < 1000) return; // skip sub-second segments

  const segment: StoredSegment = {
    id: `seg-${now}-${Math.random().toString(36).slice(2, 6)}`,
    appName: currentAppName || 'SnapBack (Dev)',
    windowTitle: currentWindowTitle || document.title,
    classification: classifySegment(duration, keystrokeCount, mouseClickCount, currentAppName),
    startTime: currentSegmentStart,
    endTime: now,
    keystrokeCount,
    mouseClickCount,
    scrollEventCount,
  };

  const segments = loadSegments();
  segments.push(segment);

  // Keep only last 7 days of data
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const pruned = segments.filter((s) => s.endTime >= cutoff);
  saveSegments(pruned);

  // Reset for next segment
  currentSegmentStart = now;
  keystrokeCount = 0;
  mouseClickCount = 0;
  scrollEventCount = 0;
}

// ─── Start Tracking ──────────────────────────────────────────────────────────

function startTracking(): void {
  if (trackingStarted) return;
  trackingStarted = true;

  const { appName, windowTitle } = detectAppFromPage();
  currentAppName = appName;
  currentWindowTitle = windowTitle;
  currentSegmentStart = Date.now();
  lastActivityTime = Date.now();

  // Keyboard tracking
  document.addEventListener('keydown', () => {
    keystrokeCount++;
    lastActivityTime = Date.now();
    if (isIdle) {
      isIdle = false;
      currentSegmentStart = Date.now();
    }
  });

  // Mouse click tracking
  document.addEventListener('click', () => {
    mouseClickCount++;
    lastActivityTime = Date.now();
    if (isIdle) {
      isIdle = false;
      currentSegmentStart = Date.now();
    }
  });

  // Scroll tracking
  document.addEventListener('scroll', () => {
    scrollEventCount++;
    lastActivityTime = Date.now();
  }, { passive: true });

  // Visibility change (tab switch)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushCurrentSegment();
      isIdle = true;
    } else {
      isIdle = false;
      currentSegmentStart = Date.now();
      lastActivityTime = Date.now();
      const { appName, windowTitle } = detectAppFromPage();
      currentAppName = appName;
      currentWindowTitle = windowTitle;
    }
  });

  // Periodic flush + idle check
  setInterval(() => {
    const now = Date.now();

    // Check idle
    if (now - lastActivityTime >= IDLE_THRESHOLD_MS && !isIdle) {
      flushCurrentSegment();
      isIdle = true;
    }

    // Periodic segment flush (every 10s of active time)
    if (!isIdle && currentSegmentStart && (now - currentSegmentStart >= SEGMENT_FLUSH_MS)) {
      flushCurrentSegment();
    }
  }, POLL_INTERVAL_MS);

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    flushCurrentSegment();
  });

  // Flush an initial segment after 5 seconds so data appears quickly
  setTimeout(() => {
    if (!isIdle && currentSegmentStart) {
      flushCurrentSegment();
    }
  }, 5000);
}

// ─── Query Functions ─────────────────────────────────────────────────────────

/** Get the current in-progress segment (not yet flushed to storage). */
function getLiveSegment(): StoredSegment | null {
  if (!currentSegmentStart || isIdle) return null;
  const now = Date.now();
  const duration = now - currentSegmentStart;
  if (duration < 1000) return null;
  return {
    id: 'live',
    appName: currentAppName || 'SnapBack (Dev)',
    windowTitle: currentWindowTitle || document.title,
    classification: classifySegment(duration, keystrokeCount, mouseClickCount, currentAppName),
    startTime: currentSegmentStart,
    endTime: now,
    keystrokeCount,
    mouseClickCount,
    scrollEventCount,
  };
}

function querySegmentsOverlapping(from: number, to: number): StoredSegment[] {
  const stored = loadSegments().filter((s) => s.startTime < to && s.endTime > from);
  // Include the live (unflushed) segment if it overlaps
  const live = getLiveSegment();
  if (live && live.startTime < to && live.endTime > from) {
    stored.push(live);
  }
  return stored;
}

function getDailySummary(date: string): DailySummary {
  const dayStart = new Date(date + 'T00:00:00').getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const segments = querySegmentsOverlapping(dayStart, dayEnd);

  let deepWorkMs = 0, shallowWorkMs = 0, distractionLoopMs = 0;

  for (const seg of segments) {
    const overlapStart = Math.max(seg.startTime, dayStart);
    const overlapEnd = Math.min(seg.endTime, dayEnd);
    const duration = overlapEnd - overlapStart;
    if (seg.classification === 'deep_work') deepWorkMs += duration;
    else if (seg.classification === 'shallow_work') shallowWorkMs += duration;
    else distractionLoopMs += duration;
  }

  return {
    date,
    totalTrackedMs: deepWorkMs + shallowWorkMs + distractionLoopMs,
    deepWorkMs,
    shallowWorkMs,
    distractionLoopMs,
  };
}

function getSevenDayTrend(): SevenDayTrendEntry[] {
  const entries: SevenDayTrendEntry[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const summary = getDailySummary(dateStr);
    entries.push({ date: dateStr, deepWorkMs: summary.deepWorkMs });
  }
  return entries;
}

function getHeatMapCells(date: string): HeatMapCell[] {
  const dayStart = new Date(date + 'T00:00:00').getTime();
  const allSegments = querySegmentsOverlapping(dayStart, dayStart + 24 * 60 * 60 * 1000);
  const cells: HeatMapCell[] = [];

  for (let i = 0; i < 96; i++) {
    const cellStart = dayStart + i * 15 * 60 * 1000;
    const cellEnd = cellStart + 15 * 60 * 1000;

    let deepMs = 0, shallowMs = 0, distractionMs = 0;
    let hasData = false;

    for (const seg of allSegments) {
      const overlap = Math.max(Math.min(seg.endTime, cellEnd) - Math.max(seg.startTime, cellStart), 0);
      if (overlap > 0) {
        hasData = true;
        if (seg.classification === 'deep_work') deepMs += overlap;
        else if (seg.classification === 'shallow_work') shallowMs += overlap;
        else distractionMs += overlap;
      }
    }

    let classification: Classification | null = null;
    if (hasData) {
      if (deepMs >= shallowMs && deepMs >= distractionMs) classification = 'deep_work';
      else if (shallowMs >= distractionMs) classification = 'shallow_work';
      else classification = 'distraction_loop';
    }

    cells.push({ cellIndex: i, startTime: cellStart, endTime: cellEnd, classification, hasData });
  }

  return cells;
}

function getHeatMapTooltip(cellIndex: number, date: string): TooltipData | null {
  const dayStart = new Date(date + 'T00:00:00').getTime();
  const cellStart = dayStart + cellIndex * 15 * 60 * 1000;
  const cellEnd = cellStart + 15 * 60 * 1000;

  const overlapping = querySegmentsOverlapping(cellStart, cellEnd);
  if (overlapping.length === 0) return null;

  // Find dominant app
  const appDurations = new Map<string, { durationMs: number; classification: Classification }>();
  for (const seg of overlapping) {
    const overlap = Math.max(Math.min(seg.endTime, cellEnd) - Math.max(seg.startTime, cellStart), 0);
    if (overlap > 0) {
      const existing = appDurations.get(seg.appName);
      if (existing) existing.durationMs += overlap;
      else appDurations.set(seg.appName, { durationMs: overlap, classification: seg.classification });
    }
  }

  let bestApp = '', bestDuration = 0, bestClassification: Classification = 'shallow_work';
  for (const [appName, data] of appDurations) {
    if (data.durationMs > bestDuration) {
      bestApp = appName;
      bestDuration = data.durationMs;
      bestClassification = data.classification;
    }
  }

  return { appName: bestApp, classification: bestClassification, durationMs: bestDuration };
}

function getAppTimeByDateRange(from: number, to: number): AppTimeSummary[] {
  const segments = querySegmentsOverlapping(from, to);
  const appMap = new Map<string, number>();
  for (const seg of segments) {
    const duration = seg.endTime - seg.startTime;
    appMap.set(seg.appName, (appMap.get(seg.appName) ?? 0) + duration);
  }
  return Array.from(appMap.entries())
    .map(([appName, totalDurationMs]) => ({ appName, totalDurationMs }))
    .sort((a, b) => b.totalDurationMs - a.totalDurationMs);
}

// ─── Badge Definitions ───────────────────────────────────────────────────────

const BADGE_DEFS: BadgeInfo[] = [
  { id: 'badge-starter', name: 'Starter', description: 'Earned 100 XP', xpThreshold: 100 },
  { id: 'badge-focused', name: 'Focused', description: 'Earned 500 XP', xpThreshold: 500 },
  { id: 'badge-deep-worker', name: 'Deep Worker', description: 'Earned 1000 XP', xpThreshold: 1000 },
  { id: 'badge-flow-master', name: 'Flow Master', description: 'Earned 5000 XP', xpThreshold: 5000 },
];

const BASE_XP: Record<string, number> = { low: 10, medium: 25, high: 50 };

function computeTotalXP(): number {
  return loadXPEvents().reduce((sum, e) => sum + e.xpAmount, 0);
}

// ─── Browser IPC Implementation ──────────────────────────────────────────────

export function createBrowserIPC(): SnapBackIPC {
  // Start real tracking immediately
  startTracking();

  return {
    async getDailySummary(date: string) {
      return getDailySummary(date);
    },

    async getSevenDayTrend() {
      return getSevenDayTrend();
    },

    async getAppTimeByDateRange(from: number, to: number) {
      return getAppTimeByDateRange(from, to);
    },

    async getHeatMapCells(date: string) {
      return getHeatMapCells(date);
    },

    async getHeatMapTooltip(cellIndex: number, date: string) {
      return getHeatMapTooltip(cellIndex, date);
    },

    async getActiveCalendarEvent() { return null; },
    async exportWeeklyReportPDF() {},

    async getTasks() {
      return loadTasks().sort((a, b) => a.order - b.order);
    },

    async createTask(title: string, priority: 'low' | 'medium' | 'high', dueDate?: number) {
      const tasks = loadTasks();
      const maxOrder = tasks.reduce((max, t) => Math.max(max, t.order), -1);
      const task: TaskInfo = {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        priority,
        dueDate,
        completed: false,
        xpAwarded: 0,
        order: maxOrder + 1,
      };
      tasks.push(task);
      saveTasks(tasks);
      return task;
    },

    async updateTask(id: string, updates: Partial<TaskInfo>) {
      const tasks = loadTasks();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error(`Task not found: ${id}`);
      tasks[idx] = { ...tasks[idx]!, ...updates, id };
      saveTasks(tasks);
      return tasks[idx]!;
    },

    async deleteTask(id: string) {
      const tasks = loadTasks().filter((t) => t.id !== id);
      saveTasks(tasks);
    },

    async completeTask(id: string, duringDeepWork: boolean) {
      const tasks = loadTasks();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error(`Task not found: ${id}`);
      const task = tasks[idx]!;
      const base = BASE_XP[task.priority] ?? 10;
      const xpAmount = duringDeepWork ? Math.floor(base * 1.5) : base;
      tasks[idx] = { ...task, completed: true, xpAwarded: xpAmount };
      saveTasks(tasks);

      // Record XP event
      const xpEvents = loadXPEvents();
      xpEvents.push({ id: `xp-${Date.now()}`, taskId: id, xpAmount, timestamp: Date.now() });
      saveXPEvents(xpEvents);

      return { xpAmount };
    },

    async reorderTasks(orderedIds: string[]) {
      const tasks = loadTasks();
      for (let i = 0; i < orderedIds.length; i++) {
        const task = tasks.find((t) => t.id === orderedIds[i]);
        if (task) task.order = i;
      }
      saveTasks(tasks);
    },

    async getTotalXP() {
      return computeTotalXP();
    },

    async getBadges() {
      const totalXP = computeTotalXP();
      return BADGE_DEFS.map((b) => ({
        ...b,
        awardedAt: totalXP >= b.xpThreshold ? Date.now() : undefined,
      }));
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
      localStorage.removeItem(SEGMENTS_KEY);
      localStorage.removeItem(TASKS_KEY);
      localStorage.removeItem(XP_KEY);
    },
  };
}
