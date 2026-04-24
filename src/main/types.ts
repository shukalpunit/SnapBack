// Shared TypeScript interfaces for SnapBack Productivity Suite

// ─── Activity Tracker ────────────────────────────────────────────────────────

export interface ActivityTick {
  timestamp: number;       // Unix ms
  appName: string;
  windowTitle: string;
  isIdle: boolean;
}

export interface ActivityTrackerConfig {
  pollIntervalMs: number;  // ≤ 5000
  idleThresholdMs: number; // default 120_000 (2 min)
}

export interface IActivityTracker {
  start(): void;
  stop(): void;
  onTick(handler: (tick: ActivityTick) => void): void;
}

// ─── Classifier ──────────────────────────────────────────────────────────────

export type Classification = 'deep_work' | 'shallow_work' | 'distraction_loop';

export type AppCategory =
  | 'ide'
  | 'browser'
  | 'email'
  | 'communication'
  | 'document'
  | 'media'
  | 'other';

export interface InputSignalSummary {
  keystrokeCount: number;
  mouseClickCount: number;
  scrollEventCount: number;
}

export interface RawSegment {
  appName: string;
  windowTitle: string;
  startTime: number;
  endTime: number;
  tickCount: number;
  inputSignals: InputSignalSummary;
}

export interface ClassifiedSegment extends RawSegment {
  id: string;
  classification: Classification;
  isManualOverride: boolean;
  appCategory: AppCategory;
}

export interface IClassifier {
  ingest(tick: ActivityTick): void;
  flush(): ClassifiedSegment | null;
  overrideClassification(segmentId: string, classification: Classification): void;
}

// ─── Prediction Engine ───────────────────────────────────────────────────────

export interface BehavioralFeatureVector {
  recentAppSwitchRate: number;
  currentSessionDeepWorkRatio: number;
  timeOfDay: number;
  dayOfWeek: number;
  consecutiveShallowMinutes: number;
  lastDistractionLoopMinutesAgo: number;
  currentAppCategory: number;
}

export interface PredictionResult {
  confidence: number;
  patternDescription: string;
  suggestedAction: string;
}

export interface IPredictionEngine {
  ingestTick(tick: ActivityTick, classification: Classification): void;
  predict(): PredictionResult | null;
  recordFeedback(accepted: boolean, patternKey: string): void;
  rebuildFromStore(): Promise<void>;
  isReady(): boolean;
}

// ─── Productivity Ghost ──────────────────────────────────────────────────────

export interface PaceRecord {
  activityKey: string;
  bestPaceScore: number;
  sessionCount: number;
  lastUpdated: number;
}

export interface GhostBarState {
  visible: boolean;
  bestPaceScore: number;
  currentPaceScore: number;
  activityKey: string;
}

export interface IProductivityGhost {
  getGhostBarState(activityKey: string): GhostBarState;
  updateBestPace(activityKey: string, sessionPaceScore: number): void;
}

// ─── Task Manager ────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  dueDate?: number;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  completedAt?: number;
  completedDuringDeepWork: boolean;
  xpAwarded: number;
  order: number;
}

export interface XPEvent {
  id: string;
  taskId: string;
  xpAmount: number;
  timestamp: number;
  multiplierApplied: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  xpThreshold: number;
  awardedAt?: number;
}

export interface ITaskManagerService {
  createTask(task: Omit<Task, 'id' | 'xpAwarded' | 'order'>): Task;
  updateTask(id: string, updates: Partial<Task>): Task;
  deleteTask(id: string): void;
  reorderTasks(orderedIds: string[]): void;
  completeTask(id: string, duringDeepWork: boolean): XPEvent;
  getTotalXP(): number;
  getBadges(): Badge[];
}

// ─── Calendar Sync ───────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  calendarId: string;
  syncedAt: number;
}

export interface ICalendarSync {
  authorize(): Promise<void>;
  fetchEvents(fromDate: Date, toDate: Date): Promise<CalendarEvent[]>;
  revokeAuthorization(): Promise<void>;
  getActiveEvent(timestamp: number): CalendarEvent | null;
}

// ─── Local Store ─────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: string;
  detail?: string;
}

export interface ILocalStore {
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

  // Data deletion
  deleteAllData(): void;
}
