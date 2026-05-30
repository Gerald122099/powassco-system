# POWASSCO Management System — Technical Overview

> Integrated cooperative management system covering water billing, loans, meter reading, HR / payroll, expenses, online payments, and member services for POWASSCO Multipurpose Cooperative.

Document version: 1.0 · Owner: Gerald Durano (Developer)

---

## 1. Executive Summary

POWASSCO is a Progressive Web App + REST API platform that replaces multiple paper- and spreadsheet-based processes with a single secured system. It supports walk-in operations (cashier, billing, loan), field operations (offline meter reading via mobile), online operations (QR PH payments, member inquiry, public requests), and administrative oversight (HR, payroll, audit, analytics).

Key characteristics:
- **Two-package monorepo**: `client/` (browser SPA + installable Android/iOS PWA), `server/` (Node REST API).
- **Single source of truth**: MongoDB Atlas.
- **Six role types** with strict access boundaries enforced both client-side (routing) and server-side (middleware).
- **Offline-first field operations** via Service Worker + IndexedDB.
- **Bank-grade auth**: bcrypt passwords, JWT, TOTP 2FA (authenticator app), single-use recovery codes, IP-aware device trust with a 2-hour inactivity boundary, audit log.
- **Payment Service Provider ready**: manual QR PH today; PayMongo / Xendit can be activated by saving keys + flipping a switch.

---

## 2. Architecture

```
                   ┌────────────────────────────────────────────────┐
                   │                 USERS (6 roles)                │
                   │  admin · water_bill_officer · loan_officer ·   │
                   │  meter_reader · plumber · cashier · public     │
                   └───────────────┬────────────────────────────────┘
                                   │ HTTPS
            ┌──────────────────────┴──────────────────────┐
            │ FRONTEND  (Vercel)                          │
            │ React 19 + Vite + Tailwind                  │
            │ vite-plugin-pwa (Service Worker)            │
            │ IndexedDB (offline field data)              │
            │ html5-qrcode (meter QR scan)                │
            │ Web Bluetooth API (thermal printer)         │
            └──────────────────────┬──────────────────────┘
                                   │ JSON / Bearer JWT + X-Device-Token
            ┌──────────────────────┴──────────────────────┐
            │ BACKEND  (Render)                           │
            │ Node 18 · Express 4 (ESM)                   │
            │ Mongoose (ODM) · zod (input validation)     │
            │ jsonwebtoken · bcryptjs · otplib (TOTP)     │
            │ helmet · express-rate-limit · mongo-sanitize│
            │ multer (CSV/SQLite upload from field app)   │
            └──────────────────────┬──────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │ MongoDB Atlas              │
                    │ Single replica set         │
                    │ Indexed: pnNo, meter, OR,  │
                    │  periodKey, paidAt, role…  │
                    └────────────────────────────┘

       External integrations (optional, activate when keys are saved):
       ┌──────────────────┐   ┌──────────────────┐
       │ PayMongo Checkout│   │ Xendit Invoices  │
       │ (Webhook secret) │   │ (Callback token) │
       └──────────────────┘   └──────────────────┘
```

### Deployment topology

| Tier | Provider | Plan baseline | Notes |
|---|---|---|---|
| Static client | Vercel | Hobby (free) or Pro | Auto-deploy on `main` push |
| API server | Render | Starter ($7/mo) or Standard | Auto-deploy on `main` push |
| Database | MongoDB Atlas | M0 (free 512 MB) / M10 ($57/mo) | Atlas-hosted, daily snapshots on M10+ |
| Domain | Any registrar | ~₱500–1,000/year | `powassco.site` + SSL via Vercel/Let's Encrypt |

---

## 3. Frontend

### Stack
- **React 19** + Vite (fast HMR, ESM build).
- **Tailwind CSS** (utility-first; no bespoke design system to maintain).
- **React Router** for SPA routing.
- **vite-plugin-pwa** with Workbox: caches the app shell, navigates offline, auto-updates with `skipWaiting + clientsClaim`.
- **lucide-react** icons (tree-shaken).
- **recharts** charts for analytics.
- **html5-qrcode** lazy-loaded for QR scanning (≈335 KB, only downloaded by roles that need it).
- **idb** (IndexedDB wrapper) for offline reading queue.
- **qrcode** for generating member meter QR stickers.

### Code organisation
```
client/src/
├─ assets/                logo, images
├─ components/            shared UI (Card, Modal, DashboardLayout, Toast, OnlineStatus, …)
├─ context/AuthContext    JWT + user persisted in localStorage
├─ lib/
│  ├─ api.js              apiFetch wrapper, attaches Bearer + X-Device-Token, clears storage on 401
│  ├─ fieldSync.js        download batch + IndexedDB queue + idempotent sync
│  ├─ offlineDb.js        IndexedDB schema for plumber field mode
│  ├─ meterQr.js          encode/decode "POW|PN|METER" QR payloads
│  ├─ thermalPrint.js     Bluetooth thermal printer driver
│  └─ qrStickerSheet.js   batch QR sticker printing
├─ pages/
│  ├─ public/             HomePage, MemberInquiry, TariffCalculator, About, Contact
│  ├─ admin/              AdminDashboard + all admin panels
│  ├─ water/              Water billing dashboard + members/bills/payments/analytics
│  ├─ loan/               Loan dashboard + apply/loans/analytics/settings
│  ├─ meter/              MeterReader dashboard (office)
│  ├─ plumber/            PlumberDashboard (Field Mode only)
│  ├─ cashier/            CashierDashboard (lookup + Today's Collection)
│  ├─ LoginPage.jsx
│  └─ TwoFactorSetup.jsx
└─ App.jsx                routing, Protected wrapper, RoleHome redirect
```

### Performance characteristics
- Role dashboards are **lazy-loaded** — a cashier never downloads the admin panel bundles, etc.
- Service worker pre-caches **app shell** (~2.5 MB total, gzipped).
- Field mode caches the **assigned batch in IndexedDB** so a plumber can work fully offline for hours.
- Debounced search (400 ms) on members, lean Mongoose queries on the server, compound indexes on `{pnNo, meterNumber, periodKey}`.

### Installable PWA (Android / iOS / desktop)
- Manifest defines name, icons, theme, `start_url: '/employee-login'`.
- Android: "Add to Home screen" creates a standalone-display app.
- Re-opening the app skips the form if a valid session exists (auto-redirect to role dashboard).

---

## 4. Backend

### Stack
- **Node 18 + Express 4** (ESM).
- **Mongoose** for MongoDB.
- **zod** for input validation on auth and HR.
- **jsonwebtoken** for sessions (30-day JWT).
- **bcryptjs** for password hashing.
- **otplib** v12 for TOTP (`authenticator` API).
- **helmet** for security headers.
- **express-rate-limit** for DDoS / brute-force protection.
- **express-mongo-sanitize** for NoSQL injection protection.
- **multer** for SQLite / CSV uploads from mobile field app.
- **crypto** for HMAC signature verification of PSP webhooks.

### Code organisation
```
server/src/
├─ index.js                  app bootstrap, CORS allowlist, rate limiters, route mounts
├─ middleware/
│  ├─ auth.js                requireAuth + requireRole + device heartbeat
│  └─ auditLogger.js         records every mutating call (actor, IP, route, status, category)
├─ models/                   Mongoose models
│  ├─ User, AuthSettings, AuditLog, WebhookEvent
│  ├─ WaterMember, WaterBill, WaterPayment, WaterReading, WaterSettings, WaterBatch
│  ├─ LoanApplication, LoanPayment, LoanSettings
│  ├─ Employee, Expense, Asset, Meeting, Announcement, PublicRequest
│  ├─ OnlinePayment, PaymentSettings
├─ routes/
│  ├─ auth.routes.js         login / 2FA / recovery / password-reset / admin self-reset
│  ├─ users.routes.js        admin user CRUD with role enum
│  ├─ water/*.routes.js      members, bills, payments, settings, analytics, readings, batches
│  ├─ loan/loans.routes.js   loan CRUD + payment + analytics
│  ├─ admin/*.routes.js      expenses, employees, payroll, audit, requests, announcements, assets
│  ├─ public/*.routes.js     inquiry, requests, announcements, payments (no auth)
│  ├─ payments.routes.js     officer-facing online-payment verify + admin settings
│  ├─ cashier.routes.js      read-only PN/meter/name lookup (water + loan)
│  ├─ collections.routes.js  daily collection aggregate (cash/online/total)
│  ├─ disconnections.routes  admin-confirmed disconnections, officer/reader notify-only
│  ├─ webhooks.routes.js     PayMongo + Xendit receivers with signature verify + audit log
│  └─ meetings.routes.js     calendar + events
└─ utils/
   ├─ ensureAdmin.js         bootstrap admin user (ADMIN2026 / PowasscoAdmin@2026)
   ├─ waterBilling.js        canonical tiered tariff calculator
   ├─ waterBillUpsert.js     single write path for generating/refreshing a bill
   ├─ waterPeriod.js         "YYYY-MM" helpers + due-date math
   ├─ postOnlinePayment.js   idempotent OR posting (used by officer verify AND PSP webhook)
   ├─ paymentProviders.js    PayMongo + Xendit adapters + HMAC/token verification
   └─ pspCreds.js            env-first credential resolver
```

### Domain model highlights

| Collection | Key shape | Highlights |
|---|---|---|
| `User` | unique `employeeId` | 2FA secret + recovery codes + knownDevices[] (hashed token, IP, lastSeen) |
| `WaterMember` | unique `pnNo`, text-indexed name | nested `meters[]` (each separately billable), seniors/PWD discount flags |
| `WaterBill` | unique `{pnNo, periodKey, meterNumber}` | snapshot of tariff + discount + penalty rules; status: unpaid/overdue/paid |
| `WaterPayment` | unique `orNo` | references bill, method (cash/online/gcash/bank), `paidAt`, `receivedBy` |
| `WaterReading` | unique `{periodKey, pnNo, meterNumber}` | drives bill generation; idempotent sync |
| `WaterBatch` | unique `batchNumber`, member uniqueness across batches | assigns plumber/reader to a member set |
| `LoanApplication` | unique `loanId` + `referenceCode` | tiered status: pending/approved/released/closed/rejected |
| `LoanPayment` | unique `orNo` | same payment-method enum + `paidAt`; runs the running balance |
| `OnlinePayment` | unique `referenceId` | walk-in submitted, officer-verified or PSP-confirmed |
| `WebhookEvent` | provider + providerRef indexed | raw payload + signature result for compliance |
| `AuditLog` | actor + path + status | categorised general / session / security |

Mongoose indexes are explicit and documented in each model file.

---

## 5. Security

### Authentication
- Passwords: `bcrypt` cost factor 10.
- Sessions: signed JWT, **30-day** lifetime to keep refresh / PWA reopen seamless.
- Tokens stored in `localStorage` (`pow_token`) + user in `pow_user`; auto-cleared by `apiFetch` on a 401.
- Device-token (`pow_device`) stored separately; survives logout so 2FA isn't re-prompted on the same phone.

### Two-Factor Authentication (TOTP)
- Per-user secret generated server-side, encoded as standard `otpauth://` URI.
- QR code rendered client-side with `qrcode`.
- Compatible with Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc.
- Admin can **enforce 2FA** for all staff via a setting.
- **Recovery codes**: 10 single-use codes per user, hashed (SHA-256) before storage, printable A5 sheet.
- **Self-reset**: admins can reset their own 2FA in-session (audited).
- **Admin reset**: admins can reset 2FA for any user (lost-phone recovery).
- **Inactivity boundary**: a remembered device skips 2FA **only** if it was active within the last 2 hours. Beyond that, the authenticator is required again.

### Network / transport
- HTTPS-only in production (Vercel + Render handle TLS).
- **Helmet** sets HSTS, no-sniff, frameguard, etc. (CSP disabled because we permit a cross-origin frontend).
- **CORS allowlist** on the server: only the configured `CLIENT_ORIGIN` plus internal LAN ranges.
- **CORS allows `X-Device-Token`** header so the heartbeat can fire.

### Rate limiting (DDoS / brute-force)
- `/api/auth/*` — **40 requests / 15 minutes / IP** (login brute-force).
- `/api/public/*` — **40 requests / minute / IP** (unauthenticated surface).
- All other `/api/*` — **240 requests / minute / IP** (normal app usage).
- Server `trust proxy: 1` so limits key on the real client IP.

### Input handling
- `express-mongo-sanitize` strips `$` / `.` prefixes from all inputs → defends against NoSQL operator injection.
- `zod` validates auth + HR payloads.
- Mongoose schema validation guards every write.

### Payment security
- PSP secret keys read **env-var first** (host environment) — DB values used only for sandbox/test.
- Webhook signatures verified with **`crypto.timingSafeEqual`** to prevent timing attacks.
- Idempotent posting: `postOnlinePayment()` is the **single write path** for both officer-manual and PSP-auto confirmation; safe to retry.
- Anti-duplicate: `OnlinePayment.referenceId` has a unique index; `WaterPayment.orNo` and `LoanPayment.orNo` are unique.
- Every PSP webhook delivery — accepted, rejected, ignored, or errored — is logged to `WebhookEvent` (raw payload + headers + signature result) for compliance traceability.
- Amounts are always **computed server-side**; client-submitted amounts are never trusted.

### Audit log
- Every mutating API call is recorded with: actor (employeeId, name, role), method, path, status code, category (`general` / `session` / `security`), IP, timestamp.
- Login, logout, 2FA setup/disable, recovery, password reset = `security` / `session`.
- Admin-only viewer with filters.

### Disaster recovery
- MongoDB Atlas daily snapshots on M10+.
- Git is the source of truth for code; `main` is the deploy branch.
- Bootstrap admin (`ADMIN2026`) is auto-seeded on first run so the system can never lock itself out.

---

## 6. Roles & Permissions Matrix

| Capability / Role | admin | water_bill_officer | loan_officer | meter_reader | plumber | cashier |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| User management | ✓ | | | | | |
| Water settings (tariffs, discounts, due dates) | ✓ | | | | | |
| Loan settings (rates, terms, charges) | ✓ | ✓ | | | | |
| Water members CRUD | ✓ | ✓ | | | | |
| Bill encoding (office) | ✓ | ✓ | | ✓ | | |
| Bill payment posting + OR input | ✓ | ✓ | | | | |
| Bulk QR sticker printing | ✓ | ✓ | | | | |
| Field meter reading (offline) | | | | ✓ | ✓ | |
| Batch management | ✓ | | | ✓ | | |
| Loan application + approval | ✓ | | ✓ | | | |
| Loan payment posting + OR input | ✓ | | ✓ | | | |
| Verify online payments (manual) | ✓ | ✓ | ✓ | | | |
| Online payment settings (PSP / QR / fee) | ✓ | | | | | |
| Disconnection — notify | ✓ | ✓ | | ✓ | ✓ | |
| Disconnection — confirm | ✓ | | | | | |
| Dues lookup (read-only) | ✓ | ✓ | ✓ | | | ✓ |
| Today's Collection | ✓ | ✓ (own) | ✓ (own) | | | ✓ (all) |
| Expenses & financial reports | ✓ | | | | | |
| Employees + payroll | ✓ | | | | | |
| Asset inventory (6-month audits) | ✓ | | | | | |
| Meetings / Calendar | ✓ | | | | | |
| Announcements (publish) | ✓ | | | | | |
| Public service requests inbox | ✓ | | | | | |
| Audit log | ✓ | | | | | |
| Security / 2FA admin | ✓ | | | | | |
| Analytics (water + loan) | ✓ | ✓ (water) | ✓ (loan) | ✓ | | |

All roles also read meetings/announcements relevant to them and can manage their own profile + 2FA.

---

## 7. End-to-End Flows

### 7.1 Walk-in water payment (most common)
1. **Consumer** approaches **Cashier**.
2. Cashier searches by **PN / meter / name** → sees per-meter dues table.
3. Cashier collects cash, hand-writes paper OR.
4. Consumer brings paper OR to **Water Bill Officer**.
5. Officer opens Payments panel → finds the bill → enters **OR number** → marks paid.
6. System records `WaterPayment{orNo, method: "cash", receivedBy, paidAt}` and flips the bill to `paid`.
7. Both Cashier and Officer see the entry in **Today's Collection** (Cash column).

### 7.2 Online QR PH water payment (manual mode)
1. Consumer opens public **Member Inquiry**, finds the bill, taps **Pay Online**.
2. They scan the coop's QR with GCash/Maya, then submit the reference number + screenshot.
3. System creates `OnlinePayment{status: "pending", referenceId}` — unique index prevents duplicates on refresh.
4. Officer reviews in **Online Payments** tab → verifies the screenshot → enters OR → `postOnlinePayment` runs.
5. Same idempotent write path posts to `WaterPayment` and flips the bill.

### 7.3 Online QR PH water payment (realtime PSP)
1. Admin saves PayMongo / Xendit keys (or env vars) and toggles **Activate realtime**.
2. Consumer flow same up to "Pay Online" — instead of submitting a screenshot, they're redirected to the PSP checkout.
3. PSP confirms → posts to `/api/webhooks/{paymongo|xendit}`.
4. Webhook verifies signature, calls `postOnlinePayment` → bill auto-flipped to `paid`.
5. Raw payload + verification result audited to `WebhookEvent` regardless of outcome.

### 7.4 Field meter reading (Plumber)
1. Admin creates a **batch** and assigns it to a Plumber user.
2. Plumber signs in on Android, opens Field Mode, taps **Download Batch** — pulls only assigned members + previous readings + tariff settings into IndexedDB.
3. Plumber walks the route **offline**. Scans meter QR → toast confirms account name + PN + meter.
4. Enters present reading → saved offline; running list of unsynced shown in the counter.
5. When back online (or anytime), sync runs automatically with **idempotent guarantee**:
   - Server upserts by `{periodKey, pnNo, meterNumber}`.
   - A duplicate POST returns `skipped` → client removes from queue → no double-billing.
   - Failed rows stay queued and auto-retry every 30 seconds (and immediately after 5 seconds on the first failure).

### 7.5 Loan disbursement + repayment
1. Loan Officer opens **Apply** tab → fills application → eligibility checked against the borrower's water bill standing.
2. Officer approves → status `approved`. Releases → status `released`, schedule generated.
3. Borrower pays at Cashier (walk-in) or via online (manual/PSP) — same flow as water.
4. Loan Officer posts the payment with OR → balance decreases. When balance ≤ 0 and status = `released`, it transitions to `closed`.

### 7.6 Disconnection workflow
1. Account has unsettled bill(s) past due + grace days.
2. **Pending Disconnections** list appears in Water Billing, Meter Reader, and Plumber dashboards (notify-only for non-admins).
3. Plumber visits the location, flips the local meter status if needed, syncs.
4. **Admin** is the only role that can **confirm** the disconnection of a specific meter linked to the account.

---

## 8. Modules & Features (Functional Summary)

### 8.1 Water Billing
- Members CRUD with nested meters
- Tiered tariff calculator (residential 0–5/6–10/11–20/21–30/31–40/41+ ; commercial 0–15/16–30/31+)
- Senior + PWD discount tiers
- Penalty engine (configurable type + value, snapshotted on the bill)
- Bills auto-generated from readings
- Payments with OR + receipt printing
- Analytics (12-month trends, classification breakdown, collection rate)

### 8.2 Meter Reading (office + field)
- Office encoding with prior-month settlement enforcement
- Batch management (assign meter readers / plumbers)
- Bulk QR sticker printing (per-meter)
- Field Mode (offline PWA): download, scan, encode, sync — idempotent
- Disconnection notice list

### 8.3 Loan
- Application with eligibility check against water bills
- Approve → release → close lifecycle
- Schedule + balance tracking
- Online + walk-in payments
- Analytics: capital released, interest profit, collected, outstanding

### 8.4 Admin / HR / Finance
- Employee registry with PH statutory deductions (SSS, PhilHealth, Pag-IBIG, withholding)
- Payroll generation
- Expense logging (pipe repair, utilities, office, etc.)
- Financial reports (combined)
- Asset & utilities inventory with **6-month audit** scheduling
- Calendar & events (audience filter; shown on every role's dashboard)
- Public announcements (with images) for the homepage + bell icon
- Public service requests (new connection / reconnection)
- **Daily Collection** (cash + online + grand total, per-collector breakdown)
- Audit log viewer with filters

### 8.5 Cashier
- Read-only dues lookup (water by PN/meter/name; loan by ID/ref/borrower/PN)
- Per-meter grouping for multi-meter accounts
- Dues slip printer
- Today's Collection (all modules)

### 8.6 Public surfaces
- Bill inquiry (PN-only, masked privacy)
- Tariff calculator
- Service request forms (with spam dedup)
- Online payment submission (manual mode) and checkout redirect (PSP mode)
- Recent announcements

### 8.7 PWA
- Installable on Android + iOS + desktop
- Offline-capable shell
- IndexedDB-backed field mode
- Auto-update via `skipWaiting + clientsClaim`
- Push installation prompt
- Bluetooth thermal printer support (Web Bluetooth)

---

## 9. Operations

### Backups
- MongoDB Atlas snapshots (daily on M10+, weekly retained 7 days).
- Optional: scheduled `mongodump` to S3/Backblaze (not yet wired; can be added).

### Monitoring
- Render dashboard for server uptime + logs.
- Vercel dashboard for build + edge logs.
- `/api/health` returns `{ ok, db }` even when DB is down (uptime probes).
- Audit log gives application-level accountability.

### Updates
- All changes go through `git push origin main`.
- Vercel + Render auto-deploy from `main`.
- PWA `skipWaiting + clientsClaim` ensures the next page load picks up the new service worker.

### Onboarding new staff
1. Admin → User Management → Add → set role + temporary password.
2. Staff logs in, is forced to set up 2FA if enforcement is on.
3. Admin can print recovery codes via Security panel.

### Bootstrap
- Server seeds an admin account (`ADMIN2026` / `PowasscoAdmin@2026`) on first run if no user exists; the password must be changed immediately.

---

## 10. Roadmap (Optional Extensions)

| Feature | Effort | Notes |
|---|---|---|
| Email / SMS notifications | M | Twilio + SendGrid integrations; cost per-message |
| Automated MongoDB backups to S3 | S | Cron-driven `mongodump` to off-platform storage |
| Multi-language (Tagalog/Cebuano) | M | i18n wiring on the client |
| GIS map of meter locations | M | Leaflet + per-meter coordinates already captured |
| Mobile-native wrapper | L | Capacitor wrapper if a Play Store / App Store listing is desired |
| Power BI / Looker exports | S | Read-only Mongo user + scheduled exports |
| Audit log export (CSV/PDF) | S | One endpoint + UI button |
| Branch / multi-coop tenancy | L | Tenant id + scoping middleware throughout |

Effort: S ≤ 1 week, M ≤ 1 month, L > 1 month.

---

*End of System Overview.*
