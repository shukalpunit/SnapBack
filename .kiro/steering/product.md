# SnapBack Productivity Suite

SnapBack is a local-first, privacy-focused desktop productivity app built with Electron. It tracks foreground application usage, classifies time segments (deep work, shallow work, distraction loops), predicts productivity patterns via local ML, and gamifies task completion with XP and badges.

All user data stays on-device in an encrypted SQLite database. The only permitted external connection is Google Calendar (via OAuth), enforced by a NetworkGuard allowlist.

## Subsystems

- **Activity Tracker**: Polls the active OS window at configurable intervals, detects idle state, buffers ticks
- **Classifier**: Labels time segments using behavioral heuristics (duration, input signals, visit frequency)
- **Prediction Engine**: Detects pre-distraction patterns from a rolling feature vector; rule-based now, TF.js planned
- **Task Manager**: CRUD tasks with XP rewards (priority-based), deep-work multiplier, and badge progression
- **Calendar Sync**: Google Calendar integration via OAuth; tokens stored in OS keychain (keytar), events cached in SQLite
- **Network Guard**: Allowlist-based outbound connection filter; monkey-patches Node http/https modules
- **Local Store**: SQLite persistence layer (better-sqlite3, SQLCipher-ready for at-rest AES-256 encryption)

## Privacy Principles

- No telemetry, no cloud sync (except opt-in Google Calendar)
- Encryption key derived from machine UUID + user SID via PBKDF2
- `deleteAllData()` wipes every table in a single transaction
- NetworkGuard blocks all outbound connections not on the allowlist
