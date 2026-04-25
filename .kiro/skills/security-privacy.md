---
inclusion: fileMatch
fileMatchPattern: "src/main/**/*.ts"
---

# Security & Privacy Audit Skill

SnapBack is a local-first, privacy-focused app. All code in `src/main/` must uphold these invariants.

## Network Isolation
- The ONLY permitted outbound connection is Google Calendar via `www.googleapis.com/calendar/`
- Any new `http`, `https`, `fetch`, or `net` usage must go through NetworkGuard
- Never import or use `node-fetch`, `axios`, or similar HTTP clients directly
- If a new external endpoint is needed, it must be added to the NetworkGuard allowlist and documented

## Data Residency
- All user data must stay in the local SQLite database — never transmit activity data, segments, tasks, or XP externally
- Never log PII (window titles, app names) to console in production; audit_log in the DB is the only acceptable destination
- `console.log` / `console.error` must not contain user activity data

## Secrets Management
- OAuth tokens must be stored via `keytar` (OS keychain), never in plaintext files or the SQLite DB
- The SQLCipher encryption key is derived from device-specific secrets (machine UUID + user SID) — never hardcode or log it
- Never commit `.env` files, API keys, or client secrets

## Audit Logging
- Security-relevant events (blocked connections, auth failures, data deletion) must produce an `audit_log` entry
- Audit log entries use `randomUUID()` for IDs and `Date.now()` for timestamps
- Audit log is append-only — never delete or update audit entries (except via `deleteAllData`)

## Error Handling
- External API failures must be caught, logged to audit_log, and swallowed — never crash the app
- Never expose stack traces or internal error details to the renderer process

## Review Checklist
When reviewing or writing code in `src/main/`, verify:
- [ ] No new outbound network calls bypass NetworkGuard
- [ ] No user activity data is logged to console
- [ ] Secrets use keytar, not plaintext storage
- [ ] Security events produce audit_log entries
- [ ] Errors from external APIs are caught and don't crash the process
