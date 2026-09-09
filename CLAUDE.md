# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Offline-first garage management & billing desktop app for Babu Awamir Auto Garage (Qatar), built as a Next.js App Router app wrapped in Electron. Full requirements are in `docs/prd.md`; the original setup walkthrough is in `docs/setup.md` (useful for *why* things are wired the way they are, but the checked-in code is the source of truth for *how*).

## Commands

```bash
npm run dev          # Next.js dev server + Electron window together (hot reload)
npm run dev:next      # Next.js dev server only (http://localhost:3000)
npm run dev:electron  # Electron only — waits for localhost:3000, then opens the window
npm run build          # next build
npm run start           # next start (production server)
npm run lint              # eslint
```

There is no test runner configured yet (no jest/vitest in `package.json`).

## Architecture

- **Next.js is both frontend and backend.** UI lives in `src/app/**/page.tsx`; business logic and DB access live in Route Handlers under `src/app/api/**/route.ts`. Electron is just a thin native window pointed at the Next.js server — it has no business logic of its own.
- **Electron shell** (`electron/main.js`, `electron/preload.js`): creates a `BrowserWindow` loading `http://localhost:3000` (both dev and current prod config — see the standalone-output TODO in `next.config.ts`). `contextIsolation` is on and `nodeIntegration` is off; anything the renderer needs from Node/Electron must be exposed explicitly via `contextBridge` in `preload.js` (currently empty/reserved).
- **Database** (`src/lib/db.ts`): a single `better-sqlite3` connection to `data/garage.db` (gitignored, created on first run), opened in WAL mode. Schema is bootstrapped with `CREATE TABLE IF NOT EXISTS` on module load — there is no separate migration system, so schema changes are made by editing the `db.exec(...)` block directly. This module is **server-only** (`better-sqlite3` is Node-only) — never import it from a Client Component, only from Route Handlers or Server Components.
- Path alias `@/*` maps to `src/*` (see `tsconfig.json`).
- Per the PRD, the local SQLite DB is the offline source of truth; a background sync to Neon Postgres is planned but not yet implemented — don't assume a Postgres/cloud client exists in the code yet.
- Current schema (in `src/lib/db.ts`) covers `users`, `customers`, `services`, `invoices`, `invoice_items`, `expenses` — cross-reference against `docs/prd.md` §3 when adding a module to check which tables/fields are still missing.
