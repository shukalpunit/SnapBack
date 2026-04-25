/**
 * BrowserTracker — Real activity tracking + seed data for browser deployment.
 *
 * On first visit, seeds localStorage with realistic historical data so the
 * dashboard is never empty. Then tracks real user activity (keyboard, mouse,
 * scroll, tab visibility) and adds it on top.
 *
 * Data is stored in localStorage and served through the SnapBackIPC interface.
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
const SEEDED_KEY = 'snapback-seeded';

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

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadSegments(): StoredSegment[] {
  try { return JSON.parse(localStorage.getItem(SEGMENTS_KEY) || '[]'); } catch { return []; }
}
function saveSegments(segs: StoredSegment[]): void {
  try { localStorage.setItem(SEGMENTS_KEY, JSON.stringify(segs)); } catch {}
}
function loadTasks(): TaskInfo[] {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); } catch { return []; }
}
function saveTasks(tasks: TaskInfo[]): void {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {}
}
function loadXPEvents(): XPEventStored[] {
  try { return JSON.parse(localStorage.getItem(XP_KEY) || '[]'); } catch { return []; }
}
function saveXPEvents(events: XPEventStored[]): void {
  try { localStorage.setItem(XP_KEY, JSON.stringify(events)); } catch {}
}

// ─── Seed Data (generated once on first visit) ──────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const SEED_APPS: Array<{ name: string; cls: Classification; weight: number }> = [
  { name: 'VS Code', cls: 'deep_work', weight: 35 },
  { name: 'Chrome', cls: 'shallow_work', weight: 20 },
  { name: 'Slack', cls: 'shallow_work', weight: 10 },
  { name: 'Terminal', cls: 'deep_work', weight: 10 },
  { name: 'Notion', cls: 'shallow_work', weight: 8 },
  { name: 'Discord', cls: 'distraction_loop', weight: 5 },
  { name: 'YouTube', cls: 'distraction_loop', weight: 4 },
  { name: 'Spotify', cls: 'distraction_loop', weight: 3 },
  { name: 'Outlook', cls: 'shallow_work', weight: 3 },
  { name: 'Figma', cls: 'deep_work', weight: 2 },
];

function seedHistoricalData(): void {
  // Always ensure we have data for today and recent days
  const existing = loadSegments();
  const now = Date.now();
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayStart = todayMidnight.getTime();

  // Check if we have any segments for today
  const todaySegments = existing.filter(s => s.startTime >= todayStart);

  // If we already have today's data and historical data, skip
  if (todaySegments.length > 10 && existing.length > 50) return;

  // Clear old seed data and regenerate
  const segments: StoredSegment[] = [];

  // Generate 7 days of historical data
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const dayStart = now - dayOffset * 24 * 60 * 60 * 1000;
    const date = new Date(dayStart);
    // Set to midnight of that day
    date.setHours(0, 0, 0, 0);
    const midnight = date.getTime();

    const rand = seededRandom(dayOffset * 1000 + 42);

    // Generate segments from 7am to 9pm
    for (let hour = 7; hour < 21; hour++) {
      // Skip lunch (12:00-12:45) sometimes
      if (hour === 12 && rand() < 0.6) continue;

      // 2-4 segments per hour
      const segCount = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < segCount; s++) {
        const minuteOffset = Math.floor(rand() * 55);
        const segStart = midnight + hour * 3600000 + minuteOffset * 60000;
        const duration = (3 + Math.floor(rand() * 12)) * 60000; // 3-15 min

        // Pick app based on time of day
        let app: typeof SEED_APPS[0];
        const r = rand();
        if (hour >= 8 && hour < 12) {
          // Morning: mostly deep work
          app = r < 0.5 ? SEED_APPS[0]! : r < 0.7 ? SEED_APPS[3]! : SEED_APPS[Math.floor(rand() * SEED_APPS.length)]!;
        } else if (hour >= 13 && hour < 17) {
          // Afternoon: mixed
          app = SEED_APPS[Math.floor(rand() * SEED_APPS.length)]!;
        } else {
          // Evening: more shallow/distraction
          app = r < 0.3 ? SEED_APPS[1]! : r < 0.5 ? SEED_APPS[4]! : SEED_APPS[Math.floor(rand() * SEED_APPS.length)]!;
        }

        segments.push({
          id: `seed-${dayOffset}-${hour}-${s}`,
          appName: app.name,
          windowTitle: `${app.name} — work session`,
          classification: app.cls,
          startTime: segStart,
          endTime: segStart + duration,
          keystrokeCount: Math.floor(rand() * 200),
          mouseClickCount: Math.floor(rand() * 50),
          scrollEventCount: Math.floor(rand() * 30),
        });
      }
    }
  }

  saveSegments(segments);

  // Seed some tasks
  const tasks: TaskInfo[] = [
    { id: 't1', title: 'Implement user authentication flow', priority: 'high', completed: true, xpAwarded: 75, order: 0 },
    { id: 't2', title: 'Write unit tests for Classifier', priority: 'high', completed: true, xpAwarded: 75, order: 1 },
    { id: 't3', title: 'Design settings page layout', priority: 'medium', completed: true, xpAwarded: 25, order: 2 },
    { id: 't4', title: 'Fix heatmap tooltip positioning', priority: 'medium', completed: false, xpAwarded: 0, order: 3 },
    { id: 't5', title: 'Add keyboard shortcuts', priority: 'low', completed: false, xpAwarded: 0, order: 4 },
    { id: 't6', title: 'Optimize SQLite queries', priority: 'high', completed: false, xpAwarded: 0, order: 5 },
  ];
  saveTasks(tasks);

  // Seed XP events for completed tasks
  const xpEvents: XPEventStored[] = [
    { id: 'xp1', taskId: 't1', xpAmount: 75, timestamp: now - 86400000 * 2 },
    { id: 'xp2', taskId: 't2', xpAmount: 75, timestamp: now - 86400000 },
    { id: 'xp3', taskId: 't3', xpAmount: 25, timestamp: now - 3600000 },
  ];
  saveXPEvents(xpEvents);

  localStorage.setItem(SEEDED_KEY, 'true');
  console.log('[SnapBack] Seeded historical data:', segments.length, 'segments');
}

// ─── Live Simulator (injects new segments every few seconds) ─────────────────

const SIM_APPS: Array<{ name: string; cls: Classification }> = [
  { name: 'VS Code', cls: 'deep_work' },
  { name: 'VS Code', cls: 'deep_work' },
  { name: 'VS Code', cls: 'deep_work' },
  { name: 'Terminal', cls: 'deep_work' },
  { name: 'Chrome — Stack Overflow', cls: 'shallow_work' },
  { name: 'Chrome — Docs', cls: 'shallow_work' },
  { name: 'Slack', cls: 'shallow_work' },
  { name: 'Notion', cls: 'shallow_work' },
  { name: 'Outlook', cls: 'shallow_work' },
  { name: 'YouTube', cls: 'distraction_loop' },
  { name: 'Discord', cls: 'distraction_loop' },
  { name: 'Figma', cls: 'deep_work' },
];

let simIndex = 0;

function startLiveSimulator(): void {
  // Inject a new segment every 8 seconds to show incremental updates
  setInterval(() => {
    const now = Date.now();
    const app = SIM_APPS[simIndex % SIM_APPS.length]!;
    simIndex++;

    // Each simulated segment is 3-8 minutes long, ending "now"
    const duration = (3 + Math.floor(Math.random() * 5)) * 60 * 1000;
    const seg: StoredSegment = {
      id: `sim-${now}-${Math.random().toString(36).slice(2, 6)}`,
      appName: app.name,
      windowTitle: `${app.name} — active session`,
      classification: app.cls,
      startTime: now - duration,
      endTime: now,
      keystrokeCount: Math.floor(Math.random() * 150) + 10,
      mouseClickCount: Math.floor(Math.random() * 40) + 5,
      scrollEventCount: Math.floor(Math.random() * 20),
    };

    const segs = loadSegments();
    segs.push(seg);
    const cutoff = now - 7 * 86400000;
    saveSegments(segs.filter(s => s.endTime >= cutoff));

    console.log(`[SnapBack] Simulated: ${seg.appName} (${seg.classification}) +${Math.round(duration / 60000)}min`);
  }, 8000);

  console.log('[SnapBack] Live simulator started — new segments every 8s');
}

// ─── Live Activity Tracking ──────────────────────────────────────────────────

let trackingStarted = false;
let currentSegmentStart = 0;
let currentAppName = '';
let currentWindowTitle = '';
let keystrokeCount = 0;
let mouseClickCount = 0;
let scrollEventCount = 0;
let isIdle = false;
let lastActivityTime = Date.now();

function classifySegment(durationMs: number, keystrokes: number, clicks: number, appName: string): Classification {
  const lower = appName.toLowerCase();
  const isDeep = /vscode|code|github|stackoverflow|docs|notion|figma|terminal/i.test(lower);
  const isDistraction = /youtube|reddit|twitter|x\.com|instagram|tiktok|facebook|netflix|twitch|discord/i.test(lower);

  if (isDistraction && durationMs < 90000) return 'distraction_loop';
  if (durationMs >= 300000 && (keystrokes > 30 || clicks > 15) && isDeep) return 'deep_work';
  if (durationMs >= 600000 && keystrokes > 100) return 'deep_work';
  if (isDistraction) return 'distraction_loop';
  return 'shallow_work';
}

function flushSegment(): void {
  if (!currentSegmentStart || isIdle) return;
  const now = Date.now();
  const duration = now - currentSegmentStart;
  if (duration < 2000) return;

  const seg: StoredSegment = {
    id: `live-${now}-${Math.random().toString(36).slice(2, 6)}`,
    appName: currentAppName || 'SnapBack',
    windowTitle: currentWindowTitle || document.title,
    classification: classifySegment(duration, keystrokeCount, mouseClickCount, currentAppName),
    startTime: currentSegmentStart,
    endTime: now,
    keystrokeCount, mouseClickCount, scrollEventCount,
  };

  const segs = loadSegments();
  segs.push(seg);
  // Keep 7 days
  const cutoff = now - 7 * 86400000;
  saveSegments(segs.filter(s => s.endTime >= cutoff));

  console.log(`[SnapBack] Tracked: ${seg.appName} (${seg.classification}) ${Math.round(duration / 1000)}s`);

  currentSegmentStart = now;
  keystrokeCount = 0;
  mouseClickCount = 0;
  scrollEventCount = 0;
}

function startTracking(): void {
  if (trackingStarted) return;
  trackingStarted = true;

  // Detect current page
  try {
    const hostname = new URL(window.location.href).hostname.replace('www.', '');
    const hostMap: Record<string, string> = {
      'localhost': 'SnapBack', 'github.com': 'GitHub', 'stackoverflow.com': 'Stack Overflow',
      'youtube.com': 'YouTube', 'reddit.com': 'Reddit', 'twitter.com': 'Twitter',
      'notion.so': 'Notion', 'figma.com': 'Figma', 'slack.com': 'Slack', 'discord.com': 'Discord',
    };
    currentAppName = hostMap[hostname] || hostname;
  } catch { currentAppName = 'SnapBack'; }
  currentWindowTitle = document.title;
  currentSegmentStart = Date.now();
  lastActivityTime = Date.now();

  // Input tracking
  document.addEventListener('keydown', () => { keystrokeCount++; lastActivityTime = Date.now(); });
  document.addEventListener('click', () => { mouseClickCount++; lastActivityTime = Date.now(); });
  document.addEventListener('scroll', () => { scrollEventCount++; lastActivityTime = Date.now(); }, { passive: true });
  document.addEventListener('mousemove', () => { lastActivityTime = Date.now(); }, { passive: true });

  // Tab visibility
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flushSegment(); isIdle = true; }
    else { isIdle = false; currentSegmentStart = Date.now(); lastActivityTime = Date.now(); }
  });

  // Periodic flush every 10 seconds
  setInterval(() => {
    if (!isIdle && currentSegmentStart && (Date.now() - currentSegmentStart >= 10000)) {
      flushSegment();
    }
  }, 5000);

  // Flush on unload
  window.addEventListener('beforeunload', flushSegment);

  // First flush after 3 seconds
  setTimeout(flushSegment, 3000);

  console.log('[SnapBack] Tracking started');
}

// ─── Query Functions ─────────────────────────────────────────────────────────

function localMidnight(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
}

function queryOverlapping(from: number, to: number): StoredSegment[] {
  const segs = loadSegments().filter(s => s.startTime < to && s.endTime > from);
  // Include live segment
  if (!isIdle && currentSegmentStart) {
    const now = Date.now();
    if (currentSegmentStart < to && now > from && (now - currentSegmentStart) >= 1000) {
      segs.push({
        id: 'live', appName: currentAppName || 'SnapBack', windowTitle: document.title,
        classification: classifySegment(now - currentSegmentStart, keystrokeCount, mouseClickCount, currentAppName),
        startTime: currentSegmentStart, endTime: now,
        keystrokeCount, mouseClickCount, scrollEventCount,
      });
    }
  }
  return segs;
}

function getDailySummary(date: string): DailySummary {
  const dayStart = localMidnight(date);
  const dayEnd = dayStart + 86400000;
  const segs = queryOverlapping(dayStart, dayEnd);

  let deep = 0, shallow = 0, distraction = 0;
  for (const s of segs) {
    const start = Math.max(s.startTime, dayStart);
    const end = Math.min(s.endTime, dayEnd);
    const dur = end - start;
    if (s.classification === 'deep_work') deep += dur;
    else if (s.classification === 'shallow_work') shallow += dur;
    else distraction += dur;
  }

  return { date, totalTrackedMs: deep + shallow + distraction, deepWorkMs: deep, shallowWorkMs: shallow, distractionLoopMs: distraction };
}

function getSevenDayTrend(): SevenDayTrendEntry[] {
  const entries: SevenDayTrendEntry[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    entries.push({ date: dateStr, deepWorkMs: getDailySummary(dateStr).deepWorkMs });
  }
  return entries;
}

function getHeatMapCells(date: string): HeatMapCell[] {
  const dayStart = localMidnight(date);
  const allSegs = queryOverlapping(dayStart, dayStart + 86400000);
  const cells: HeatMapCell[] = [];

  for (let i = 0; i < 96; i++) {
    const cStart = dayStart + i * 900000; // 15 min
    const cEnd = cStart + 900000;
    let deep = 0, shallow = 0, dist = 0, hasData = false;

    for (const s of allSegs) {
      const overlap = Math.max(Math.min(s.endTime, cEnd) - Math.max(s.startTime, cStart), 0);
      if (overlap > 0) {
        hasData = true;
        if (s.classification === 'deep_work') deep += overlap;
        else if (s.classification === 'shallow_work') shallow += overlap;
        else dist += overlap;
      }
    }

    let cls: Classification | null = null;
    if (hasData) {
      if (deep >= shallow && deep >= dist) cls = 'deep_work';
      else if (shallow >= dist) cls = 'shallow_work';
      else cls = 'distraction_loop';
    }
    cells.push({ cellIndex: i, startTime: cStart, endTime: cEnd, classification: cls, hasData });
  }
  return cells;
}

function getTooltip(cellIndex: number, date: string): TooltipData | null {
  const dayStart = localMidnight(date);
  const cStart = dayStart + cellIndex * 900000;
  const cEnd = cStart + 900000;
  const segs = queryOverlapping(cStart, cEnd);
  if (!segs.length) return null;

  const appDur = new Map<string, { ms: number; cls: Classification }>();
  for (const s of segs) {
    const overlap = Math.max(Math.min(s.endTime, cEnd) - Math.max(s.startTime, cStart), 0);
    if (overlap > 0) {
      const e = appDur.get(s.appName);
      if (e) e.ms += overlap;
      else appDur.set(s.appName, { ms: overlap, cls: s.classification });
    }
  }

  let best = '', bestMs = 0, bestCls: Classification = 'shallow_work';
  for (const [name, d] of appDur) {
    if (d.ms > bestMs) { best = name; bestMs = d.ms; bestCls = d.cls; }
  }
  return { appName: best, classification: bestCls, durationMs: bestMs };
}

function getAppTime(from: number, to: number): AppTimeSummary[] {
  const segs = queryOverlapping(from, to);
  const m = new Map<string, number>();
  for (const s of segs) m.set(s.appName, (m.get(s.appName) ?? 0) + s.endTime - s.startTime);
  return [...m.entries()].map(([appName, totalDurationMs]) => ({ appName, totalDurationMs })).sort((a, b) => b.totalDurationMs - a.totalDurationMs);
}

// ─── Badge / XP ──────────────────────────────────────────────────────────────

const BADGE_DEFS: BadgeInfo[] = [
  { id: 'badge-starter', name: 'Starter', description: 'Earned 100 XP', xpThreshold: 100 },
  { id: 'badge-focused', name: 'Focused', description: 'Earned 500 XP', xpThreshold: 500 },
  { id: 'badge-deep-worker', name: 'Deep Worker', description: 'Earned 1000 XP', xpThreshold: 1000 },
  { id: 'badge-flow-master', name: 'Flow Master', description: 'Earned 5000 XP', xpThreshold: 5000 },
];
const BASE_XP: Record<string, number> = { low: 10, medium: 25, high: 50 };
function totalXP(): number { return loadXPEvents().reduce((s, e) => s + e.xpAmount, 0); }

// ─── Public API ──────────────────────────────────────────────────────────────

export function createBrowserIPC(): SnapBackIPC {
  // Seed historical data on first visit
  seedHistoricalData();
  // Start live tracking
  startTracking();
  // Start live simulator for visible incremental updates
  startLiveSimulator();

  return {
    async getDailySummary(date) { return getDailySummary(date); },
    async getSevenDayTrend() { return getSevenDayTrend(); },
    async getAppTimeByDateRange(from, to) { return getAppTime(from, to); },
    async getHeatMapCells(date) { return getHeatMapCells(date); },
    async getHeatMapTooltip(cellIndex, date) { return getTooltip(cellIndex, date); },
    async getActiveCalendarEvent() { return null; },
    async exportWeeklyReportPDF() {},

    async getTasks() { return loadTasks().sort((a, b) => a.order - b.order); },

    async createTask(title, priority, dueDate?) {
      const tasks = loadTasks();
      const maxOrder = tasks.reduce((mx, t) => Math.max(mx, t.order), -1);
      const task: TaskInfo = {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title, priority, dueDate, completed: false, xpAwarded: 0, order: maxOrder + 1,
      };
      tasks.push(task);
      saveTasks(tasks);
      return task;
    },

    async updateTask(id, updates) {
      const tasks = loadTasks();
      const i = tasks.findIndex(t => t.id === id);
      if (i === -1) throw new Error(`Task not found: ${id}`);
      tasks[i] = { ...tasks[i]!, ...updates, id };
      saveTasks(tasks);
      return tasks[i]!;
    },

    async deleteTask(id) { saveTasks(loadTasks().filter(t => t.id !== id)); },

    async completeTask(id, duringDeepWork) {
      const tasks = loadTasks();
      const i = tasks.findIndex(t => t.id === id);
      if (i === -1) throw new Error(`Task not found: ${id}`);
      const base = BASE_XP[tasks[i]!.priority] ?? 10;
      const xp = duringDeepWork ? Math.floor(base * 1.5) : base;
      tasks[i] = { ...tasks[i]!, completed: true, xpAwarded: xp };
      saveTasks(tasks);
      const events = loadXPEvents();
      events.push({ id: `xp-${Date.now()}`, taskId: id, xpAmount: xp, timestamp: Date.now() });
      saveXPEvents(events);
      return { xpAmount: xp };
    },

    async reorderTasks(ids) {
      const tasks = loadTasks();
      ids.forEach((id, i) => { const t = tasks.find(x => x.id === id); if (t) t.order = i; });
      saveTasks(tasks);
    },

    async getTotalXP() { return totalXP(); },

    async getBadges() {
      const xp = totalXP();
      return BADGE_DEFS.map(b => ({ ...b, awardedAt: xp >= b.xpThreshold ? Date.now() : undefined }));
    },

    async getSettings() {
      return { language: 'en', darkMode: false, colorBlindMode: false, reducedMotion: false, ghostBarEnabled: true, ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false };
    },
    async updateSettings(updates) {
      return { language: 'en', darkMode: false, colorBlindMode: false, reducedMotion: false, ghostBarEnabled: true, ghostBarPosition: 'bottom-right' as const, calendarAuthorized: false, ...updates };
    },
    async authorizeCalendar() {},
    async revokeCalendar() {},
    async deleteAllData() {
      localStorage.removeItem(SEGMENTS_KEY);
      localStorage.removeItem(TASKS_KEY);
      localStorage.removeItem(XP_KEY);
      localStorage.removeItem(SEEDED_KEY);
    },
  };
}
