# Architecture Selection: snapback-productivity-suite

## Recommended Architecture: Candidate A — Layered Pipeline with EventBus

### Rationale
Candidate A achieves the lowest information flow density (0.127 vs 0.145–0.167) and zero synchronous cycles, while mapping component names 1:1 to the requirements vocabulary — every component name appears directly in the requirements glossary. The EventBus naturally handles the Electron main/renderer IPC boundary without an additional translation layer. The trade-off is a slightly higher evolvability cost (1.5 avg components changed per new REQ) compared to Candidate C's event-driven projector model (1.0), but this is acceptable given the bounded scope and the direct alignment with the existing design.

### Components

| Component | Owned State | Responsibility |
|---|---|---|
| ActivityTracker | rawSegment buffer (in-memory) | OS polling via `active-win`, idle detection, tick emission onto EventBus |
| Classifier | appCategory heuristic rules | Accumulates ticks into segments; applies distraction loop → deep work → shallow work rules; writes ClassifiedSegments to LocalStore |
| PredictionEngine | featureVector, predictionModel blob, patternThresholds | Local TF.js inference; emits intervention triggers when confidence ≥ threshold; manages per-pattern threshold arithmetic |
| ProductivityGhost | (reads paceRecord from LocalStore) | Computes current vs best pace; drives Ghost Bar overlay visibility and state |
| TaskManagerService | (reads/writes tasks, xpEvents, badges via LocalStore) | Task CRUD, XP award with deep-work multiplier, idempotent badge detection |
| CalendarSync | oauthToken (OS keychain only) | Google Calendar OAuth 2.0 fetch; caches events in LocalStore; revocation within 30s |
| DashboardService | (reads segments, calendarEvents from LocalStore) | Aggregation queries, 7-day trend, weekly report generation, PDF export |
| HeatMapService | (reads segments from LocalStore) | Produces exactly 96 cells/day; dominant-classification per 15-min block |
| NetworkGuard | networkAllowlist | Wraps all outbound Node.js http/https; blocks non-allowlisted endpoints; writes audit log entries |
| LocalStore | ALL persisted state | AES-256 SQLCipher SQLite; PBKDF2 key derivation; single persistence boundary for all subsystems |
| EventBus | in-flight events | Node.js EventEmitter; decouples ActivityTracker → Classifier → PredictionEngine hot path |

### Information Flow

| From \ To | ActivityTracker | Classifier | PredictionEngine | ProductivityGhost | TaskManagerService | CalendarSync | DashboardService | HeatMapService | NetworkGuard | LocalStore | EventBus | UI |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ActivityTracker | | | | | | | | | | | → tick | |
| EventBus | | → segment | → tick | | | | | | | | | → intervention |
| Classifier | | | | | | | | | | → write | | |
| PredictionEngine | | | | | | | | | | → threshold | → trigger | |
| ProductivityGhost | | | | | | | | | | ← pace | | → ghost state |
| TaskManagerService | | | | | | | | | | ↔ CRUD | | ↔ IPC |
| CalendarSync | | | | | | | | | → auth | → events | | |
| DashboardService | | | | | | | | | | ← query | | → metrics |
| HeatMapService | | | | | | | | | | ← query | | → cells |
| NetworkGuard | | | | | | | | | | → audit | | |
| LocalStore | | | | | | | | | | | | ← query |
| UI | | | | | | | ← request | ← request | | | | |

### Requirement Allocation

| Requirement | Component(s) |
|---|---|
| REQ-1: App & Tool Time Tracking | ActivityTracker, LocalStore |
| REQ-2: Behavioral Classification | Classifier, LocalStore |
| REQ-3: Productivity Heat Maps | HeatMapService, UI |
| REQ-4: Productivity Ghost | ProductivityGhost, LocalStore, UI |
| REQ-5: Predictive Intervention Engine | PredictionEngine, EventBus, UI |
| REQ-6: Dashboard & Weekly Reports | DashboardService, LocalStore, UI |
| REQ-7: Gamified To-Do List | TaskManagerService, LocalStore, UI |
| REQ-8: Google Calendar Integration | CalendarSync, NetworkGuard, LocalStore |
| REQ-9: Local-First Data Privacy | NetworkGuard, LocalStore |
| REQ-10: Accessibility | UI (settings), all components (flag propagation) |

### Key Design-Induced Invariants

These invariants arise from the architecture's partitioning decisions, not directly from requirements:

1. **EventBus is the only inter-component communication channel** — no component holds a direct reference to another component (except LocalStore). This means adding a new subscriber never requires modifying the publisher.
2. **LocalStore is the only persistence boundary** — no component caches state to disk independently. This structurally enforces REQ-9 (privacy): auditing one component is sufficient to verify no data leaks.
3. **NetworkGuard wraps all outbound I/O** — CalendarSync never calls `https` directly; it always goes through NetworkGuard. This makes the allowlist the single enforcement point for I-12.
4. **Renderer process is display-only** — all business logic, classification, and ML inference run in the Electron main process. The renderer receives pre-computed data via IPC and cannot directly query LocalStore.
5. **oauthToken lives exclusively in the OS keychain** — CalendarSync is the only component that touches it, and it never passes the token to LocalStore or EventBus.

### Alternatives Considered

| Candidate | Strength | Weakness | Why Not Selected |
|---|---|---|---|
| B: Use-Case-Oriented (CQRS) | Cleanest read/write separation; PrivacyEnforcer centralizes all privacy invariants | Highest flow density (0.167); evolvability cost 2.0 (QueryService must be updated for every new read path) | Higher coupling on the read path; QueryService becomes a bottleneck as features grow |
| C: Event-Driven Projectors | Best evolvability (1.0); most explicit persistence boundary naming; fully auditable event log | Higher flow density than A (0.145); introduces Projector/DomainEventBus/UIEventBridge naming overhead; more indirection for a bounded-scope app | Marginal metric wins don't justify the added cognitive load for this scope; Candidate A already uses EventBus for the hot path |

### Metrics Summary

| Metric | Candidate A (Selected) | Candidate B | Candidate C |
|---|---|---|---|
| Cross-cutting reqs % | 100% (all REQs touch ≥2 components — unavoidable) | 100% | 100% |
| Cross-cutting invariants % | 28% (5/18) | 28% (5/18) | 28% (5/18) |
| Flow density | **0.127** | 0.167 | 0.145 |
| God object score | 100% LocalStore (intentional privacy boundary) | 100% LocalStore | 100% PersistenceGateway |
| Sync cycles | **0** | **0** | **0** |
| Max fan-in | 7 (LocalStore) | 5 (LocalStore) | 6 (PersistenceGateway) |
| Max fan-out | 4 (EventBus) | 3 (PrivacyEnforcer) | 6 (DomainEventBus) |
| Evolvability cost | 1.5 avg components/new REQ | 2.0 | **1.0** |
