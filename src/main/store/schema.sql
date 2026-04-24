-- SnapBack Productivity Suite — SQLite Schema
-- All tables used by the Local Store (AES-256 encrypted via SQLCipher)

-- Core activity segments
CREATE TABLE IF NOT EXISTS segments (
  id                  TEXT PRIMARY KEY,
  app_name            TEXT NOT NULL,
  window_title        TEXT NOT NULL,
  app_category        TEXT NOT NULL,
  start_time          INTEGER NOT NULL,
  end_time            INTEGER NOT NULL,
  tick_count          INTEGER NOT NULL,
  keystroke_count     INTEGER NOT NULL DEFAULT 0,
  mouse_click_count   INTEGER NOT NULL DEFAULT 0,
  scroll_event_count  INTEGER NOT NULL DEFAULT 0,
  classification      TEXT NOT NULL CHECK(classification IN ('deep_work','shallow_work','distraction_loop')),
  is_manual_override  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_segments_time ON segments(start_time, end_time);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id                          TEXT PRIMARY KEY,
  title                       TEXT NOT NULL,
  due_date                    INTEGER,
  priority                    TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  completed                   INTEGER NOT NULL DEFAULT 0,
  completed_at                INTEGER,
  completed_during_deep_work  INTEGER NOT NULL DEFAULT 0,
  xp_awarded                  INTEGER NOT NULL DEFAULT 0,
  sort_order                  INTEGER NOT NULL DEFAULT 0
);

-- XP events
CREATE TABLE IF NOT EXISTS xp_events (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL REFERENCES tasks(id),
  xp_amount           INTEGER NOT NULL,
  timestamp           INTEGER NOT NULL,
  multiplier_applied  INTEGER NOT NULL DEFAULT 0
);

-- Badges
CREATE TABLE IF NOT EXISTS badges (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  xp_threshold  INTEGER NOT NULL,
  awarded_at    INTEGER
);

-- Calendar events
CREATE TABLE IF NOT EXISTS calendar_events (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  start_time   INTEGER NOT NULL,
  end_time     INTEGER NOT NULL,
  calendar_id  TEXT NOT NULL,
  synced_at    INTEGER NOT NULL
);

-- Pace records (Productivity Ghost)
CREATE TABLE IF NOT EXISTS pace_records (
  activity_key    TEXT PRIMARY KEY,
  best_pace_score REAL NOT NULL,
  session_count   INTEGER NOT NULL DEFAULT 0,
  last_updated    INTEGER NOT NULL
);

-- Audit log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  timestamp   INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  detail      TEXT
);

-- Prediction model blob
CREATE TABLE IF NOT EXISTS model_store (
  key        TEXT PRIMARY KEY,
  blob       BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Pattern confidence thresholds
CREATE TABLE IF NOT EXISTS pattern_thresholds (
  pattern_key   TEXT PRIMARY KEY,
  threshold     REAL NOT NULL DEFAULT 0.75,
  dismiss_count INTEGER NOT NULL DEFAULT 0,
  accept_count  INTEGER NOT NULL DEFAULT 0
);
