# Product Requirements Document
## Babu Awamir Auto Garage — Garage Management & Billing Software

**Version:** 1.0
**Platform:** Windows Desktop Application
**Prepared for:** AI Development Agent
**Client:** Babu Awamir Auto Garage, Qatar

---

## 1. Overview

A Windows desktop application for managing day-to-day operations of an auto garage: customers, vehicle services, invoicing/billing, expenses, profit & loss reporting, and staff user accounts. The app works fully offline using a local database and syncs data to a cloud database when internet is available, so the business owner can view consolidated data remotely if needed.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Application type | Windows desktop app (installable .exe) |
| Frontend + Backend | Next.js (App Router) — UI pages + API routes handle all business logic |
| Desktop wrapper | **Electron** (see rationale below) |
| Local database | SQLite via `better-sqlite3` (offline-first, always source of truth on the machine) |
| Cloud database | Neon PostgreSQL (cloud sync target) |
| Sync mechanism | Background sync job — pushes local changes to Neon when online; conflict handling favors most-recent-write |
| Printing | Native print support for invoice printing (thermal/A4 printer compatible) via Electron's print API |

### 2.1 Electron vs. Tauri — why Electron

Both can package a Next.js app into a `.exe`, but they fit this project differently:

- **Electron (recommended):** Bundles a full Node.js runtime, so it can directly host the Next.js server (API routes and all) inside the app with no extra glue layer. Node-based SQLite drivers (`better-sqlite3`) and the Neon sync logic just work as-is — the same backend code that runs in Next.js API routes runs unmodified inside Electron's main/renderer process. Given the requirement is "Next.js with backend and frontend," Electron is the path of least friction.
- **Tauri:** Produces a much smaller, faster, lower-memory `.exe` (Rust-based shell instead of bundling Chromium+Node), which is attractive for a lightweight office PC. But Tauri's backend is Rust, not Node — a Next.js API-route backend doesn't run natively inside it. You'd either run Next.js as a separate "sidecar" process that Tauri launches and talks to over local HTTP, or rewrite backend logic in Rust. That's extra engineering effort and a less direct mapping to "Next.js has the backend."

**Recommendation:** Electron, for direct compatibility with a Next.js backend and faster build time. If app performance/size becomes a real problem on very low-spec office PCs later, Tauri + a Node sidecar is a viable future migration, not a blocker now.

## 3. Core Modules

### 3.1 Customer Management
- Add/edit/delete customer records: name, phone, vehicle number(s), vehicle make/model
- Search/filter customers by name, phone, or vehicle number
- View customer service and invoice history

### 3.2 Service Management
- Create a service record per vehicle visit: services performed, parts used, labor charges, notes
- Link service record to a customer
- Status tracking (e.g., in progress, completed)

### 3.3 Invoice & Billing
- Generate invoice from a service record
- Itemized billing: parts, labor, discounts, tax (if applicable)
- Print invoice (formatted for garage's printer)
- Invoice history with search by date, customer, or invoice number
- Support for partial/full payment status

### 3.4 Expense Management
- Log business expenses (category, amount, date, notes)
- Expense categories configurable (e.g., parts purchase, rent, utilities, salaries)

### 3.5 Profit & Loss Dashboard
- Summary view: total revenue (from invoices) vs. total expenses over a selected date range
- Simple charts/tables by day, week, month
- Net profit calculation

### 3.6 User Management
- Multiple user accounts with roles (e.g., Admin, Staff)
- Login screen with username/password
- Role-based access (e.g., only Admin sees Profit & Loss and Expense modules)

## 4. Data Sync (Local ↔ Cloud)

- App must function fully offline; all modules read/write to local SQLite first
- When internet is available, a background process syncs new/changed records to Neon PostgreSQL
- Sync should be automatic, silent, and not block the UI
- On conflict (rare, e.g., edited on two installs), most recent update wins
- A sync status indicator (e.g., "Synced" / "Pending sync") should be visible in the app

## 5. Non-Functional Requirements

- Installable on standard Windows 10/11 machines
- Should run smoothly on modest hardware (garage office PC)
- Data should never be lost if internet is unavailable for extended periods
- Basic data validation on all forms (no empty required fields, valid phone numbers, etc.)

## 6. Out of Scope (per quotation)

- Mobile app version
- SMS/WhatsApp notifications to customers
- Online customer-facing booking portal
- Multi-branch / multi-location support (single garage location only)

## 7. Suggested Build Order

1. Scaffold Next.js app (App Router) inside an Electron shell — confirm the packaged `.exe` launches and loads the Next.js UI before building features
2. Local SQLite schema + core CRUD via Next.js API routes (Customer, Service, Invoice, Expense)
3. User login & role-based access
4. Invoice generation + print (via Electron print API)
5. Profit & Loss dashboard
6. Cloud sync (Neon PostgreSQL) as final integration layer
7. Packaging: set up `electron-builder` for a signed/unsigned Windows installer

---

*This PRD is derived from the signed quotation (Ref: VFS-2025-BAG-001) for Babu Awamir Auto Garage. Scope changes after kickoff should be treated as revisions per the quotation's terms.*