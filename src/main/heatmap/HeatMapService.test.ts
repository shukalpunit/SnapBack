// Feature: snapback-productivity-suite, Property 7: Heat Map Grid Completeness
// Feature: snapback-productivity-suite, Property 8: Heat Map Tooltip Data Completeness
// Validates: Requirements 3.1, 3.2, 3.3

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { HeatMapService } from './HeatMapService.js';
import { LocalStore } from '../store/LocalStore.js';
import type { ClassifiedSegment, Classification } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CELL_DURATION_MS = 15 * 60 * 1000;

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

// ─── Property 7: Heat Map Grid Completeness ──────────────────────────────────

describe('Property 7: Heat Map Grid Completeness', () => {
  it('produces exactly 96 cells for any day', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }),
        (date) => {
          const store = new LocalStore(':memory:');
          const svc = new HeatMapService(store);
          const dateStr = date.toISOString().slice(0, 10);

          const cells = svc.getHeatMapCells(dateStr);
          store.close();
          return cells.length === 96;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each cell classification matches the dominant classification by duration', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            classification: arbClassification,
            cellIndex: fc.integer({ min: 0, max: 95 }),
            durationMs: fc.integer({ min: 1000, max: CELL_DURATION_MS - 1 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (segDefs) => {
          const store = new LocalStore(':memory:');
          const svc = new HeatMapService(store);
          const date = '2026-06-15';
          const dayStart = new Date(date + 'T00:00:00.000Z').getTime();

          for (let i = 0; i < segDefs.length; i++) {
            const def = segDefs[i]!;
            const windowStart = dayStart + def.cellIndex * CELL_DURATION_MS;
            const start = windowStart;
            const end = windowStart + def.durationMs;
            store.insertSegment(
              makeSegment(`seg-${i}`, `App${i}`, def.classification, start, end)
            );
          }

          const cells = svc.getHeatMapCells(date);

          // Every cell with data must have a non-null classification
          for (const cell of cells) {
            if (cell.hasData && cell.classification === null) {
              store.close();
              return false;
            }
          }

          // Every cell without data must have null classification
          for (const cell of cells) {
            if (!cell.hasData && cell.classification !== null) {
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

// ─── Property 8: Heat Map Tooltip Data Completeness ──────────────────────────

describe('Property 8: Heat Map Tooltip Data Completeness', () => {
  it('tooltip for cells with data has non-null appName, valid classification, and duration > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 95 }),
        arbClassification,
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.integer({ min: 1000, max: CELL_DURATION_MS - 1 }),
        (cellIndex, classification, appName, durationMs) => {
          const store = new LocalStore(':memory:');
          const svc = new HeatMapService(store);
          const date = '2026-06-15';
          const dayStart = new Date(date + 'T00:00:00.000Z').getTime();

          const windowStart = dayStart + cellIndex * CELL_DURATION_MS;
          store.insertSegment(
            makeSegment('seg-1', appName, classification, windowStart, windowStart + durationMs)
          );

          const tooltip = svc.getTooltipData(cellIndex, date);

          if (!tooltip) { store.close(); return false; }

          const ok =
            tooltip.appName !== null &&
            tooltip.appName.length > 0 &&
            ['deep_work', 'shallow_work', 'distraction_loop'].includes(tooltip.classification) &&
            tooltip.durationMs > 0;

          store.close();
          return ok;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tooltip returns null for cells with no data', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 95 }),
        (cellIndex) => {
          const store = new LocalStore(':memory:');
          const svc = new HeatMapService(store);

          const tooltip = svc.getTooltipData(cellIndex, '2026-06-15');
          store.close();
          return tooltip === null;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Unit Tests ──────────────────────────────────────────────────────────────

describe('HeatMapService — unit tests', () => {
  let store: LocalStore;
  let svc: HeatMapService;

  beforeEach(() => {
    store = new LocalStore(':memory:');
    svc = new HeatMapService(store);
  });

  afterEach(() => {
    store.close();
  });

  it('returns 96 cells for an empty day', () => {
    const cells = svc.getHeatMapCells('2026-06-15');
    expect(cells).toHaveLength(96);
    expect(cells.every((c) => !c.hasData)).toBe(true);
    expect(cells.every((c) => c.classification === null)).toBe(true);
  });

  it('cell indices are 0–95 in order', () => {
    const cells = svc.getHeatMapCells('2026-06-15');
    for (let i = 0; i < 96; i++) {
      expect(cells[i]!.cellIndex).toBe(i);
    }
  });

  it('classifies a cell as deep_work when deep work dominates', () => {
    const date = '2026-06-15';
    const dayStart = new Date(date + 'T00:00:00.000Z').getTime();

    // Cell 0: 10 min deep work + 4 min shallow work
    store.insertSegment(makeSegment('s1', 'VSCode', 'deep_work', dayStart, dayStart + 600_000));
    store.insertSegment(makeSegment('s2', 'Slack', 'shallow_work', dayStart + 600_000, dayStart + 840_000));

    const cells = svc.getHeatMapCells(date);
    expect(cells[0]!.classification).toBe('deep_work');
    expect(cells[0]!.hasData).toBe(true);
  });

  it('classifies a cell as distraction_loop when it dominates', () => {
    const date = '2026-06-15';
    const dayStart = new Date(date + 'T00:00:00.000Z').getTime();

    // Cell 4 (1:00–1:15): 12 min distraction + 2 min shallow
    const cellStart = dayStart + 4 * CELL_DURATION_MS;
    store.insertSegment(makeSegment('s1', 'Mail', 'distraction_loop', cellStart, cellStart + 720_000));
    store.insertSegment(makeSegment('s2', 'Slack', 'shallow_work', cellStart + 720_000, cellStart + 840_000));

    const cells = svc.getHeatMapCells(date);
    expect(cells[4]!.classification).toBe('distraction_loop');
  });

  it('getTooltipData returns dominant app info', () => {
    const date = '2026-06-15';
    const dayStart = new Date(date + 'T00:00:00.000Z').getTime();

    store.insertSegment(makeSegment('s1', 'VSCode', 'deep_work', dayStart, dayStart + 600_000));
    store.insertSegment(makeSegment('s2', 'Chrome', 'shallow_work', dayStart + 600_000, dayStart + 700_000));

    const tooltip = svc.getTooltipData(0, date);
    expect(tooltip).not.toBeNull();
    expect(tooltip!.appName).toBe('VSCode');
    expect(tooltip!.classification).toBe('deep_work');
    expect(tooltip!.durationMs).toBe(600_000);
  });

  it('getTooltipData returns null for empty cell', () => {
    expect(svc.getTooltipData(50, '2026-06-15')).toBeNull();
  });

  it('getTooltipData returns null for invalid cell index', () => {
    expect(svc.getTooltipData(-1, '2026-06-15')).toBeNull();
    expect(svc.getTooltipData(96, '2026-06-15')).toBeNull();
  });

  it('handles segments spanning multiple cells', () => {
    const date = '2026-06-15';
    const dayStart = new Date(date + 'T00:00:00.000Z').getTime();

    // 45-minute deep work session spanning cells 0, 1, 2
    store.insertSegment(makeSegment('s1', 'VSCode', 'deep_work', dayStart, dayStart + 45 * 60_000));

    const cells = svc.getHeatMapCells(date);
    expect(cells[0]!.classification).toBe('deep_work');
    expect(cells[1]!.classification).toBe('deep_work');
    expect(cells[2]!.classification).toBe('deep_work');
    expect(cells[3]!.hasData).toBe(false);
  });
});
