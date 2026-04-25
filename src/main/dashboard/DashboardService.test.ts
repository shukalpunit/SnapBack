// Feature: snapback-productivity-suite, Property 3: Dashboard Sort Order
// Feature: snapback-productivity-suite, Property 5: Classification Proportions Sum to Total
// Feature: snapback-productivity-suite, Property 15: 7-Day Trend Chart Cardinality
// Feature: snapback-productivity-suite, Property 16: Weekly Report Completeness
// Validates: Requirements 1.6, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { DashboardService } from './DashboardService.js';
import { LocalStore } from '../store/LocalStore.js';
import type { ClassifiedSegment, Classification } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSegment(
  id: string,
  appName: string,
  classification: Classification,
  startTime: number,
  endTime: number
): ClassifiedSegment {
  return {
    id,
    appName,
    windowTitle: 'window',
    appCategory: 'other',
    startTime,
    endTime,
    tickCount: Math.max(1, Math.floor((endTime - startTime) / 5000)),
    inputSignals: { keystrokeCount: 10, mouseClickCount: 5, scrollEventCount: 2 },
    classification,
    isManualOverride: false,
  };
}

const arbClassification = fc.oneof(
  fc.constant<Classification>('deep_work'),
  fc.constant<Classification>('shallow_work'),
  fc.constant<Classification>('distraction_loop')
);

// ─── Property 3: Dashboard Sort Order ────────────────────────────────────────

describe('Property 3: Dashboard Sort Order', () => {
  it('returns apps sorted by total duration descending with no adjacent inversion', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            appName: fc.oneof(fc.constant('VSCode'), fc.constant('Chrome'), fc.constant('Slack'), fc.constant('Mail')),
            durationMs: fc.integer({ min: 1000, max: 3_600_000 }),
            classification: arbClassification,
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (segDefs) => {
          const store = new LocalStore(':memory:');
          const svc = new DashboardService(store);

          const baseTime = new Date('2026-03-15T10:00:00Z').getTime();
          let cursor = baseTime;

          for (let i = 0; i < segDefs.length; i++) {
            const def = segDefs[i]!;
            const start = cursor;
            const end = cursor + def.durationMs;
            store.insertSegment(makeSegment(`seg-${i}`, def.appName, def.classification, start, end));
            cursor = end + 1000;
          }

          const result = svc.getAppTimeByDateRange(baseTime, cursor);

          // Verify descending order: no adjacent pair where first < second
          for (let i = 0; i < result.length - 1; i++) {
            if (result[i]!.totalDurationMs < result[i + 1]!.totalDurationMs) {
              store.close();
              return false;
            }
          }

          store.close();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Classification Proportions Sum to Total ─────────────────────

describe('Property 5: Classification Proportions Sum to Total', () => {
  it('deep + shallow + distraction hours equal total tracked hours', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            classification: arbClassification,
            durationMs: fc.integer({ min: 1000, max: 3_600_000 }),
          }),
          { minLength: 1, maxLength: 15 }
        ),
        (segDefs) => {
          const store = new LocalStore(':memory:');
          const svc = new DashboardService(store);

          const date = '2026-03-15';
          const dayStart = new Date(date + 'T00:00:00.000Z').getTime();
          let cursor = dayStart;

          for (let i = 0; i < segDefs.length; i++) {
            const def = segDefs[i]!;
            const start = cursor;
            const end = cursor + def.durationMs;
            store.insertSegment(makeSegment(`seg-${i}`, 'App', def.classification, start, end));
            cursor = end + 1;
          }

          const summary = svc.getDailySummary(date);
          const sum = summary.deepWorkMs + summary.shallowWorkMs + summary.distractionLoopMs;
          const diff = Math.abs(sum - summary.totalTrackedMs);

          store.close();
          return diff < 1; // within 1ms tolerance
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 15: 7-Day Trend Chart Cardinality ─────────────────────────────

describe('Property 15: 7-Day Trend Chart Cardinality', () => {
  it('returns exactly 7 entries with no duplicate or missing dates', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-10'), max: new Date('2026-12-31') }),
        (refDate) => {
          const store = new LocalStore(':memory:');
          const svc = new DashboardService(store);

          const trend = svc.getSevenDayTrend(refDate);

          if (trend.length !== 7) { store.close(); return false; }

          // No duplicate dates
          const dates = trend.map((e) => e.date);
          const uniqueDates = new Set(dates);
          if (uniqueDates.size !== 7) { store.close(); return false; }

          // Dates should be consecutive
          for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]!);
            const curr = new Date(dates[i]!);
            const diffDays = (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);
            if (Math.abs(diffDays - 1) > 0.01) { store.close(); return false; }
          }

          store.close();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 16: Weekly Report Completeness ─────────────────────────────────

describe('Property 16: Weekly Report Completeness', () => {
  it('report contains all required fields with breakdown summing to 1.0', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            classification: arbClassification,
            durationMs: fc.integer({ min: 1000, max: 3_600_000 }),
            dayOffset: fc.integer({ min: 1, max: 7 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (segDefs) => {
          const store = new LocalStore(':memory:');
          const svc = new DashboardService(store);

          const refDate = new Date('2026-03-15T12:00:00Z');

          for (let i = 0; i < segDefs.length; i++) {
            const def = segDefs[i]!;
            const dayDate = new Date(refDate);
            dayDate.setDate(dayDate.getDate() - def.dayOffset);
            const start = dayDate.getTime();
            const end = start + def.durationMs;
            store.insertSegment(makeSegment(`seg-${i}`, `App${i % 3}`, def.classification, start, end));
          }

          const report = svc.generateWeeklyReport(refDate);

          // Required fields exist
          if (typeof report.totalHoursTracked !== 'number') { store.close(); return false; }
          if (!report.classificationBreakdown) { store.close(); return false; }
          if (!Array.isArray(report.topFiveApps)) { store.close(); return false; }
          if (typeof report.mostFrequentDistractionPattern !== 'string') { store.close(); return false; }

          // Breakdown sums to 1.0 (if there's data)
          if (report.totalHoursTracked > 0) {
            const sum =
              report.classificationBreakdown.deepWork +
              report.classificationBreakdown.shallowWork +
              report.classificationBreakdown.distractionLoop;
            if (Math.abs(sum - 1.0) > 1e-9) { store.close(); return false; }
          }

          // Top apps ≤ 5 and sorted descending
          if (report.topFiveApps.length > 5) { store.close(); return false; }
          for (let i = 1; i < report.topFiveApps.length; i++) {
            if (report.topFiveApps[i]!.totalDurationMs > report.topFiveApps[i - 1]!.totalDurationMs) {
              store.close();
              return false;
            }
          }

          store.close();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Unit Tests ──────────────────────────────────────────────────────────────

describe('DashboardService — unit tests', () => {
  let store: LocalStore;
  let svc: DashboardService;

  beforeEach(() => {
    store = new LocalStore(':memory:');
    svc = new DashboardService(store);
  });

  afterEach(() => {
    store.close();
  });

  it('getAppTimeByDateRange returns empty for no data', () => {
    const result = svc.getAppTimeByDateRange(0, Number.MAX_SAFE_INTEGER);
    expect(result).toHaveLength(0);
  });

  it('getAppTimeByDateRange aggregates and sorts correctly', () => {
    const base = new Date('2026-03-15T10:00:00Z').getTime();
    store.insertSegment(makeSegment('s1', 'VSCode', 'deep_work', base, base + 60_000));
    store.insertSegment(makeSegment('s2', 'Chrome', 'shallow_work', base + 70_000, base + 200_000));
    store.insertSegment(makeSegment('s3', 'VSCode', 'deep_work', base + 210_000, base + 300_000));

    const result = svc.getAppTimeByDateRange(base, base + 400_000);
    expect(result[0]!.appName).toBe('VSCode'); // 60k + 90k = 150k
    expect(result[1]!.appName).toBe('Chrome'); // 130k
  });

  it('getDailySummary returns correct breakdown', () => {
    const date = '2026-03-15';
    const base = new Date(date + 'T10:00:00.000Z').getTime();

    store.insertSegment(makeSegment('s1', 'VSCode', 'deep_work', base, base + 3_600_000));
    store.insertSegment(makeSegment('s2', 'Slack', 'shallow_work', base + 3_700_000, base + 5_400_000));
    store.insertSegment(makeSegment('s3', 'Mail', 'distraction_loop', base + 5_500_000, base + 5_800_000));

    const summary = svc.getDailySummary(date);
    expect(summary.deepWorkMs).toBe(3_600_000);
    expect(summary.shallowWorkMs).toBe(1_700_000);
    expect(summary.distractionLoopMs).toBe(300_000);
    expect(summary.totalTrackedMs).toBe(5_600_000);
  });

  it('getDailySummary returns zeros for empty day', () => {
    const summary = svc.getDailySummary('2026-03-15');
    expect(summary.totalTrackedMs).toBe(0);
    expect(summary.deepWorkMs).toBe(0);
  });

  it('getSevenDayTrend returns exactly 7 entries', () => {
    const trend = svc.getSevenDayTrend(new Date('2026-03-15'));
    expect(trend).toHaveLength(7);
  });

  it('generateWeeklyReport returns valid structure with no data', () => {
    const report = svc.generateWeeklyReport(new Date('2026-03-15'));
    expect(report.totalHoursTracked).toBe(0);
    expect(report.classificationBreakdown.deepWork).toBe(0);
    expect(report.topFiveApps).toHaveLength(0);
    expect(report.mostFrequentDistractionPattern).toBe('None');
  });

  it('generatePDFReport returns a non-empty buffer', async () => {
    const base = new Date('2026-03-10T10:00:00Z').getTime();
    store.insertSegment(makeSegment('s1', 'VSCode', 'deep_work', base, base + 3_600_000));

    const pdf = await svc.generatePDFReport(new Date('2026-03-15'));
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(0);
  });
});
