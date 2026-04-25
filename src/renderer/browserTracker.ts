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
