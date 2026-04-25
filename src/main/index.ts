/**
 * SnapBack — Electron main process entry point.
 *
 * Initializes all subsystems (LocalStore, ActivityTracker, Classifier,
 * PredictionEngine, TaskManagerService, CalendarSync, NetworkGuard,
 * DashboardService, HeatMapService, TimeBlockScheduler) and registers
 * IPC handlers that bridge the renderer UI to the backend.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

import { LocalStore } from './store/LocalStore.js';
import { NetworkGuard } from './network/NetworkGuard.js';
import { ActivityTracker, type ActiveWindowProvider, type IdleTimeProvider } from './tracker/ActivityTracker.js';
import { Classifier } from './classifier/Classifier.js';
import { PredictionEngine } from './prediction/PredictionEngine.js';
import { TaskManagerService } from './tasks/TaskManagerService.js';
import { CalendarSync, type KeychainProvider, type CalendarAPIClient } from './calendar/CalendarSync.js';
import { DashboardService } from './dashboard/DashboardService.js';
import { HeatMapService } from './heatmap/HeatMapService.js';
import { TimeBlockScheduler } from './scheduler/TimeBlockScheduler.js';
import type { ClassifiedSegment, Classification, ActivityTick } from './types.js';

// ─── Subsystem Initialization ────────────────────────────────────────────────

const DB_PATH = join(app.getPath('userData'), 'snapback.db');

let mainWindow: BrowserWindow | null = null;
let store: LocalStore;
let networkGuard: NetworkGuard;
let tracker: ActivityTracker;
let classifier: Classifier;
let predictionEngine: PredictionEngine;
let taskManager: TaskManagerService;
let calendarSync: CalendarSync;
let dashboardService: DashboardService;
let heatMapService: HeatMapService;
let scheduler: TimeBlockScheduler;

function initSubsystems(): void {
  store = new LocalStore(DB_PATH);

  // NetworkGuard
  networkGuard = new NetworkGuard(store);
  networkGuard.install();

  // Classifier
  classifier = new Classifier(store);

  // PredictionEngine
  predictionEngine = new PredictionEngine(store, (msg) => {
    mainWindow?.webContents.send('toast', msg);
  });

  // TaskManagerService
  taskManager = new TaskManagerService(store);

  // DashboardService
  dashboardService = new DashboardService(store);

  // HeatMapService
  heatMapService = new HeatMapService(store);

  // TimeBlockScheduler
  scheduler = new TimeBlockScheduler(store);

  // CalendarSync — uses stub keychain/API for now (real OAuth wiring is Task 16+)
  const stubKeychain: KeychainProvider = {
    async getPassword() { return null; },
    async setPassword() {},
    async deletePassword() { return true; },
  };
  const stubAPI: CalendarAPIClient = {
    async fetchEvents() { return []; },
    async refreshToken() { return ''; },
  };
  calendarSync = new CalendarSync(store, stubKeychain, stubAPI, {
    networkGuardHook: {
      authorize: () => networkGuard.authorizeCalendar(),
      revoke: () => networkGuard.revokeCalendar(),
    },
  });

  // ActivityTracker — uses active-win and powerMonitor for real OS polling
  const getActiveWindow: ActiveWindowProvider = async () => {
    try {
      const activeWin = await import('active-win');
      const result = await activeWin.default();
      if (!result) return undefined;
      return { title: result.title, owner: { name: result.owner.name } };
    } catch {
      return undefined;
    }
  };

  const getIdleTime: IdleTimeProvider = () => {
    try {
      const { powerMonitor } = require('electron');
      return powerMonitor.getSystemIdleTime() * 1000; // seconds → ms
    } catch {
      return 0;
    }
  };

  tracker = new ActivityTracker(
    { pollIntervalMs: 5000, idleThresholdMs: 120_000 },
    getActiveWindow,
    getIdleTime,
    store
  );

  // Wire tracker → classifier → prediction pipeline
  //
  // Classifier.ingest() calls flush() internally on app switch but discards
  // the returned segment. We wrap flush() to intercept and persist segments.
  let lastClassification: Classification = 'shallow_work';

  const originalFlush = classifier.flush.bind(classifier);
  (classifier as any).flush = function (): ClassifiedSegment | null {
    const segment = originalFlush();
    if (segment) {
      try { store.insertSegment(segment); } catch { /* already inserted or DB error */ }
      lastClassification = segment.classification;
    }
    return segment;
  };

  tracker.onTick((tick: ActivityTick) => {
    classifier.ingest(tick);
    predictionEngine.ingestTick(tick, lastClassification);
  });

  // Start tracking
  tracker.start();
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  if (process.env['NODE_ENV'] === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  initSubsystems();
  registerIPCHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    tracker?.stop();
    networkGuard?.uninstall();
    store?.close();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});


// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIPCHandlers(): void {
  // ── Dashboard (delegates to DashboardService) ────────────────────────────

  ipcMain.handle('dashboard:getDailySummary', (_event, date: string) => {
    return dashboardService.getDailySummary(date);
  });

  ipcMain.handle('dashboard:getSevenDayTrend', () => {
    return dashboardService.getSevenDayTrend();
  });

  ipcMain.handle('dashboard:getAppTimeByDateRange', (_event, from: number, to: number) => {
    return dashboardService.getAppTimeByDateRange(from, to);
  });

  ipcMain.handle('dashboard:exportWeeklyReportPDF', async (_event, targetDir: string) => {
    const pdfBuffer = await dashboardService.generatePDFReport();
    const { writeFileSync } = require('node:fs');
    const outPath = join(targetDir, `snapback-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    writeFileSync(outPath, pdfBuffer);
  });

  // ── Heat Map (delegates to HeatMapService) ───────────────────────────────

  ipcMain.handle('heatmap:getCells', (_event, date: string) => {
    return heatMapService.getHeatMapCells(date);
  });

  ipcMain.handle('heatmap:getTooltip', (_event, cellIndex: number, date: string) => {
    return heatMapService.getTooltipData(cellIndex, date);
  });

  // ── Tasks (delegates to TaskManagerService) ──────────────────────────────

  ipcMain.handle('tasks:getAll', () => {
    const tasks = store.queryTasks();
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      completed: t.completed,
      xpAwarded: t.xpAwarded,
      order: t.order,
    }));
  });

  ipcMain.handle('tasks:create', (_event, title: string, priority: string, dueDate?: number) => {
    const task = taskManager.createTask({
      title,
      priority: priority as 'low' | 'medium' | 'high',
      dueDate,
      completed: false,
      completedAt: undefined,
      completedDuringDeepWork: false,
    });
    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
      completed: task.completed,
      xpAwarded: task.xpAwarded,
      order: task.order,
    };
  });

  ipcMain.handle('tasks:update', (_event, id: string, updates: Record<string, unknown>) => {
    const task = taskManager.updateTask(id, updates as any);
    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
      completed: task.completed,
      xpAwarded: task.xpAwarded,
      order: task.order,
    };
  });

  ipcMain.handle('tasks:delete', (_event, id: string) => {
    taskManager.deleteTask(id);
  });

  ipcMain.handle('tasks:complete', (_event, id: string, duringDeepWork: boolean) => {
    const xpEvent = taskManager.completeTask(id, duringDeepWork);
    return { xpAmount: xpEvent.xpAmount };
  });

  ipcMain.handle('tasks:reorder', (_event, orderedIds: string[]) => {
    taskManager.reorderTasks(orderedIds);
  });

  ipcMain.handle('tasks:getTotalXP', () => {
    return taskManager.getTotalXP();
  });

  ipcMain.handle('tasks:getBadges', () => {
    return taskManager.getBadges();
  });

  // ── Calendar ─────────────────────────────────────────────────────────────

  ipcMain.handle('calendar:getActiveEvent', (_event, timestamp: number) => {
    const event = calendarSync.getActiveEvent(timestamp);
    if (!event) return null;
    return { title: event.title, startTime: event.startTime, endTime: event.endTime };
  });

  ipcMain.handle('calendar:authorize', async () => {
    await calendarSync.authorize();
  });

  ipcMain.handle('calendar:revoke', async () => {
    await calendarSync.revokeAuthorization();
  });

  // ── Settings ─────────────────────────────────────────────────────────────
  // Settings are stored in localStorage on the renderer side.
  // These handlers provide main-process state (e.g. calendar auth status).

  ipcMain.handle('settings:get', () => {
    return {
      language: 'en',
      darkMode: false,
      colorBlindMode: false,
      reducedMotion: false,
      ghostBarEnabled: true,
      ghostBarPosition: 'bottom-right',
      calendarAuthorized: calendarSync.isAuthorized(),
    };
  });

  ipcMain.handle('settings:update', (_event, updates: Record<string, unknown>) => {
    return {
      language: 'en',
      darkMode: false,
      colorBlindMode: false,
      reducedMotion: false,
      ghostBarEnabled: true,
      ghostBarPosition: 'bottom-right',
      calendarAuthorized: calendarSync.isAuthorized(),
      ...updates,
    };
  });

  // ── Data Management ──────────────────────────────────────────────────────

  ipcMain.handle('store:deleteAllData', () => {
    store.deleteAllData();
  });
}
