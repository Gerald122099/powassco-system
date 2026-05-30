# POWASSCO Management System — Client Proposal & Pricing

> Submitted to: **POWASSCO Multipurpose Cooperative**
> Submitted by: **Gerald Durano** — Independent Software Developer
> Date: ________________ · Validity: 30 days from date above

This proposal covers the design, development, deployment, and ongoing operation of the POWASSCO Management System: a custom web + mobile (PWA) platform that consolidates water billing, loans, meter reading, HR/payroll, expenses, asset audit, and online payments for the cooperative.

---

## 1. What the Client Receives

A production system already deployed and operating, plus all source code and documentation. See [SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md) for the full technical scope.

### 1.1 Modules delivered
1. **Water Billing** — members, meters, tiered tariffs, senior/PWD discounts, penalty engine, payments with OR.
2. **Meter Reading**
   - Office encoding with prior-month settlement enforcement.
   - Offline-capable Android/PWA Field Mode for plumbers (download batch, scan QR, encode offline, sync idempotently).
   - Bulk QR sticker printing.
3. **Loan System** — applications with water-bill eligibility, approve/release/close, schedule, payments.
4. **Online Payments (QR PH)**
   - Manual mode (verify reference + receipt screenshot).
   - Realtime mode ready for PayMongo / Xendit — activates when keys are saved.
   - Idempotent posting, anti-duplicate guarantees, master switch to disable.
5. **Cashier** — read-only dues lookup by PN / meter / name / loan ID; multi-meter per-meter grouping; daily collection.
6. **Admin / HR**
   - Employee registry with PH statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR).
   - Payroll.
   - Expenses + financial reports.
   - Asset & utilities inventory with 6-month audit scheduling.
   - Calendar / events shown on every role's dashboard.
   - Announcements (with images) for the public homepage.
   - Public service requests inbox (new connection / reconnection).
   - Daily Collections (overall + per-collector breakdown).
   - Audit log viewer.
7. **Security**
   - Bcrypt passwords + JWT sessions.
   - TOTP 2FA (authenticator app) with admin enforcement, recovery codes (printable), 2-hour inactivity boundary, admin self-reset.
   - Audit log split into general / session / security categories.
   - Helmet headers, rate limiting (DDoS + brute-force), NoSQL sanitisation.
   - Webhook signature verification + raw payload audit collection.
8. **Public-facing**
   - Homepage with recent announcements.
   - Bill inquiry (privacy-masked).
   - Tariff calculator.
   - New connection / reconnection request forms.
9. **Six staff roles** with strict permissions: admin, water_bill_officer, loan_officer, meter_reader (office), plumber (field), cashier.

### 1.2 Deliverables
- Full source code in private GitHub repository.
- Deployed system on the client's chosen cloud (Vercel + Render + MongoDB Atlas).
- Custom domain configured (`powassco.site` or as specified).
- Bootstrap admin account.
- Training session for admin + key staff (remote, recorded).
- Operations runbook (deploy, backup, restore, on-call basics).
- 30-day post-deployment hypercare (bug fixes free of charge).
- This System Overview document.

### 1.3 What is NOT included (available as add-ons)
- SMS / Email notifications (third-party fees apply).
- Native Android Play Store listing (Capacitor wrapper).
- Tagalog / Cebuano UI translation.
- Custom integrations with existing accounting software.
- Data migration from legacy spreadsheets (priced per data volume).
- Branch / multi-cooperative tenancy.

---

## 2. One-Time Development Cost

The system is **already built** to the scope above. The one-time fee covers the existing build, deployment, training, source code transfer, and 30-day hypercare.

### 2.1 Pricing tiers

| Tier | One-time fee (₱) | What's included |
|---|---:|---|
| **Standard** | **₱ 220,000** | Everything in Section 1.1 + 1.2. Manual QR PH only (no PSP integration). |
| **Plus** ⭐ recommended | **₱ 280,000** | Standard + PayMongo / Xendit realtime integration + webhook audit + env-key isolation. |
| **Enterprise** | **₱ 350,000** | Plus + Capacitor Play Store wrapper + automated S3 backups + monthly health-check reports for 12 months. |

> Rationale: the system covers six fully-built modules, two payment workflows, offline field operations, full security stack, and a public-facing surface — comparable to a 6-month engineering engagement at a local agency (₱400k–₱700k). Pricing here reflects an independent-developer rate.

### 2.2 Payment schedule (recommended)

| Milestone | % | Trigger |
|---|---:|---|
| Signing | 30% | Contract signed |
| Pilot deploy | 40% | System live, admin trained |
| Acceptance | 30% | 14-day acceptance test passed |

Other terms negotiable (e.g., 50/50, monthly instalments over 6 months).

### 2.3 Add-on services (one-time)

| Add-on | Price (₱) |
|---|---:|
| Data migration from spreadsheets (≤ 2,000 members) | 25,000 |
| SMS notifications wiring (Semaphore / Twilio; client pays per-message) | 15,000 |
| Email notifications wiring (SendGrid; client pays per-message) | 8,000 |
| Capacitor Play Store wrapper | 35,000 |
| Tagalog UI translation | 18,000 |
| Cebuano UI translation | 18,000 |
| Power BI / Looker read-only export | 12,000 |
| GIS map of meter locations | 22,000 |

---

## 3. Monthly Cloud Operating Cost

The cooperative pays cloud providers **directly** (so credentials and billing stay with the coop). The developer can set up the accounts on behalf of the coop during deployment.

### 3.1 Required services

| Service | Tier | USD/month | ₱/month (≈ ₱58/USD) |
|---|---|---:|---:|
| **Vercel** (frontend hosting + CDN) | Hobby (free) for small load, **Pro recommended** for production | $0 — $20 | 0 — 1,160 |
| **Render** (API server) | **Starter** ($7) for small load; **Standard** ($25) for steady traffic | $7 — $25 | 406 — 1,450 |
| **MongoDB Atlas** (database) | **M0 (free)** up to ≈ 512 MB; **M10 ($57)** when data grows or backups required | $0 — $57 | 0 — 3,306 |
| **Domain registration** | `.site` or `.com` | $1 — $1.5 | ~60 — 90 |
| **TLS / HTTPS** | Included free with Vercel + Render | $0 | 0 |
| **SUBTOTAL — minimum (free tiers)** | | **~$8** | **~₱470** |
| **SUBTOTAL — recommended production** | | **~$102** | **~₱5,920** |

### 3.2 Recommended setup for first-year production

| Service | Plan | ₱/month |
|---|---|---:|
| Vercel | Pro | 1,160 |
| Render | Starter | 406 |
| MongoDB Atlas | M10 | 3,306 |
| Domain (.site, amortised) | — | 60 |
| **Total** | | **~₱4,932/month** |

This is approximate; FX rate and provider price changes can shift it. Allow ~₱5,500/month buffer.

### 3.3 Optional / usage-based extras

| Service | Cost model |
|---|---|
| PayMongo / Xendit transaction fees | ~2.5% + small per-txn fee (paid out of payer's online surcharge — already wired into the system) |
| Semaphore SMS (PH local provider) | ~₱0.50 per SMS |
| Twilio SMS (international fallback) | ~₱2.50 per SMS |
| SendGrid (email) | Free up to 100/day; ~$15/month for 40k emails |

### 3.4 Cost-cutting fallback

If the cooperative wants to minimise monthly outflow at the cost of some performance + uptime:

| Service | Free-tier plan | Limits |
|---|---|---|
| Vercel | Hobby | 100 GB bandwidth/mo, no commercial SLA |
| Render | Free | Server sleeps after 15 min idle (cold start ~30s) — bad for cashier UX |
| MongoDB Atlas | M0 | 512 MB total (data + indexes); no scheduled backups |

**Free-tier monthly cost: ~₱60** (only the domain). Acceptable for a pilot or low-volume use; not recommended for production.

---

## 4. Maintenance & Support (Optional)

After the 30-day hypercare period ends, ongoing support is available as a monthly retainer.

| Tier | ₱/month | Coverage |
|---|---:|---|
| **Bronze** | 4,000 | Up to 4 hours of bug fixes / small tweaks per month. Email response within 48 hours. |
| **Silver** | 8,000 | Up to 10 hours/month. Includes minor feature additions. Response within 24 hours. |
| **Gold** | 15,000 | Up to 25 hours/month. New features in roadmap. Response within 8 working hours. Quarterly health-check report. |
| **Ad-hoc** | 800/hr | No retainer. Pay only for hours worked; 4-hour minimum per ticket. |

All tiers include emergency hot-fix on production-down incidents at no extra charge.

---

## 5. Project Timeline

The system is **already built and deployed**. Engagement timeline if signing today:

| Phase | Duration | Activity |
|---|---|---|
| Contract + NDA | 1 week | Signing, payment of first tranche |
| Data migration (if applicable) | 1–2 weeks | Import members, meters, prior bills |
| Configuration | 1 week | Tariffs, settings, branding, user accounts |
| Pilot run | 2 weeks | Live with 1 office + 1 plumber/cashier; daily check-ins |
| Acceptance test | 2 weeks | All staff onboarded; UAT checklist |
| Hypercare | 30 days | Free bug fixes, daily monitoring |

**Total to fully live: ~6–8 weeks** depending on data migration scope.

---

## 6. Acceptance Criteria

The system is considered "accepted" when:
1. All six roles can sign in and operate their dashboard.
2. A full water-billing cycle completes (read → bill → pay → OR).
3. A full loan cycle completes (apply → approve → release → pay → close).
4. Cashier successfully completes 10 walk-in lookups + dues slips.
5. Plumber successfully completes 10 offline readings + sync without duplicates.
6. Admin successfully generates one payroll batch + one expense report.
7. The 2FA flow is exercised by at least one user.
8. Public inquiry page is reachable, rate-limited, and returns the correct masked data.

---

## 7. Terms

- **Ownership**: Upon final payment, the cooperative receives a perpetual, exclusive license to use and modify the source code for the cooperative's internal operations. The developer retains the right to reuse underlying generic patterns (boilerplate, utility libraries) in unrelated future projects.
- **Confidentiality**: Both parties sign the [NDA](./NDA.md) before work begins.
- **Warranty**: 30-day defect warranty post-acceptance — bugs against the spec are fixed free of charge.
- **Liability cap**: Developer's liability under any single engagement is capped at the total fees paid by the cooperative under this proposal.
- **Cloud credentials**: All third-party accounts (Vercel, Render, MongoDB Atlas, PayMongo/Xendit) are owned by the cooperative. The developer is granted access only for the duration required to operate them on the coop's behalf.
- **Force majeure**: Standard exclusions for natural disasters, power/network outages outside developer control, and provider downtime.

---

## 8. Sign-Off

| | Cooperative | Developer |
|---|---|---|
| Name | | Gerald Durano |
| Title | | Independent Software Developer |
| Signature | | |
| Date | | |

---

*This proposal supersedes any prior estimates. Pricing is in Philippine Pesos unless noted. FX-denominated cloud costs are estimates and may shift with USD/PHP rates.*
