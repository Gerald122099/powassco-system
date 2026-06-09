# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

POWASSCO management system — a multipurpose cooperative app (water utility, loans, HR/payroll, online payments, member services). Two-package monorepo:

- `client/` — React 19 + Vite + Tailwind installable PWA (deployed to **Vercel**)
- `server/` — Express 4 + Mongoose/MongoDB REST API, ES modules (deployed to **Render**)

The root `package.json` is **only a launcher** for PaaS hosts that build from the repo root: its `postinstall` runs `npm install --prefix server` and `start` runs the server. Day-to-day, you still install and run `client/` and `server/` independently.

`docs/SYSTEM-OVERVIEW.md` is a thorough, current architecture/security/flows document — read it for the big picture (role matrix, end-to-end flows, payment flows).

## Commands

Run these from `client/` or `server/` respectively (cd into the package first).

**Client** (`client/`):
- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint
- `npm run preview` — preview the production build
- `npm test` — Vitest (runs once). Single file: `npx vitest run src/lib/waterBillingLocal.test.js`; filter by name: `npx vitest run -t "<test name>"`

**Server** (`server/`):
- `npm run dev` — start with nodemon (auto-reload), port 5000
- `npm start` — start with node
- `npm test` — Vitest (`vitest run`). Single file: `npx vitest run src/utils/loanAmortization.test.js`
- `npm run seed` — create the bootstrap admin user (`ADMIN2026` / `PowasscoAdmin@2026`); no-op if a user already exists
- `npm run import-existing` — bulk-import legacy members ([scripts/importExistingMembers.js](server/src/scripts/importExistingMembers.js))

Test coverage is sparse — only a few pure-logic units are tested ([waterBillingLocal.test.js](client/src/lib/waterBillingLocal.test.js), [loanAmortization.test.js](server/src/utils/loanAmortization.test.js), [payrollCompute.test.js](server/src/utils/payrollCompute.test.js)). Most behavior is verified by running the app.

## Environment variables

`server/.env`: `MONGO_URI`, `JWT_SECRET`, `PORT` (default 5000), `CLIENT_ORIGIN` (may be a comma-separated list). PSP keys (PayMongo/Xendit) are read env-first via [utils/pspCreds.js](server/src/utils/pspCreds.js), falling back to DB `PaymentSettings`.
`client/.env`: `VITE_API_BASE` (default `http://localhost:5000/api`)

## Architecture

### Auth & roles
JWT-based, **30-day expiry** (long, to keep PWA reopen seamless). Login is by `employeeId` + password (bcrypt hash in `User.passwordHash`). **Seven roles** (enum in [server/src/models/User.js](server/src/models/User.js)): `admin`, `water_bill_officer`, `loan_officer`, `meter_reader`, `plumber`, `cashier`, `bookkeeper`.

- **Server** ([middleware/auth.js](server/src/middleware/auth.js)): `requireAuth` (verifies token, loads `req.user`, fires a throttled device heartbeat), `requireRole([...])`, and `requireAdminAuthz` (dual-control: non-admins must carry a short-lived `X-Admin-Authz` token an admin issued via `POST /api/auth/admin-authz`). Routes compose these into a `guard` array.
- **2FA / device trust**: TOTP (otplib) with single-use recovery codes; a known device (`X-Device-Token`, sha256-hashed in `User.knownDevices[]`) skips the 2FA challenge only within a 2-hour inactivity window. The plumber field PWA also has an admin-set re-entry PIN (`appPinHash`).
- **Client** ([context/AuthContext.jsx](client/src/context/AuthContext.jsx)): token/user persist in `localStorage` under `pow_token` / `pow_user`; device token under `pow_device`. [lib/api.js](client/src/lib/api.js) wraps all HTTP (`apiFetch`, `apiDownload`), auto-attaches the bearer + device token, and clears storage on a 401. Always go through these helpers, not `fetch` directly.
- **Routing** ([App.jsx](client/src/App.jsx)): `Protected` redirects by role; `RoleHome` / `ROLE_HOME` map each role to its dashboard (`/admin`, `/water`, `/loan`, `/meter`, `/plumber`, `/cashier`, `/bookkeeper`). Dashboards are lazy-loaded so each role downloads only its bundle.

### Server request flow
[server/src/index.js](server/src/index.js) is the bootstrap and the source of truth for what exists: it sets security middleware (helmet, `express-mongo-sanitize`, compression), a **CORS allowlist** (hardcoded LAN IPs + `powassco.site` + `CLIENT_ORIGIN`), tiered **rate limiters** (`/api/public` 40/min, `/api/auth` 40/15min, other `/api` 240/min), the `auditLogger`, then mounts every router under `/api/*`. The server `listen()`s immediately and connects to Mongo separately with retry, so `/api/health` answers even when the DB is down. `express.json` captures `req.rawBody` (PayMongo signs the exact bytes). It binds `0.0.0.0` for mobile/LAN access. Route files live in `server/src/routes/` (water under `routes/water/`, admin under `routes/admin/`, public/unauthenticated under `routes/public/`).

### Water billing domain (the core logic)
- **Period keys** are `"YYYY-MM"` strings ([utils/waterPeriod.js](server/src/utils/waterPeriod.js): labels, due dates, past-due checks). Due date is the *month after* the period, on `dueDayOfMonth` + `graceDays` from settings.
- **One bill per meter per period**, uniquely keyed by `{ pnNo, periodKey, meterNumber }`. A member ([models/WaterMember.js](server/src/models/WaterMember.js)) has a `meters[]` array; each meter bills separately.
- **`calculateWaterBill(consumption, classification, member)`** is the canonical pricing function in [utils/waterBilling.js](server/src/utils/waterBilling.js): tiered tariffs from `WaterSettings`, classification minimum charges (residential ₱74 for 0–5 m³, commercial ₱442.50 for 0–15 m³), then senior/PWD discounts. [lib/waterBillingLocal.js](client/src/lib/waterBillingLocal.js) is the client-side mirror used for offline thermal-bill computation — keep the two in sync.
- **`upsertWaterBill(...)`** ([utils/waterBillUpsert.js](server/src/utils/waterBillUpsert.js)) is the central write path for generating/updating a bill from a reading. It snapshots member discount flags + tariff onto the bill, and **will not overwrite a `paid` bill unless `forceUpdate` is passed.**
- Overdue penalties are computed lazily on read in [routes/water/waterBills.routes.js](server/src/routes/water/waterBills.routes.js) (`ensureOverdueAndPenalty`): an unpaid bill past due is flipped to `overdue` and penalty/`totalDue` recomputed from the snapshotted `penaltyTypeUsed`/`penaltyValueUsed`.

### Offline field mode (PWA)
Meter readers / plumbers work offline. [lib/fieldSync.js](client/src/lib/fieldSync.js) downloads the user's assigned batch (members + previous readings + tariff settings) via `GET /water/readings/my-batch` into IndexedDB ([lib/offlineDb.js](client/src/lib/offlineDb.js), DB `powassco-field`). Readings are encoded locally and synced when online; the sync is **idempotent** — the server upserts by `{periodKey, pnNo, meterNumber}` and a duplicate POST returns `skipped`, so re-syncing never double-bills. Meter QR payloads (`POW|PN|METER`) are handled in [lib/meterQr.js](client/src/lib/meterQr.js); thermal printing over Web Bluetooth in [lib/thermalPrint.js](client/src/lib/thermalPrint.js).

### Online payments (PSP)
`postOnlinePayment()` ([utils/postOnlinePayment.js](server/src/utils/postOnlinePayment.js)) is the **single idempotent write path** for posting a payment — used by both officer-manual verification and PSP webhooks. PayMongo/Xendit webhooks land at [routes/webhooks.routes.js](server/src/routes/webhooks.routes.js), which verifies signatures ([utils/paymentProviders.js](server/src/utils/paymentProviders.js), `crypto.timingSafeEqual`) and logs every delivery (accepted/rejected/errored) to `WebhookEvent`. Amounts are always computed server-side; `OnlinePayment.referenceId`, `WaterPayment.orNo`, and `LoanPayment.orNo` are unique to block duplicates.

### Models
Mongoose models in `server/src/models/`. `WaterMember` is a large nested document (personal, address, contact, billing, `meters[]`, discount tiers) with virtuals (`fullAddress`, `primaryMeter`, `isEligibleForSeniorDiscount`) and a text index for search. Other domains: loan (`LoanApplication`, `LoanPayment`, `LoanSettings`, `ProductLoan`), HR/finance (`Employee`, `Payroll`, `PayrollSettings`, `Expense`, `Asset`), CBU (`CbuTransaction`), governance (`Meeting`, `Announcement`, `ServiceRequest`), payments (`OnlinePayment`, `PaymentSettings`, `WebhookEvent`), and security (`AuthSettings`, `AuditLog`, `PushSubscription`).

## Gotchas

- **Model filenames are PascalCase in git (`WaterMember.js`, `WaterBill.js`) even though Windows `ls` may display them lowercase.** Git's `core.ignorecase=true` lets the working tree show a stale case while the committed/index name — what a Linux clone or Render deploy receives — stays PascalCase. **Check casing with `git ls-files`, not `ls`.** Keep new imports PascalCase so they resolve on case-sensitive Linux. (Mongoose registers models by the string in `mongoose.model("WaterMember", ...)`, independent of filename — only the *import path string* is case-fragile.)
- The repo includes committed `node_modules/`. Ignore them in searches.
- `server/src/uploads/exports/` holds committed sample batch JSON — not source code.
