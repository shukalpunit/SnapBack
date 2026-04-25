# Tech Stack & Build

## Runtime
- Electron 29 (main + renderer processes)
- Node.js with ES2022 target

## Languages
- TypeScript 5.3 (strict mode everywhere)
- React 18 (renderer only, JSX via react-jsx)

## Key Dependencies
- `better-sqlite3` — synchronous SQLite (SQLCipher swap planned for production encryption)
- `active-win` — OS-level foreground window detection
- `keytar` — OS keychain for OAuth tokens
- `@tensorflow/tfjs-node` — prediction engine ML
- `pdfkit` — PDF report generation
- `fast-check` — property-based testing

## Build System
- Vite 5 for renderer (React dev server + bundling, root at `src/renderer`)
- TypeScript compiler (`tsc`) for main process (CommonJS output to `dist/main`)
- `concurrently` runs both in dev mode

## TypeScript Configs
- `tsconfig.json` — renderer (ESNext modules, bundler resolution, JSX)
- `tsconfig.main.json` — main process (CommonJS, node resolution)
- `tsconfig.test.json` — test environment (vitest globals, node types)

## Testing
- Vitest 1.3 with `globals: true`, node environment
- Property-based tests via `fast-check` for correctness properties
- Tests co-located: `Foo.test.ts` next to `Foo.ts`
- In-memory SQLite (`:memory:`) for all tests — no filesystem side effects

## Common Commands
```bash
npm run dev          # Start Vite dev server + tsc watch (run in terminal, not CI)
npm run build        # Production build (Vite + tsc)
npm run test         # Run all tests once (vitest --run)
npm run test:watch   # Watch mode (vitest)
```
