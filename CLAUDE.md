# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

POWASSCO management system — a water utility cooperative app. Two-package monorepo with no root `package.json`; install and run `client/` and `server/` independently.

- `client/` — React 19 + Vite + Tailwind SPA (deployed to Vercel)
- `server/` — Express 4 + Mongoose/MongoDB REST API (ES modules)

Four operational modules gated by user role: **water billing** (fully built), **loan**, **meter reading**, and **admin**. Public (unauthenticated) pages exist for member inquiry and a tariff calculator.

## Commands

Run these from `client/` or `server/` respectively (cd into the package first).

**Client** (`client/`):
- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint (only lint/build check available; there is no test suite)
- `npm run preview` — preview the production build

**Server** (`server/`):
- `npm run dev` — start with nodemon (auto-reload), port 5000
- `npm start` — start with node
- `npm run seed` — create the bootstrap admin user (`ADMIN2026` / `PowasscoAdmin@2026`); no-op if it already exists

There are **no automated tests** in this repo. Verify changes by running the app.

## Environment variables

`server/.env`: `MONGO_URI`, `JWT_SECRET`, `PORT` (default 5000), `CLIENT_ORIGIN`
`client/.env`: `VITE_API_BASE` (default `http://localhost:5000/api`)

## Architecture

### Auth & roles
JWT-based, 8-hour expiry. Login is by `employeeId` + password (bcrypt hash in `User.passwordHash`). The four roles are `admin`, `water_bill_officer`, `loan_officer`, `meter_reader` (enum in [server/src/models/User.js](server/src/models/User.js)).

- **Server**: [middleware/auth.js](server/src/middleware/auth.js) exposes `requireAuth` (verifies token, loads `req.user`) and `requireRole([...])`. Routes compose them as a `guard` array.
- **Client**: [context/AuthContext.jsx](client/src/context/AuthContext.jsx) holds auth state; token/user persist in `localStorage` under `pow_token` / `pow_user`. [lib/api.js](client/src/lib/api.js) wraps all HTTP calls (`apiFetch`, `apiDownload`), auto-attaches the bearer token, and clears storage on a 401. Always go through these helpers rather than calling `fetch` directly.
- **Routing**: [App.jsx](client/src/App.jsx) `Protected` wrapper redirects by role; `RoleHome` sends each role to its dashboard (`/admin`, `/water`, `/loan`, `/meter`).

### Server request flow
[server/src/index.js](server/src/index.js) mounts all routers under `/api/*`. Route files live in `server/src/routes/` (water routes under `routes/water/`, public ones under `routes/public/`). Each route file imports its Mongoose models and the shared auth guards. CORS uses a hardcoded allowlist that includes LAN IPs plus `CLIENT_ORIGIN`, and the server binds `0.0.0.0` for mobile/LAN access — recent work centers on this.

### Water billing domain (the core logic)
This is where most complexity lives. Key concepts:

- **Period keys** are `"YYYY-MM"` strings ([utils/waterPeriod.js](server/src/utils/waterPeriod.js) handles labels, due dates, past-due checks). Due date is in the *month after* the period, on `dueDayOfMonth` + `graceDays` from settings.
- **One bill per meter per period.** Bills are uniquely keyed by `{ pnNo, periodKey, meterNumber }`. A member ([models/Watermember.js](server/src/models/Watermember.js)) has a `meters[]` array; each meter bills separately.
- **`calculateWaterBill(consumption, classification, member)`** is the canonical pricing function in [utils/waterBilling.js](server/src/utils/waterBilling.js). It reads tiered tariffs from `WaterSettings`, applies classification-specific minimum charges (e.g. residential ₱74 for 0–5 m³, commercial ₱442.50 for 0–15 m³), then senior-citizen or PWD discounts.
- **`upsertWaterBill(...)`** in [utils/waterBillUpsert.js](server/src/utils/waterBillUpsert.js) is the central write path for generating/updating a bill from a meter reading. It snapshots member discount flags and tariff onto the bill, and **will not overwrite a `paid` bill unless `forceUpdate` is passed.**
- Overdue penalties are computed lazily on read in [routes/water/waterBills.routes.js](server/src/routes/water/waterBills.routes.js) (`ensureOverdueAndPenalty`): an unpaid bill past its due date is flipped to `overdue` and penalty/`totalDue` recomputed from the snapshotted `penaltyTypeUsed`/`penaltyValueUsed`.

### Models
Mongoose models in `server/src/models/`. `WaterMember` is a large nested document (personal, address, contact, billing, `meters[]`, discount tiers) with virtuals (`fullAddress`, `primaryMeter`, `isEligibleForSeniorDiscount`) and a text index for search. Loan models (`LoanApplication`, `LoanPayment`, `LoanSettings`) back the partially-built loan module.

## Gotchas

- **Model filenames are PascalCase in git (`WaterMember.js`, `WaterBill.js`) even though Windows `ls` may display them lowercase.** Git's `core.ignorecase=true` lets the working tree show a stale case while the committed/index name — what a Linux clone or deploy actually receives — stays PascalCase. **Check casing with `git ls-files`, not `ls`.** All model imports now match the tracked PascalCase names; keep new imports PascalCase so they resolve on case-sensitive Linux.
- Mongoose registers each model by the string passed to `mongoose.model("WaterMember", ...)`, independent of filename — model *registration* is stable; only the *import path string* is case-fragile.
- Water tariff pricing lives in [utils/waterBilling.js](server/src/utils/waterBilling.js) (`calculateWaterBill`). The former `waterBillingNew.js` was renamed into this name and the old stale duplicate removed.
- **[routes/water/waterTariff.routes.js](server/src/routes/water/waterTariff.routes.js) is orphaned/broken**: it is never mounted in [index.js](server/src/index.js) and imports a `WaterTariff.js` model that does not exist. It will throw if ever imported — either wire up the model and mount it, or delete it.
- The repo includes committed `node_modules/`. Ignore them in searches.
