# POWASSCO Management System
## System Manuscript & Board Presentation

**Poblacion Owak Water & Sanitation Service Cooperative (POWASSCO)**
Owak, Asturias, Cebu · C.D.A Reg. No. 9520-07014753

*A complete description of the cooperative's management system, written in plain language for the Board and Audit Committee. No technical background is required to read it.*

---

### System Developer

**Gerald Durano**
Full Stack Developer · MERN Software Engineer · AI Engineer · Data Analyst · Project Manager · Security Consultant

*Designed, built, and deployed the entire POWASSCO Management System — water billing, loans, savings, treasury, payroll, online payments, the member-facing web app, and the plumber field mobile app — end to end.*

Contact: facebook.com/gerald.durano.16

---

### Document Control

| | |
|---|---|
| Document | POWASSCO Management System — Manuscript & Board Presentation |
| Audience | Board of Directors, Audit Committee, Management |
| Prepared by | Gerald Durano (System Developer) |
| Status | For presentation |
| Reading note | Plain-language; each major section begins on its own heading for clean printing. |

---

## Plain-Language Summary (Read This First)

**In one sentence:** POWASSCO now runs on **one secure online system** that does all the cooperative's record-keeping and money-handling, and it can be used from **any phone or computer**.

A simple way to picture it:
- The old **paper ledgers and notebooks** are replaced by **one shared, always-updated record** everyone looks at together — so the numbers never disagree between offices.
- The **computer does the math** (water bills, penalties, loan interest, payroll) the exact same way every time — no more hand-computation differences.
- **No single person can move money alone.** Anything sensitive — releasing a loan, moving cash, payroll — needs **two or three people to approve**, and **every action is permanently recorded** with the name of who did it.

The system has **two sides**:

**1. The Member Side — for the public and co-op members**
- Check their **water bill** and their **savings + share capital balance** from home, using their account number and a private PIN.
- Receive **automatic reminders** before a bill is due and when it becomes overdue.
- **Pay online** (GCash / QR) or get an **accurate printed bill on the spot** from the plumber.
- Install the free **"POWASSCO Member" app** on an Android phone — a simple home screen for bills, balance, and reminders.

**2. The Staff Side — for employees and officers**
- Each employee has a **role** (cashier, bookkeeper, water officer, loan officer, manager, admin, audit committee) that shows only the screens for their job.
- The **cashier** collects and pays out; the **bookkeeper** keeps the records; the **manager + bookkeeper** approve loans and money movements; the **audit committee** sees everything but changes nothing.
- Staff use it in any browser or install the **Windows desktop app**; plumbers use a **field app that works with no internet signal**.

**Is the money and data safe?** Yes. Passwords and PINs are **scrambled (never readable)**, sensitive logins need a **second one-time code (2FA)**, the system is **protected against common online attacks**, financial records can be **added but never quietly erased**, and everything is **backed up automatically** on professional cloud services. (Full detail in Sections 14–18 and 20.)

> The rest of this document explains each part in plain language. The Board can read just this summary and the Executive Summary (Section 6) for the complete picture; the remaining sections are there for depth and for the record.

---

## Table of Contents

**Part I — Introduction**
1. Background and Rationale
2. Objectives
3. Scope and Limitations
4. Significance of the System
5. Definition of Terms (Glossary)

**Part II — The System in Plain Terms**
6. Executive Summary
7. The Problem the System Solves
8. Roles and Responsibilities
9. How Work Flows Through the System
10. Full Features by Area

**Part III — How It Is Built and Protected**
11. System Architecture (in plain terms)
12. Development Methodology
13. System Requirements
14. Security and Data Safeguarding
15. Data Privacy
16. Testing and Quality Assurance
17. Deployment, Backup, and Maintenance
18. Standards and Good-Practice Compliance

**Part IV — The Apps, Field Operations, and Trust**
19. The Apps — Member, Field, and Desktop
20. System Integrity — Why the Numbers Can Be Trusted

**Part V — Direction and Guidance**
21. Roadmap
22. Quick User Guide (per role)
23. Conclusion
- Appendix A — System Modules at a Glance

---
---

# PART I — INTRODUCTION

# 1. Background and Rationale

POWASSCO is a multipurpose cooperative serving the community of Owak with water utility services, loans, savings, share capital, payroll, and member services. As membership and transactions grew, the cooperative's reliance on **paper ledgers and separate spreadsheets** became a limitation rather than a tool.

Manual records are slow to total, easy to mis-add, hard to cross-check, and impossible to audit quickly. A member's complete standing — water bills, loans, savings, and capital — was spread across different books. Cash handling depended heavily on personal trust, with little independent verification. Penalties, interest, and loan amortization were computed by hand and could differ from one staff member to another. Preparing reports for the Board took days of manual consolidation.

The **POWASSCO Management System** was developed to address these realities directly: to put every operation into **one connected, accountable, always-available system** that any staff member can use from a phone or computer, and that the Board and Audit Committee can trust without having to recheck by hand.

---

# 2. Objectives

**General Objective**
To provide POWASSCO with a single, secure, and accountable computer system that manages all of the cooperative's operations and produces trustworthy records and reports.

**Specific Objectives**
1. To maintain water billing — readings, tiered tariffs, bills, penalties, and disconnection/reconnection — accurately and automatically.
2. To manage the full loan lifecycle, from application and eligibility through a multi-approval release to collection.
3. To handle savings and Share Capital (CBU) with member self-service balance checking.
4. To control all cash and bank movements through a treasury with multi-party approvals and a complete inflow/outflow ledger.
5. To process payroll and expenses with proper approval before any money leaves the cooperative.
6. To give the Audit Committee independent, read-only oversight with sign-off reports.
7. To enable field staff to work offline and print bills on the spot.
8. To protect member money and data through layered security and a permanent audit trail.
9. To generate Board-ready reports and an audit summary instantly for any date range.

---

# 3. Scope and Limitations

**Scope — what the system covers**
- Water billing and field meter reading (online and offline)
- Loans (application → approval → disbursement → collection)
- Savings, Share Capital (CBU), and product sales/product loans
- Treasury (bank accounts + cash vault), payroll, and expenses
- Cashiering, bookkeeping, management operations, and independent audit
- Online payment acceptance, internal staff chat, and member self-service balance checking
- Full security, audit logging, and reporting

**Limitations — what is intentionally outside the system, by current design**
- It is an **operational and financial management system**, not a tax-filing or government-remittance engine; statutory remittances are computed/recorded but filed through the relevant agencies separately.
- It relies on **internet connectivity for office use** (the field app is the exception and works offline).
- It does not replace the Board's judgment — it provides accurate information and controls; decisions remain with the cooperative's officers.
- Historical paper records are brought in through a **verified import process** rather than assumed; figures are checked line by line before they become live.

---

# 4. Significance of the System (Beneficiaries)

- **Members** — accurate bills, faster service, on-the-spot printed bills, and the ability to check their own savings and capital from home.
- **Cashiers and Bookkeepers** — less manual computation, automatic receipts, and reconciliation that balances by itself.
- **Management** — real-time visibility and controlled approvals over every peso.
- **The Board and Audit Committee** — instant, trustworthy reports and an independent, tamper-evident audit trail.
- **The Cooperative as a whole** — stronger financial controls, reduced risk of error or loss, and a professional foundation for growth.

---

# 5. Definition of Terms (Glossary)

For non-technical readers, the recurring terms used in this manuscript:

- **CBU / Share Capital** — Capital Build-Up: a member's mandatory capital contribution held by the cooperative.
- **Savings** — a member's *voluntary* deposit account, separate from CBU, which can be withdrawn.
- **AR (Accounts Receivable)** — money owed to the cooperative (e.g., AR Water = unpaid water bills).
- **OR (Official Receipt)** — the numbered receipt issued when the cashier collects a payment.
- **Tariff** — the price schedule for water; "tiered" means different rates apply at different consumption levels.
- **Amortization** — the repayment schedule of a loan, period by period (principal + interest).
- **Diminishing balance** — an interest method where interest is charged on the remaining balance, so it falls as the loan is paid.
- **Net proceeds** — the cash a borrower actually receives: loan principal minus deductions/charges.
- **Cash Vault** — the cooperative's secured cash reserve, separate from the cashier's daily drawer.
- **Cash Drawer** — the cash the cashier physically holds during the day.
- **Disbursement** — paying money out (a loan payout, payroll, or an expense).
- **Dual control / multi-approval** — a rule requiring two or more people to approve an action before it takes effect.
- **Audit log** — the permanent record of every action taken in the system and who took it.
- **Role** — the job-based permission set that decides what a user can see and do.
- **PWA (mobile app)** — a Progressive Web App: an app installed from a web browser, with no app store, that can work offline.
- **2FA (Two-Factor Authentication)** — a second login step using a one-time code, on top of the password.
- **Staging vs. Production** — "staging" is the practice copy where changes are tested first; "production" is the live system the cooperative uses.

---
---

# PART II — THE SYSTEM IN PLAIN TERMS

# 6. Executive Summary

POWASSCO now runs on **one connected computer system** that replaces stacks of paper ledgers and disconnected spreadsheets. It handles everything the cooperative does day to day:

- **Water billing** — meter readings, bills, payments, disconnection and reconnection
- **Loans** — applications, approvals, releasing money, and collection
- **Savings & Share Capital (CBU)** — member deposits and capital build-up
- **Product sales & product loans** — goods sold for cash or on terms
- **Treasury** — bank accounts and the cash vault, with controlled transfers
- **Payroll** — staff salaries and cash advances
- **Expenses** — purchase and disbursement of cooperative funds
- **Oversight** — a full audit trail and an independent Audit Committee view

It works on **any phone, tablet, or computer with a web browser**, and field staff have a **mobile app that works even without internet signal**.

Every peso that moves is recorded, attributed to a named staff member, and — for anything sensitive — requires **more than one person to approve it**. Nothing important can be done by a single person alone, and nothing can be quietly deleted.

---

# 7. The Problem the System Solves

**Before:** records lived on paper ledgers and personal spreadsheets, which meant hand-added totals that disagreed between offices, no single view of a member, cash handled largely on trust, manual and inconsistent computations, no easy way to find "who did what," and slow Board reporting.

**After — what the system delivers:**

| Problem | How the system fixes it |
|---|---|
| Numbers disagree between offices | One shared database — everyone sees the same figure |
| No single view of a member | One screen shows water dues, loans, CBU, savings, and product balances |
| Cash handled without checks | Every cash movement is logged; sensitive ones need 2–3 approvals |
| Manual, error-prone math | The computer calculates penalties, interest, and amortization to the centavo |
| No accountability | A permanent audit log records every action and the person who did it |
| Slow board reporting | Reports and an audit summary generate instantly for any date range |
| Field work needs signal | The plumber app works offline and syncs when back online |
| Members can't check balances | A public "Check Balance" page lets members view savings + capital with a PIN |

---

# 8. Roles and Responsibilities

The system gives each staff member a **role** that decides which screens they see and what they may do. This is the foundation of accountability — a cashier cannot change tariffs, a water officer cannot release loans, and the Audit Committee can see everything but change nothing.

**Admin (System Administrator)** — manages user accounts and roles, settings (tariffs, loan rates, payment options), bank registration, security (2FA), the audit log, the system error monitor, and one-time data maintenance. Sets *how* the system behaves; kept out of daily operations.

**Manager (Operations)** — files expenses for disbursement, manages employees and payroll, approves loans (first signature) and payroll, manages product inventory, and approves treasury movements. Also sees shared monitoring views.

**Audit Committee (Independent Oversight)** — *read-only.* Sees every transaction, all analytics, payroll, treasury balances and flows, inventory, and the audit log, but changes nothing. Produces the Overall Audit Report for any date range and signs/archives audited periods.

**Water Bill Officer** — manages members and meters, generates bills, views the meter map, and handles disconnection/reconnection from the office.

**Loan Officer** — takes applications, checks eligibility, prepares amortization, and releases approved loans to the cashier. Opens member savings accounts.

**Cashier (Collections & Payouts)** — the single point where cash enters and leaves. Collects water bills, loan payments, product sales, savings deposits, member fees, and Share Capital; pays out approved loans, payroll, and expenses; maintains the cash drawer; issues one OR that can bundle several payables.

**Bookkeeper (Records & Reconciliation)** — reviews every transaction, maintains members' receivables and Share Capital, manages product loans and bank accounts/cash vault, approves loans (second signature), and produces the Treasurer's Report.

**Meter Reader (Office)** — enters and reviews meter readings from the office.

**Plumber (Field)** — reads meters, prints bills on the spot, and marks meters disconnected/reconnected — all offline, via the mobile app (Section 19).

---

# 9. How Work Flows Through the System

**Water billing & payment** — the reader records consumption (offline if needed) → the system computes the bill from the tiered tariff with senior/PWD discounts → if unpaid past grace, penalties add automatically (₱10/day) plus a ₱200 reconnection charge after grace, flagging disconnection → the member pays at the cashier on one OR, with any overpayment routed to CBU or savings → paying arrears + penalty + reconnection fee moves a disconnected meter into the reconnection queue.

**Loan — application to collection (four roles)** — Loan Officer records the application and the system checks eligibility and builds the amortization → **Manager approves** → **Bookkeeper approves** → **Loan Officer releases** to the cashier → **Cashier disburses** the net proceeds as cash, bank transfer, or cheque (with the cash drawer checked first). *No single person can create and release a loan alone.*

**Treasury — banks & cash vault** — Admin registers banks; Bookkeeper adds the cooperative's accounts. Every movement (adding balance, bank-to-vault, bank-to-bank, vault-to-bank, drawer-to-vault, vault-to-drawer) **requires approval in order** by the right mix of Manager, Bookkeeper, and Cashier, then a reference number is recorded. All movements appear in an inflow/outflow ledger.

**Expenses & payroll** — the Manager files an expense; the Cashier pays it as cash (drawer) or bank/cheque (bank account), recording the voucher. Payroll is prepared by the Bookkeeper, **approved by the Manager**, then the Cashier prints the payslip (employee signs) and pays out. The cashier **cannot pay more than the drawer holds** — they request from the vault first.

**New member onboarding** — registering a new member automatically raises a membership fee + tapping fee for the cashier to collect.

**Savings & Share Capital** — members open savings secured by a 4-digit PIN and can check their savings and capital balance themselves on the public homepage; interest applies on a schedule the Admin sets.

---

# 10. Full Features by Area

**Water Billing** — member & multi-meter records, auto-generated account/meter numbers, tiered tariffs (flat or per-cubic) with senior/PWD discounts, one bill per meter per period, automatic overdue penalties, disconnection/reconnection workflow with a color-coded meter map, analytics and period collection views.

**Loans** — eligibility checks, whole-peso diminishing-balance amortization, four-role approval chain → cashier disbursement (cash/bank/cheque), collection tracking, period views (capital, interest, paid/unpaid, deductions), printable disclosure, promissory note, and receipts.

**Cashier** — single-screen counter (water dues, loan dues, sales, savings, disbursements, collection, history, reports, treasury, cash drawer); one OR can bundle water + product loans + CBU + savings; overpayment routing to CBU/savings/split; full cash-drawer reconciliation.

**Bookkeeper** — every-transaction feed; members & receivables in one row (CBU, AR water, fines, reconnection, AR loan, product, savings); product loans + analytics (capital, profit, inventory, sold vs unsold); Treasurer's report (PDF/Excel); loan collections; payroll; adjustments.

**Manager** — expenses, employees, payroll approvals, loan approvals, inventory, treasury, reports, requests, calendar/events, announcements, shared analytics.

**Admin** — user & role management, all settings, bank registration, online-payment settings, security (2FA), audit log, system error monitor, data maintenance tools.

**Audit Committee** — Overall Audit Report (collections, disbursements, loans, inventory, treasury flows, financial ratios, cash on hand) for any date range; automatic system remarks; sign-and-archive printable audited reports; read-only access across transactions, analytics, payroll, treasury, and audit logs.

**Treasury** — bank registry + accounts, cash vault, ordered multi-party approvals, full inflow/outflow ledger.

**Savings & CBU** — voluntary savings with PIN, public balance check, interest accrual, Share Capital ledger.

**Member Self-Service & Mobile App** — members check their water bills and their savings + Share Capital balance themselves (account number + private PIN), and can install the **"POWASSCO Member" Android app** — a simple "My POWASSCO" home with **My Bills**, **My Balance**, reminders on/off, and an optional 4-digit app PIN. No member passwords are stored; access is by the member's own saved account + PIN.

**Automatic Bill Reminders & Announcements** — the system automatically notifies members on their phones: a **new-bill** notice, a **due-soon** reminder before the due date, and a **daily overdue** reminder until paid (it stops once the meter is disconnected or the bill is settled). The cooperative can also **broadcast announcements** to all subscribed members.

**Online payments** — accepts verified online payments (QR PH / e-wallet) with secure provider confirmation; the amount is always computed by the system, and duplicate payments are blocked.

**Petty Cash Fund** — the cashier runs a small **imprest fund**: top it up (cash in), record **vouchers** for minor expenses (cash out), and the system keeps a **running balance** and blocks overspending. Bookkeeper, manager, and audit see it read-only, and it exports in the Reports.

**Reports (PDF & Excel)** — the Treasurer's Report, Petty Cash, and others export as a **branded PDF** (cooperative letterhead, totals, signature blocks, page numbers) and a **real Excel (.xlsx) workbook** whose amounts stay as true numbers that sum and pivot.

**Team Chat** — internal staff chat (office roles) with **@mentions** (type @ to tag a teammate, who gets a special "mentioned you" alert + chime), reactions, read receipts, screenshots, and profile photos.

**Everywhere** — two-factor login, 30-minute idle lock with a tap-in PIN keypad, full audit logging, and role-based access on every screen.

---
---

# PART III — HOW IT IS BUILT AND PROTECTED

# 11. System Architecture (in plain terms)

The system has three connected parts, like a well-run office:

1. **The front desk (what you see)** — a web application that runs in any browser on a phone, tablet, or computer. There is nothing to install for office staff; field staff can install it as an app.
2. **The back office (where decisions are enforced)** — a secure server that holds the rules. It is the part that actually checks "is this person allowed to do this?" and "does this payment balance?" — so the rules cannot be bypassed by tampering with a screen.
3. **The records room (where data lives)** — a managed database that stores every member, bill, loan, payment, and ledger entry in one place, continuously backed up.

These run on **professional cloud platforms** (the front desk and back office are hosted separately), which provide reliability, automatic backups, and large-scale protection against attacks. In everyday terms: the cooperative does not have to maintain its own server room, and the data is kept safe and available by specialists.

A **practice copy (staging)** mirrors the live system. Every change is tried there first; only after it works is it promoted to the **live system (production)**.

---

# 12. Development Methodology

The system was developed **iteratively** — built in small, working pieces rather than one big delivery — so that each capability could be put to use and verified early. The working approach:

- **Build a feature → test it on the practice copy → promote it to live.**
- Keep an **automated test suite** that re-checks core money calculations on every change.
- Make every financial action **idempotent where possible** (safe to repeat without double-counting) and **atomic** (it fully completes or not at all).
- Favor **clear audit trails and approvals** over convenience whenever money is involved.

This is why new requests from management could be delivered continuously and safely, without disrupting live operations.

---

# 13. System Requirements

**To use the system (staff and members)**
- Any reasonably modern device — smartphone, tablet, laptop, or desktop
- A web browser (e.g., Chrome, Edge, Safari)
- Internet connection for office work
- For field staff: a smartphone, and a portable Bluetooth thermal printer for on-site bills

**To operate the field app offline**
- The route is downloaded while online, then the phone works without signal and syncs later

**No special hardware, server room, or per-seat software licenses are required** — the system is reached through the browser.

---

# 14. Security and Data Safeguarding

Member money and information are protected by **multiple independent layers** — if one were bypassed, others still stand.

**Getting in (authentication)**
- Private staff accounts; passwords stored **scrambled (hashed)**, never in plain text.
- **Two-factor authentication** for sensitive roles, with single-use backup codes.
- **Trusted devices** and a **30-minute idle lock** behind a personal PIN.

**Doing things (authorization)**
- **Role-based access**, enforced on the server — not just by hiding buttons.
- **Dual control** — money movements, balance adjustments, loans, payroll, and treasury transfers require **two or more approvals in a set order**.
- **Independent audit** — the Audit Committee reviews everything, changes nothing.

**Protecting the data itself**
- Defenses against common internet attacks: request **rate-limiting** (slows brute-force and denial-of-service attempts), input **sanitization** (blocks database tampering), secure headers, and an approved-website list.
- **Append-only ledgers** for Share Capital, savings, and treasury — entries are added, never quietly edited away.
- **Atomic money writes** — a payment either completes fully or not at all.
- Professional cloud hosting with built-in attack protection and automatic backups.

**Watching the system**
- A **permanent audit log** of every action, who did it, and when (kept for months, colour-coded by type).
- A **System Monitor** that captures any technical error for the Admin to review and resolve.

---

# 15. Data Privacy

- Personal information is collected only for cooperative operations (billing, loans, savings, membership).
- Access is limited by role — staff see only what their job requires.
- The public **Check Balance** page reveals a balance **only** after the member enters their own account number and 4-digit PIN, and locks after repeated wrong attempts.
- Sensitive fields (passwords, PINs, security codes) are never displayed or stored in readable form.
- The audit trail provides accountability for every access to financial records.

---

# 16. Testing and Quality Assurance

- **Automated tests** re-verify the core money logic (water billing tiers, loan amortization, payroll computation) on every change, so a future edit cannot silently break a calculation.
- **Practice-copy verification** — every feature is exercised on staging before it reaches members.
- **Dry-run tools** — sensitive data operations (like importing historical loan ledgers, or balance corrections) preview their effect first and require confirmation before any change is written.
- **Idempotent, atomic money handling** — repeats don't double-count, and partial failures don't leave half-finished records.
- **Reconciliation checks** — Share Capital and treasury balances are continuously checked against their ledgers; any discrepancy is surfaced for the bookkeeper.

---

# 17. Deployment, Backup, and Maintenance

- The system is **live on the internet** and reached by a web address; there is nothing for the cooperative to install or maintain on a local server.
- It is hosted on **managed cloud platforms** that handle uptime, scaling, and **automatic database backups**.
- Changes follow a **staging → production** path so the live system is only updated with verified work.
- The **Audit Log** (retained for months) and **System Monitor** give ongoing visibility into activity and any errors.
- Routine maintenance (settings, new staff accounts, tariff changes) is done by the Admin through the system itself — no programmer needed for day-to-day administration.

---

# 18. Standards and Good-Practice Compliance

The system follows widely accepted practices for handling money and personal data:

- **Separation of duties** and **dual control** for financial actions (a core internal-control principle).
- **Complete, tamper-evident audit trail** for accountability.
- **Least-privilege access** — each role can do only what its job requires.
- **Encryption in transit** — all communication with the system is encrypted (the secure padlock in the browser).
- **Hashed credentials and PINs** — never stored in readable form.
- **Data-minimization and purpose-limitation** — only necessary data is collected, used only for cooperative operations, consistent with the spirit of the Data Privacy Act.

---
---

# PART IV — THE APPS, FIELD OPERATIONS, AND TRUST

# 19. The Apps — Member, Field, and Desktop

The system is one web application, but it is also packaged as **three purpose-built apps** so each audience gets the simplest possible experience.

## 19.1 The Member Mobile App (POWASSCO Member — Android)

Members can install a **real Android app** on their phone — built from the same system, signed, and downloadable from the cooperative's website (no Play Store needed). It opens to a simple **"My POWASSCO"** home:

- **My Bills** — view current and past water bills and what's due.
- **My Balance** — check savings and Share Capital (CBU), protected by the member's PIN.
- **Reminders on/off** — choose to receive bill notifications.
- **Optional app PIN** — lock the app on the device for privacy.

The app needs **no member password** — a member simply saves their account/meter on the device. Once installed, it **receives the automatic bill reminders and announcements** directly as phone notifications. Members who prefer not to install anything can do all the same things on the **website** (the "Check Balance" and bill-inquiry pages), or simply receive an **accurate printed bill** from the plumber.

## 19.2 The Plumber Field App (works offline)

Plumbers and meter readers carry the system into the field as an **installable app that works without internet** — essential for remote sitios with no signal.

1. Before heading out, the plumber downloads their assigned route — the members, previous readings, and current tariffs — onto the phone.
2. In the field, **with no signal**, they:
   - Scan or type a meter number
   - Enter the new reading
   - **Print the bill on the spot** via a portable Bluetooth thermal printer
   - Mark a meter **disconnected** or **reconnected**
3. When signal returns, the phone **syncs automatically**. The sync is safe against duplicates — re-syncing the same reading never double-bills.
4. The field app has its own **re-entry PIN**, so a misplaced phone cannot expose member data.

This means billing continues even with no cell coverage, and members receive an accurate printed bill immediately.

## 19.3 The Staff Desktop App (Windows)

Office staff can install a **Windows desktop app** that opens the system in its **own window** (not a browser tab) and lands directly on the staff login. It always shows the **current live system** — so it never needs reinstalling when the system is updated — and it's downloadable straight from each staff dashboard. This gives the office a clean, dedicated "POWASSCO" program on the desktop, while still allowing any staff member to use a plain browser if they prefer.

---

# 20. System Integrity — Why the Numbers Can Be Trusted

- **Single source of truth** — every screen reads the same database, so totals always agree.
- **Separation of duties** — those who request money are not those who approve it, and the auditors approve nothing.
- **The computer does the math** — tariffs, penalties, interest, and amortization are calculated identically every time.
- **Reconciliation built in** — Share Capital and treasury ledgers are checked against running balances; any drift is surfaced.
- **Everything is traceable** — a Board report can be drilled down to the exact receipt and the staff member who issued it.
- **Independent audit sign-off** — the Audit Committee freezes and signs a period's figures, with automatic findings, creating a permanent reviewed record.

---
---

# PART V — DIRECTION AND GUIDANCE

# 21. Roadmap

**Delivered and in use**
- Water billing, loans, savings & CBU, product sales/loans
- Cashier counter (incl. **petty-cash imprest fund**), bookkeeping, treasury (banks + cash vault) with approvals
- Manager operations, payroll with approvals & cash advance
- Audit Committee dashboard with overall audit report, ratios, sign-off, **plus automatic remarks and prioritised recommendations** drawn from inflows/outflows and all transactions
- **Member mobile app (Android)** — bills, balance, reminders; and **automatic bill reminders + announcements** delivered to members' phones
- **Plumber field app** (offline readings, on-site printing, disconnect/reconnect)
- **Staff Windows desktop app**
- **Branded PDF + Excel (.xlsx) report exports**
- Online payments, team chat **with @mentions**, full security suite, audit log, system monitor

**Underway / planned**
- Importing the historical paper **loan and water ledgers** into the system, verified line by line
- Optional **native push (FCM)** for even more reliable phone notifications (groundwork in place)
- Refinements to dashboards and reports as the committee uses them
- Ongoing tuning of automatic financial-health thresholds to the cooperative's norms

New capabilities are added in **small, tested steps**, each verified on the practice copy before reaching the live system.

---

# 22. Quick User Guide (per role)

**All staff** — open the website, log in with Employee ID + password (and authenticator code if prompted). If the screen locks after 30 minutes, enter your 4-digit PIN to resume.

**Cashier (Counter)** — search a member → see all their dues → collect → enter the OR number → print. Use the pills to switch between Water, Loan, Sales, Savings, Disbursements, Cash Drawer, and Reports.

**Loan Officer (Apply → Release)** — apply for a member (eligibility shows automatically) → wait for Manager + Bookkeeper approval → click **Release** to send it to the cashier for payout.

**Manager (Approve & operate)** — check the red badges on **Loan Approvals**, **Payroll Approvals**, **Treasury**, and **Expenses** — those are items waiting for you.

**Bookkeeper (Records)** — **Members & CBU** for a member's full standing; **Treasury** for banks/vault; **Reports** for the Treasurer's Report; approve loans on **Loan Approvals**.

**Audit Committee (Review & sign)** — open **Overall Audit Report**, choose the range, read the figures and **System Remarks**, then **Sign as Audited**. Signed reports live under **Audited Reports** (printable).

**Admin (Setup & safety)** — manage people in **User Management**; configure rates/tariffs in **Settings**; watch **System Monitor** and **Audit Log**.

**Plumber (Field)** — download the route while online → read meters and print bills offline → the app syncs when signal returns.

---

# 23. Conclusion

The POWASSCO Management System gives the cooperative **accurate records, controlled cash handling, instant reporting, and a complete audit trail**, while remaining simple enough that any staff member can do their part from a phone or computer, and a member can check their own balance from home.

It is built around a principle the Board can rely on: **no important action happens by one person alone, and nothing of value can be changed without leaving a permanent, reviewable record.** This is the foundation of a transparent, well-controlled, and growth-ready cooperative.

---

## Appendix A — System Modules at a Glance

| Module | Purpose | Primary users |
|---|---|---|
| Water Billing | Readings, tariffs, bills, penalties, disconnection | Water Officer, Meter Reader, Plumber |
| Loans | Application → approval → disbursement → collection | Loan Officer, Manager, Bookkeeper, Cashier |
| Savings & CBU | Voluntary savings + Share Capital, member balance check | Cashier, Loan Officer, Bookkeeper |
| Product Sales / Loans | Goods sold for cash or on terms, inventory | Bookkeeper, Manager, Cashier |
| Treasury | Bank accounts + cash vault, approved transfers | Bookkeeper, Manager, Cashier, Admin |
| Payroll | Salaries + cash advances, with approval | Bookkeeper, Manager, Cashier |
| Expenses | Purchase/disbursement of funds, with approval | Manager, Cashier |
| Cashiering | Single point of collection and payout, incl. petty-cash fund | Cashier |
| Bookkeeping | Records, receivables, reconciliation, PDF/Excel reports | Bookkeeper |
| Audit | Independent oversight, signed reports, auto remarks + recommendations | Audit Committee |
| Administration | Users, settings, security, monitoring | Admin |
| Member App (Android) | Bills, savings/CBU balance, reminders, app PIN | Members |
| Field App | Offline readings + on-site bill printing | Plumber, Meter Reader |
| Desktop App (Windows) | Dedicated staff window, opens to login | Office staff |
| Bill Reminders & Announcements | Auto phone notices: new bill, due-soon, overdue; broadcasts | Members |
| Online Payments | Accept verified e-wallet/QR payments | Members, Officers |
| Security & Audit | 2FA, idle-lock PIN keypad, audit log, error monitor | All |

*— End of document —*
