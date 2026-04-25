"use strict";
/**
 * Preload script — exposes a typed IPC bridge to the renderer via contextBridge.
 *
 * The renderer accesses these methods via `window.snapbackAPI`.
 * All calls go through ipcRenderer.invoke → ipcMain.handle in index.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('snapbackAPI', {
    // Dashboard
    getDailySummary: (date) => electron_1.ipcRenderer.invoke('dashboard:getDailySummary', date),
    getSevenDayTrend: () => electron_1.ipcRenderer.invoke('dashboard:getSevenDayTrend'),
    getAppTimeByDateRange: (from, to) => electron_1.ipcRenderer.invoke('dashboard:getAppTimeByDateRange', from, to),
    exportWeeklyReportPDF: (targetDir) => electron_1.ipcRenderer.invoke('dashboard:exportWeeklyReportPDF', targetDir),
    // Heat Map
    getHeatMapCells: (date) => electron_1.ipcRenderer.invoke('heatmap:getCells', date),
    getHeatMapTooltip: (cellIndex, date) => electron_1.ipcRenderer.invoke('heatmap:getTooltip', cellIndex, date),
    // Calendar
    getActiveCalendarEvent: (timestamp) => electron_1.ipcRenderer.invoke('calendar:getActiveEvent', timestamp),
    // Tasks
    getTasks: () => electron_1.ipcRenderer.invoke('tasks:getAll'),
    createTask: (title, priority, dueDate) => electron_1.ipcRenderer.invoke('tasks:create', title, priority, dueDate),
    updateTask: (id, updates) => electron_1.ipcRenderer.invoke('tasks:update', id, updates),
    deleteTask: (id) => electron_1.ipcRenderer.invoke('tasks:delete', id),
    completeTask: (id, duringDeepWork) => electron_1.ipcRenderer.invoke('tasks:complete', id, duringDeepWork),
    reorderTasks: (orderedIds) => electron_1.ipcRenderer.invoke('tasks:reorder', orderedIds),
    getTotalXP: () => electron_1.ipcRenderer.invoke('tasks:getTotalXP'),
    getBadges: () => electron_1.ipcRenderer.invoke('tasks:getBadges'),
    // Settings
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    updateSettings: (updates) => electron_1.ipcRenderer.invoke('settings:update', updates),
    authorizeCalendar: () => electron_1.ipcRenderer.invoke('calendar:authorize'),
    revokeCalendar: () => electron_1.ipcRenderer.invoke('calendar:revoke'),
    deleteAllData: () => electron_1.ipcRenderer.invoke('store:deleteAllData'),
});
