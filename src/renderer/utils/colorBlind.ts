/**
 * Color blind mode utilities.
 *
 * Provides alternative color palettes and icon patterns so classification
 * is distinguishable without relying on color alone.
 *
 * Requirements: 3.5, 10.3 (Property 9: Color Blind Mode Indicator Distinctness)
 */

import type { Classification } from '../ipc.js';

// ─── Default Palette (green/yellow/red) ──────────────────────────────────────

export const DEFAULT_COLORS: Record<Classification, string> = {
  deep_work: '#22c55e',        // green
  shallow_work: '#eab308',     // yellow
  distraction_loop: '#ef4444', // red
};

// ─── Color Blind Palette (blue/orange/purple — perceptually distinct) ────────

export const COLOR_BLIND_COLORS: Record<Classification, string> = {
  deep_work: '#2563eb',        // blue
  shallow_work: '#f97316',     // orange
  distraction_loop: '#a855f7', // purple
};

// ─── Icon Patterns ───────────────────────────────────────────────────────────

export const ICON_PATTERNS: Record<Classification, string> = {
  deep_work: '◆',              // filled diamond
  shallow_work: '▲',           // triangle
  distraction_loop: '●',       // filled circle
};

// ─── Accessors ───────────────────────────────────────────────────────────────

export function getClassificationColor(
  classification: Classification,
  colorBlindMode: boolean
): string {
  return colorBlindMode
    ? COLOR_BLIND_COLORS[classification]
    : DEFAULT_COLORS[classification];
}

export function getClassificationIcon(
  classification: Classification
): string {
  return ICON_PATTERNS[classification];
}

export interface ClassificationIndicator {
  color: string;
  icon: string;
}

/**
 * Get both color and icon for a classification.
 * In color blind mode, the color differs from the default palette
 * and an icon is always included.
 */
export function getClassificationIndicator(
  classification: Classification,
  colorBlindMode: boolean
): ClassificationIndicator {
  return {
    color: getClassificationColor(classification, colorBlindMode),
    icon: colorBlindMode ? getClassificationIcon(classification) : '',
  };
}
