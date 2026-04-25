/**
 * SnapBack — Electron main process entry point.
 *
 * Initializes all subsystems in order:
 * LocalStore → NetworkGuard → EventBus → ActivityTracker → Classifier →
 * PredictionEngine → TaskManagerService → CalendarSync → DashboardService →
 * HeatMapService
 *
 * Registers IPC handlers for renderer communication.
 * Requirements: 1.1, 2.1, 5.2, 5.3, 6.5
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';

import { LocalStore } from './store/LocalStore.js';
import { NetworkGuard } from './network/NetworkGuard.js';
import { ActivityTracker } from './tracker/ActivityTracker.js';
import { Classifier } from './classifier/Classifier.js';
import { PredictionEngine } from './prediction/PredictionEngine.js';
import { TaskManagerService } from './tasks/TaskManagerService.js';
import { CalendarSync } from './calendar/CalendarSync.js';
import { DashboardService } from './dashboard/DashboardService.js';
import { HeatMapService } from './heatmap/HeatMapService.js';

import type { ActivityTick } from './types.js';

// ─── Globals ─────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let store: LocalStore;
let networkGuard: NetworkGuard;
let eventBus: EventEmitter;
let activityTracker: ActivityTracker;
let classifier: Classifier;
let predictionEngine: PredictionEngine;
let taskManagerService: TaskManagerService;
let calendarSync: CalendarSync;
let dashboardService: DashboardService;
let heatMapService: HeatMapService;

// In-memory settings (persisted to a simple JSON in production)
let appSettings = {
  language: 'en',
  darkMode: false,
  colorBlindMode: false,
  reducedMotion: false,
  ghostBarEnabled: true,
  ghostBarPosition: 'bottom-right' as const,
  calendarAuthorized: false,
};

// ─── Initialization ──────────────────────────────────────────────────────────

function initializeSubsystems(): void {
  // 1. Local Store
  const dbPath = join(app.getPath('userData'), 'snapback.db');
  store = new LocalStore(dbPath);

  // 2. Network Guard
  networkGuard = new NetworkGuard(store);
  networkGuard.install();

  // 3. Event Bus
  eventBus = new EventEmitter();
  eventBus.setMaxListeners(20);

  // 4. Activity Tracker
  let activeWinModule: any;
  try {
    activeWinModule = require('active-win');
  } catch {
    activeWinModule = null;
  }

  activityTracker = new ActivityTracker(
    { pollIntervalMs: 5000, idleThresholdMs: 120_000 },
    async () => {
      if (!activeWinModule) return undefined;
      try {
        const win = await activeWinModule.activeWindow();
        if (!win) return undefined;
        return { title: win.title ?? '', owner: { name: win.owner?.name ?? '' } };
      } catch {
        return undefined;
      }
    },
    () => {
      // Idle time detection — platform-specific
      // In production, use electron's powerMonitor or native bindings
      // For now, return 0 (not idle)
      return 0;
    },
    store
  );

  // 5. Classifier
  classifier = new Classifier(store);

  // 6. Prediction Engine
  predictionEngine = new PredictionEngine(store, (message) => {
    mainWindow?.webContents.send('toast', message);
  });

  // 7. Task Manager Service
  taskManagerService = new TaskManagerService(store);

  // 8. Calendar Sync (with mock keychain for now — keytar wired in production)
  const keychainStore = new Map<string, string>();
  calendarSync = new CalendarSync(
    store,
    {
      async getPassword(_svc, account) { return keychainStore.get(account) ?? null; },
      async setPassword(_svc, account, pw) { keychainStore.set(account, pw); },
      async deletePassword(_svc, account) { return keychainStore.delete(account); },
    },
    {
      async fetchEvents() { return []; },
      async refreshToken() { return ''; },
    },
    {
      networkGuardHook: {
        authorize: () => networkGuard.authorizeCalendar(),
        revoke: () => networkGuard.revokeCalendar(),
      },
    }
  );

  // 9. Dashboard Service
  dashboardService = new DashboardService(store);

  // 10. Heat Map Service
  heatMapService = new HeatMapService(store);

  // ─── Wire Event Subscriptions ────────────────────────────────────────────

  // ActivityTracker → EventBus → Classifier + PredictionEngine
  activityTracker.onTick((tick: ActivityTick) => {
    eventBus.emit('activity.tick', tick);
  });

  eventBus.on('activity.tick', (tick: ActivityTick) => {
    // Feed to classifier
    classifier.ingest(tick);

    // Check if classifier flushed a segment (app switch)
    // The classifier flushes internally on app switch via ingest()

    // Feed to prediction engine
    const lastClassification = 'shallow_work'; // simplified — in production, use actual classification
    predictionEngine.ingestTick(tick, lastClassification);

    // Check for intervention
    const prediction = predictionEngine.predict();
    if (prediction) {
      mainWindow?.webContents.send('intervention', {
        patternDescription: prediction.patternDescription,
        suggestedAction: prediction.suggestedAction,
        confidence: prediction.confidence,
      });
    }
  });

  // Start tracking
  activityTracker.start();
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

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIPCHandlers(): void {
  // Dashboard
  ipcMain.handle('dashboard:getDailySummary', (_e, date: string) => {
    return dashboardService.getDailySummary(date);
  });

  ipcMain.handle('dashboard:getSevenDayTrend', () => {
    return dashboardService.getSevenDayTrend();
  });

  ipcMain.handle('dashboard:getAppTimeByDateRange', (_e, from: number, to: number) => {
    return dashboardService.getAppTimeByDateRange(from, to);
  });

  ipcMain.handle('dashboard:exportWeeklyReportPDF', async (_e, targetDir: string) => {
    const buffer = await dashboardService.generatePDFReport();
    const filePath = join(targetDir, `snapback-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    writeFileSync(filePath, buffer);
  });

  // Heat Map
  ipcMain.handle('heatmap:getCells', (_e, date: string) => {
    return heatMapService.getHeatMapCells(date);
  });

  ipcMain.handle('heatmap:getTooltip', (_e, cellIndex: number, date: string) => {
    return heatMapService.getTooltipData(cellIndex, date);
  });

  // Calendar
  ipcMain.handle('calendar:getActiveEvent', (_e, timestamp: number) => {
    return calendarSync.getActiveEvent(timestamp);
  });

  ipcMain.handle('calendar:authorize', async () => {
    await calendarSync.authorize();
  });

  ipcMain.handle('calendar:revoke', async () => {
    await calendarSync.revokeAuthorization();
  });

  // Tasks
  ipcMain.handle('tasks:getAll', () => {
    return store.queryTasks();
  });

  ipcMain.handle('tasks:create', (_e, title: string, priority: string, dueDate?: number) => {
    return taskManagerService.createTask({
      title,
      priority: priority as 'low' | 'medium' | 'high',
      dueDate,
      completed: false,
      completedDuringDeepWork: false,
    });
  });

  ipcMain.handle('tasks:update', (_e, id: string, updates: Record<string, unknown>) => {
    return taskManagerService.updateTask(id, updates);
  });

  ipcMain.handle('tasks:delete', (_e, id: string) => {
    taskManagerService.deleteTask(id);
  });

  ipcMain.handle('tasks:complete', (_e, id: string, duringDeepWork: boolean) => {
    const xpEvent = taskManagerService.completeTask(id, duringDeepWork);
    return { xpAmount: xpEvent.xpAmount };
  });

  ipcMain.handle('tasks:reorder', (_e, orderedIds: string[]) => {
    taskManagerService.reorderTasks(orderedIds);
  });

  ipcMain.handle('tasks:getTotalXP', () => {
    return taskManagerService.getTotalXP();
  });

  ipcMain.handle('tasks:getBadges', () => {
    return taskManagerService.getBadges();
  });

  // Settings
  ipcMain.handle('settings:get', () => {
    return { ...appSettings };
  });

  ipcMain.handle('settings:update', (_e, updates: Record<string, unknown>) => {
    appSettings = { ...appSettings, ...updates };
    return { ...appSettings };
  });

  // Data deletion
  ipcMain.handle('store:deleteAllData', () => {
    store.deleteAllData();
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  initializeSubsystems();
  registerIPCHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  activityTracker?.stop();
  networkGuard?.uninstall();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
