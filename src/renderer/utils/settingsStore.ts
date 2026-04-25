/**
 * Settings persistence — saves/loads settings to localStorage.
 * Falls back to defaults if localStorage is unavailable.
 */

import type { AppSettings } from '../ipc.js';

const STORAGE_KEY = 'snapback-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  darkMode: false,
  colorBlindMode: false,
  reducedMotion: false,
  ghostBarEnabled: true,
  ghostBarPosition: 'bottom-right',
  calendarAuthorized: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // localStorage unavailable or corrupt
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable
  }
}
