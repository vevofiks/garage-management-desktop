# Implementation Plan

Feature-by-feature build plan for the core modules in `docs/prd.md` §3 (Customer, Service, Invoice, Expense, P&L, User Management). Each phase is a vertical slice — backend (SQLite schema + `src/app/api/**` route handlers) and frontend (`src/app/**` pages) for one module — meant to be built and manually verified in order before moving to the next.

**How to use this checklist:** every actionable unit of work is a `- [ ]` line. Whoever (Claude or another agent) completes an item ticks it to `- [x]` in this file as part of that same change — don't batch-tick at the end, and don't tick an item that isn't actually done/verified. Work phases top to bottom; later phases assume earlier ones are checked off.

**Why the order differs from the PRD's §3 listing:** the PRD lists modules as 3.1 Customer → 3.6 User Management, but role-based access ("only Admin sees Profit & Loss and Expense") and "who is doing this action" (e.g. attributing services/invoices to a logged-in user) depend on auth existing first. So Auth/User Management is built right after the shared foundation, then the rest follow the PRD's order: Customer → Service → Invoice → Expense → P&L.

Cloud sync (PRD §4) and Windows packaging (PRD §7 step 6–7) are **not** covered here — see [Not in this plan](#not-in-this-plan).

---

## Frontend Architecture: State & Data Consistency

Single rule: **server data only ever lives in TanStack Query's cache** — no component copies API data into local `useState`/context "just in case." That's what keeps, say, the customer list and a customer's detail page from showing two different versions of the same record.

- **Server state — TanStack Query (`@tanstack/react-query`).** Every `GET /api/**` call goes through a `useQuery`, every `POST`/`PATCH`/`DELETE` through a `useMutation`. A typed fetch wrapper (`src/lib/api-client.ts`) centralizes error handling against the `ok`/`badRequest`/etc. shapes from `src/lib/http.ts`.
- **Query keys — `src/lib/query-keys.ts`.** One key factory per entity (`customers`, `services`, `invoices`, `expenses`, `users`, `auth`, `reports`) so invalidation targets are typed and can't typo-drift between files.
- **Mutation → invalidation matrix** — the actual consistency mechanism. Every mutation below invalidates the listed query keys on success, so every open screen reflects the change on its next render instead of going stale:

  | Mutation | Invalidates |
  |---|---|
  | Create/edit customer | `customers.list`, `customers.detail(id)` |
  | Create/edit/delete service | `services.list`, `services.detail(id)`, `customers.detail(customer_id)` |
  | Generate invoice from service | `invoices.*`, `services.detail(service_id)`, `customers.detail(customer_id)` |
  | Update invoice items/payment | `invoices.detail(id)`, `invoices.list`, `reports.profitLoss` |
  | Create/edit/delete expense | `expenses.*`, `reports.profitLoss` |
  | Create/edit/delete user | `users.*`, and `auth.me` if it's the current user |
  | Login | `auth.me` |
  | Logout | clear the entire query cache (`queryClient.clear()`) — nothing from the previous session should be visible to the next login |

  Apply this matrix as each mutation is built in Phases 1–6 — it's referenced from each phase's Frontend checklist below rather than repeated per phase.
- **Form state — `react-hook-form` + `zod`.** Shared zod schemas in `src/lib/schemas/*.ts` are the single source of truth for validation: the same schema runs client-side (via shadcn's `Form` component + `@hookform/resolvers/zod`) for instant feedback, and server-side inside the route handler before touching SQLite — so client and server can never disagree about what's valid.
- **Auth/session state** is not a separate context — it's `useQuery(queryKeys.auth.me, ...)` via the `useAuth()` hook below, so "am I logged in / what's my role" always matches what the server actually thinks.
- **Ephemeral UI state** (modal open/closed, table filters, selected date range) stays local `useState` or URL search params — it never goes into React Query or a global store. Don't add Redux/Zustand/Context for this app: query cache + local state covers every case here, and a second state system would just be a second source of truth to keep in sync with the first.

---

## Phase 0 — Shared Foundation

Nothing user-facing; everything below depends on it, including the state/data architecture above.

### Backend
- [x] `src/lib/http.ts` — response helpers `ok(data)`, `badRequest(msg)`, `unauthorized()`, `forbidden()`, `notFound()`, each returning `Response.json(...)` with the right status
- [x] `src/lib/schemas/` — folder for shared zod schemas, one file per entity, added as each later phase needs them; imported by both route handlers and client forms
- [x] `src/lib/format.ts` — `formatCurrency` using `Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR' })`, plus a date formatter, shared by every module

### Dependencies
- [x] `npm install @tanstack/react-query`
- [x] `npm install -D @tanstack/react-query-devtools`
- [x] `npm install react-hook-form zod @hookform/resolvers`
- [x] `npx shadcn@latest init` — Tailwind v4 / CSS-variables theme; pulls in `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` automatically. **Correction found during execution:** the installed `shadcn` CLI (v4.19, "base-nova" preset) builds primitives on `@base-ui/react`, not Radix — a newer major version than the Radix-based one this plan assumed. Noted here rather than silently building against stale assumptions.

### shadcn/ui components
Add only what Phase 1–2 actually consume now; pull in the rest (`calendar`/`popover` for Phase 6's date range, etc.) when the phase that needs them starts, not speculatively:
- [x] `npx shadcn@latest add button input label table dialog dropdown-menu select badge card sonner skeleton` — **`form` dropped from this list**: this shadcn version has no bundled `Form`/`FormField` wrapper (`shadcn view form` returns a registry stub with no files — the react-hook-form-context component from the old shadcn major version doesn't exist here). Forms in later phases compose `react-hook-form`'s `useForm`/`Controller` directly with the `Label`/`Input`/`Select` primitives instead.

**Rule for every component added from Phase 1 onward:** don't shell out to `npx shadcn@latest add` anymore — go through the `shadcnio` MCP server registered in `.mcp.json` (project scope) instead, by asking the agent to "use shadcnio to install `<component-name>`". This searches/previews against the live shadcn.io registry and asks for approval before writing files, which is the safer default once the server is wired up. The `.mcp.json` entry needs `SHADCNIO_TOKEN` exported in your shell (shadcn.io Pro account → MCP token) and the server approved once via `claude mcp list`/`/mcp` inside a `claude` session — until then, `npx shadcn@latest add <name>` is the fallback.

### Frontend — data & state plumbing
- [x] `src/lib/api-client.ts` — typed fetch wrapper around every `/api/**` call
- [x] `src/lib/query-keys.ts` — key factory for `customers`, `services`, `invoices`, `expenses`, `users`, `auth`, `reports`
- [x] `src/app/providers.tsx` (client component) — mounts `QueryClientProvider` + shadcn `<Toaster />` (sonner) for mutation success/error feedback. Also wraps with `next-themes`'s `ThemeProvider` (pulled in by shadcn init as a dependency of the generated `sonner.tsx`, which reads the theme via `useTheme()`) — not in the original plan text but required for the Toaster component to work.
- [x] `src/hooks/use-auth.ts` — `useQuery(queryKeys.auth.me, ...)` wrapper, used by the nav shell and page-level role checks

### Frontend — shell
- [x] `src/app/layout.tsx` — app shell: sidebar/topbar nav (`src/components/app-shell.tsx`), wraps children in `providers.tsx`
- [x] Confirm Tailwind v4 (`postcss.config.mjs`, `src/app/globals.css`) + shadcn theme tokens render correctly with a throwaway styled element — fixed a bug found in the process: `shadcn init` wrote `--font-sans: var(--font-sans)` (circular/undefined) instead of pointing at the Next font loader's `--font-geist-sans` variable already set in `layout.tsx`; corrected in `globals.css`
- [x] Remove the leftover `create-next-app` boilerplate in `src/app/page.tsx`

### Verify
- [x] `npm run dev` builds and lints clean, nav shell renders — `tsc --noEmit` and `eslint` are clean on every file touched in this phase; `next dev`'s existing dev server compiled with no new errors and served the shell HTML (confirmed via `curl`). Note: `npm run lint` does report pre-existing errors in `src/app/db-inspector/**`, unrelated to this phase and not touched by it — worth a separate cleanup pass.
- [ ] React Query Devtools panel opens and shows an empty cache — **not verified**: the Chrome browser-automation tool wasn't connected in this environment, so this needs a human (or a session with browser access) to actually open the running Electron/dev window and look
- [ ] A shadcn `Button`/`Dialog` renders with correct theming — **not verified** for the same reason; `curl` confirms the markup and classes are present but not that it's visually correct

---

## Phase 1 — Authentication & User Management (PRD §3.6)

Foundational because every later module either records "who did this" or is gated by role.

### Schema (`src/lib/db.ts`)
- [x] Add `sessions` table: `token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP`
- [x] Decide and document `users.password` format: `scryptSalt:scryptHash` (Node's built-in `crypto.scrypt`, no new dependency)

### Backend
- [x] `src/lib/auth.ts` — `hashPassword`, `verifyPassword`
- [x] `src/lib/auth.ts` — `createSession(userId)`
- [x] `src/lib/auth.ts` — `getSessionUser()` (reads the `session` cookie via `await cookies()` from `next/headers` — async in this Next version)
- [x] `src/lib/auth.ts` — `requireUser()`, `requireRole('admin')`
- [x] Create `scripts/create-admin.js` — a standalone Node script to manually seed the first Admin account into the local SQLite database with hashed credentials.
- [x] `POST /api/auth/login` — verifies credentials, creates session row, sets `httpOnly`/`sameSite: 'lax'` cookie
- [x] `POST /api/auth/logout` — deletes session row, clears cookie
- [x] `GET /api/auth/me` — current user + role, or 401
- [x] `GET /api/users`, `POST /api/users` — admin only
- [x] `PATCH /api/users/[id]`, `DELETE /api/users/[id]` — admin only
- [x] `src/proxy.ts` — redirect unauthenticated requests to `/login` (except `/login`, static assets). **Critical bug found and fixed during the Phase 1/2 audit:** this was originally `middleware.ts` at the project root. Next.js **16** (this project's exact version) renamed the entire convention to `proxy.ts` — different required filename, different export name (`proxy` not `middleware`), and it must live next to `src/app` (i.e. `src/proxy.ts`), not the project root, since this project uses a `src/` layout. `middleware.ts` at the root was silently never invoked: confirmed with `curl` that every page, including `/customers`, served its full content to a request with no session cookie at all — the entire auth gate was a no-op. Moved to `src/proxy.ts` with the correct `proxy` export; re-verified with `curl` that `/`, `/customers`, etc. now correctly 307-redirect to `/login` when unauthenticated, and `/api/**` 401s instead of redirecting.
- [x] Retrofitted all Phase 1 routes onto `withErrorHandling`/`HttpError` (added to `src/lib/http.ts` while building Phase 2 — see its Backend section) instead of each repeating the same try/catch → `if (error.message === 'Unauthorized') ...` boilerplate

### Frontend
- [x] `/login` — username/password form
- [x] `/users` — admin-only account table (username, role, created date) with add/edit-role/deactivate actions
- [x] Nav shell shows logged-in username + logout button
- [x] Nav shell conditionally renders Expenses/P&L links only for `role === 'admin'`
- [x] Login/logout/user mutations invalidate query keys per the [Invalidation Matrix](#frontend-architecture-state--data-consistency)
- [x] **Bug found and fixed:** `/users` itself was missing from `NAV_ITEMS` in `app-shell.tsx` — the admin-only filter logic was already there (`["/expenses", "/users"].includes(...)`) but `/users` was never in the list it filtered, so no admin could reach the page from the nav at all. Added it back.
- [x] **Bug found and fixed:** the delete-user confirmation used the browser's native `confirm()` instead of a shadcn component — replaced with `AlertDialog` (added via `npx shadcn@latest add alert-dialog`, the `shadcnio` MCP server still isn't approved/connected — see Phase 0's fallback note)
- [x] **Bug found and fixed:** `/users` had no role guard of its own — a `staff` user hitting the URL directly got the full page shell (the `GET /api/users` call correctly 403'd, so no data leaked, but the UX was a broken admin page instead of being routed away). Added `useRequireRole('admin')` to `src/hooks/use-auth.ts` (reusable for `/expenses` and `/dashboard` in Phases 5–6) and wired it into `/users`, including gating the `useQuery` itself off (`enabled: isAllowed`) so a non-admin doesn't even fire the doomed request.

### Verify
- [x] Run `node scripts/create-admin.js` to create the initial admin user locally
- [x] App redirects unauthenticated requests to `/login` — confirmed via `curl` after the `proxy.ts` fix above (was failing before the fix)
- [x] Log in with the newly created admin → nav shows admin-only links — confirmed via `curl` login flow (`/api/auth/login` → cookie → `/api/auth/me` returns the admin)
- [x] Create a `staff` account via `/users`; confirm it does not see Expenses/P&L nav links — confirmed via API: staff's `/api/customers` POST succeeds, `/api/users` GET is 403
- [x] Confirm `staff` account gets 403 hitting Expenses/P&L API routes directly — confirmed for `/api/users` (Expenses itself doesn't exist until Phase 5); also confirmed the `/users` *page* now redirects a staff user client-side rather than just relying on the API 403

---

## Phase 2 — Customer Management (PRD §3.1)

Schema: `customers` table already covers name/phone/vehicle_number/vehicle_model — no schema changes needed, but two backend-wide fixes landed as part of this phase (see below).

### Backend-wide fixes made while building this phase
- [x] `src/lib/db.ts` — **enabled `PRAGMA foreign_keys = ON`**. SQLite ignores `REFERENCES` constraints unless this is set per-connection, and it was never set — every `REFERENCES` in the schema (customers ← services ← invoices, users ← sessions) was decorative only. Without it, "block delete if referenced" for this phase would have silently orphaned rows instead of failing. Confirmed via manual test: inserted a `services` row pointing at a customer, `DELETE /api/customers/[id]` correctly failed with `SQLITE_CONSTRAINT_FOREIGNKEY` until the service was removed.
- [x] `src/lib/db.ts` — added `ON DELETE CASCADE` to `sessions.user_id`, since enabling FK enforcement would otherwise make `DELETE /api/users/[id]` (Phase 1) fail with a foreign-key error the moment that user has an active session — cascading their session away on account deletion is the correct behavior, not a workaround.
- [x] `src/lib/db.ts` — added indexes: `customers(name|phone|vehicle_number)` for search, and `customer_id`/`service_id`/`invoice_id` FK columns on `services`/`invoices`/`invoice_items`/`sessions` so the customer-detail history lookups (and every later phase's joins back to a customer) stay fast as the tables grow.
- [x] `src/lib/http.ts` — added `HttpError`/`UnauthorizedError`/`ForbiddenError`/`NotFoundError`/`BadRequestError` + `withErrorHandling()` wrapper. Phase 1's routes each repeated the same `try { ... } catch (error: any) { if (error.message === 'Unauthorized') ...}` block; `requireUser`/`requireRole` (`src/lib/auth.ts`) now throw the typed errors and every route (Phase 1's, retrofitted, and every Phase 2 route below) just wraps its handler in `withErrorHandling` instead. New pattern for every route handler from here on.

### Backend
- [x] `GET /api/customers?q=` — search across name, phone, vehicle_number; capped at 200 rows (no pagination UI yet — this is a safety bound, not a feature)
- [x] `POST /api/customers` — create
- [x] `GET /api/customers/[id]` — record + services/invoices history. Implemented as the customer query plus **two separate** queries for services and invoices (each `LIMIT 50`), not one join — a customer can have many services *and* many invoices, so joining both in one query would multiply rows (an N×M cartesian product) instead of returning clean lists.
- [x] `PATCH /api/customers/[id]` — edit
- [x] `DELETE /api/customers/[id]` — blocked by the FK constraint fix above; the `SQLITE_CONSTRAINT_FOREIGNKEY` catch maps it to a clear 400 message instead of a raw SQLite error leaking to the client
- [x] `src/lib/schemas/customer.ts` — zod schema shared by the API routes and the frontend form, plus a `normalizeCustomerInput()` helper. **Bug found and fixed during testing:** the first version required `phone`/`vehicle_number`/`vehicle_model` to be *present* (even as `""`) — a request that simply omitted an optional field failed validation. `normalizeCustomerInput()` defaults omitted fields to `''` before parsing so the schema itself could stay a plain `z.string()` per field (needed for `zodResolver` + `useForm`'s type inference to agree — an earlier `.optional()`/`.transform()` version of the schema broke that inference with a real `tsc` error, not just a lint nit).

### Frontend
- [x] `/customers` — searchable table (debounced) + "Add Customer" button; `Skeleton` rows while loading instead of a spinner
- [x] `/customers/new` — create form
- [x] `/customers/[id]/edit` — edit form
- [x] `/customers/[id]` — detail view: contact info card, service history table, invoice history table, edit/delete actions (delete uses `AlertDialog`, matching the Phase 1 fix, not `confirm()`)
- [x] Customer mutations invalidate `queryKeys.customers.all` (not `customers.list()`/`customers.detail(id)` individually) — `.all` is a prefix of both, and TanStack Query's `invalidateQueries` matches by key-array **prefix**, so invalidating the parameterized `list(searchTerm)` key by itself would only match that one exact search term, not every other search a user might have cached
- [x] `src/app/customers/_components/customer-form.tsx` — the 4-field form shared by `/customers/new` and `/customers/[id]/edit` (real reuse, not premature abstraction — both pages need the identical fields)
- [x] **Bug found via the actual running Electron window** (this shadcn version's `Button` defaults to `nativeButton: true`): `<Button render={<Link .../>} />` — used to make an "Add Customer"/"Edit" button navigate as a real Next `<Link>` — logged a Base UI console error because the rendered element is an `<a>`, not a `<button>`. Fixed by adding `nativeButton={false}` on both call sites (`/customers` and `/customers/[id]`), per Base UI's own error message. Not something `tsc`/`curl` could have caught — only surfaced because someone was actually clicking around in the dev app while this was being built; worth remembering as a pattern for every future `Button`-as-`Link` composition.

### Verify
- [x] Create, search, edit, and delete a customer end to end — done via `curl` against the running dev server (logged in as a real admin created through `scripts/create-admin.js`): create → validation errors for bad phone/missing name → list → search match/no-match → get detail (empty history) → update → delete-blocked-by-history → delete-succeeds-after-history-cleared → 404s for a non-existent id on get/delete. All confirmed working.
- [x] Confirmed a `staff` user (not just admin) can create a customer — this module isn't role-gated per the PRD, unlike Expenses/P&L

---

## Phase 3 — Service Management (PRD §3.2)

### Schema (`src/lib/db.ts`)
- [x] Add `service_items` table, mirroring `invoice_items` so Phase 4 can copy rows straight across — with one addition beyond the original sketch: `service_id` REFERENCES `services(id)` **`ON DELETE CASCADE`**, not plain `REFERENCES`. Reasoning: `service_items` are owned by their service (they have no independent meaning), unlike `services` ← `customers`/`invoices` which must *block* deletion instead (independent audit records) — so the two relationships need opposite FK behavior, both now enforced by `PRAGMA foreign_keys = ON` (Phase 2).
- [x] Added `idx_service_items_service_id` alongside it, same reasoning as Phase 2's other FK indexes.

### Backend
- [x] `GET /api/services?customer_id=&status=` — list/filter, joined to `customers` for `customer_name` (avoids an N+1 lookup on the list page)
- [x] `POST /api/services` — create with `customer_id`, `notes`, `items[]`, written in one `db.transaction()` (service row + all item rows succeed or fail together). Checks the customer exists first and returns a clean `400 Customer not found` rather than surfacing a raw FK error.
- [x] `GET /api/services/[id]` — record + `customer_name` + items, plus a `has_invoice: boolean` computed from `EXISTS`-style lookup against `invoices` — Phase 4 doesn't exist yet, but the frontend's "Generate Invoice" control uses this now so it doesn't imply you can click it twice once Phase 4 lands.
- [x] `PATCH /api/services/[id]` — edits notes/status **and replaces the entire item set** (delete-all-then-reinsert, one transaction) rather than diffing individual rows — the edit form has no stable way to tell "this row is the same one, just edited" from "this is a new row" across a save, so replace-all is the simple, correct approach here.
- [x] `DELETE /api/services/[id]` — relies on the same FK-catch pattern as Phase 2's customer delete (`SQLITE_CONSTRAINT_FOREIGNKEY` → clean 400); `service_items` cascade away on their own, `invoices` (once Phase 4 exists) block it.
- [x] `src/lib/schemas/service.ts` — `serviceItemSchema`/`serviceSchema`/`updateServiceSchema` + `normalizeServiceInput()`/`normalizeUpdateServiceInput()`, same omitted-optional-field defaulting pattern as Phase 2's `normalizeCustomerInput()`. Amount/customer_id are plain `z.number()`, not `z.coerce.number()` — coercion reopens the same zodResolver input/output type mismatch documented in Phase 2, and isn't needed here since the client always supplies real numbers (`valueAsNumber: true` on the amount `<Input>`, `setValue()` with a real `number` for `customer_id`).

### Frontend
- [x] `/services` — table filterable by status (shadcn `Select`), links to customer, `Skeleton` loading rows
- [x] `/services/new` — `CustomerPicker` (search-as-you-type against `GET /api/customers?q=`, `src/app/services/_components/customer-picker.tsx` — no combobox/command component exists in this shadcn version, built from `Input` + a scrollable `Button variant="ghost"` result list instead of adding one), notes `Textarea` (new component: `npx shadcn@latest add textarea`, MCP still pending — see Phase 0's fallback note), repeatable part/labor line-item rows
- [x] `/services/[id]` — combined detail/edit page (not a separate `/edit` route, unlike Customers — status, notes, and items are all editable inline): status `Select` + `Badge`, `ServiceItemsField`, delete via `AlertDialog`, and a "Generate Invoice" button that's enabled once `status = completed` **and** `!has_invoice`, but its `onClick` is a placeholder toast ("part of Phase 4 — not built yet") since there's no invoice endpoint to call yet — the enablement logic is real and matches what Phase 4 will need, only the action itself is stubbed.
- [x] `src/app/services/_components/service-items-field.tsx` — the repeatable line-item editor, shared by `/services/new` and `/services/[id]` (both `ServiceFormData` and `UpdateServiceFormData` carry an identical `items` field). Generic over the caller's form-value type, narrowed internally to a fixed `{ items: ServiceItemFormData[] }` shape before touching `useFieldArray`/`register`/`setValue` — react-hook-form's `Path`/`ArrayPath`/`FieldArray` utility types don't resolve through an open generic parameter, and fighting them field-by-field with individual casts (tried first) was worse than one clear cast at the top explaining why.
- [x] Service mutations invalidate `queryKeys.services.all` and the affected customer's `queryKeys.customers.detail(customer_id)` (their service-history list on the customer detail page must reflect the change too), per the Invalidation Matrix

### Verify
- [x] Created a service with mixed part/labor line items against a real customer, via `curl` end-to-end: missing `customer_id` → 400, empty `items[]` → 400 ("Add at least one line item"), invalid `customer_id` → 400 ("Customer not found"), valid create → 201, list/filter by `status`/`customer_id`, get detail
- [x] Marked it completed via `PATCH` (status + full item replacement in one call) — confirmed the old item rows are gone and only the new set remains
- [x] Delete: succeeds and cascades its `service_items` cleanly (verified zero orphaned rows directly against the DB) when no invoice exists; manually inserted an `invoices` row pointing at a service to confirm delete is correctly **blocked** (`has_invoice: true` in the detail response, `DELETE` → 400) — then cleaned the test invoice back out
- [x] Confirmed a `staff` user can create/list services — this module isn't role-gated per the PRD, matching Customers
- [x] `tsc --noEmit` and `eslint` clean on every file in this phase; `/services`, `/services/new`, `/services/[id]` all compiled and served 200 through the live dev server (no new browser console errors in the dev log, unlike Phase 2's `nativeButton` catch — but still not visually confirmed by a human/browser tool)

---

## Phase 4 — Invoice & Billing (PRD §3.3)

**Deviation from the original plan, by explicit product direction:** Services and Invoices as two disconnected sections was flagged as a workflow "headache" — the requirement was to make **Billing the key, self-sufficient entry point**, with every relevant detail (customer, vehicle, service items, work status, payment) reachable and actionable from there, not split across two screens you have to bounce between. `/invoices/new` is the primary billing screen now (a customer can be billed directly, with no Service ever manually created first); Services still exists for staff who want to track in-progress job cards, but it's optional, not a gate. Two follow-up refinements landed after the initial build, folded in below rather than as a separate changelog: work status became independently trackable from the invoice page (needed `PATCH /api/services/[id]` to become a true partial update), and line items were simplified to drop the part/labor picker per-row (see Frontend).

Schema: existing `invoices`/`invoice_items` tables cover totals, payment status, and item types (`part`, `labor`, `discount`, `tax`) — no structural change there. One new table:
- [x] `predefined_services` (`id`, `name UNIQUE`, `created_at`) — a catalog of common jobs, seeded once with the 14 names requested (two spellings normalized — "Deferential"→"Differential", "Expnsn"→"Expansion" — since these print on customer-facing invoices). **Deliberately no price/price-range column**: real cost varies too much (vehicle, parts source) to fabricate a canonical number, and inventing one would just be wrong data sitting in a billing system. The line-item amount stays a manual per-line entry everywhere this catalog is used; add a price column later once real pricing data exists.
- [x] Decide + document invoice numbering: `invoices.id` formatted as `INV-{id}` — computed for display (list/detail/search), never stored

### Backend
- [x] `GET /api/predefined-services`, `POST /api/predefined-services` — any authenticated user (not admin-gated — this is operational catalog data, not financial config); `POST` is idempotent on a duplicate name (hands back the existing row) since it's a shared catalog every staff member's "add new service" affordance writes to
- [x] `POST /api/invoices` — body is a discriminated union on `mode`: `{ mode: 'from_service', service_id }` copies `service_items` into `invoice_items` as originally planned (rejects if the service already has an invoice, or has no items); `{ mode: 'direct', customer_id, items[] }` is the new self-sufficient path — bills a customer with no pre-existing service by transparently creating a backing `'completed'` service in the same transaction (part/labor items only — discount/tax have no home on a service), so customer history and future P&L (both of which join through `services`) stay consistent even though the user never sees that as a separate step
- [x] `GET /api/invoices?q=&from=&to=&customer_id=` — `q` matches customer name or a typed `INV-12`/`12`
- [x] `GET /api/invoices/[id]` — record + items + customer contact/vehicle info + the linked service's `id`/`notes`/`status`, all in one round trip — the whole point of "billing is the key" is that this page doesn't need a second call to `/api/customers/[id]` or `/api/services/[id]` to show the full picture
- [x] `PATCH /api/invoices/[id]` — `items` and/or `paid_amount`, independently optional (recording a payment shouldn't require resending every line item, and vice versa); `payment_status` is always re-derived server-side from total/paid, never trusted from the client, so the two can't drift
- [x] `src/lib/invoice-totals.ts` — `computeInvoiceTotal()` (parts+labor+tax minus discount, clamped at 0) and `derivePaymentStatus()`, shared by create/patch (and reused client-side in `InvoiceItemsField` for the live running total, so the UI's number can never disagree with what the server will compute) so the math can't drift between call sites
- [x] `src/lib/schemas/invoice.ts` — `invoiceItemSchema`/`createInvoiceSchema`/`updateInvoiceSchema`, plain (non-coerced) types per the established pattern
- [x] **Follow-up: `PATCH /api/services/[id]` (Phase 3) became a true partial update.** It originally required `notes`+`status`+`items` together (full replace). The invoice page's new "Work Status" control needed to flip just `status` without touching items — so `updateServiceSchema`'s three fields are now each independently `.optional()`, and the route builds its `UPDATE` dynamically from whichever fields are actually present (still parameterized, no string-built SQL values). `/services/[id]`'s own full edit form is unaffected — it always sends all three, so it still behaves exactly like a full replace.

### Frontend
- [x] `/invoices` — searchable/filterable (payment-status `Select`) table with status badges
- [x] `/invoices/new` — **the primary billing screen.** `CustomerPicker` (moved to `src/components/` — now shared by Services and Invoices, not Services-only), then either pick one of that customer's completed-but-unbilled services (shown as quick-pick rows, items previewed read-only before committing) or add items directly with no service involved at all. Widened to `max-w-4xl` (was `max-w-2xl`) — this screen now carries a lot more on it than a typical form.
- [x] `/invoices/[id]` — **the self-contained billing record**: customer + vehicle info, service notes if any, a **Work Status** control (separate from payment status, updates the linked service directly via the new partial-PATCH), editable items, payment recording with live total/paid/balance-due, Print button. Also widened to `max-w-4xl`.
- [x] `/invoices/[id]/print` — print-only layout (`print:hidden`/`print:p-0` etc. via Tailwind's print variant), bypassed out of `AppShell`'s sidebar/header (new `pathname?.endsWith("/print")` check in `app-shell.tsx`, placed after the auth gate so print pages stay authenticated, unlike `/db-inspector`'s earlier bypass which skips auth entirely)
- [x] `/services/[id]`'s "Generate Invoice" button is wired for real now (was a Phase 3 placeholder toast) — calls `POST /api/invoices` with `mode: 'from_service'` and redirects to the new invoice
- [x] **Line items simplified to "labor only" per follow-up request**: the per-row Part/Labor `Select` is gone from both `ServiceItemsField` and `InvoiceItemsField` — every regular row is billed as `'labor'` (a predefined-service pick already bundles any parts into one price, so splitting accounting was pure friction). `InvoiceItemsField` gained dedicated "Discount"/"Tax" buttons instead, each appending a row locked to that type with a plain text field (not the catalog) and a `Badge` label instead of an editable type control.
- [x] `src/components/predefined-service-select.tsx` — the description picker for a part/labor row: a `Select` over the shared catalog with an inline "add new" affordance (mirrors the "add new category" pattern sketched for Phase 5's expenses) that grows the catalog instead of falling back to free text. Used by both item editors.
- [x] `src/app/invoices/_components/invoice-items-field.tsx` — same generic-narrowing approach as Phase 3's `ServiceItemsField` (open `Path`/`ArrayPath`/`FieldArray` generics don't resolve through react-hook-form's utility types — see that file's comment).
- [x] Invoice mutations invalidate `queryKeys.invoices.all`/`.detail(id)`, plus `customers.detail(customer_id)` and `services.all`/`.detail(service_id)` where relevant (generating or editing an invoice changes what the customer/service detail pages show), per the Invalidation Matrix
- [x] **Bug found via the dev log, not by me clicking around:** Base UI logged *"A component is changing the uncontrolled value state of Select to be controlled"* for `PredefinedServiceSelect`. Cause: it passed `value={value || undefined}` — a freshly-appended item starts with `description: ""`, so the `Select` mounted *uncontrolled* (`undefined`) and then flipped to *controlled* the moment a service was picked. Fixed by always passing the raw string (`value={value}`, empty or not) so the controlled/uncontrolled decision Base UI makes on first render never changes across the component's lifetime.

### Electron print wiring
- [x] `electron/preload.js` — was an empty stub since Phase 0; now actually calls `contextBridge.exposeInMainWorld('electronAPI', { printInvoice: () => ipcRenderer.invoke('print-invoice') })`
- [x] `electron/main.js` — `ipcMain.handle('print-invoice', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.print({ silent: false, printBackground: true }))`
- [x] `/invoices/[id]/print`'s Print button calls `window.electronAPI?.printInvoice()`, falls back to `window.print()` outside Electron (`npm run dev:next` only)

### Verify
- [x] Generated an invoice from a completed service via `curl`: totals matched the service's items exactly; a second `from_service` call against the same service correctly 400'd ("already has an invoice"); a nonexistent `service_id` 400'd cleanly
- [x] Direct billing (no service): created a customer's invoice with labor + discount + tax in one call — `180 + 60 − 20 + 11 = 231`, confirmed the transparent backing service got only the two labor items (discount/tax correctly excluded), and the invoice's `has_invoice`/history views reflect it
- [x] Payment: recorded partial (100 of 231 → `partial`) then full (231 of 231 → `paid`) — `payment_status` re-derived correctly both times; a bodyless `PATCH` correctly 400'd ("Nothing to update")
- [x] Work status: `PATCH`'d `{ status: 'completed' }` alone against a service that had real notes/items — confirmed via a follow-up `GET` that notes and items were completely untouched, only `status`/`updated_at` changed
- [x] Items replace on an existing invoice: added a discount to an already-created invoice, confirmed `total_amount` recomputed correctly and the old item set was fully replaced, not appended to
- [x] Confirmed a `staff` user (not just admin) can view and create invoices — matches the Customers/Services precedent, and the client's explicit "Customers + Billing only" staff-portal direction now has a real Invoices section to point at
- [x] Predefined-services catalog: confirmed all 14 seeded names, added a new one, and confirmed adding the same name twice returns the existing row (200) instead of a `409`/constraint error
- [x] `tsc --noEmit` and `eslint` clean on every file touched. `/invoices`, `/invoices/new`, `/invoices/[id]`, `/invoices/[id]/print` all compiled and served 200 through the live dev server; the dev log's transient module/export-not-found errors during the edit itself (customer-picker's move, the service-schema refactor) had already resolved by the final compile — not present in the current tree
- [ ] Print preview's visual output (spacing, page breaks, whether the Electron print dialog actually opens) — **not verified**: no browser tool connected this session, same limitation noted for every prior phase's visual checks

---

## Phase 5 — Expense Management (PRD §3.4) — Admin only

### Schema (`src/lib/db.ts`)
- [x] Add `expense_categories` table: `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE`
- [x] Seed defaults once, only if table is empty: Parts Purchase, Rent, Utilities, Salaries
- [x] Change `expenses.category` → `expenses.category_id INTEGER NOT NULL REFERENCES expense_categories(id)`. **Migration note:** SQLite can't change a column's type/constraints in place, so an existing database (one with the old `category TEXT NOT NULL` column) is migrated by: deduplicating its distinct `category` strings into new `expense_categories` rows, then rebuilding the `expenses` table (create `expenses_new` with `category_id`, copy rows across via a join back to the new categories, drop the old table, rename) — same table-rebuild recipe Phase 4's `payment_method` CHECK-widening migration used, including the `PRAGMA foreign_keys = OFF/ON` toggle around it (can't change that pragma inside a transaction). Verified against both a fresh database and a simulated pre-migration one seeded with real rows across two categories — `PRAGMA foreign_key_check` came back empty and every row's amount/notes/date/category mapping was intact afterward.
- [x] `idx_expenses_category_id`/`idx_expenses_date` indexes added — the category-id index has to be created *after* the migration above (same reasoning as Phase 4's `idx_invoices_vehicle_id`: creating it in the main schema-bootstrap block would fail on a database that still has the old `category` column at that point in startup).

### Backend (all `requireRole('admin')`)
- [x] `GET /api/expense-categories`, `POST /api/expense-categories` — `POST` 400s on a duplicate name (admin-only config, low contention, unlike the predefined-services catalog's idempotent-on-duplicate behavior which exists because *every* staff member writes to that one)
- [x] `GET /api/expenses?from=&to=&category_id=` — joined to `expense_categories` for `category_name` (avoids an N+1 lookup on the list page); capped at 500 rows, same "safety bound, not a feature" reasoning as every other list route in this app
- [x] `POST /api/expenses` — validates the category exists first, clean `400 Category not found` instead of a raw FK error
- [x] `PATCH /api/expenses/[id]`, `DELETE /api/expenses/[id]` — `PATCH` is a true partial update (every field independently optional, same pattern as `PATCH /api/invoices/[id]`), builds its `UPDATE` from whichever fields are actually present
- [x] `src/lib/schemas/expense.ts` — `expenseCategorySchema`/`expenseSchema`/`updateExpenseSchema` + `normalizeExpenseInput()`, same omitted-optional-field-defaults-to-`''` pattern as every other schema in this folder; plain (non-coerced) types for the same zodResolver/useForm type-inference reason documented elsewhere in this file

### Frontend
- [x] `/expenses` (admin-guarded via `useRequireRole('admin')`, on top of `src/proxy.ts`'s login check) — table with date-range (native `<Input type="date">`, no calendar/date-range-picker component pulled in since Phase 6 is the first phase that actually needs one) + category filters, a "Clear filters" affordance, and a running total of the currently-filtered rows
- [x] Log/edit-expense `Dialog` (matches `/users`' Dialog-based form pattern, not a separate route) with category `Select` + inline "add new category" affordance — `src/components/expense-category-select.tsx`, mirroring `PredefinedServiceSelect`'s controlled-Select-from-first-render fix (Phase 4) but keyed by category **id** (a number) since expenses reference categories by id, not name
- [x] Delete via `AlertDialog`, matching every other module's delete confirmation in this app (never the native `confirm()`)
- [x] Expense mutations invalidate `queryKeys.expenses.all` per the [Invalidation Matrix](#frontend-architecture-state--data-consistency) — `.all` is a prefix of both `.list(filters)` and `.categories`, so one invalidation covers the filtered table and the category dropdown together
- [x] Nav: `/expenses` was already in `app-shell.tsx`'s `NAV_ITEMS` and already admin-only-filtered from an earlier phase's work — no nav changes needed for this phase

### Verify
- [x] Logged an expense in each of the four seeded categories via `curl`, plus one added through the "add new category" affordance — confirmed a duplicate category name 400s instead of silently duplicating
- [x] `PATCH` (amount-only) and `DELETE` both confirmed against a real row; a bodyless `PATCH` correctly 400'd ("Nothing to update"); date-range and `category_id` filters both confirmed narrowing the list correctly
- [x] Confirmed a `staff`-role user gets `403` on `GET /api/expenses` and `GET /api/expense-categories` directly (the real security boundary); `/expenses` itself 200s at the HTTP level for staff (same as `/users` in Phase 1 — the page shell loads, then `useRequireRole` redirects client-side once the auth query resolves, rather than the route handler blocking the page request)
- [x] `tsc --noEmit` and `eslint` clean on every file touched; `/expenses` compiled and served through the live dev server with no new console warnings

---

## Phase 6 — Admin Dashboard + Profit & Loss (PRD §3.5) — Admin only

**Deviation from the original plan, by explicit product direction:** the brief for this phase was rewritten mid-project to be a proper admin home screen — 4 stat cards (Sales/Expenses/Profit/Invoices), a prominent Create Invoice button, Recent Customers, Recent Invoices, and Quick Actions — rather than only a P&L report. That home dashboard now lives at `/` (replacing the Phase 0 placeholder card), and the original date-range P&L report (still needed, still admin-only) got its own page at `/profit-loss` instead of sharing `/dashboard`. **Services was in the original spec's sidebar list and quick actions, but that module doesn't exist anymore** (Phase 4 folded it entirely into Invoices) — dropped from both per explicit direction rather than resurrected; Invoices is the billing/service entry point already.

### Backend
- [x] `GET /api/reports/dashboard` — admin-only, one round trip for everything the home screen needs: this-month `sales` (`SUM(invoices.paid_amount)` where `date(created_at) >= <first of month>`), this-month `expenses` (`SUM(expenses.amount)` where `date >= <first of month>`), `profit` (`sales - expenses`), this-month `invoiceCount`, plus the 5 most recent customers and 5 most recent invoices (joined to `customers` for `customer_name`, avoiding an N+1 lookup). "This month" is a fixed, unconfigurable window on purpose — the brief asked for this screen to be "minimal and fast," and arbitrary ranges belong to the P&L page below, not duplicated here.
- [x] `GET /api/reports/profit-loss?from=&to=&groupBy=day|week|month` — aggregates `SUM(invoices.paid_amount)` as revenue and `SUM(expenses.amount)` as expenses, grouped by period (`strftime` with `%Y-%m-%d`/`%Y-W%W`/`%Y-%m`), merged into `{ period, revenue, expenses, net }[]` — invoices and expenses are grouped in two independent queries then merged by period key, so a period with one but not the other still gets a `0` on the missing side instead of being dropped
- [x] Revenue is labeled "collected" (`paid_amount`) throughout, not billed total, since PRD's "total revenue (from invoices)" is ambiguous and what the garage actually banked is the more useful number for both the dashboard and the P&L page

### Frontend
- [x] `/` (admin-only via `useRequireRole('admin')`, replacing the Phase 0 placeholder card) — 4 stat cards (Sales/Expenses/Profit/Invoices this month), and Recent Customers + Recent Invoices tables (5 rows each). **Follow-up, by explicit product direction:** the top-right "Create Invoice" button and the plain "Quick Actions" button row were both removed as boring/low-value — invoice creation is contextual instead: each Recent Customers row has an "Invoice" action that links to `/invoices/new?customerId={id}`, which now pre-selects that customer (fetches it and skips the picker) instead of requiring a search. Each Recent Invoices row got a "View" action, and both cards gained a small header-level "+ New …" link in place of the removed global buttons.
- [x] **Second follow-up, by explicit product direction:** the standalone Profit & Loss page/nav-item was replaced with a combined **`/analytics`** page (nav item "Analytics") — same date-range + day/week/month P&L reporting, but the hand-rolled CSS bar chart was replaced with a real chart from [evilcharts](https://evilcharts.com) (`npx shadcn@latest add @evilcharts/recharts-area-chart`, built on `recharts` — both added as real dependencies), rendered as a gradient area chart (`EvilAreaChart`, revenue vs. expenses over the selected range). The same page also carries the new Audit Logs section below (see next item) — "platform analytics" reads as one section covering both financial trend and account activity, not two disconnected pages.
- [x] **Audit log, new in this phase (not in the original PRD/plan) — added per explicit product direction.** `audit_logs` table (`user_id`, `username` — denormalized so the trail survives that user's account being deleted later, `action`, `description`, `created_at`); `src/lib/audit.ts`'s `logAudit(user, action, description)` is called from inside the route handler *after* the underlying operation succeeds. Wired into create+delete for the four entities where "who did this" matters most: invoices ("Created INV-12 for Jane Doe" / "Deleted INV-12"), customers, expenses (amount + category in the description), and users. `GET /api/audit-logs` (admin-only, latest 100) backs the Audit Logs card on `/analytics`, with a manual "Auto-refresh" toggle (`refetchInterval` on the query, off by default) rather than always polling.
- [x] `reports.profitLoss` query key includes `{from, to, groupBy}` (already present in `query-keys.ts` from the original plan) so changing the date range fetches fresh data instead of showing a stale cached range; added `reports.dashboard` and `auditLogs.all` alongside it
- [x] `app-shell.tsx` nav: "Analytics" (admin-only, same filter as Expenses/Users) in place of the earlier "Profit & Loss" entry; order is Dashboard, Invoices, Customers, Expenses, Analytics, Users. "Dashboard" (`/`) and its staff-redirect-to-`/customers` behavior already existed from Phase 0/1 — no change needed there, it now just points at a real page instead of the placeholder.

### Verify
- [x] `GET /api/reports/dashboard` against real data via `curl`: sales/expenses/profit/invoiceCount matched a manual sum of the underlying rows, recent lists correctly capped at 5 and ordered newest-first
- [x] `GET /api/reports/profit-loss` for a range spanning several days with both invoices-only and expenses-only days: each such day showed the right side as `0` instead of being omitted, and `net = revenue - expenses` held for every row
- [x] Audit log: created then deleted a real customer via `curl`, confirmed `GET /api/audit-logs` returned both entries newest-first with the exact "Deleted customer "…"" / "Created customer "…"" wording, correct username, in the right order
- [x] Confirmed `/invoices/new?customerId=<id>` pre-selects that customer instead of showing the picker
- [x] Confirmed the old `/profit-loss` route now 404s (page removed, not just unlinked)
- [x] `tsc --noEmit` and `eslint` clean on every file touched (only a pre-existing benign unused-type warning inside the vendored, CLI-generated `evilcharts` component — not hand-written, not touched); a full `next build` (not just dev) completed with no errors and listed every route including `/analytics` and `/api/audit-logs`
- [ ] Visual check of the area chart, stat cards, and dashboard row actions in an actual browser window — **not verified**: no browser tool connected this session, same limitation noted for every prior phase's visual checks

---

## Not in this plan

- **Cloud sync to Neon Postgres** (PRD §4) — background push-on-reconnect + conflict resolution + sync-status indicator. Needs its own design pass once local modules are stable; touches every table above (each needs a `synced_at`/dirty flag).
- **Windows packaging** (PRD §7 steps 6–7) — `electron-builder` config, `output: 'standalone'` in `next.config.ts`, and the production Electron-spawns-Next-server flow noted in `docs/setup.md` §9.
