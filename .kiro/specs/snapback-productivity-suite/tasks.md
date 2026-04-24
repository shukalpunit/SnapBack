# Implementation Plan: SnapBack Productivity Suite

## Overview

Implement SnapBack as an Electron + React + TypeScript desktop application. Tasks are ordered to build the data foundation first, then each subsystem, then the UI layer, and finally integration wiring. Each task builds directly on the previous ones with no orphaned code.

## Tasks

- [ ] 1. Project scaffold and Local Store foundation
  - Initialize Electron + React + TypeScript project with Vite (renderer) and tsc (main process)
  - Configure `vitest.config.ts` with `globals: true, environment: 'node'`
  - Install dependencies: `better-sqlite3`, `sqlcipher`, `electron`, `react`, `typescript`, `fast-check`, `vitest`, `active-win`, `keytar`, `pdfkit`, `@tensorflow/tfjs-node`
  - Create `src/main/store/schema.sql` with all tables: `segments`, `tasks`, `xp_events`, `badges`, `calendar_events`, `pace_records`, `audit_log`, `model_store`, `pattern_thresholds`
  - Implement `src/main/store/LocalStore.ts` implementing `ILocalStore` — all CRUD methods, SQLite transactions, `PRAGMA integrity_check` on startup, AES-256 key derivation via PBKDF2 from machine UUID + OS user SID
  - _Requirements: 1.5, 9.1, 9.4_

  - [ ]* 1.1 Write property test for data deletion completeness
    - **Property 23: Data Deletion Completeness**
    - **Validates: Requirements 9.4**

  - [ ]* 1.2 Write property test for manual override round-trip
    - **Property 6: Manual Override Round-Trip**
    - **Validates: Requirements 2.7**

- [ ] 2. Network Guard
  - Implement `src/main/network/NetworkGuard.ts` that wraps Node.js `http`/`https` modules
  - Maintain an allowlist; when Calendar Sync is not authorized, the allowlist is empty
  - Block any non-allowlisted outbound connection and call `LocalStore.insertAuditLog` with `event_type = 'blocked_connection'`
  - _Requirements: 9.2, 9.5_

  - [ ]* 2.1 Write property test for Network Guard blocking
    - **Property 22: Network Guard Blocks Non-Allowlisted Endpoints**
    - **Validates: Requirements 9.2, 9.5**

- [ ] 3. Activity Tracker
  - Implement `src/main/tracker/ActivityTracker.ts` implementing `IActivityTracker`
  - Use `active-win` for foreground window polling on macOS and Windows
  - Enforce `pollIntervalMs ≤ 5000` — clamp or reject values above 5000
  - Implement idle detection: pause accumulation after 120 consecutive idle seconds; resume on input
  - Emit `activity.tick` events on the internal event bus (use Node.js `EventEmitter`)
  - Record app-switch events with timestamps accurate to ≤1 second
  - On OS API failure, log to audit log and skip the tick without crashing
  - Buffer up to 60 seconds of ticks in memory if Local Store write fails; drop oldest on overflow
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 3.1 Write property test for poll interval constraint
    - **Property 1: Poll Interval Constraint**
    - **Validates: Requirements 1.1**

  - [ ]* 3.2 Write property test for idle time exclusion
    - **Property 2: Idle Time Exclusion**
    - **Validates: Requirements 1.4**

  - [ ]* 3.3 Write unit tests for Activity Tracker
    - Integration test with mocked `active-win` verifying tick emission, idle detection, and app-switch recording
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 4. Classifier
  - Implement `src/main/classifier/Classifier.ts` implementing `IClassifier`
  - Define `AppCategory` mapping heuristics for `ide`, `browser`, `email`, `communication`, `document`, `media`, `other`
  - Implement classification rules in priority order: distraction loop → deep work → shallow work (fallback)
  - Implement `overrideClassification` writing to Local Store with `is_manual_override = true`
  - Handle null/empty `appName` by assigning `app_category = 'other'` and applying default heuristics
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_

  - [ ]* 4.1 Write property test for classifier exhaustiveness and exclusivity
    - **Property 4: Classifier Exhaustiveness and Exclusivity**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [ ]* 4.2 Write unit tests for Classifier
    - Example tests for each `AppCategory` verifying correct heuristic application
    - _Requirements: 2.5_

- [ ] 5. Checkpoint — core data pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Prediction Engine
  - Implement `src/main/prediction/PredictionEngine.ts` implementing `IPredictionEngine`
  - Define `BehavioralFeatureVector` extraction from recent `ActivityTick` + `Classification` history
  - Build a TensorFlow.js feedforward network (2 hidden layers, 16 units each) in Node.js process
  - Implement `isReady()` returning `false` when fewer than 5 distinct days of data exist in Local Store
  - Implement `predict()` returning `null` when `isReady() = false` or on TensorFlow.js inference error
  - Implement per-pattern threshold management: dismissal → `min(t + 0.05, 0.95)`, acceptance → `max(t - 0.02, 0.60)`
  - Implement `rebuildFromStore()` — async retraining from raw Local Store data; on failure set `isReady = false`
  - On corrupted/missing model blob, call `rebuildFromStore()` and emit a non-blocking toast notification
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 6.1 Write property test for intervention threshold arithmetic
    - **Property 12: Intervention Threshold Arithmetic**
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 6.2 Write property test for intervention suppression before sufficient data
    - **Property 13: Intervention Suppression Before Sufficient Data**
    - **Validates: Requirements 5.6**

  - [ ]* 6.3 Write property test for intervention notification contains pattern description
    - **Property 14: Intervention Notification Contains Pattern Description**
    - **Validates: Requirements 5.3**

  - [ ]* 6.4 Write unit test for corrupted model recovery
    - Example test: corrupt model blob → `rebuildFromStore()` called → toast notification emitted
    - _Requirements: 5.7_

- [ ] 7. Productivity Ghost
  - Implement `src/main/ghost/ProductivityGhost.ts` implementing `IProductivityGhost`
  - Implement `getGhostBarState`: return `visible: false` when `session_count < 3` or ghost disabled in settings
  - Implement `updateBestPace`: only update Local Store when `newScore > currentBestPaceScore`
  - Create `src/renderer/components/GhostBar.tsx` — frameless always-on-top Electron `BrowserWindow` with `transparent: true`, configurable corner position
  - Respect `reducedMotion` setting: render as static indicator with no animated transitions
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 7.1 Write property test for Ghost Bar visibility invariant
    - **Property 10: Ghost Bar Visibility Invariant**
    - **Validates: Requirements 4.1, 4.4**

  - [ ]* 7.2 Write property test for best pace monotonicity
    - **Property 11: Best Pace Monotonicity**
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 7.3 Write unit tests for Ghost Bar
    - Example test: settings-disabled suppression (Requirement 4.5)
    - Example test: reduced motion static display (Requirement 4.6)

- [ ] 8. Task Manager Service
  - Implement `src/main/tasks/TaskManagerService.ts` implementing `ITaskManagerService`
  - Implement `createTask`, `updateTask`, `deleteTask`, `reorderTasks` with Local Store persistence
  - Implement `completeTask`: compute XP (10/25/50 base × 1.5 if `duringDeepWork`; medium rounds to 37), write `XPEvent` to Local Store
  - Implement badge threshold crossing detection in `completeTask` — award each badge exactly once (idempotent)
  - Implement `getTotalXP()` by summing `xp_events` from Local Store
  - Implement `getBadges()` returning all badges with `awarded_at` set for earned ones
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [ ]* 8.1 Write property test for XP award correctness
    - **Property 18: XP Award Correctness**
    - **Validates: Requirements 7.2, 7.5**

  - [ ]* 8.2 Write property test for badge award threshold crossing
    - **Property 19: Badge Award Threshold Crossing**
    - **Validates: Requirements 7.3**

  - [ ]* 8.3 Write property test for task CRUD round-trip
    - **Property 17: Task CRUD Round-Trip**
    - **Validates: Requirements 7.1, 7.6**

  - [ ]* 8.4 Write unit test for leaderboard opt-in/opt-out
    - Example test: leaderboard visible when opted in, hidden when opted out
    - _Requirements: 7.4_

- [ ] 9. Calendar Sync
  - Implement `src/main/calendar/CalendarSync.ts` implementing `ICalendarSync`
  - Implement OAuth 2.0 authorization flow using Google Calendar REST API; store tokens in OS keychain via `keytar` (never in Local Store)
  - Implement `fetchEvents` for current + next 7 days; upsert results into Local Store
  - Implement `getActiveEvent(timestamp)`: return event where `startTime ≤ t < endTime`, or `null`
  - Implement `revokeAuthorization`: delete all `calendar_events` rows within 30 seconds; retry once on timeout, then log critical audit event
  - On API error or network timeout, display non-blocking error banner and continue with cached data
  - On token expiry, trigger re-authorization; if declined, disable Calendar Sync and clear keychain token
  - Add Google Calendar API endpoint to Network Guard allowlist on authorization; remove on revocation
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 9.1 Write property test for calendar event active lookup
    - **Property 20: Calendar Event Active Lookup**
    - **Validates: Requirements 8.3**

  - [ ]* 9.2 Write property test for calendar revocation completeness
    - **Property 21: Calendar Revocation Completeness**
    - **Validates: Requirements 8.5**

  - [ ]* 9.3 Write integration tests for Calendar Sync
    - Integration test with mocked Google Calendar API for initial fetch (Requirement 8.1)
    - Example test for API error fallback (Requirement 8.4)

- [ ] 10. Checkpoint — all services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Dashboard and reporting
  - Implement `src/main/dashboard/DashboardService.ts` with query methods for the renderer
  - Implement `getAppTimeByDateRange(from, to)`: aggregate `segments` by `app_name`, sort by total duration descending
  - Implement `getDailySummary(date)`: return total tracked time + per-classification hours
  - Implement `getSevenDayTrend()`: return exactly 7 entries (one per calendar day), no duplicates, no gaps
  - Implement `generateWeeklyReport()`: `totalHoursTracked`, `classificationBreakdown` (three percentages summing to 1.0), `topFiveApps` (≤5, sorted descending), `mostFrequentDistractionPattern`
  - Implement PDF export via `pdfkit` writing to a user-specified local directory; abort after 30 seconds with user notification
  - Subscribe to `store.updated` event and push refresh to renderer via IPC within 5 seconds
  - _Requirements: 1.6, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 11.1 Write property test for dashboard sort order
    - **Property 3: Dashboard Sort Order**
    - **Validates: Requirements 1.6**

  - [ ]* 11.2 Write property test for classification proportions sum to total
    - **Property 5: Classification Proportions Sum to Total**
    - **Validates: Requirements 2.6, 6.1**

  - [ ]* 11.3 Write property test for 7-day trend chart cardinality
    - **Property 15: 7-Day Trend Chart Cardinality**
    - **Validates: Requirements 6.2**

  - [ ]* 11.4 Write property test for weekly report completeness
    - **Property 16: Weekly Report Completeness**
    - **Validates: Requirements 6.3**

  - [ ]* 11.5 Write unit tests for Dashboard
    - Example test: PDF export to local path (Requirement 6.4)
    - Example test: ≤5 second refresh latency (Requirement 6.5)

- [ ] 12. Heat Map data model
  - Implement `src/main/heatmap/HeatMapService.ts`
  - Implement `getHeatMapCells(date)`: produce exactly 96 cells (one per 15-minute block), each cell's classification = dominant classification by total duration in that window
  - Implement `getTooltipData(cellIndex, date)`: return `{ appName, classification, duration }` for cells with at least one segment; all fields non-null, `duration > 0`
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 12.1 Write property test for heat map grid completeness
    - **Property 7: Heat Map Grid Completeness**
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 12.2 Write property test for heat map tooltip data completeness
    - **Property 8: Heat Map Tooltip Data Completeness**
    - **Validates: Requirements 3.3**

- [ ] 13. React UI — Dashboard and Heat Map views
  - Implement `src/renderer/pages/DashboardPage.tsx`: display daily summary, 7-day trend chart, classification breakdown, active calendar event name
  - Implement `src/renderer/pages/HeatMapPage.tsx`: render 96-cell time grid, color cells green/yellow/red per classification, show tooltip on cell click, support day navigation
  - Implement color blind mode: replace green/yellow/red with alternative palette + distinct icon patterns (both color AND icon present, never color alone)
  - Wire IPC calls to `DashboardService` and `HeatMapService` in main process
  - _Requirements: 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 8.3_

  - [ ]* 13.1 Write property test for color blind mode indicator distinctness
    - **Property 9: Color Blind Mode Indicator Distinctness**
    - **Validates: Requirements 3.5, 10.3**

- [ ] 14. React UI — Task Manager view
  - Implement `src/renderer/pages/TasksPage.tsx`: task list with create/edit/delete/reorder, priority selector, due date picker
  - Display XP total, earned badges with notification on new badge award
  - Implement leaderboard panel (visible only when user has opted into peer comparison)
  - Wire IPC calls to `TaskManagerService`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 15. Settings and accessibility
  - Implement `src/renderer/pages/SettingsPage.tsx` with controls for: language (≥5 options, default English), dark mode, color blind mode, reduced motion, Ghost Bar enable/disable + corner position, Calendar Sync authorize/revoke, data deletion
  - Implement dark mode: apply dark CSS theme to all surfaces within 500 ms, no restart required
  - Implement reduced motion: disable all non-essential animations app-wide when enabled
  - Implement keyboard navigation for all primary actions (no pointer device required)
  - Implement data deletion: remove all Local Store rows within 10 seconds on user confirmation
  - _Requirements: 9.4, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 15.1 Write unit tests for accessibility settings
    - Example test: dark mode theme switch latency ≤500 ms (Requirement 10.2)
    - Example test: reduced motion flag disables animations (Requirement 10.4)

- [ ] 16. Wire all subsystems together in main process
  - Implement `src/main/index.ts`: initialize Local Store → Network Guard → Event Bus → Activity Tracker → Classifier → Prediction Engine → Productivity Ghost → Task Manager Service → Calendar Sync → Dashboard Service
  - Subscribe Classifier to `activity.tick` events; on segment flush, write to Local Store and emit `store.updated`
  - Subscribe Prediction Engine to `activity.tick`; on `intervention.trigger`, send IPC notification to renderer with `patternDescription` as substring of notification text
  - Subscribe Dashboard to `store.updated`; push refresh to renderer within 5 seconds
  - Implement `PRAGMA integrity_check` on startup; prompt user to restore or start fresh on failure
  - _Requirements: 1.1, 2.1, 5.2, 5.3, 6.5_

- [ ] 17. Smoke tests and integration tests
  - Write smoke test: verify SQLCipher AES-256 is active (database file not readable as plaintext)
  - Write smoke test: verify ≥5 languages available in settings
  - Write smoke test: verify no outbound network calls during a full tracked session without Calendar Sync
  - Write smoke test: verify `PRAGMA integrity_check` passes on a freshly created Local Store
  - Write end-to-end integration test: tracker → classifier → store → dashboard query, verifying data flows correctly through all components
  - _Requirements: 9.1, 9.2, 10.1_

- [ ] 18. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per run
- Each property test file includes a comment: `// Feature: snapback-productivity-suite, Property N: <Title>`
- All data access and background processing run in the Electron main process; the renderer only displays data received via IPC
