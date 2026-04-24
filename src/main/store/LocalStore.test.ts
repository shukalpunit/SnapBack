// Feature: snapback-productivity-suite, Property 23: Data Deletion Completeness
// Feature: snapback-productivity-suite, Property 6: Manual Override Round-Trip

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { LocalStore } from './LocalStore.js';
import type {
  ClassifiedSegment,
  Task,
  XPEvent,
  Badge,
  CalendarEvent,
  PaceRecord,
  AuditLogEntry,
  Classification,
} from '../types.js';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const arbClassification = fc.oneof(
  fc.constant<Classification>('deep_work'),
  fc.constant<Classification>('shallow_work'),
  fc.constant<Classification>('distraction_loop')
);

const arbAppCategory = fc.oneof(
  fc.constant('ide' as const),
  fc.constant('browser' as const),
  fc.constant('email' as const),
  fc.constant('communication' as const),
  fc.constant('document' as const),
  fc.constant('media' as const),
  fc.constant('other' as const)
);

const arbSegment = fc.record({
  id: fc.uuid(),
  appName: fc.string({ minLength: 1, maxLength: 64 }),
  windowTitle: fc.string({ minLength: 0, maxLength: 128 }),
  appCategory: arbAppCategory,
  startTime: fc.integer({ min: 1_000_000, max: 2_000_000_000 }),
  endTime: fc.integer({ min: 2_000_000_001, max: 3_000_000_000 }),
  tickCount: fc.integer({ min: 1, max: 1000 }),
  inputSignals: fc.record({
    keystrokeCount: fc.integer({ min: 0, max: 10000 }),
    mouseClickCount: fc.integer({ min: 0, max: 10000 }),
    scrollEventCount: fc.integer({ min: 0, max: 10000 }),
  }),
  classification: arbClassification,
  isManualOverride: fc.boolean(),
});

const arbPriority = fc.oneof(
  fc.constant<'low' | 'medium' | 'high'>('low'),
  fc.constant<'low' | 'medium' | 'high'>('medium'),
  fc.constant<'low' | 'medium' | 'high'>('high')
);

const arbTask = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 128 }),
  dueDate: fc.option(fc.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
  priority: arbPriority,
  completed: fc.boolean(),
  completedAt: fc.option(fc.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
  completedDuringDeepWork: fc.boolean(),
  xpAwarded: fc.integer({ min: 0, max: 1000 }),
  order: fc.integer({ min: 0, max: 1000 }),
});

const arbXPEvent = (taskId: string) =>
  fc.record({
    id: fc.uuid(),
    taskId: fc.constant(taskId),
    xpAmount: fc.integer({ min: 1, max: 1000 }),
    timestamp: fc.integer({ min: 1_000_000, max: 3_000_000_000 }),
    multiplierApplied: fc.boolean(),
  });

const arbBadge = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 64 }),
  description: fc.string({ minLength: 1, maxLength: 256 }),
  xpThreshold: fc.integer({ min: 1, max: 10000 }),
  awardedAt: fc.option(fc.integer({ min: 1_000_000, max: 3_000_000_000 }), { nil: undefined }),
});

const arbCalendarEvent = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 128 }),
  startTime: fc.integer({ min: 1_000_000, max: 2_000_000_000 }),
  endTime: fc.integer({ min: 2_000_000_001, max: 3_000_000_000 }),
  calendarId: fc.uuid(),
  syncedAt: fc.integer({ min: 1_000_000, max: 3_000_000_000 }),
});

const arbPaceRecord = fc.record({
  activityKey: fc.string({ minLength: 1, maxLength: 64 }),
  bestPaceScore: fc.float({ min: 0, max: 1, noNaN: true }),
  sessionCount: fc.integer({ min: 0, max: 10000 }),
  lastUpdated: fc.integer({ min: 1_000_000, max: 3_000_000_000 }),
});

const arbAuditEntry = fc.record({
  id: fc.uuid(),
  timestamp: fc.integer({ min: 1_000_000, max: 3_000_000_000 }),
  eventType: fc.string({ minLength: 1, maxLength: 64 }),
  detail: fc.option(fc.string({ minLength: 0, maxLength: 256 }), { nil: undefined }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStore(): LocalStore {
  return new LocalStore(':memory:');
}

// ─── Property 23: Data Deletion Completeness ─────────────────────────────────
// Validates: Requirements 9.4

describe('Property 23: Data Deletion Completeness', () => {
  it('after deleteAllData(), all tables return zero rows for any populated store', () => {
    fc.assert(
      fc.property(
        arbSegment,
        arbTask,
        arbBadge,
        arbCalendarEvent,
        arbPaceRecord,
        arbAuditEntry,
        (segment, task, badge, calEvent, paceRecord, auditEntry) => {
          const store = makeStore();

          // Populate every table
          store.insertSegment(segment);
          store.insertTask(task);

          const xpEvent: XPEvent = {
            id: crypto.randomUUID(),
            taskId: task.id,
            xpAmount: 10,
            timestamp: Date.now(),
            multiplierApplied: false,
          };
          store.insertXPEvent(xpEvent);
          store.upsertBadge(badge);
          store.upsertCalendarEvent(calEvent);
          store.upsertPaceRecord(paceRecord);
          store.insertAuditLog(auditEntry);
          store.saveModelBlob(Buffer.from('test-model-data'));

          // Delete all data
          store.deleteAllData();

          // Verify every table is empty
          const db = store._db();
          const tables = [
            'segments',
            'tasks',
            'xp_events',
            'badges',
            'calendar_events',
            'pace_records',
            'audit_log',
            'model_store',
            'pattern_thresholds',
          ];

          for (const table of tables) {
            const count = (db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
            if (count !== 0) {
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

// ─── Property 6: Manual Override Round-Trip ───────────────────────────────────
// Validates: Requirements 2.7

describe('Property 6: Manual Override Round-Trip', () => {
  it('overrideSegmentClassification persists the new classification with is_manual_override=true', () => {
    fc.assert(
      fc.property(
        arbSegment,
        arbClassification,
        (segment, targetClassification) => {
          const store = makeStore();

          store.insertSegment(segment);
          store.overrideSegmentClassification(segment.id, targetClassification);

          // Query back — use a wide time range to ensure the segment is found
          const results = store.querySegments(0, Number.MAX_SAFE_INTEGER);
          const found = results.find((s) => s.id === segment.id);

          const ok =
            found !== undefined &&
            found.classification === targetClassification &&
            found.isManualOverride === true;

          store.close();
          return ok;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('LocalStore — unit tests', () => {
  let store: LocalStore;

  beforeEach(() => {
    store = makeStore();
  });

  afterEach(() => {
    store.close();
  });

  it('passes PRAGMA integrity_check on a fresh database', () => {
    // If integrity check fails, the constructor throws — so reaching here means it passed.
    expect(store).toBeDefined();
  });

  it('insertSegment and querySegments round-trip', () => {
    const seg: ClassifiedSegment = {
      id: 'seg-1',
      appName: 'VSCode',
      windowTitle: 'main.ts',
      appCategory: 'ide',
      startTime: 1000,
      endTime: 2000,
      tickCount: 10,
      inputSignals: { keystrokeCount: 100, mouseClickCount: 5, scrollEventCount: 3 },
      classification: 'deep_work',
      isManualOverride: false,
    };
    store.insertSegment(seg);
    const results = store.querySegments(0, 3000);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'seg-1',
      appName: 'VSCode',
      classification: 'deep_work',
      isManualOverride: false,
    });
  });

  it('insertTask and queryTasks round-trip', () => {
    const task: Task = {
      id: 'task-1',
      title: 'Write tests',
      priority: 'high',
      completed: false,
      completedDuringDeepWork: false,
      xpAwarded: 0,
      order: 0,
    };
    store.insertTask(task);
    const tasks = store.queryTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Write tests');
    expect(tasks[0]?.priority).toBe('high');
  });

  it('updateTask persists changes', () => {
    const task: Task = {
      id: 'task-2',
      title: 'Original',
      priority: 'low',
      completed: false,
      completedDuringDeepWork: false,
      xpAwarded: 0,
      order: 0,
    };
    store.insertTask(task);
    store.updateTask({ ...task, title: 'Updated', completed: true });
    const tasks = store.queryTasks();
    expect(tasks[0]?.title).toBe('Updated');
    expect(tasks[0]?.completed).toBe(true);
  });

  it('deleteTask removes the row', () => {
    const task: Task = {
      id: 'task-3',
      title: 'To delete',
      priority: 'medium',
      completed: false,
      completedDuringDeepWork: false,
      xpAwarded: 0,
      order: 0,
    };
    store.insertTask(task);
    store.deleteTask('task-3');
    expect(store.queryTasks()).toHaveLength(0);
  });

  it('upsertPaceRecord and getPaceRecord round-trip', () => {
    const record: PaceRecord = {
      activityKey: 'vscode:typescript',
      bestPaceScore: 0.85,
      sessionCount: 5,
      lastUpdated: Date.now(),
    };
    store.upsertPaceRecord(record);
    const fetched = store.getPaceRecord('vscode:typescript');
    expect(fetched).not.toBeNull();
    expect(fetched?.bestPaceScore).toBeCloseTo(0.85);
    expect(fetched?.sessionCount).toBe(5);
  });

  it('getPaceRecord returns null for unknown key', () => {
    expect(store.getPaceRecord('nonexistent')).toBeNull();
  });

  it('saveModelBlob and loadModelBlob round-trip', () => {
    const blob = Buffer.from('fake-model-weights');
    store.saveModelBlob(blob);
    const loaded = store.loadModelBlob();
    expect(loaded).not.toBeNull();
    expect(loaded?.toString()).toBe('fake-model-weights');
  });

  it('loadModelBlob returns null when no model stored', () => {
    expect(store.loadModelBlob()).toBeNull();
  });

  it('upsertCalendarEvent and queryCalendarEvents round-trip', () => {
    const event: CalendarEvent = {
      id: 'cal-1',
      title: 'Team standup',
      startTime: 1000,
      endTime: 2000,
      calendarId: 'primary',
      syncedAt: Date.now(),
    };
    store.upsertCalendarEvent(event);
    const results = store.queryCalendarEvents(0, 3000);
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Team standup');
  });

  it('deleteAllCalendarEvents clears calendar table', () => {
    const event: CalendarEvent = {
      id: 'cal-2',
      title: 'Meeting',
      startTime: 1000,
      endTime: 2000,
      calendarId: 'primary',
      syncedAt: Date.now(),
    };
    store.upsertCalendarEvent(event);
    store.deleteAllCalendarEvents();
    expect(store.queryCalendarEvents(0, 3000)).toHaveLength(0);
  });

  it('insertAuditLog persists entries', () => {
    const entry: AuditLogEntry = {
      id: 'audit-1',
      timestamp: Date.now(),
      eventType: 'blocked_connection',
      detail: 'https://example.com',
    };
    store.insertAuditLog(entry);
    const db = store._db();
    const count = (db.prepare('SELECT COUNT(*) as n FROM audit_log').get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it('deleteAllData empties all tables', () => {
    const task: Task = {
      id: 'task-del',
      title: 'Delete me',
      priority: 'low',
      completed: false,
      completedDuringDeepWork: false,
      xpAwarded: 0,
      order: 0,
    };
    store.insertTask(task);
    store.saveModelBlob(Buffer.from('data'));
    store.deleteAllData();
    expect(store.queryTasks()).toHaveLength(0);
    expect(store.loadModelBlob()).toBeNull();
  });
});
