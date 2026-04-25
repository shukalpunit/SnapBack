// Feature: snapback-productivity-suite — Time Block Scheduler
// Validates: Peak hour analysis, task-to-slot pairing, calendar conflict avoidance

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { TimeBlockScheduler } from './TimeBlockScheduler.js';
import { LocalStore } from '../store/LocalStore.js';
import type { ClassifiedSegment, Task, CalendarEvent } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSegment(
  id: string, appName: string, classification: 'deep_work' | 'shallow_work' | 'distraction_loop',
  startTime: number, endTime: number
): ClassifiedSegment {
  return {
    id, appName, windowTitle: 'w', appCategory: 'ide',
    startTime, endTime, tickCount: 10,
    inputSignals: { keystrokeCount: 100, mouseClickCount: 10, scrollEventCount: 5 },
    classification, isManualOverride: false,
  };
}

function makeTask(id: string, title: string, priority: 'low' | 'medium' | 'high', order: number): Task {
  return {
    id, title, priority, completed: false, completedDuringDeepWork: false,
    xpAwarded: 0, order,
  };
}

function makeCalEvent(id: string, start: number, end: number, title = 'Meeting'): CalendarEvent {
  return { id, title, startTime: start, endTime: end, calendarId: 'primary', syncedAt: Date.now() };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('TimeBlockScheduler — property tests', () => {
  it('analyzeProductivityByHour always returns exactly 24 slots', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-02-01'), max: new Date('2026-12-31') }),
        (refDate) => {
          const store = new LocalStore(':memory:');
          const scheduler = new TimeBlockScheduler(store);
          const slots = scheduler.analyzeProductivityByHour(refDate);
          store.close();
          return slots.length === 24;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('all productivity scores are between 0 and 1', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-02-01'), max: new Date('2026-12-31') }),
        (refDate) => {
          const store = new LocalStore(':memory:');
          const scheduler = new TimeBlockScheduler(store);
          const slots = scheduler.analyzeProductivityByHour(refDate);
          store.close();
          return slots.every((s) => s.score >= 0 && s.score <= 1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('suggestions never exceed the number of incomplete tasks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        (taskCount) => {
          const store = new LocalStore(':memory:');
          const scheduler = new TimeBlockScheduler(store);

          for (let i = 0; i < taskCount; i++) {
            store.insertTask(makeTask(`t-${i}`, `Task ${i}`, 'high', i));
          }

          const suggestions = scheduler.generateSuggestions('2026-06-15');
          store.close();
          return suggestions.length <= taskCount;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('no two suggestions overlap in time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        (taskCount) => {
          const store = new LocalStore(':memory:');
          const scheduler = new TimeBlockScheduler(store);

          for (let i = 0; i < taskCount; i++) {
            store.insertTask(makeTask(`t-${i}`, `Task ${i}`, 'high', i));
          }

          const suggestions = scheduler.generateSuggestions('2026-06-15');

          for (let i = 0; i < suggestions.length; i++) {
            for (let j = i + 1; j < suggestions.length; j++) {
              const a = suggestions[i]!;
              const b = suggestions[j]!;
              const overlap = Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime);
              if (overlap > 0) { store.close(); return false; }
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

describe('TimeBlockScheduler — unit tests', () => {
  let store: LocalStore;
  let scheduler: TimeBlockScheduler;

  beforeEach(() => {
    store = new LocalStore(':memory:');
    scheduler = new TimeBlockScheduler(store);
  });

  afterEach(() => {
    store.close();
  });

  it('returns empty slots with zero scores when no historical data', () => {
    const slots = scheduler.analyzeProductivityByHour();
    expect(slots).toHaveLength(24);
    expect(slots.every((s) => s.score === 0)).toBe(true);
  });

  it('identifies peak hours from historical deep work data', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');

    // Simulate 5 days of deep work from 9–11 AM
    for (let d = 1; d <= 5; d++) {
      const date = new Date(refDate);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();

      // 2 hours of deep work: 9:00–11:00
      store.insertSegment(makeSegment(
        `seg-${d}`, 'VSCode', 'deep_work',
        dayStart + 9 * 3600_000,
        dayStart + 11 * 3600_000
      ));
    }

    const slots = scheduler.analyzeProductivityByHour(refDate);
    const hour9 = slots.find((s) => s.hour === 9)!;
    const hour10 = slots.find((s) => s.hour === 10)!;
    const hour3am = slots.find((s) => s.hour === 3)!;

    expect(hour9.score).toBeGreaterThan(0.5);
    expect(hour10.score).toBeGreaterThan(0.5);
    expect(hour3am.score).toBe(0);
  });

  it('getPeakHours filters to working hours and minimum score', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');

    for (let d = 1; d <= 5; d++) {
      const date = new Date(refDate);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();

      store.insertSegment(makeSegment(
        `seg-${d}`, 'VSCode', 'deep_work',
        dayStart + 10 * 3600_000,
        dayStart + 12 * 3600_000
      ));
    }

    const peaks = scheduler.getPeakHours(refDate);
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks.every((p) => p.hour >= 7 && p.hour < 21)).toBe(true);
    expect(peaks.every((p) => p.score >= 0.3)).toBe(true);
    // Should be sorted by score descending
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]!.score).toBeLessThanOrEqual(peaks[i - 1]!.score);
    }
  });

  it('generates suggestions pairing high-priority tasks with peak hours', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');

    // Historical data: peak at 10 AM
    for (let d = 1; d <= 5; d++) {
      const date = new Date(refDate);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStart = new Date(dateStr + 'T00:00:00.000Z').getTime();
      store.insertSegment(makeSegment(`seg-${d}`, 'VSCode', 'deep_work', dayStart + 10 * 3600_000, dayStart + 11 * 3600_000));
    }

    // Tasks
    store.insertTask(makeTask('t-low', 'Low task', 'low', 2));
    store.insertTask(makeTask('t-high', 'High task', 'high', 0));
    store.insertTask(makeTask('t-med', 'Medium task', 'medium', 1));

    const suggestions = scheduler.generateSuggestions('2026-06-20', 60, refDate);

    expect(suggestions.length).toBeGreaterThan(0);
    // First suggestion should be the high-priority task at the peak hour
    expect(suggestions[0]!.taskPriority).toBe('high');
    expect(suggestions[0]!.taskTitle).toBe('High task');
  });

  it('avoids calendar conflicts', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');
    const targetDate = '2026-06-20';
    const dayStart = new Date(targetDate + 'T00:00:00.000Z').getTime();

    // Historical: peak at 10 AM and 11 AM
    for (let d = 1; d <= 5; d++) {
      const date = new Date(refDate);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().slice(0, 10);
      const ds = new Date(dateStr + 'T00:00:00.000Z').getTime();
      store.insertSegment(makeSegment(`seg-${d}a`, 'VSCode', 'deep_work', ds + 10 * 3600_000, ds + 11 * 3600_000));
      store.insertSegment(makeSegment(`seg-${d}b`, 'VSCode', 'deep_work', ds + 11 * 3600_000, ds + 12 * 3600_000));
    }

    // Existing calendar event at 10 AM
    store.upsertCalendarEvent(makeCalEvent('meeting-1', dayStart + 10 * 3600_000, dayStart + 11 * 3600_000, 'Team Standup'));

    store.insertTask(makeTask('t-1', 'Important task', 'high', 0));

    const suggestions = scheduler.generateSuggestions(targetDate, 60, refDate);

    // Should NOT schedule at 10 AM (conflict), should use 11 AM instead
    expect(suggestions.length).toBe(1);
    const suggestedHour = new Date(suggestions[0]!.startTime).getUTCHours();
    expect(suggestedHour).not.toBe(10);
  });

  it('generates default suggestions when no historical data exists', () => {
    store.insertTask(makeTask('t-1', 'Task A', 'high', 0));
    store.insertTask(makeTask('t-2', 'Task B', 'medium', 1));

    const suggestions = scheduler.generateSuggestions('2026-06-20');

    expect(suggestions.length).toBe(2);
    expect(suggestions[0]!.reason).toContain('No historical data');
  });

  it('returns empty suggestions when no incomplete tasks exist', () => {
    const completedTask: Task = {
      id: 't-done', title: 'Done', priority: 'high', completed: true,
      completedAt: Date.now(), completedDuringDeepWork: false, xpAwarded: 50, order: 0,
    };
    store.insertTask(completedTask);

    const suggestions = scheduler.generateSuggestions('2026-06-20');
    expect(suggestions).toHaveLength(0);
  });

  it('toCalendarBlocks converts suggestions to calendar format', () => {
    store.insertTask(makeTask('t-1', 'Write docs', 'high', 0));
    const suggestions = scheduler.generateSuggestions('2026-06-20');

    const blocks = scheduler.toCalendarBlocks(suggestions);
    expect(blocks.length).toBe(suggestions.length);

    if (blocks.length > 0) {
      expect(blocks[0]!.title).toContain('Write docs');
      expect(blocks[0]!.title).toContain('⚡');
      expect(blocks[0]!.description).toContain('SnapBack Time Block');
      expect(blocks[0]!.description).toContain('high');
    }
  });

  it('completed tasks are excluded from suggestions', () => {
    store.insertTask(makeTask('t-1', 'Done task', 'high', 0));
    store.insertTask({ ...makeTask('t-2', 'Active task', 'medium', 1) });

    // Complete the first task
    const db = store._db();
    db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?').run('t-1');

    const suggestions = scheduler.generateSuggestions('2026-06-20');
    expect(suggestions.every((s) => s.taskId !== 't-1')).toBe(true);
  });
});
