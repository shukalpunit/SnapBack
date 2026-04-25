# Project Structure

```
src/
├── main/                    # Electron main process (CommonJS output)
│   ├── index.ts             # Electron bootstrap (BrowserWindow, app lifecycle)
│   ├── types.ts             # Shared interfaces — all subsystems import from here
│   ├── store/
│   │   ├── LocalStore.ts    # SQLite persistence (better-sqlite3)
│   │   ├── schema.sql       # DDL for all tables
│   │   └── LocalStore.test.ts
│   ├── tracker/             # ActivityTracker — OS window polling, idle detection
│   ├── classifier/          # Classifier — segment labeling heuristics
│   ├── prediction/          # PredictionEngine — pattern detection
│   ├── tasks/               # TaskManagerService — CRUD, XP, badges
│   ├── calendar/            # CalendarSync — Google Calendar OAuth
│   └── network/             # NetworkGuard — outbound connection allowlist
└── renderer/                # Electron renderer process (Vite + React)
    ├── index.html
    ├── main.tsx             # React root mount
    └── App.tsx              # Root component
```

## Conventions

- One subsystem per folder under `src/main/`
- Each subsystem has an interface in `src/main/types.ts` (e.g. `IClassifier`, `ILocalStore`)
- Implementation class in `SubsystemName.ts`, tests in `SubsystemName.test.ts` (co-located)
- Constructor injection for dependencies (especially `ILocalStore`)
- All subsystems accept an `ILocalStore` for persistence and audit logging
- `randomUUID()` from `node:crypto` for ID generation
- Errors in external APIs are caught, logged to `audit_log`, and swallowed (never crash the app)
- SQLite operations wrapped in `this.db.transaction(() => { ... })()`
- Row mappers convert snake_case DB columns to camelCase TypeScript interfaces
- Test files use `describe`/`it` from vitest with `fast-check` property tests grouped by Property number, followed by unit tests
- In-memory SQLite (`:memory:`) for all tests — no filesystem side effects
- Injectable dependencies for OS-level APIs (e.g. `ActiveWindowProvider`, `KeychainProvider`) to enable testing without real OS calls
