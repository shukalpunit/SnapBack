# Requirements Document

## Introduction

SnapBack is a local-first productivity suite for students and professionals that automatically tracks, classifies, and visualizes how time is spent across applications. Every minute is classified as deep work, shallow work, or a distraction loop based on behavioral analysis — not just app presence. The suite includes a predictive intervention engine that learns personal patterns locally and intervenes before distraction spirals occur, a "Productivity Ghost" that lets users race against their own best pace, gamified task management, heat map visualizations, and Google Calendar integration. All data remains on the user's machine at all times.

## Glossary

- **SnapBack**: The local-first productivity suite described in this document.
- **Activity_Tracker**: The background component that monitors active application usage and user behavior signals.
- **Classifier**: The component that categorizes each tracked time segment as deep work, shallow work, or a distraction loop.
- **Distraction_Loop**: A behavioral pattern of short, repeated, low-action visits to an application (e.g., checking Gmail every few minutes without composing or reading).
- **Deep_Work**: A sustained, focused engagement with a task that produces meaningful output (e.g., writing code, drafting a document).
- **Shallow_Work**: Task-related activity that is not cognitively demanding and does not require sustained focus (e.g., replying to a routine message).
- **Ghost_Bar**: A subtle UI overlay that displays the user's personal best pace for the current activity as a reference line.
- **Productivity_Ghost**: The feature that renders the Ghost_Bar and computes the user's historical best pace per activity.
- **Prediction_Engine**: The local ML component that learns personal behavioral patterns and predicts impending distraction spirals.
- **Intervention**: A personalized, context-aware notification or prompt triggered by the Prediction_Engine before a distraction spiral occurs.
- **Heat_Map**: A color-coded time visualization where green represents deep work, yellow represents shallow work, and red represents distraction loops.
- **Dashboard**: The main UI screen displaying productivity metrics, reports, and visualizations.
- **Task_Manager**: The gamified to-do list component with XP and badges.
- **Calendar_Sync**: The component responsible for reading and writing Google Calendar events.
- **Local_Store**: The encrypted, on-device data store that persists all user data.
- **Session**: A continuous period of computer usage bounded by login/wake and logout/sleep events.
- **XP**: Experience points awarded to users for completing tasks and maintaining focus streaks.
- **Badge**: A visual achievement awarded when a user meets a defined milestone.

---

## Requirements

### Requirement 1: Application and Tool Time Tracking

**User Story:** As a student or professional, I want SnapBack to automatically track the time I spend in each application, so that I can see exactly where my hours go without manual logging.

#### Acceptance Criteria

1. WHEN the user's computer session is active, THE Activity_Tracker SHALL record the foreground application name and window title at intervals no greater than 5 seconds.
2. WHEN the user switches the active application, THE Activity_Tracker SHALL record the switch event with a timestamp accurate to within 1 second.
3. THE Activity_Tracker SHALL track usage across all installed desktop applications without requiring per-app configuration.
4. WHEN the user's session is idle for more than 2 consecutive minutes, THE Activity_Tracker SHALL pause time accumulation for the current application until input resumes.
5. THE Local_Store SHALL persist all tracked activity data exclusively on the user's device and SHALL NOT transmit any activity data to external servers or services.
6. WHEN the user views the Dashboard, THE Dashboard SHALL display total time spent per application for the selected date range, sorted by duration descending.

---

### Requirement 2: Behavioral Classification of Time

**User Story:** As a user, I want every tracked minute automatically classified as deep work, shallow work, or a distraction loop based on how I actually behave in each app, so that I get an honest picture of my productive time.

#### Acceptance Criteria

1. WHEN a tracked time segment ends, THE Classifier SHALL assign it exactly one classification: deep work, shallow work, or distraction loop.
2. WHEN the Activity_Tracker records repeated visits to the same application within a 10-minute window where each visit is shorter than 90 seconds and no substantive action is detected, THE Classifier SHALL classify those visits as a distraction loop.
3. WHEN the Activity_Tracker records a continuous engagement with a single application exceeding 10 minutes with sustained input signals, THE Classifier SHALL classify that segment as deep work.
4. WHEN a time segment does not meet the criteria for deep work or distraction loop, THE Classifier SHALL classify it as shallow work.
5. THE Classifier SHALL apply per-application behavioral heuristics that account for the typical interaction patterns of that application category (e.g., email clients, IDEs, communication tools, browsers).
6. WHEN the user views the Dashboard, THE Dashboard SHALL display the total daily hours classified as deep work, shallow work, and distraction loops as a single summary number and as a proportional breakdown.
7. WHERE the user has enabled manual override, THE Classifier SHALL allow the user to reclassify any time segment, and THE Local_Store SHALL persist the override.

---

### Requirement 3: Productivity Heat Maps

**User Story:** As a user, I want a color-coded visual of my day showing when I was in deep work, shallow work, or distraction loops, so that I can identify patterns in my focus and distraction.

#### Acceptance Criteria

1. WHEN the user opens the Heat Map view, THE Heat_Map SHALL render a time-grid visualization of the current day where each cell represents a 15-minute block.
2. THE Heat_Map SHALL color each 15-minute block green when the dominant classification for that block is deep work, yellow when it is shallow work, and red when it is a distraction loop.
3. WHEN the user selects a specific block on the Heat_Map, THE Heat_Map SHALL display a tooltip showing the application name, classification, and duration for that block.
4. THE Heat_Map SHALL support navigation to any prior day within the data retention period.
5. WHERE the user has enabled color blind mode, THE Heat_Map SHALL replace the green/yellow/red color scheme with a perceptually distinct alternative palette that does not rely solely on hue to convey classification.

---

### Requirement 4: Productivity Ghost *(low priority — deferred to later development phase)*

**User Story:** As a user, I want to see a subtle indicator of my personal best pace for my current activity while I work, so that I can challenge myself to match or beat my own record.

#### Acceptance Criteria

1. WHEN the user is engaged in a tracked activity with an established historical best pace, THE Productivity_Ghost SHALL render the Ghost_Bar as a non-intrusive overlay in a configurable screen corner.
2. THE Ghost_Bar SHALL display a reference line representing the user's fastest-ever pace for the current activity type, derived exclusively from Local_Store data.
3. WHEN the user's current pace exceeds their historical best, THE Ghost_Bar SHALL update the stored best pace in the Local_Store at the end of the session.
4. WHEN the user has fewer than 3 historical sessions for a given activity, THE Productivity_Ghost SHALL suppress the Ghost_Bar for that activity until sufficient data exists.
5. WHERE the user has disabled the Ghost_Bar in settings, THE Productivity_Ghost SHALL not render the Ghost_Bar overlay.
6. WHERE the user has enabled reduced motion mode, THE Ghost_Bar SHALL display as a static indicator without animated transitions.

---

### Requirement 5: Predictive Intervention Engine

**User Story:** As a user, I want SnapBack to predict when I am about to enter a distraction spiral and intervene with a personalized prompt before it happens, so that I can course-correct before losing focus.

#### Acceptance Criteria

1. THE Prediction_Engine SHALL train and update its behavioral model exclusively using data in the Local_Store, without sending any data to external services.
2. WHEN the Prediction_Engine determines that the user's current behavioral signals match a learned pre-distraction pattern with a confidence score of 0.75 or greater, THE Prediction_Engine SHALL trigger an Intervention.
3. WHEN an Intervention is triggered, THE SnapBack SHALL display a personalized notification that references the specific pattern detected (e.g., "You usually open Reddit after a long Slack thread — want to take a 5-minute break instead?").
4. WHEN the user dismisses an Intervention, THE Prediction_Engine SHALL record the dismissal and adjust the confidence threshold for that pattern by 0.05 upward to reduce false positives.
5. WHEN the user accepts an Intervention, THE Prediction_Engine SHALL record the acceptance and reinforce the triggering pattern.
6. THE Prediction_Engine SHALL require a minimum of 5 days of tracked data before generating any Interventions.
7. IF the Prediction_Engine model file becomes corrupted or unreadable, THEN THE Prediction_Engine SHALL rebuild the model from raw Local_Store data and notify the user that retraining is in progress.

---

### Requirement 6: Tracking Dashboard and Weekly Reports

**User Story:** As a user, I want an accurate dashboard and weekly productivity report, so that I can review my performance trends over time and make informed adjustments.

#### Acceptance Criteria

1. WHEN the user opens the Dashboard, THE Dashboard SHALL display the current day's total tracked time, deep work hours, shallow work hours, and distraction loop hours.
2. THE Dashboard SHALL display a 7-day trend chart showing daily deep work hours for the past 7 days.
3. WHEN the user requests a weekly report, THE Dashboard SHALL generate a summary covering the 7 most recently completed days, including total hours tracked, classification breakdown percentages, top 5 applications by time, and the single most frequent distraction loop pattern.
4. WHEN the user exports a weekly report, THE Dashboard SHALL produce a PDF file saved to a user-specified local directory.
5. THE Dashboard SHALL refresh displayed metrics within 5 seconds of new activity data being written to the Local_Store.

---

### Requirement 7: Gamified To-Do List

**User Story:** As a user, I want a task management system with XP and badges, so that completing tasks feels rewarding and I stay motivated.

#### Acceptance Criteria

1. THE Task_Manager SHALL allow the user to create, edit, delete, and reorder tasks with a title, optional due date, and optional priority level.
2. WHEN the user marks a task as complete, THE Task_Manager SHALL award XP to the user's profile based on the task's priority level: 10 XP for low priority, 25 XP for medium priority, and 50 XP for high priority.
3. WHEN the user's cumulative XP crosses a defined Badge threshold, THE Task_Manager SHALL award the corresponding Badge and display a notification to the user.
4. WHEN the user completes tasks during a verified deep work session, THE Task_Manager SHALL apply a 1.5x XP multiplier to those tasks.
5. THE Task_Manager SHALL persist all task data and XP history in the Local_Store.

---

### Requirement 8: Google Calendar Integration

**User Story:** As a user, I want SnapBack to read my Google Calendar events, so that it can correlate my scheduled activities with my actual tracked time.

#### Acceptance Criteria

1. WHEN the user authorizes Google Calendar access, THE Calendar_Sync SHALL retrieve calendar events for the current and next 7 days using the Google Calendar API.
2. THE Calendar_Sync SHALL store retrieved calendar event data in the Local_Store and SHALL NOT retain Google API credentials beyond the current session token lifetime.
3. WHEN a Google Calendar event is active and the user is in a tracked session, THE Dashboard SHALL display the event name alongside the current activity classification.
4. WHEN the Calendar_Sync encounters an API error or network unavailability, THE Calendar_Sync SHALL display an error message to the user and continue operating with the most recently cached calendar data.
5. WHEN the user revokes Google Calendar authorization, THE Calendar_Sync SHALL delete all stored calendar data from the Local_Store within 30 seconds.

---

### Requirement 9: Local-First Data Privacy

**User Story:** As a user, I want absolute certainty that none of my productivity data ever leaves my machine, so that I can use SnapBack without privacy concerns.

#### Acceptance Criteria

1. THE Local_Store SHALL encrypt all persisted data at rest using AES-256 encryption with a key derived from the user's device credentials.
2. THE SnapBack SHALL NOT establish any outbound network connections except for Google Calendar API calls when the user has explicitly authorized Calendar_Sync.
3. WHEN the user initiates a data export, THE SnapBack SHALL write the exported file to a local directory specified by the user and SHALL NOT upload the file to any remote location.
4. THE SnapBack SHALL provide a data deletion feature that permanently removes all Local_Store data upon user confirmation, completing the deletion within 10 seconds.
5. IF SnapBack detects an attempted outbound connection to a non-authorized endpoint, THEN THE SnapBack SHALL block the connection and log the attempt to the Local_Store audit log.

---

### Requirement 10: Accessibility

**User Story:** As a user with accessibility needs, I want SnapBack to support multiple languages, dark mode, color blind mode, and reduced motion, so that I can use the application comfortably.

#### Acceptance Criteria

1. THE SnapBack SHALL support a minimum of 5 display languages selectable from the settings screen, with English as the default.
2. WHEN the user selects dark mode, THE SnapBack SHALL apply a dark color theme to all UI surfaces within 500 milliseconds without requiring an application restart.
3. WHERE the user has enabled color blind mode, THE SnapBack SHALL replace all classification color indicators with a combination of color and distinct iconographic patterns so that classification is distinguishable without relying on color alone.
4. WHERE the user has enabled reduced motion mode, THE SnapBack SHALL disable all non-essential animations and transitions throughout the application.
5. THE SnapBack SHALL support keyboard navigation for all primary user actions without requiring a pointing device.
