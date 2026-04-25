"use strict";
/**
 * SnapBack — Electron main process entry point.
 *
 * Initializes all subsystems (LocalStore, ActivityTracker, Classifier,
 * PredictionEngine, TaskManagerService, CalendarSync, NetworkGuard,
 * DashboardService, HeatMapService, TimeBlockScheduler) and registers
 * IPC handlers that bridge the renderer UI to the backend.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const LocalStore_js_1 = require("./store/LocalStore.js");
const NetworkGuard_js_1 = require("./network/NetworkGuard.js");
const ActivityTracker_js_1 = require("./tracker/ActivityTracker.js");
const Classifier_js_1 = require("./classifier/Classifier.js");
const PredictionEngine_js_1 = require("./prediction/PredictionEngine.js");
const TaskManagerService_js_1 = require("./tasks/TaskManagerService.js");
const CalendarSync_js_1 = require("./calendar/CalendarSync.js");
const DashboardService_js_1 = require("./dashboard/DashboardService.js");
const HeatMapService_js_1 = require("./heatmap/HeatMapService.js");
const TimeBlockScheduler_js_1 = require("./scheduler/TimeBlockScheduler.js");
// ─── Subsystem Initialization ────────────────────────────────────────────────
const DB_PATH = (0, node_path_1.join)(electron_1.app.getPath('userData'), 'snapback.db');
let mainWindow = null;
let store;
let networkGuard;
let tracker;
let classifier;
let predictionEngine;
let taskManager;
let calendarSync;
let dashboardService;
let heatMapService;
let scheduler;
function initSubsystems() {
    store = new LocalStore_js_1.LocalStore(DB_PATH);
    // NetworkGuard
    networkGuard = new NetworkGuard_js_1.NetworkGuard(store);
    networkGuard.install();
    // Classifier
    classifier = new Classifier_js_1.Classifier(store);
    // PredictionEngine
    predictionEngine = new PredictionEngine_js_1.PredictionEngine(store, (msg) => {
        mainWindow?.webContents.send('toast', msg);
    });
    // TaskManagerService
    taskManager = new TaskManagerService_js_1.TaskManagerService(store);
    // DashboardService
    dashboardService = new DashboardService_js_1.DashboardService(store);
    // HeatMapService
    heatMapService = new HeatMapService_js_1.HeatMapService(store);
    // TimeBlockScheduler
    scheduler = new TimeBlockScheduler_js_1.TimeBlockScheduler(store);
    // CalendarSync — uses stub keychain/API for now (real OAuth wiring is Task 16+)
    const stubKeychain = {
        async getPassword() { return null; },
        async setPassword() { },
        async deletePassword() { return true; },
    };
    const stubAPI = {
        async fetchEvents() { return []; },
        async refreshToken() { return ''; },
    };
    calendarSync = new CalendarSync_js_1.CalendarSync(store, stubKeychain, stubAPI, {
        networkGuardHook: {
            authorize: () => networkGuard.authorizeCalendar(),
            revoke: () => networkGuard.revokeCalendar(),
        },
    });
    // ActivityTracker — uses active-win and powerMonitor for real OS polling
    const getActiveWindow = async () => {
        try {
            const activeWin = await Promise.resolve().then(() => __importStar(require('active-win')));
            const result = await activeWin.default();
            if (!result)
                return undefined;
            return { title: result.title, owner: { name: result.owner.name } };
        }
        catch {
            return undefined;
        }
    };
    const getIdleTime = () => {
        try {
            const { powerMonitor } = require('electron');
            return powerMonitor.getSystemIdleTime() * 1000; // seconds → ms
        }
        catch {
            return 0;
        }
    };
    tracker = new ActivityTracker_js_1.ActivityTracker({ pollIntervalMs: 5000, idleThresholdMs: 120_000 }, getActiveWindow, getIdleTime, store);
    // Wire tracker → classifier → prediction pipeline
    //
    // Classifier.ingest() calls flush() internally on app switch but discards
    // the returned segment. We wrap flush() to intercept and persist segments.
    let lastClassification = 'shallow_work';
    const originalFlush = classifier.flush.bind(classifier);
    classifier.flush = function () {
        const segment = originalFlush();
        if (segment) {
            try {
                store.insertSegment(segment);
            }
            catch { /* already inserted or DB error */ }
            lastClassification = segment.classification;
        }
        return segment;
    };
    tracker.onTick((tick) => {
        classifier.ingest(tick);
        predictionEngine.ingestTick(tick, lastClassification);
    });
    // Start tracking
    tracker.start();
}
// ─── Window Creation ─────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
        },
    });
    if (process.env['NODE_ENV'] === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile((0, node_path_1.join)(__dirname, '../renderer/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ─── App Lifecycle ───────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    initSubsystems();
    registerIPCHandlers();
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        tracker?.stop();
        networkGuard?.uninstall();
        store?.close();
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null)
        createWindow();
});
// ─── IPC Handlers ────────────────────────────────────────────────────────────
function registerIPCHandlers() {
    // ── Dashboard (delegates to DashboardService) ────────────────────────────
    electron_1.ipcMain.handle('dashboard:getDailySummary', (_event, date) => {
        return dashboardService.getDailySummary(date);
    });
    electron_1.ipcMain.handle('dashboard:getSevenDayTrend', () => {
        return dashboardService.getSevenDayTrend();
    });
    electron_1.ipcMain.handle('dashboard:getAppTimeByDateRange', (_event, from, to) => {
        return dashboardService.getAppTimeByDateRange(from, to);
    });
    electron_1.ipcMain.handle('dashboard:exportWeeklyReportPDF', async (_event, targetDir) => {
        const pdfBuffer = await dashboardService.generatePDFReport();
        const { writeFileSync } = require('node:fs');
        const outPath = (0, node_path_1.join)(targetDir, `snapback-report-${new Date().toISOString().slice(0, 10)}.pdf`);
        writeFileSync(outPath, pdfBuffer);
    });
    // ── Heat Map (delegates to HeatMapService) ───────────────────────────────
    electron_1.ipcMain.handle('heatmap:getCells', (_event, date) => {
        return heatMapService.getHeatMapCells(date);
    });
    electron_1.ipcMain.handle('heatmap:getTooltip', (_event, cellIndex, date) => {
        return heatMapService.getTooltipData(cellIndex, date);
    });
    // ── Tasks (delegates to TaskManagerService) ──────────────────────────────
    electron_1.ipcMain.handle('tasks:getAll', () => {
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
    electron_1.ipcMain.handle('tasks:create', (_event, title, priority, dueDate) => {
        const task = taskManager.createTask({
            title,
            priority: priority,
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
    electron_1.ipcMain.handle('tasks:update', (_event, id, updates) => {
        const task = taskManager.updateTask(id, updates);
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
    electron_1.ipcMain.handle('tasks:delete', (_event, id) => {
        taskManager.deleteTask(id);
    });
    electron_1.ipcMain.handle('tasks:complete', (_event, id, duringDeepWork) => {
        const xpEvent = taskManager.completeTask(id, duringDeepWork);
        return { xpAmount: xpEvent.xpAmount };
    });
    electron_1.ipcMain.handle('tasks:reorder', (_event, orderedIds) => {
        taskManager.reorderTasks(orderedIds);
    });
    electron_1.ipcMain.handle('tasks:getTotalXP', () => {
        return taskManager.getTotalXP();
    });
    electron_1.ipcMain.handle('tasks:getBadges', () => {
        return taskManager.getBadges();
    });
    // ── Calendar ─────────────────────────────────────────────────────────────
    electron_1.ipcMain.handle('calendar:getActiveEvent', (_event, timestamp) => {
        const event = calendarSync.getActiveEvent(timestamp);
        if (!event)
            return null;
        return { title: event.title, startTime: event.startTime, endTime: event.endTime };
    });
    electron_1.ipcMain.handle('calendar:authorize', async () => {
        await calendarSync.authorize();
    });
    electron_1.ipcMain.handle('calendar:revoke', async () => {
        await calendarSync.revokeAuthorization();
    });
    // ── Settings ─────────────────────────────────────────────────────────────
    // Settings are stored in localStorage on the renderer side.
    // These handlers provide main-process state (e.g. calendar auth status).
    electron_1.ipcMain.handle('settings:get', () => {
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
    electron_1.ipcMain.handle('settings:update', (_event, updates) => {
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
    electron_1.ipcMain.handle('store:deleteAllData', () => {
        store.deleteAllData();
    });
}
