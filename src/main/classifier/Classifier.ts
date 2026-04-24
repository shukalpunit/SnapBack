/**
 * Classifier — Behavioral heuristic engine that labels time segments.
 *
 * Accumulates ActivityTick events into RawSegments, then classifies each
 * completed segment as deep_work, shallow_work, or distraction_loop based
 * on behavioral rules evaluated in priority order.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7
 */

import { randomUUID } from 'node:crypto';
import type {
  ActivityTick,
  Classification,
  ClassifiedSegment,
  AppCategory,
  InputSignalSummary,
  IClassifier,
  ILocalStore,
} from '../types.js';

// ─── App Category Detection ──────────────────────────────────────────────────

const APP_CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: AppCategory }> = [
  // IDEs
  { pattern: /\b(vscode|visual studio|intellij|webstorm|pycharm|android studio|xcode|eclipse|sublime|atom|neovim|vim|emacs|cursor|kiro)\b/i, category: 'ide' },
  // Email
  { pattern: /\b(outlook|thunderbird|mail|gmail|protonmail)\b/i, category: 'email' },
  // Communication
  { pattern: /\b(slack|discord|teams|zoom|skype|telegram|whatsapp|signal|meet)\b/i, category: 'communication' },
  // Browsers
  { pattern: /\b(chrome|firefox|safari|edge|brave|opera|arc|vivaldi)\b/i, category: 'browser' },
  // Documents
  { pattern: /\b(word|docs|pages|notion|obsidian|excel|sheets|powerpoint|slides|libreoffice|writer|calc)\b/i, category: 'document' },
  // Media
  { pattern: /\b(spotify|vlc|youtube|netflix|twitch|music|photos|preview|mpv)\b/i, category: 'media' },
];

export function detectAppCategory(appName: string): AppCategory {
  if (!appName || appName.trim().length === 0) return 'other';
  for (const { pattern, category } of APP_CATEGORY_PATTERNS) {
    if (pattern.test(appName)) return category;
  }
  return 'other';
}

// ─── Classification Constants ────────────────────────────────────────────────

/** Distraction loop: ≥3 visits within this window (ms). */
const DISTRACTION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Distraction loop: each visit must be shorter than this (ms). */
const DISTRACTION_MAX_VISIT_MS = 90 * 1000; // 90 seconds

/** Distraction loop: minimum number of short visits to the same app. */
const DISTRACTION_MIN_VISITS = 3;

/** Distraction loop: max keystrokes per visit to count as "no substantive action". */
const DISTRACTION_MAX_KEYSTROKES = 5;

/** Deep work: minimum continuous engagement duration (ms). */
const DEEP_WORK_MIN_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/** Deep work: minimum keystrokes for sustained input. */
const DEEP_WORK_MIN_KEYSTROKES = 50;

/** Deep work: minimum mouse clicks for sustained input. */
const DEEP_WORK_MIN_CLICKS = 20;

// ─── Visit Tracker (for distraction loop detection) ──────────────────────────

interface AppVisit {
  appName: string;
  startTime: number;
  endTime: number;
  keystrokeCount: number;
}

// ─── Classifier ──────────────────────────────────────────────────────────────

export class Classifier implements IClassifier {
  private store: ILocalStore | null;

  // Current segment being accumulated
  private currentAppName: string | null = null;
  private currentWindowTitle: string | null = null;
  private segmentStartTime: number | null = null;
  private lastTickTimestamp: number | null = null;
  private tickCount = 0;
  private inputSignals: InputSignalSummary = {
    keystrokeCount: 0,
    mouseClickCount: 0,
    scrollEventCount: 0,
  };

  // Recent visits for distraction loop detection
  private recentVisits: AppVisit[] = [];

  constructor(store?: ILocalStore) {
    this.store = store ?? null;
  }

  /**
   * Ingest a single ActivityTick. If the app changed, flush the previous
   * segment and start a new one.
   */
  ingest(tick: ActivityTick): void {
    // Skip idle ticks — they don't accumulate time (Requirement 1.4)
    if (tick.isIdle) return;

    // App switch detected — flush previous segment
    if (this.currentAppName !== null && tick.appName !== this.currentAppName) {
      this.flush();
    }

    // Start or continue segment
    if (this.currentAppName === null || tick.appName !== this.currentAppName) {
      this.currentAppName = tick.appName;
      this.currentWindowTitle = tick.windowTitle;
      this.segmentStartTime = tick.timestamp;
      this.lastTickTimestamp = tick.timestamp;
      this.tickCount = 0;
      this.inputSignals = { keystrokeCount: 0, mouseClickCount: 0, scrollEventCount: 0 };
    }

    this.tickCount++;
    this.currentWindowTitle = tick.windowTitle;
    this.lastTickTimestamp = tick.timestamp;
  }

  /**
   * Ingest input signals separately (keystrokes, clicks, scrolls).
   * Called by the main process when OS-level input events are detected.
   */
  addInputSignals(signals: Partial<InputSignalSummary>): void {
    this.inputSignals.keystrokeCount += signals.keystrokeCount ?? 0;
    this.inputSignals.mouseClickCount += signals.mouseClickCount ?? 0;
    this.inputSignals.scrollEventCount += signals.scrollEventCount ?? 0;
  }

  /**
   * Flush the current segment, classify it, and return it.
   * Returns null if there's no segment to flush.
   */
  flush(): ClassifiedSegment | null {
    if (this.currentAppName === null || this.segmentStartTime === null) {
      return null;
    }

    const endTime = this.lastTickTimestamp ?? Date.now();
    const segment: ClassifiedSegment = {
      id: randomUUID(),
      appName: this.currentAppName,
      windowTitle: this.currentWindowTitle ?? '',
      appCategory: detectAppCategory(this.currentAppName),
      startTime: this.segmentStartTime,
      endTime,
      tickCount: this.tickCount,
      inputSignals: { ...this.inputSignals },
      classification: 'shallow_work', // default, overridden below
      isManualOverride: false,
    };

    // Record this visit for distraction loop detection
    const visit: AppVisit = {
      appName: segment.appName,
      startTime: segment.startTime,
      endTime: segment.endTime,
      keystrokeCount: segment.inputSignals.keystrokeCount,
    };
    this.recentVisits.push(visit);

    // Prune visits older than the distraction window
    const cutoff = endTime - DISTRACTION_WINDOW_MS;
    this.recentVisits = this.recentVisits.filter((v) => v.endTime >= cutoff);

    // Classify
    segment.classification = this.classify(segment, this.recentVisits);

    // Reset current segment state
    this.currentAppName = null;
    this.currentWindowTitle = null;
    this.segmentStartTime = null;
    this.lastTickTimestamp = null;
    this.tickCount = 0;
    this.inputSignals = { keystrokeCount: 0, mouseClickCount: 0, scrollEventCount: 0 };

    return segment;
  }

  /**
   * Override the classification of a previously stored segment.
   */
  overrideClassification(segmentId: string, classification: Classification): void {
    if (this.store) {
      this.store.overrideSegmentClassification(segmentId, classification);
    }
  }

  /**
   * Core classification logic. Evaluated in priority order:
   * 1. Distraction loop
   * 2. Deep work
   * 3. Shallow work (fallback)
   */
  private classify(segment: ClassifiedSegment, visits: AppVisit[]): Classification {
    if (this.isDistractionLoop(segment, visits)) return 'distraction_loop';
    if (this.isDeepWork(segment)) return 'deep_work';
    return 'shallow_work';
  }

  /**
   * Distraction loop: ≥3 visits to the same app within 10 minutes,
   * each visit < 90 seconds, with < 5 keystrokes per visit.
   */
  private isDistractionLoop(segment: ClassifiedSegment, visits: AppVisit[]): boolean {
    const sameAppVisits = visits.filter((v) => v.appName === segment.appName);
    if (sameAppVisits.length < DISTRACTION_MIN_VISITS) return false;

    // Check that all visits (including current) are short and low-action
    const allShortAndLowAction = sameAppVisits.every((v) => {
      const duration = v.endTime - v.startTime;
      return duration < DISTRACTION_MAX_VISIT_MS && v.keystrokeCount < DISTRACTION_MAX_KEYSTROKES;
    });

    return allShortAndLowAction;
  }

  /**
   * Deep work: continuous engagement > 10 minutes with sustained input
   * (keystrokes > 50 or mouse clicks > 20).
   */
  private isDeepWork(segment: ClassifiedSegment): boolean {
    const duration = segment.endTime - segment.startTime;
    if (duration < DEEP_WORK_MIN_DURATION_MS) return false;

    return (
      segment.inputSignals.keystrokeCount > DEEP_WORK_MIN_KEYSTROKES ||
      segment.inputSignals.mouseClickCount > DEEP_WORK_MIN_CLICKS
    );
  }
}

// ─── Pure classification function (for testing without state) ────────────────

/**
 * Classify a single segment in isolation (no visit history).
 * Useful for property testing the exhaustiveness/exclusivity invariant.
 */
export function classifySegment(
  durationMs: number,
  keystrokeCount: number,
  mouseClickCount: number,
  visitCount: number,
  allVisitsShortAndLowAction: boolean
): Classification {
  // Priority 1: Distraction loop
  if (
    visitCount >= DISTRACTION_MIN_VISITS &&
    allVisitsShortAndLowAction &&
    durationMs < DISTRACTION_MAX_VISIT_MS
  ) {
    return 'distraction_loop';
  }

  // Priority 2: Deep work
  if (
    durationMs >= DEEP_WORK_MIN_DURATION_MS &&
    (keystrokeCount > DEEP_WORK_MIN_KEYSTROKES || mouseClickCount > DEEP_WORK_MIN_CLICKS)
  ) {
    return 'deep_work';
  }

  // Priority 3: Shallow work (fallback)
  return 'shallow_work';
}
