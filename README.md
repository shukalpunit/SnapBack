# SnapBack

**A Local-First Productivity Suite That Predicts Your Focus Failures Before They Happen**

SnapBack is an all-in-one productivity tool that helps students and professionals understand where their time actually goes, then helps them take control of it. All data stays on your machine. Nothing leaves your system. Ever.

## The Problem

People consistently misjudge how productive they are. Eight hours at a computer feels like eight hours of work. It's not. The tools that exist today give you a useless screen time number (Digital Wellbeing). Nobody has built a tool that treats you as the owner of your own data AND gives you the intelligence to actually change.

## The Solution

SnapBack watches how you work (not what you type) and classifies every minute into three buckets:

- **Deep Work** — sustained, focused effort on a single task
- **Shallow Work** — necessary but low-impact activities
- **Distraction Loops** — repeated, no-action visits that masquerade as productivity

That Gmail tab you refreshed 11 times with no action? Distraction loop, not work. Slack checked 14 times in an hour? That's avoidance, not collaboration.

End of day, you get one honest number. Out of 8 hours at your computer, only 3.5 were real work. That gap between perceived effort and actual output is the thing nobody wants to see but everybody needs to see.

Then SnapBack goes further. It learns your patterns locally. It knows you lose focus at 2pm on Tuesdays. It sees the crash coming before you do. And it intervenes before the spiral, not after.

The AI is the scaffolding. You're still the one who has to do the work.

## Core Features

### App and Tool Time Audit
Tracks time spent across tools like Slack, Gmail, and IDEs, then visualizes it so users can spot invisible time sinks.

### Productivity Heat Maps
Color-coded visuals showing where time flows each day:
- 🟢 Green = Deep Work
- 🟡 Yellow = Shallow Work
- 🔴 Red = Distraction Loops

### Predictive Coaching
Powered by a local Gemma 4B model running entirely on your machine. No API calls. No cloud inference. Your behavioral data never touches a server. SnapBack anticipates when you're about to lose focus and intervenes in real time with personalized, data-driven nudges.

### Gamified To-Do List
Task management with XP, badges, and progression to keep users engaged with their own improvement.

### Weekly Productivity Reports
PDF-generated summaries of behavioral trends, focus patterns, and actionable insights.

### Google Calendar Integration
Syncs with your calendar to contextualize focus data alongside scheduled commitments.

### 100% Local and Private
Every byte of data stays on your machine. Period.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 29 (main + renderer processes) |
| Language | TypeScript 5.3 (strict mode) |
| Frontend | React 18 |
| ML/Prediction | TensorFlow.js, Gemma 4B (local inference) |
| Database | better-sqlite3 (SQLCipher planned for production encryption) |
| Window Detection | active-win (OS-level foreground detection) |
| Auth | keytar (OS keychain for OAuth tokens) |
| Reports | pdfkit (PDF generation) |
| Testing | Vitest 1.3, fast-check (property-based testing) |
| Build System | Vite 5 (renderer), tsc (main process) |

## Accessibility

SnapBack is accessible from day one:

- **Languages**: English, Spanish, Mandarin, Hindi
- **Dark Mode**
- **Color Blind Mode**
- **Reduced Motion**

## Architecture

SnapBack runs as an Electron application with two TypeScript configurations:

- `tsconfig.json` — Renderer process (ESNext modules, bundler resolution, JSX)
- `tsconfig.main.json` — Main process (CommonJS, Node resolution)
- `tsconfig.test.json` — Test environment (Vitest globals, Node types)

Every subsystem implements an `I*` interface from `types.ts`, enforcing consistent contracts across the codebase.

### Local-First Design

- OS-level foreground window detection via `active-win`
- All behavioral data stored in local SQLite
- Gemma 4B model runs on-device for pattern detection and prediction
- OAuth tokens stored in OS keychain via `keytar`
- Zero outbound data connections for user behavioral data

## Testing

- **Vitest 1.3** with `globals: true` in Node environment
- **Property-based testing** via `fast-check` for classification logic correctness across thousands of generated inputs
- **In-memory SQLite** (`:memory:`) for all tests — zero filesystem side effects
- Tests co-located: `Foo.test.ts` next to `Foo.ts`

## Development

### Prerequisites

- Node.js
- npm

### Commands

```bash
npm run dev          # Start Vite dev server + tsc watch
npm run build        # Production build (Vite + tsc)
npm run test         # Run all tests once
npm run test:watch   # Watch mode
```

## Built With Kiro

SnapBack was built at the ASU Kiro Hackathon using spec-driven development throughout the entire workflow.

### Kiro Features Used

- **Spec-Driven Development** — Requirements, architecture, and task breakdowns defined before writing code. Consistent interface contracts enforced across every subsystem through shared `types.ts`.
- **Agent Hooks** — Auto-generated time classification and timestamping logic, eliminating boilerplate and accelerating core feature development.
- **Steering Docs** — Kept three developers aligned on the same architecture throughout the build with zero conflicting implementations.

### Custom Kiro Skills Built

- **Security Audit Skill** — Flags accidental data leaks, checks NetworkGuard coverage, and validates that no outbound connections break the local-first promise.
- **Interface Consistency Skill** — Checks that new classes conform to their `I*` interface contracts and that `types.ts` stays in sync with implementations.
- **Commit Message Skill** — Enforces conventional commits across the multi-developer workflow.

## Hackathon Context

- **Event**: ASU Kiro Hackathon (April 2026)
- **Challenge Frame**: Education — The "Agency" Guardrail
- **Constraint**: The app must empower a learner to do something they couldn't do before, without doing it for them.
- **Team**: 3 members — Full Stack Developer, Data Science Engineer, CS/Business Major
- **Competing Signals**: Build, Collaboration, Impact, Story

## Roadmap

- SQLCipher encryption for production database
- Additional behavioral coaching features
- Expanded language support
- Enhanced prediction models with longer behavioral history analysis

## Team

Punit Shukal
Andrea Wang
Suhas Raghavendra