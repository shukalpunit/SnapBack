# Design Document: SnapBack Productivity Suite

## Overview

SnapBack is a local-first productivity suite for students and professionals. It runs as a background desktop application (Electron-based, targeting macOS and Windows) that continuously monitors application usage, classifies time segments behaviorally, and surfaces insights through a rich dashboard — all without any user data leaving the device.

The system is composed of six primary subsystems that communicate through an internal event bus and share a single encrypted on-device data store:

1. **Activity Tracker** — OS-level foreground app polling and idle detection
2. **Classifier** — Behavioral heuristic engine that labels time segments
3. **Prediction Engine** — Local ML model that detects pre-distraction patterns
4. **Productivity Ghost** — Overlay renderer for personal-best pace reference
5. **Task Manager** — Gamified to-do list with XP, badges, and leaderboard
6. **Calendar Sync** — Google Calendar API integration (opt-in)

All subsystems read from and write to the **Local Store** — an AES-256 encrypted SQLite database stored on the user's device.

### Technology Stack

- **Runtime**: Electron (Node.js main process + Chromium renderer)
- **UI Framework**: React + TypeScript
- **Local Store**: SQLite via `better-sqlite3`, encrypted with `sqlcipher`
- **ML / Prediction**: TensorFlow.js (runs entirely in Node.js process)
- **Calendar API**: Google Calendar REST API (OAuth 2.0, token stored in OS keychain)
- **PDF Export**: `pdfkit` (Node.js, no network calls)
- **Property-Based Testing**: `fast-check` (TypeScript)
- **Unit Testing**: Vitest

---

## Architecture

The application follows a **main-process / renderer-process** split mandated by Electron, with a strict rule: all data access and background processing happen in the main process; the renderer only displays data it receives via IPC.

```mermaid
graph TD
    subgraph Main Process
        AT[Activity Tracker]
        CL[Classifier]
        PE[Prediction Engine]
        PG[Productivity Ghost]
        TM[Task Manager Service]
        CS[Calendar Sync]
        LS[(Local Store\nSQLite + AES-256)]
        EB[Internal Event Bus]
    end

    subgraph Renderer Process
        UI[React UI\nDashboard / HeatMap / Tasks]
        GO[Ghost Bar Overlay]
    end

    AT -->|activity events| EB
    EB -->|raw segments| CL
    CL -->|classified segments| LS
    EB -->|behavioral signals| PE
    PE -->|intervention trigger| EB
    EB -->|intervention| UI
    PG -->|reads best pace| LS
    PG -->|ghost data| GO
    TM -->|task CRUD + XP| LS
    CS -->|calendar events| LS
    LS -->|query results| UI
    UI -->|IPC| Main Process
```

### Data Flow

1. The **Activity Tracker** polls the OS every ≤5 seconds for the foreground window and emits `activity.tick` events on the internal event bus.
2. The **Classifier** accumulates ticks into segments and applies behavioral heuristics, writing completed `ClassifiedSegment` records to the Local Store.
3. The **Prediction Engine** subscribes to `activity.tick` events, maintains a rolling behavioral feature vector, and emits `intervention.trigger` when confidence ≥ 0.75.
4. The **Productivity Ghost** reads historical session data from the Local Store and pushes pace data to the Ghost Bar overlay via IPC.
5. The **Dashboard** queries the Local Store on demand and subscribes to a `store.updated` event for live refresh (≤5 second latency).

### Privacy Boundary

A **Network Guard** module wraps all outbound network calls. It maintains an allowlist containing only the Google Calendar API endpoint (when Calendar Sync is authorized). Any connection attempt to a non-allowlisted endpoint is blocked and logged to the Local Store audit log.

---

## Components and Interfaces

### Activity Tracker

Runs as a recurring timer in the Electron main process.

```typescript
interface ActivityTick {
  timestamp: number;        // Unix ms
  appName: string;
  windowTitle: string;
  isIdle: boolean;
}

interface ActivityTrackerConfig {
  pollIntervalMs: number;   // ≤ 5000
  idleThresholdMs: number;  // default 120_000 (2 min)
}

interface IActivityTracker {
  start(): void;
  stop(): void;
  onTick(handler: (tick: ActivityTick) => void): void;
}
```

**OS Integration:**
- macOS: `NSWorkspace.shared.frontmostApplication` via native addon or `active-win` npm package
- Windows: `GetForegroundWindow` + `GetWindowText` via `active-win`

**Idle Detection:**
- macOS: `CGEventSourceSecondsSinceLastEventType`
- Windows: `GetLastInputInfo`

### Classifier

Stateful component that accumulates `ActivityTick` events into segments and applies classification rules.

```typescript
type Classification = 'deep_work' | 'shallow_work' | 'distraction_loop';

interface RawSegment {
  appName: string;
  windowTitle: string;
  startTime: number;
  endTime: number;
  tickCount: number;
  inputSignals: InputSignalSummary;
}

interface ClassifiedSegment extends RawSegment {
  classification: Classification;
  isManualOverride: boolean;
  appCategory: AppCategory;
}

type AppCategory = 'ide' | 'browser' | 'email' | 'communication' | 'document' | 'media' | 'other';

interface InputSignalSummary {
  keystrokeCount: number;
  mouseClickCount: number;
  scrollEventCount: number;
}

interface IClassifier {
  ingest(tick: ActivityTick): void;
  flush(): ClassifiedSegment | null;  // called on app switch or session end
  overrideClassification(segmentId: string, classification: Classification): void;
}
```

**Classification Rules (evaluated in order):**
1. **Distraction Loop**: ≥3 visits to the same app within a 10-minute window, each visit < 90 seconds, with `inputSignals.keystrokeCount < 5` per visit.
2. **Deep Work**: Continuous engagement > 10 minutes with `inputSignals.keystrokeCount > 50` or `mouseClickCount > 20` (sustained input).
3. **Shallow Work**: Everything else.

### Prediction Engine

Local TensorFlow.js model trained on behavioral feature vectors extracted from the Local Store.

```typescript
interface BehavioralFeatureVector {
  recentAppSwitchRate: number;       // switches per minute, last 5 min
  currentSessionDeepWorkRatio: number;
  timeOfDay: number;                 // 0–1 normalized hour
  dayOfWeek: number;                 // 0–6
  consecutiveShallowMinutes: number;
  lastDistractionLoopMinutesAgo: number;
  currentAppCategory: number;        // encoded AppCategory
}

interface PredictionResult {
  confidence: number;               // 0–1
  patternDescription: string;       // human-readable, e.g. "long Slack thread → Reddit"
  suggestedAction: string;
}

interface IPredictionEngine {
  ingestTick(tick: ActivityTick, classification: Classification): void;
  predict(): PredictionResult | null;
  recordFeedback(accepted: boolean, patternKey: string): void;
  rebuildFromStore(): Promise<void>;
  isReady(): boolean;               // false if < 5 days of data
}
```

**Model Architecture**: A lightweight feedforward neural network (2 hidden layers, 16 units each) trained on sequences of `BehavioralFeatureVector`. Stored as a JSON model file in the Local Store data directory. Retrained incrementally after each session.

**Confidence Threshold Management**: Each pattern key maintains its own threshold, initialized at 0.75. Dismissals increment by 0.05; acceptances decrement by 0.02 (floor 0.60, ceiling 0.95).

### Productivity Ghost

```typescript
interface PaceRecord {
  activityKey: string;    // e.g., "vscode:typescript"
  bestPaceScore: number;  // normalized 0–1, higher = faster
  sessionCount: number;
  lastUpdated: number;
}

interface GhostBarState {
  visible: boolean;
  bestPaceScore: number;
  currentPaceScore: number;
  activityKey: string;
}

interface IProductivityGhost {
  getGhostBarState(activityKey: string): GhostBarState;
  updateBestPace(activityKey: string, sessionPaceScore: number): void;
}
```

The Ghost Bar is rendered as a frameless, always-on-top Electron `BrowserWindow` with `transparent: true`. Position is configurable (four corners). Suppressed when `sessionCount < 3` or when disabled in settings.

### Task Manager Service

```typescript
interface Task {
  id: string;
  title: string;
  dueDate?: number;       // Unix ms
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  completedAt?: number;
  completedDuringDeepWork: boolean;
  xpAwarded: number;
  order: number;
}

interface XPEvent {
  id: string;
  taskId: string;
  xpAmount: number;
  timestamp: number;
  multiplierApplied: boolean;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  xpThreshold: number;
  awardedAt?: number;
}

interface ITaskManagerService {
  createTask(task: Omit<Task, 'id' | 'xpAwarded' | 'order'>): Task;
  updateTask(id: string, updates: Partial<Task>): Task;
  deleteTask(id: string): void;
  reorderTasks(orderedIds: string[]): void;
  completeTask(id: string, duringDeepWork: boolean): XPEvent;
  getTotalXP(): number;
  getBadges(): Badge[];
}
```

**XP Table:**
| Priority | Base XP | Deep Work Multiplier | Final XP |
|----------|---------|---------------------|----------|
| Low      | 10      | 1.5×                | 15       |
| Medium   | 25      | 1.5×                | 37 (rounded) |
| High     | 50      | 1.5×                | 75       |

**Badge Thresholds (initial set):** 100 XP (Starter), 500 XP (Focused), 1000 XP (Deep Worker), 5000 XP (Flow Master).

### Calendar Sync

```typescript
interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  calendarId: string;
  syncedAt: number;
}

interface ICalendarSync {
  authorize(): Promise<void>;
  fetchEvents(fromDate: Date, toDate: Date): Promise<CalendarEvent[]>;
  revokeAuthorization(): Promise<void>;
  getActiveEvent(timestamp: number): CalendarEvent | null;
}
```

OAuth 2.0 tokens are stored in the OS keychain (macOS Keychain / Windows Credential Manager) via the `keytar` package — never in the Local Store. On revocation, all `CalendarEvent` rows are deleted from the Local Store within 30 seconds.

### Local Store

SQLite database encrypted with SQLCipher. The encryption key is derived from a device-specific secret (machine UUID + OS user SID) using PBKDF2 (100,000 iterations, SHA-256).

```typescript
interface ILocalStore {
  // Segments
  insertSegment(segment: ClassifiedSegment): void;
  querySegments(from: number, to: number): ClassifiedSegment[];
  overrideSegmentClassification(id: string, classification: Classification): void;

  // Tasks
  insertTask(task: Task): void;
  updateTask(task: Task): void;
  deleteTask(id: string): void;
  queryTasks(): Task[];

  // XP / Badges
  insertXPEvent(event: XPEvent): void;
  queryXPEvents(): XPEvent[];
  upsertBadge(badge: Badge): void;

  // Calendar
  upsertCalendarEvent(event: CalendarEvent): void;
  deleteAllCalendarEvents(): void;
  queryCalendarEvents(from: number, to: number): CalendarEvent[];

  // Ghost / Pace
  upsertPaceRecord(record: PaceRecord): void;
  getPaceRecord(activityKey: string): PaceRecord | null;

  // Audit
  insertAuditLog(entry: AuditLogEntry): void;

  // Prediction model
  saveModelBlob(blob: Buffer): void;
  loadModelBlob(): Buffer | null;
}
```

---

## Data Models

### SQLite Schema

```sql
-- Core activity segments
CREATE TABLE segments (
  id            TEXT PRIMARY KEY,
  app_name      TEXT NOT NULL,
  window_title  TEXT NOT NULL,
  app_category  TEXT NOT NULL,
  start_time    INTEGER NOT NULL,
  end_time      INTEGER NOT NULL,
  tick_count    INTEGER NOT NULL,
  keystroke_count   INTEGER NOT NULL DEFAULT 0,
  mouse_click_count INTEGER NOT NULL DEFAULT 0,
  scroll_event_count INTEGER NOT NULL DEFAULT 0,
  classification TEXT NOT NULL CHECK(classification IN ('deep_work','shallow_work','distraction_loop')),
  is_manual_override INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_segments_time ON segments(start_time, end_time);

-- Tasks
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  due_date      INTEGER,
  priority      TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  completed     INTEGER NOT NULL DEFAULT 0,
  completed_at  INTEGER,
  completed_during_deep_work INTEGER NOT NULL DEFAULT 0,
  xp_awarded    INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- XP events
CREATE TABLE xp_events (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  xp_amount     INTEGER NOT NULL,
  timestamp     INTEGER NOT NULL,
  multiplier_applied INTEGER NOT NULL DEFAULT 0
);

-- Badges
CREATE TABLE badges (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  xp_threshold  INTEGER NOT NULL,
  awarded_at    INTEGER
);

-- Calendar events
CREATE TABLE calendar_events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  start_time    INTEGER NOT NULL,
  end_time      INTEGER NOT NULL,
  calendar_id   TEXT NOT NULL,
  synced_at     INTEGER NOT NULL
);

-- Pace records (Productivity Ghost)
CREATE TABLE pace_records (
  activity_key  TEXT PRIMARY KEY,
  best_pace_score REAL NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 0,
  last_updated  INTEGER NOT NULL
);

-- Audit log
CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  timestamp     INTEGER NOT NULL,
  event_type    TEXT NOT NULL,
  detail        TEXT
);

-- Prediction model blob
CREATE TABLE model_store (
  key           TEXT PRIMARY KEY,
  blob          BLOB NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Pattern confidence thresholds
CREATE TABLE pattern_thresholds (
  pattern_key   TEXT PRIMARY KEY,
  threshold     REAL NOT NULL DEFAULT 0.75,
  dismiss_count INTEGER NOT NULL DEFAULT 0,
  accept_count  INTEGER NOT NULL DEFAULT 0
);
```

### Key Invariants

- Every `segment` row has `start_time < end_time`.
- Every `xp_event` references a valid `task.id`.
- `pace_records.session_count` is monotonically non-decreasing.
- `pattern_thresholds.threshold` is always in [0.60, 0.95].
- `audit_log` is append-only; no rows are ever deleted.


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Poll Interval Constraint

*For any* configured `ActivityTrackerConfig`, if `pollIntervalMs > 5000` the tracker SHALL reject or clamp the value; if `pollIntervalMs ≤ 5000` the tracker SHALL emit ticks at no greater than that interval.

**Validates: Requirements 1.1**

---

### Property 2: Idle Time Exclusion

*For any* session containing an idle gap of more than 120 consecutive seconds, the total accumulated time for the affected application SHALL NOT include the idle period.

**Validates: Requirements 1.4**

---

### Property 3: Dashboard Sort Order

*For any* set of `ClassifiedSegment` records for a given date range, the dashboard aggregation function SHALL return applications sorted by total duration in descending order, with no two adjacent entries where the first has a shorter total duration than the second.

**Validates: Requirements 1.6**

---

### Property 4: Classifier Exhaustiveness and Exclusivity

*For any* valid `RawSegment`, the Classifier SHALL return exactly one classification from `{deep_work, shallow_work, distraction_loop}` — never null, never multiple. Specifically:
- If the segment meets the distraction loop criteria (≥3 visits within 10 min, each < 90 s, < 5 keystrokes), it SHALL be classified as `distraction_loop`.
- If the segment meets the deep work criteria (continuous > 10 min, keystroke_count > 50 or mouse_click_count > 20), it SHALL be classified as `deep_work`.
- Otherwise it SHALL be classified as `shallow_work`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

---

### Property 5: Classification Proportions Sum to Total

*For any* set of `ClassifiedSegment` records for a given day, the sum of deep work hours + shallow work hours + distraction loop hours SHALL equal the total tracked hours for that day, and the proportional breakdown percentages SHALL sum to 1.0 (within floating-point tolerance of 1e-9).

**Validates: Requirements 2.6, 6.1**

---

### Property 6: Manual Override Round-Trip

*For any* segment ID and any target `Classification`, applying `overrideClassification(id, classification)` and then querying the Local Store for that segment SHALL return the overridden classification, with `is_manual_override = true`.

**Validates: Requirements 2.7**

---

### Property 7: Heat Map Grid Completeness

*For any* day's segment data, the heat map data model SHALL produce exactly 96 cells (one per 15-minute block in a 24-hour day), and each cell's assigned classification SHALL correspond to the classification with the greatest total duration within that 15-minute window.

**Validates: Requirements 3.1, 3.2**

---

### Property 8: Heat Map Tooltip Data Completeness

*For any* heat map cell that contains at least one classified segment, the tooltip data structure SHALL include a non-null `appName`, a valid `classification`, and a `duration > 0`.

**Validates: Requirements 3.3**

---

### Property 9: Color Blind Mode Indicator Distinctness

*For any* `Classification` value, when color blind mode is enabled, the rendered indicator SHALL include both a non-null color value AND a non-null icon pattern, and the color value SHALL differ from the default (green/yellow/red) palette.

**Validates: Requirements 3.5, 10.3**

---

### Property 10: Ghost Bar Visibility Invariant

*For any* activity key, the Ghost Bar visibility SHALL satisfy: `visible = (session_count >= 3) AND (ghost_enabled_in_settings)`. Specifically, for any activity with `session_count < 3`, `getGhostBarState` SHALL return `visible: false`; for any activity with `session_count >= 3` and ghost enabled, it SHALL return `visible: true`.

**Validates: Requirements 4.1, 4.4**

---

### Property 11: Best Pace Monotonicity

*For any* activity key, calling `updateBestPace(activityKey, newScore)` where `newScore > currentBestPaceScore` SHALL result in the Local Store's `pace_records` row for that key having `best_pace_score = newScore`. Calling it with `newScore ≤ currentBestPaceScore` SHALL leave the stored value unchanged.

**Validates: Requirements 4.2, 4.3**

---

### Property 12: Intervention Threshold Arithmetic

*For any* pattern key with threshold `t ∈ [0.60, 0.95]`:
- After `recordFeedback(false, patternKey)` (dismissal), the new threshold SHALL be `min(t + 0.05, 0.95)`.
- After `recordFeedback(true, patternKey)` (acceptance), the new threshold SHALL be `max(t - 0.02, 0.60)`.
- The threshold SHALL always remain within `[0.60, 0.95]` regardless of how many feedback events are applied.

**Validates: Requirements 5.4, 5.5**

---

### Property 13: Intervention Suppression Before Sufficient Data

*For any* Local Store state containing fewer than 5 distinct days of tracked segment data, `predictionEngine.isReady()` SHALL return `false` and `predictionEngine.predict()` SHALL return `null`.

**Validates: Requirements 5.6**

---

### Property 14: Intervention Notification Contains Pattern Description

*For any* `PredictionResult` with a non-empty `patternDescription`, the rendered intervention notification text SHALL contain that `patternDescription` as a substring.

**Validates: Requirements 5.3**

---

### Property 15: 7-Day Trend Chart Cardinality

*For any* query of the 7-day deep work trend, the result SHALL contain exactly 7 entries, one for each of the 7 most recent calendar days, with no duplicate dates and no missing dates within the range.

**Validates: Requirements 6.2**

---

### Property 16: Weekly Report Completeness

*For any* 7-day period of segment data, the generated weekly report object SHALL contain: `totalHoursTracked`, `classificationBreakdown` (three percentages summing to 1.0), `topFiveApps` (array of length ≤ 5, sorted by duration descending), and `mostFrequentDistractionPattern`.

**Validates: Requirements 6.3**

---

### Property 17: Task CRUD Round-Trip

*For any* valid `Task` object (with non-empty title and valid priority), creating it via `createTask` and then querying `queryTasks` SHALL return a task with equivalent `title`, `priority`, `dueDate`, and `completed` fields.

**Validates: Requirements 7.1, 7.6**

---

### Property 18: XP Award Correctness

*For any* task with priority `p ∈ {low, medium, high}` and `completedDuringDeepWork ∈ {true, false}`, the XP awarded by `completeTask` SHALL equal:
- `low`: 10 (no multiplier) or 15 (deep work)
- `medium`: 25 (no multiplier) or 37 (deep work, floor of 25 × 1.5)
- `high`: 50 (no multiplier) or 75 (deep work)

**Validates: Requirements 7.2, 7.5**

---

### Property 19: Badge Award Threshold Crossing

*For any* sequence of XP events that causes the user's cumulative XP to cross a defined badge threshold for the first time, the corresponding badge SHALL be awarded exactly once (idempotent — re-crossing the same threshold does not award a duplicate badge).

**Validates: Requirements 7.3**

---

### Property 20: Calendar Event Active Lookup

*For any* `CalendarEvent` stored in the Local Store with `startTime ≤ t < endTime`, calling `getActiveEvent(t)` SHALL return that event. For any timestamp `t` not covered by any stored event, `getActiveEvent(t)` SHALL return `null`.

**Validates: Requirements 8.3**

---

### Property 21: Calendar Revocation Completeness

*For any* set of `CalendarEvent` rows in the Local Store, after `revokeAuthorization()` completes, `queryCalendarEvents` for any time range SHALL return an empty array.

**Validates: Requirements 8.5**

---

### Property 22: Network Guard Blocks Non-Allowlisted Endpoints

*For any* outbound connection attempt to a URL that is not the Google Calendar API endpoint (or when Calendar Sync is not authorized), the Network Guard SHALL block the connection and insert an `AuditLogEntry` with `event_type = 'blocked_connection'` into the Local Store.

**Validates: Requirements 9.2, 9.5**

---

### Property 23: Data Deletion Completeness

*For any* populated Local Store, after the user-confirmed data deletion operation completes, querying all tables (`segments`, `tasks`, `xp_events`, `badges`, `calendar_events`, `pace_records`, `model_store`, `pattern_thresholds`) SHALL return zero rows.

**Validates: Requirements 9.4**

---

## Error Handling

### Activity Tracker
- If the OS API call to get the foreground window fails, the tracker logs the error to the audit log and skips that tick (does not crash).
- If the Local Store write fails, the tracker buffers up to 60 seconds of ticks in memory and retries; if the buffer overflows, it logs a warning and drops the oldest ticks.

### Classifier
- If a segment's `appName` is empty or null (e.g., OS returned no window), the classifier assigns `app_category = 'other'` and applies default heuristics.
- If the classifier encounters an unrecognized app category, it defaults to shallow work classification.

### Prediction Engine
- If the model file is missing or corrupted (`loadModelBlob()` returns null or throws), the engine calls `rebuildFromStore()` asynchronously and notifies the user via a non-blocking toast: "Retraining your focus model — this may take a few minutes."
- If `rebuildFromStore()` fails (e.g., insufficient data), the engine sets `isReady() = false` and suppresses all interventions until retraining succeeds.
- If TensorFlow.js throws during inference, the engine catches the error, logs it, and returns `null` from `predict()`.

### Calendar Sync
- On API error (4xx/5xx) or network timeout, Calendar Sync displays a non-blocking error banner: "Calendar sync failed — showing cached events." It continues operating with the last successfully cached data.
- On token expiry, Calendar Sync triggers a re-authorization flow. If the user declines, Calendar Sync disables itself and clears the stored token from the OS keychain.
- On revocation, a 30-second deadline is enforced; if `deleteAllCalendarEvents()` does not complete within 30 seconds, the operation is retried once and then logged as a critical audit event.

### Local Store
- All writes are wrapped in SQLite transactions. If a transaction fails, it is rolled back and the error is logged.
- On startup, the application verifies the database integrity with `PRAGMA integrity_check`. If the check fails, the user is prompted to restore from a backup or start fresh.
- The encryption key derivation is performed once at startup; if it fails (e.g., device credentials unavailable), the application refuses to start and displays a clear error message.

### PDF Export
- If the target directory does not exist or is not writable, the export operation fails with a user-visible error message specifying the path issue.
- PDF generation is performed synchronously in the main process; if it exceeds 30 seconds, it is aborted and the user is notified.

---

## Testing Strategy

### Dual Testing Approach

SnapBack uses a combination of property-based tests and example-based unit/integration tests.

**Property-Based Testing Library**: `fast-check` (TypeScript/Node.js)

Each property test runs a minimum of **100 iterations**. Each test is tagged with a comment referencing the design property:

```typescript
// Feature: snapback-productivity-suite, Property 4: Classifier Exhaustiveness and Exclusivity
```

### Property Tests

The 23 correctness properties defined above are each implemented as a single `fast-check` property test. Key generators include:

- `fc.record({ appName: fc.string(), windowTitle: fc.string(), startTime: fc.integer(), ... })` for `RawSegment`
- `fc.array(fc.record(...))` for collections of segments
- `fc.float({ min: 0.60, max: 0.95 })` for threshold values
- `fc.oneof(fc.constant('low'), fc.constant('medium'), fc.constant('high'))` for priority
- `fc.boolean()` for `completedDuringDeepWork`

### Unit / Example Tests

- **Activity Tracker**: Integration test with mocked `active-win` verifying tick emission, idle detection, and app switch recording.
- **Classifier**: Example tests for each `AppCategory` verifying correct heuristic application.
- **Prediction Engine**: Example test for corrupted model recovery (Requirement 5.7).
- **Dashboard**: Example test for PDF export to local path (Requirement 6.4); example test for ≤5 second refresh latency (Requirement 6.5).
- **Task Manager**: Example test for leaderboard opt-in/opt-out (Requirement 7.4).
- **Calendar Sync**: Integration test with mocked Google Calendar API for initial fetch (Requirement 8.1); example test for API error fallback (Requirement 8.4).
- **Ghost Bar**: Example test for settings-disabled suppression (Requirement 4.5); example test for reduced motion static display (Requirement 4.6).
- **Accessibility**: Example test for dark mode theme switch latency (Requirement 10.2); example test for reduced motion flag (Requirement 10.4).

### Smoke Tests

- Verify SQLCipher AES-256 encryption is active (database file is not readable as plaintext).
- Verify 5+ languages are available in settings.
- Verify no outbound network calls occur during a full tracked session (no Calendar Sync).
- Verify `PRAGMA integrity_check` passes on a freshly created Local Store.

### Integration Tests

- Google Calendar API fetch with mocked HTTP responses (Requirement 8.1).
- State machine logging verification (Requirement 8.4 error path).
- End-to-end session: tracker → classifier → store → dashboard query, verifying data flows correctly through all components.

### Test Configuration

```typescript
// vitest.config.ts
export default {
  test: {
    globals: true,
    environment: 'node',
  }
}
```

```typescript
// Example property test structure
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

describe('Classifier Exhaustiveness', () => {
  // Feature: snapback-productivity-suite, Property 4: Classifier Exhaustiveness and Exclusivity
  it('assigns exactly one classification to any segment', () => {
    fc.assert(
      fc.property(arbitraryRawSegment(), (segment) => {
        const result = classifier.classify(segment);
        expect(['deep_work', 'shallow_work', 'distraction_loop']).toContain(result);
      }),
      { numRuns: 100 }
    );
  });
});
```
