/**
 * Preload script — exposes a typed IPC bridge to the renderer via contextBridge.
 *
 * The renderer accesses these methods via `window.snapbackAPI`.
 * All calls go through ipcRenderer.invoke → ipcMain.handle in index.ts.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('snapbackAPI', {
  // Dashboard
  getDailySummary: (date: string) => ipcRenderer.invoke('dashboard:getDailySummary', date),
  getSevenDayTrend: () => ipcRenderer.invoke('dashboard:getSevenDayTrend'),
  getAppTimeByDateRange: (from: number, to: number) => ipcRenderer.invoke('dashboard:getAppTimeByDateRange', from, to),
  exportWeeklyReportPDF: (targetDir: string) => ipcRenderer.invoke('dashboard:exportWeeklyReportPDF', targetDir),

  // Heat Map
  getHeatMapCells: (date: string) => ipcRenderer.invoke('heatmap:getCells', date),
  getHeatMapTooltip: (cellIndex: number, date: string) => ipcRenderer.invoke('heatmap:getTooltip', cellIndex, date),

  // Calendar
  getActiveCalendarEvent: (timestamp: number) => ipcRenderer.invoke('calendar:getActiveEvent', timestamp),

  // Tasks
  getTasks: () => ipcRenderer.invoke('tasks:getAll'),
  createTask: (title: string, priority: string, dueDate?: number) => ipcRenderer.invoke('tasks:create', title, priority, dueDate),
  updateTask: (id: string, updates: Record<string, unknown>) => ipcRenderer.invoke('tasks:update', id, updates),
  deleteTask: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  completeTask: (id: string, duringDeepWork: boolean) => ipcRenderer.invoke('tasks:complete', id, duringDeepWork),
  reorderTasks: (orderedIds: string[]) => ipcRenderer.invoke('tasks:reorder', orderedIds),
  getTotalXP: () => ipcRenderer.invoke('tasks:getTotalXP'),
  getBadges: () => ipcRenderer.invoke('tasks:getBadges'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (updates: Record<string, unknown>) => ipcRenderer.invoke('settings:update', updates),
  authorizeCalendar: () => ipcRenderer.invoke('calendar:authorize'),
  revokeCalendar: () => ipcRenderer.invoke('calendar:revoke'),
  deleteAllData: () => ipcRenderer.invoke('store:deleteAllData'),
});
