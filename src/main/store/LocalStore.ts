/**
 * LocalStore — AES-256 encrypted SQLite database for SnapBack.
 *
 * Encryption strategy:
 *   The encryption key is derived via PBKDF2 (100,000 iterations, SHA-256)
 *   from a device-specific secret composed of the machine UUID and the OS
 *   user SID.  The derived key is passed to SQLCipher via `PRAGMA key`.
 *
 * NOTE: This implementation uses `better-sqlite3` for all synchronous SQLite
 * operations.  The SQLCipher binding (`@journeyapps/sqlcipher` or equivalent)
 * should be substituted for `better-sqlite3` in production to activate
 * at-rest AES-256 encryption.  The key derivation function (`deriveKey`) is
 * fully implemented and ready to be passed to `PRAGMA key = '...'` once the
 * SQLCipher native module is available.
 */

import Database from 'better-sqlite3';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type {
  ILocalStore,
  ClassifiedSegment,
  Classification,
  Task,
  XPEvent,
  Badge,
  CalendarEvent,
  PaceRecord,
  AuditLogEntry,
} from '../types.js';

// ─── Key Derivation ───────────────────────────────────────────────────────────

/**
 * Retrieve the machine UUID in a cross-platform manner.
 * Falls back to a stable hash of the hostname if the OS call fails.
 */
function getMachineUUID(): string {
  try {
    if (process.platform === 'darwin') {
      const out = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'",
        { encoding: 'utf8', timeout: 3000 }
      ).trim().replace(/"/g, '');
      if (out.length > 0) return out;
    } else if (process.platform === 'win32') {
      const out = execSync(
        'wmic csproduct get UUID /value',
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      const match = out.match(/UUID=(.+)/i);
      if (match) return match[1].trim();
    } else {
      // Linux
      const out = readFileSync('/etc/machine-id', 'utf8').trim();
      if (out.length > 0) return out;
    }
  } catch {
    // fall through to fallback
  }
  // Stable fallback: hash of hostname
  return createHash('sha256').update(require('os').hostname()).digest('hex');
}

/**
 * Retrieve the OS user SID (Windows) or UID string (macOS/Linux).
 */
function getUserSID(): string {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'wmic useraccount where name="%USERNAME%" get SID /value',
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      const match = out.match(/SID=(.+)/i);
      if (match) return match[1].trim();
    } else {
      // macOS / Linux: use numeric UID as stable identifier
      return String(process.getuid ? process.getuid() : 0);
    }
  } catch {
    // fall through to fallback
  }
  return createHash('sha256').update(process.env['USER'] ?? 'unknown').digest('hex');
}

/**
 * Derive a 32-byte AES-256 key from the device secret using PBKDF2.
 *
 * @param machineUUID  - Platform machine UUID
 * @param userSID      - OS user SID / UID
 * @returns 32-byte Buffer suitable for use as a SQLCipher PRAGMA key
 */
export function deriveKey(machineUUID: string, userSID: string): Buffer {
  // Salt is deterministic (not random) so the same key is reproduced on every
  // startup without storing the salt.  The salt is derived from the combined
  // device secret to prevent cross-device key reuse.
  const saltInput = `snapback:${machineUUID}:${userSID}`;
  const salt = createHash('sha256').update(saltInput).digest();

  return pbkdf2Sync(
    `${machineUUID}:${userSID}`,
    salt,
    100_000,
    32,
    'sha256'
  );
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_PATH = join(__dirname, 'schema.sql');

function loadSchema(): string {
  try {
    return readFileSync(SCHEMA_PATH, 'utf8');
  } catch {
    // Inline fallback schema (used in test environments where __dirname differs)
    return INLINE_SCHEMA;
  }
}

const INLINE_SCHEMA = `
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY, app_name TEXT NOT NULL, window_title TEXT NOT NULL,
  app_category TEXT NOT NULL, start_time INTEGER NOT NULL, end_time INTEGER NOT NULL,
  tick_count INTEGER NOT NULL, keystroke_count INTEGER NOT NULL DEFAULT 0,
  mouse_click_count INTEGER NOT NULL DEFAULT 0, scroll_event_count INTEGER NOT NULL DEFAULT 0,
  classification TEXT NOT NULL CHECK(classification IN ('deep_work','shallow_work','distraction_loop')),
  is_manual_override INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_segments_time ON segments(start_time, end_time);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, due_date INTEGER,
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  completed INTEGER NOT NULL DEFAULT 0, completed_at INTEGER,
  completed_during_deep_work INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS xp_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
  xp_amount INTEGER NOT NULL, timestamp INTEGER NOT NULL, multiplier_applied INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  xp_threshold INTEGER NOT NULL, awarded_at INTEGER
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL, calendar_id TEXT NOT NULL, synced_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pace_records (
  activity_key TEXT PRIMARY KEY, best_pace_score REAL NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 0, last_updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, event_type TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS model_store (
  key TEXT PRIMARY KEY, blob BLOB NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pattern_thresholds (
  pattern_key TEXT PRIMARY KEY, threshold REAL NOT NULL DEFAULT 0.75,
  dismiss_count INTEGER NOT NULL DEFAULT 0, accept_count INTEGER NOT NULL DEFAULT 0
);
`;

// ─── LocalStore ───────────────────────────────────────────────────────────────

export class LocalStore implements ILocalStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);

    // ── SQLCipher key derivation (stub) ──────────────────────────────────────
    // In production, replace `better-sqlite3` with the SQLCipher binding and
    // uncomment the following lines:
    //
    //   const key = deriveKey(getMachineUUID(), getUserSID());
    //   this.db.pragma(`key = "x'${key.toString('hex')}'"`)
    //
    // The deriveKey function above is fully implemented and ready to use.
    // ─────────────────────────────────────────────────────────────────────────

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Apply schema
    const schema = loadSchema();
    this.db.exec(schema);

    // Integrity check on startup (Requirement 9.1)
    this.verifyIntegrity();
  }

  /** Run PRAGMA integrity_check; throws if the database is corrupt. */
  private verifyIntegrity(): void {
    const result = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (!result || result[0]?.integrity_check !== 'ok') {
      throw new Error(
        `Local Store integrity check failed: ${JSON.stringify(result)}. ` +
        'Please restore from a backup or start fresh.'
      );
    }
  }

  // ─── Segments ──────────────────────────────────────────────────────────────

  insertSegment(segment: ClassifiedSegment): void {
    const stmt = this.db.prepare(`
      INSERT INTO segments
        (id, app_name, window_title, app_category, start_time, end_time,
         tick_count, keystroke_count, mouse_click_count, scroll_event_count,
         classification, is_manual_override)
      VALUES
        (@id, @appName, @windowTitle, @appCategory, @startTime, @endTime,
         @tickCount, @keystrokeCount, @mouseClickCount, @scrollEventCount,
         @classification, @isManualOverride)
    `);

    this.db.transaction(() => {
      stmt.run({
        id: segment.id,
        appName: segment.appName,
        windowTitle: segment.windowTitle,
        appCategory: segment.appCategory,
        startTime: segment.startTime,
        endTime: segment.endTime,
        tickCount: segment.tickCount,
        keystrokeCount: segment.inputSignals.keystrokeCount,
        mouseClickCount: segment.inputSignals.mouseClickCount,
        scrollEventCount: segment.inputSignals.scrollEventCount,
        classification: segment.classification,
        isManualOverride: segment.isManualOverride ? 1 : 0,
      });
    })();
  }

  querySegments(from: number, to: number): ClassifiedSegment[] {
    const rows = this.db.prepare(`
      SELECT * FROM segments
      WHERE start_time >= ? AND end_time <= ?
      ORDER BY start_time ASC
    `).all(from, to) as Array<Record<string, unknown>>;

    return rows.map(rowToSegment);
  }

  overrideSegmentClassification(id: string, classification: Classification): void {
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE segments
        SET classification = ?, is_manual_override = 1
        WHERE id = ?
      `).run(classification, id);
    })();
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  insertTask(task: Task): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks
        (id, title, due_date, priority, completed, completed_at,
         completed_during_deep_work, xp_awarded, sort_order)
      VALUES
        (@id, @title, @dueDate, @priority, @completed, @completedAt,
         @completedDuringDeepWork, @xpAwarded, @sortOrder)
    `);

    this.db.transaction(() => {
      stmt.run({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate ?? null,
        priority: task.priority,
        completed: task.completed ? 1 : 0,
        completedAt: task.completedAt ?? null,
        completedDuringDeepWork: task.completedDuringDeepWork ? 1 : 0,
        xpAwarded: task.xpAwarded,
        sortOrder: task.order,
      });
    })();
  }

  updateTask(task: Task): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET
        title = @title,
        due_date = @dueDate,
        priority = @priority,
        completed = @completed,
        completed_at = @completedAt,
        completed_during_deep_work = @completedDuringDeepWork,
        xp_awarded = @xpAwarded,
        sort_order = @sortOrder
      WHERE id = @id
    `);

    this.db.transaction(() => {
      stmt.run({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate ?? null,
        priority: task.priority,
        completed: task.completed ? 1 : 0,
        completedAt: task.completedAt ?? null,
        completedDuringDeepWork: task.completedDuringDeepWork ? 1 : 0,
        xpAwarded: task.xpAwarded,
        sortOrder: task.order,
      });
    })();
  }

  deleteTask(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    })();
  }

  queryTasks(): Task[] {
    const rows = this.db.prepare(
      'SELECT * FROM tasks ORDER BY sort_order ASC'
    ).all() as Array<Record<string, unknown>>;
    return rows.map(rowToTask);
  }

  // ─── XP / Badges ───────────────────────────────────────────────────────────

  insertXPEvent(event: XPEvent): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO xp_events (id, task_id, xp_amount, timestamp, multiplier_applied)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.taskId,
        event.xpAmount,
        event.timestamp,
        event.multiplierApplied ? 1 : 0
      );
    })();
  }

  queryXPEvents(): XPEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM xp_events ORDER BY timestamp ASC'
    ).all() as Array<Record<string, unknown>>;
    return rows.map(rowToXPEvent);
  }

  upsertBadge(badge: Badge): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO badges (id, name, description, xp_threshold, awarded_at)
        VALUES (@id, @name, @description, @xpThreshold, @awardedAt)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          xp_threshold = excluded.xp_threshold,
          awarded_at = excluded.awarded_at
      `).run({
        id: badge.id,
        name: badge.name,
        description: badge.description,
        xpThreshold: badge.xpThreshold,
        awardedAt: badge.awardedAt ?? null,
      });
    })();
  }

  // ─── Calendar ──────────────────────────────────────────────────────────────

  upsertCalendarEvent(event: CalendarEvent): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO calendar_events (id, title, start_time, end_time, calendar_id, synced_at)
        VALUES (@id, @title, @startTime, @endTime, @calendarId, @syncedAt)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          calendar_id = excluded.calendar_id,
          synced_at = excluded.synced_at
      `).run({
        id: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        calendarId: event.calendarId,
        syncedAt: event.syncedAt,
      });
    })();
  }

  deleteAllCalendarEvents(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM calendar_events').run();
    })();
  }

  queryCalendarEvents(from: number, to: number): CalendarEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM calendar_events
      WHERE start_time >= ? AND end_time <= ?
      ORDER BY start_time ASC
    `).all(from, to) as Array<Record<string, unknown>>;
    return rows.map(rowToCalendarEvent);
  }

  // ─── Ghost / Pace ──────────────────────────────────────────────────────────

  upsertPaceRecord(record: PaceRecord): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO pace_records (activity_key, best_pace_score, session_count, last_updated)
        VALUES (@activityKey, @bestPaceScore, @sessionCount, @lastUpdated)
        ON CONFLICT(activity_key) DO UPDATE SET
          best_pace_score = excluded.best_pace_score,
          session_count = excluded.session_count,
          last_updated = excluded.last_updated
      `).run({
        activityKey: record.activityKey,
        bestPaceScore: record.bestPaceScore,
        sessionCount: record.sessionCount,
        lastUpdated: record.lastUpdated,
      });
    })();
  }

  getPaceRecord(activityKey: string): PaceRecord | null {
    const row = this.db.prepare(
      'SELECT * FROM pace_records WHERE activity_key = ?'
    ).get(activityKey) as Record<string, unknown> | undefined;
    return row ? rowToPaceRecord(row) : null;
  }

  // ─── Audit ─────────────────────────────────────────────────────────────────

  insertAuditLog(entry: AuditLogEntry): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO audit_log (id, timestamp, event_type, detail)
        VALUES (?, ?, ?, ?)
      `).run(entry.id, entry.timestamp, entry.eventType, entry.detail ?? null);
    })();
  }

  // ─── Prediction model ──────────────────────────────────────────────────────

  saveModelBlob(blob: Buffer): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO model_store (key, blob, updated_at)
        VALUES ('model', ?, ?)
        ON CONFLICT(key) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at
      `).run(blob, Date.now());
    })();
  }

  loadModelBlob(): Buffer | null {
    const row = this.db.prepare(
      "SELECT blob FROM model_store WHERE key = 'model'"
    ).get() as { blob: Buffer } | undefined;
    return row?.blob ?? null;
  }

  // ─── Data deletion ─────────────────────────────────────────────────────────

  /** Permanently delete all user data from every table (Requirement 9.4). */
  deleteAllData(): void {
    this.db.transaction(() => {
      for (const table of [
        'xp_events',
        'segments',
        'tasks',
        'badges',
        'calendar_events',
        'pace_records',
        'audit_log',
        'model_store',
        'pattern_thresholds',
      ]) {
        this.db.prepare(`DELETE FROM ${table}`).run();
      }
    })();
  }

  /** Expose the underlying database for testing purposes. */
  _db(): Database.Database {
    return this.db;
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToSegment(row: Record<string, unknown>): ClassifiedSegment {
  return {
    id: row['id'] as string,
    appName: row['app_name'] as string,
    windowTitle: row['window_title'] as string,
    appCategory: row['app_category'] as ClassifiedSegment['appCategory'],
    startTime: row['start_time'] as number,
    endTime: row['end_time'] as number,
    tickCount: row['tick_count'] as number,
    inputSignals: {
      keystrokeCount: row['keystroke_count'] as number,
      mouseClickCount: row['mouse_click_count'] as number,
      scrollEventCount: row['scroll_event_count'] as number,
    },
    classification: row['classification'] as Classification,
    isManualOverride: Boolean(row['is_manual_override']),
  };
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row['id'] as string,
    title: row['title'] as string,
    dueDate: row['due_date'] != null ? (row['due_date'] as number) : undefined,
    priority: row['priority'] as Task['priority'],
    completed: Boolean(row['completed']),
    completedAt: row['completed_at'] != null ? (row['completed_at'] as number) : undefined,
    completedDuringDeepWork: Boolean(row['completed_during_deep_work']),
    xpAwarded: row['xp_awarded'] as number,
    order: row['sort_order'] as number,
  };
}

function rowToXPEvent(row: Record<string, unknown>): XPEvent {
  return {
    id: row['id'] as string,
    taskId: row['task_id'] as string,
    xpAmount: row['xp_amount'] as number,
    timestamp: row['timestamp'] as number,
    multiplierApplied: Boolean(row['multiplier_applied']),
  };
}

function rowToCalendarEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row['id'] as string,
    title: row['title'] as string,
    startTime: row['start_time'] as number,
    endTime: row['end_time'] as number,
    calendarId: row['calendar_id'] as string,
    syncedAt: row['synced_at'] as number,
  };
}

function rowToPaceRecord(row: Record<string, unknown>): PaceRecord {
  return {
    activityKey: row['activity_key'] as string,
    bestPaceScore: row['best_pace_score'] as number,
    sessionCount: row['session_count'] as number,
    lastUpdated: row['last_updated'] as number,
  };
}
