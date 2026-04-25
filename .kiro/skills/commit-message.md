---
inclusion: manual
---

# Commit Message Skill

When asked to write or review a commit message, follow these rules:

## Format
```
<type>(<scope>): <short summary>

<optional body>
```

## Types
- `feat` — new feature or capability
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests only
- `docs` — documentation changes only
- `chore` — build, config, tooling, or dependency changes
- `perf` — performance improvement
- `security` — security-related change

## Scopes (match subsystem folders)
- `store`, `tracker`, `classifier`, `prediction`, `tasks`, `calendar`, `network`, `renderer`
- Use `app` for cross-cutting changes or `index.ts` / Electron bootstrap changes
- Use `schema` for `schema.sql` or migration changes

## Rules
1. Summary line ≤ 72 characters, imperative mood ("add", not "added" or "adds")
2. Do not end the summary with a period
3. Reference requirement IDs when relevant (e.g. `Req 9.2`)
4. Reference property test numbers when the commit adds or modifies them (e.g. `Property 22`)
5. Body is optional — use it for non-obvious "why" context, not restating the diff
6. One logical change per commit; if the diff touches multiple subsystems for different reasons, suggest splitting

## Examples
```
feat(classifier): add media app category detection

Adds spotify, vlc, youtube, netflix to the media pattern list.
Req 2.3
```

```
fix(store): delete xp_events before tasks to respect FK constraint
```

```
test(network): add Property 22 blocked-endpoint property test
```
