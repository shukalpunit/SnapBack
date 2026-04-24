/**
 * SnapBack — Electron main process entry point (placeholder).
 *
 * Full wiring of all subsystems is implemented in Task 16.
 * This file provides the minimal Electron bootstrap.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
