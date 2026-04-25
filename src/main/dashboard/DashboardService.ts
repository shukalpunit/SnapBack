/**
 * DashboardService — Aggregation queries, reporting, and PDF export.
 *
 * Provides query methods for the renderer: app time by date range,
 * daily summary, 7-day trend, weekly report generation, and PDF export.
 *
 * Requirements: 1.6, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import type {
  ClassifiedSegment,
  Classification,
  ILocalStore,
} from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppTimeSummary {
  appName: string;
  totalDurationMs: number;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalTrackedMs: number;
  deepWorkMs: number;
  shallowWorkMs: number;
  distractionLoopMs: number;
}

export interface SevenDayTrendEntry {
  date: string; // YYYY-MM-DD
  deepWorkMs: number;
}

export interface WeeklyReport {
  totalHoursTracked: number;
  classificationBreakdown: {
    deepWork: number;    // 0–1 proportion
    shallowWork: number;
    distractionLoop: number;
  };
  topFiveApps: AppTimeSummary[];
  mostFrequentDistractionPattern: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function segmentDuration(seg: ClassifiedSegment): number {
  return Math.max(seg.endTime - seg.startTime, 0);
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function startOfDay(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00.000Z').getTime();
}

function endOfDay(dateStr: string): number {
  return new Date(dateStr + 'T23:59:59.999Z').getTime();
}

/** Get the YYYY-MM-DD string for N days ago from a reference date. */
function daysAgo(n: number, refDate?: Date): string {
  const d = refDate ? new Date(refDate) : new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── DashboardService ────────────────────────────────────────────────────────

export class DashboardService {
  private store: ILocalStore;

  constructor(store: ILocalStore) {
    this.store = store;
  }

  /**
   * Aggregate time per application for a date range, sorted by duration descending.
   * Validates: Requirements 1.6 (Property 3: Dashboard Sort Order)
   */
  getAppTimeByDateRange(from: number, to: number): AppTimeSummary[] {
    const segments = this.store.querySegments(from, to);
    const appMap = new Map<string, number>();

    for (const seg of segments) {
      const dur = segmentDuration(seg);
      appMap.set(seg.appName, (appMap.get(seg.appName) ?? 0) + dur);
    }

    return Array.from(appMap.entries())
      .map(([appName, totalDurationMs]) => ({ appName, totalDurationMs }))
      .sort((a, b) => b.totalDurationMs - a.totalDurationMs);
  }

  /**
   * Daily summary: total tracked time + per-classification hours.
   * Validates: Requirements 6.1 (Property 5: Classification Proportions Sum to Total)
   */
  getDailySummary(date: string): DailySummary {
    const from = startOfDay(date);
    const to = endOfDay(date);
    const segments = this.store.querySegments(from, to);

    let deepWorkMs = 0;
    let shallowWorkMs = 0;
    let distractionLoopMs = 0;

    for (const seg of segments) {
      const dur = segmentDuration(seg);
      switch (seg.classification) {
        case 'deep_work': deepWorkMs += dur; break;
        case 'shallow_work': shallowWorkMs += dur; break;
        case 'distraction_loop': distractionLoopMs += dur; break;
      }
    }

    return {
      date,
      totalTrackedMs: deepWorkMs + shallowWorkMs + distractionLoopMs,
      deepWorkMs,
      shallowWorkMs,
      distractionLoopMs,
    };
  }

  /**
   * 7-day trend: exactly 7 entries, one per calendar day, no gaps, no duplicates.
   * Validates: Requirements 6.2 (Property 15: 7-Day Trend Chart Cardinality)
   */
  getSevenDayTrend(refDate?: Date): SevenDayTrendEntry[] {
    const entries: SevenDayTrendEntry[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = daysAgo(i, refDate);
      const summary = this.getDailySummary(date);
      entries.push({ date, deepWorkMs: summary.deepWorkMs });
    }

    return entries;
  }

  /**
   * Weekly report covering the 7 most recently completed days.
   * Validates: Requirements 6.3 (Property 16: Weekly Report Completeness)
   */
  generateWeeklyReport(refDate?: Date): WeeklyReport {
    let totalDeepMs = 0;
    let totalShallowMs = 0;
    let totalDistractionMs = 0;
    const appTotals = new Map<string, number>();
    const distractionPatterns = new Map<string, number>();

    for (let i = 7; i >= 1; i--) {
      const date = daysAgo(i, refDate);
      const from = startOfDay(date);
      const to = endOfDay(date);
      const segments = this.store.querySegments(from, to);

      for (const seg of segments) {
        const dur = segmentDuration(seg);
        switch (seg.classification) {
          case 'deep_work': totalDeepMs += dur; break;
          case 'shallow_work': totalShallowMs += dur; break;
          case 'distraction_loop':
            totalDistractionMs += dur;
            // Track distraction patterns by app name
            distractionPatterns.set(
              seg.appName,
              (distractionPatterns.get(seg.appName) ?? 0) + 1
            );
            break;
        }
        appTotals.set(seg.appName, (appTotals.get(seg.appName) ?? 0) + dur);
      }
    }

    const totalMs = totalDeepMs + totalShallowMs + totalDistractionMs;
    const totalHoursTracked = totalMs / (1000 * 60 * 60);

    // Classification breakdown (proportions summing to 1.0)
    const classificationBreakdown = totalMs > 0
      ? {
          deepWork: totalDeepMs / totalMs,
          shallowWork: totalShallowMs / totalMs,
          distractionLoop: totalDistractionMs / totalMs,
        }
      : { deepWork: 0, shallowWork: 0, distractionLoop: 0 };

    // Top 5 apps sorted by duration descending
    const topFiveApps = Array.from(appTotals.entries())
      .map(([appName, totalDurationMs]) => ({ appName, totalDurationMs }))
      .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
      .slice(0, 5);

    // Most frequent distraction pattern
    let mostFrequentDistractionPattern = 'None';
    let maxCount = 0;
    for (const [app, count] of distractionPatterns) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentDistractionPattern = app;
      }
    }

    return {
      totalHoursTracked,
      classificationBreakdown,
      topFiveApps,
      mostFrequentDistractionPattern,
    };
  }

  /**
   * Generate PDF report content as a Buffer.
   * In production, uses pdfkit. Here we return a structured buffer
   * that can be written to a user-specified local directory.
   * Validates: Requirements 6.4
   */
  async generatePDFReport(refDate?: Date, timeoutMs = 30_000): Promise<Buffer> {
    const report = this.generateWeeklyReport(refDate);

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('PDF generation timed out after 30 seconds'));
      }, timeoutMs);

      try {
        // Lazy-load pdfkit to avoid import issues in test environments
        let PDFDocument: any;
        try {
          PDFDocument = require('pdfkit');
        } catch {
          // Fallback: return a plain text buffer if pdfkit is unavailable
          clearTimeout(timer);
          const text = formatReportAsText(report);
          resolve(Buffer.from(text, 'utf-8'));
          return;
        }

        const doc = new PDFDocument();
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks));
        });
        doc.on('error', (err: Error) => {
          clearTimeout(timer);
          reject(err);
        });

        // Write report content
        doc.fontSize(20).text('SnapBack Weekly Productivity Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Total Hours Tracked: ${report.totalHoursTracked.toFixed(1)}`);
        doc.text(`Deep Work: ${(report.classificationBreakdown.deepWork * 100).toFixed(1)}%`);
        doc.text(`Shallow Work: ${(report.classificationBreakdown.shallowWork * 100).toFixed(1)}%`);
        doc.text(`Distraction Loops: ${(report.classificationBreakdown.distractionLoop * 100).toFixed(1)}%`);
        doc.moveDown();
        doc.text('Top Applications:');
        for (const app of report.topFiveApps) {
          const hours = (app.totalDurationMs / (1000 * 60 * 60)).toFixed(1);
          doc.text(`  ${app.appName}: ${hours}h`);
        }
        doc.moveDown();
        doc.text(`Most Frequent Distraction: ${report.mostFrequentDistractionPattern}`);

        doc.end();
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}

// ─── Text Fallback ───────────────────────────────────────────────────────────

function formatReportAsText(report: WeeklyReport): string {
  const lines = [
    'SnapBack Weekly Productivity Report',
    '====================================',
    `Total Hours Tracked: ${report.totalHoursTracked.toFixed(1)}`,
    `Deep Work: ${(report.classificationBreakdown.deepWork * 100).toFixed(1)}%`,
    `Shallow Work: ${(report.classificationBreakdown.shallowWork * 100).toFixed(1)}%`,
    `Distraction Loops: ${(report.classificationBreakdown.distractionLoop * 100).toFixed(1)}%`,
    '',
    'Top Applications:',
    ...report.topFiveApps.map(
      (app) => `  ${app.appName}: ${(app.totalDurationMs / (1000 * 60 * 60)).toFixed(1)}h`
    ),
    '',
    `Most Frequent Distraction: ${report.mostFrequentDistractionPattern}`,
  ];
  return lines.join('\n');
}
