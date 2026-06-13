# POWASSCO Management System
## Board Presentation & System Overview

**Poblacion Owak Water & Sanitation Service Cooperative (POWASSCO)**
Owak, Asturias, Cebu · C.D.A Reg. No. 9520-07014753

*Prepared for the Board / Audit Committee — written in plain language for non-technical readers.*

---

### System Developer

**Gerald Durano**
Full Stack Developer · MERN Software Engineer · AI Engineer · Data Analyst · Project Manager · Security Consultant

*Designed, built, and deployed the entire POWASSCO Management System — water billing, loans, savings, treasury, payroll, online payments, the member-facing web app, and the plumber field mobile app — end to end.*

Contact: facebook.com/gerald.durano.16

---

## How to read this document

This paper describes the cooperative's complete computer system in everyday terms. You do **not** need a technical background. Each section answers a simple question:

- **What is it?** — what the system does
- **Who uses it?** — the staff roles and what each one can do
- **How does work flow?** — the step-by-step journey of money and records
- **Is it safe?** — how member money and data are protected
- **What's next?** — the roadmap

You can print this whole document. Each major section starts on its own heading so it divides cleanly into handouts.

---

# 1. Executive Summary

POWASSCO now runs on **one connected computer system** that replaces stacks of paper ledgers and disconnected spreadsheets. It handles everything the cooperative does day to day:

- **Water billing** — meter readings, bills, payments, disconnection and reconnection
- **Loans** — applications, approvals, releasing money, and collection
- **Savings & Share Capital (CBU)** — member deposits and capital build-up
- **Product sales & product loans** — goods sold for cash or on terms
- **Treasury** — bank accounts and the cash vault, with controlled transfers
- **Payroll** — staff salaries and cash advances
- **Expenses** — purchase and disbursement of cooperative funds
- **Oversight** — a full audit trail and an independent Audit Committee view

The system is available on **any phone, tablet, or computer with a web browser**, and the field staff (plumbers/meter readers) have a **mobile app that works even without internet signal**.

Every peso that moves through the cooperative is recorded, attributed to a named staff member, and — for anything sensitive — requires **more than one person to approve it**. Nothing important can be done by a single person acting alone, and nothing can be quietly deleted.

---

# 2. The Problem This System Solves

**Before:** records lived on paper ledgers and personal spreadsheets. That meant:

- Totals had to be added by hand and often disagreed between offices
- A member's full standing (water bills + loans + savings + capital) was never in one place
- Cash handling relied on trust with little independent checking
- Penalties, interest, and amortization were computed manually and inconsistently
- Finding "who did what, and when" was nearly impossible
- Reports for the board took days to assemble

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

# 3. Who Uses the System — Roles & Responsibilities

The system gives each staff member a **role**. The role decides which screens they see and what they are allowed to do. This is the foundation of accountability: a cashier cannot change tariffs, a water officer cannot release loans, and the audit committee can see everything but change nothing.

There are **nine roles**:

### 3.1 Admin (System Administrator)
The system's caretaker. Manages **user accounts and roles**, **settings** (tariffs, loan rates, payment options), **bank registration**, **security (two-factor authentication)**, the **audit log**, the **system error monitor**, and one-time data maintenance. The Admin sets up *how* the system behaves but is intentionally kept out of day-to-day operations (those moved to the Manager).

### 3.2 Manager (Operations)
Runs daily operations: **files expenses for disbursement**, manages **employees and payroll**, approves **loans (first signature)** and **payroll**, manages **product inventory**, and approves **treasury movements (bank & cash vault)**. Also sees the shared monitoring views (meter map, analytics, collections).

### 3.3 Audit Committee (Independent Oversight)
**Read-only.** Sees every transaction, all analytics, payroll, treasury balances and flows, product inventory, and the audit log — but **cannot change, approve, or delete anything**. Produces an **Overall Audit Report** for any date range, with automatic financial-health remarks, and can **sign and archive** a period as audited. This independence is what makes the audit meaningful.

### 3.4 Water Bill Officer
Manages **water members and meters**, generates **bills**, views the **meter map**, and handles the **disconnection/reconnection** queue from the office.

### 3.5 Loan Officer
Takes **loan applications**, checks **eligibility**, prepares the **amortization schedule**, and **releases approved loans** to the cashier for payout. Also opens member **savings accounts**.

### 3.6 Cashier (Collections & Payouts)
The single point where cash enters and leaves. **Collects** water bills, loan payments, product sales, savings deposits, member fees, and Share Capital. **Pays out** approved loans, payroll, and expenses. Maintains the **cash drawer** and can request cash to/from the vault. Issues one **Official Receipt (OR)** that can bundle several payables together.

### 3.7 Bookkeeper (Records & Reconciliation)
Keeps the books: reviews **every transaction**, maintains **members' receivables and Share Capital**, manages **product loans and bank accounts/cash vault**, approves **loans (second signature)**, and produces the **Treasurer's Report**.

### 3.8 Meter Reader (Office)
Enters and reviews **meter readings** from the office.

### 3.9 Plumber (Field) — with the Mobile App
Works in the field, **reads meters**, **prints bills on the spot** via a portable Bluetooth printer, and marks meters **disconnected/reconnected** — all **offline**, syncing automatically when signal returns. (Details in Section 8.)

---

# 4. How Work Flows Through the System

This section traces the real journeys, end to end.

### 4.1 Water billing & payment
1. The plumber/meter reader records the meter reading (in the field, even offline).
2. The system computes the bill from the cooperative's **tiered tariff** (different rates for different consumption levels, with senior/PWD discounts).
3. The bill becomes due. If unpaid past the grace period, the system **automatically adds penalties** (₱10 per day) and, after grace runs out, a **₱200 reconnection charge** — flagging the meter for disconnection.
4. The member pays at the cashier. The cashier issues one OR. Any overpayment can be routed to **Share Capital (CBU)** or **savings**.
5. If the meter was disconnected, paying the arrears + penalty + reconnection fee puts it in the **reconnection queue** for the plumber to restore.

### 4.2 Loan — from application to collection (multi-approval)
1. **Loan Officer** records the application; the system checks eligibility (enough Share Capital, no unpaid water bills) and builds the **amortization schedule** (fixed diminishing balance, whole-peso to match the paper ledger).
2. **Manager approves** (first signature).
3. **Bookkeeper approves** (second signature).
4. **Loan Officer releases** it to the cashier's payout queue.
5. **Cashier disburses** the net proceeds — as **cash** (from the drawer), **bank transfer**, or **cheque** (with cheque number recorded). The system checks there is enough cash before allowing a cash payout.
6. The loan's clock starts on the actual payout date; repayments are collected by the cashier and tracked against the schedule.

*No single person can create and release a loan alone — it takes four roles.*

### 4.3 Treasury — banks & cash vault (controlled transfers)
- The **Admin registers banks** (name + logo). The **Bookkeeper** adds the cooperative's actual bank accounts.
- Moving money — adding bank balance, withdrawing to the vault, bank-to-bank transfer, depositing the vault into a bank, or moving cash between the drawer and the vault — **always requires approval, in order**, by the right combination of Manager, Bookkeeper, and/or Cashier.
- After approval, the responsible person records the **bank slip / reference number**.
- Every movement appears in an **inflow/outflow ledger** with the running balance.

### 4.4 Expenses & payroll (money leaving the cooperative)
- The **Manager files an expense** for disbursement; the **Cashier pays it** as cash (deducts the drawer) or by bank/cheque (deducts the chosen bank account) — recording the voucher number.
- **Payroll**: the Bookkeeper prepares it, the **Manager approves**, then the **Cashier prints the payslip** (the employee signs it) and **pays out**, recording who received the money.
- Employees can be given a **cash advance** through the same controlled flow.
- The cashier **cannot pay out more than the drawer holds** — they must first request cash from the vault.

### 4.5 New member onboarding
When a new water member registers, the system automatically raises a **membership fee + tapping fee** for the cashier to collect on one OR.

### 4.6 Savings & Share Capital (CBU)
- Members may open a **voluntary savings account** secured by a **4-digit PIN**.
- They can **check their savings and Share Capital balance themselves** on the public homepage using their account number + PIN.
- The cashier accepts deposits and pays withdrawals; the system can apply **interest** on a schedule set by the Admin.

---

# 5. Full Feature List (by area)

**Water Billing**
- Member & multi-meter records, auto-generated account and meter numbers
- Tiered tariffs (flat or per-cubic), senior/PWD discounts
- One bill per meter per period; automatic overdue penalties
- Disconnection & reconnection workflow with a live meter map (color-coded by status)
- Water analytics and period collection views

**Loans**
- Eligibility checks, whole-peso diminishing-balance amortization
- Four-role approval chain → cashier disbursement (cash/bank/cheque)
- Collection tracking, period views (capital, interest, paid/unpaid, deductions)
- Printable disclosure, promissory note, and receipts

**Cashier**
- Single-screen counter: water dues, loan dues, sales, savings, disbursements, collection, history, reports, treasury, cash drawer
- One OR can bundle water + product loans + Share Capital + savings
- Overpayment routing to CBU, savings, or a 50/50 split
- Cash drawer reconciliation (all inflows and outflows, separated and totaled)

**Bookkeeper**
- Every transaction feed; members & receivables in one row (CBU, AR water, fines, reconnection, AR loan, product, savings)
- Product loans + product analytics (capital, profit, inventory, sold vs unsold)
- Treasurer's report (PDF/Excel), loan collections, payroll, adjustments

**Manager**
- Expenses, employees, payroll approvals, loan approvals, inventory, treasury
- Reports, requests, calendar/events, announcements, shared analytics

**Admin**
- User & role management, all settings, bank registration, payment (online) settings
- Security (2FA), audit log, system error monitor, data maintenance tools

**Audit Committee**
- Overall Audit Report (collections, disbursements, loans, inventory, treasury flows, ratios, cash on hand) for any date range
- Automatic system remarks/recommendations; sign-and-archive audited reports (printable)
- Read-only access to transactions, analytics, payroll, treasury, and audit logs

**Treasury**
- Bank registry + accounts, cash vault, ordered multi-party approvals, full inflow/outflow ledger

**Savings & CBU**
- Voluntary savings with PIN, public balance check, interest accrual, Share Capital ledger

**Online payments**
- Accepts verified online payments (QR PH / e-wallet) with secure provider confirmation

**Team Chat**
- Internal staff chat (office roles) with reactions, read receipts, screenshots, and profile photos

**Everywhere**
- Two-factor login, 30-minute idle lock with PIN, full audit logging, role-based access

---

# 6. Security & Data Safeguarding

Member money and information are protected by **multiple independent layers** — if one were bypassed, others still stand.

**Getting in (authentication)**
- Each staff member has a private account; passwords are stored **scrambled (hashed)**, never in plain text.
- **Two-factor authentication**: sensitive roles confirm a one-time code from an authenticator app, with single-use backup codes.
- **Trusted devices** and a **30-minute idle lock** — step away and the screen locks behind a personal PIN.

**Doing things (authorization)**
- **Role-based access**: the system enforces what each role may see and do on the server, not just by hiding buttons.
- **Dual control**: money movements, balance adjustments, loans, payroll, and treasury transfers require **two or more approvals in a set order**.
- **Independent audit**: the Audit Committee can review everything but change nothing.

**Protecting the data itself**
- Defenses against common internet attacks: request **rate-limiting** (slows brute-force and denial-of-service attempts), input **sanitization** (blocks database-tampering), secure headers, and an approved-website list.
- **Append-only ledgers** for Share Capital, savings, and treasury — entries are added, never quietly edited away.
- **Atomic money writes** — a payment either completes fully or not at all; it can't half-post.
- Hosted on professional cloud platforms with their own large-scale attack protection and automatic backups.

**Watching the system**
- A **permanent audit log** records every action, who did it, and when (kept for months, colour-coded by type).
- A **System Monitor** captures any technical error for the Admin to review and resolve.

---

# 7. Data Privacy

- Member and staff personal information is collected only for cooperative operations (billing, loans, savings, membership).
- Access is limited by role — staff see only what their job requires.
- The public **Check Balance** page reveals a balance **only** after the member enters their own account number and 4-digit PIN, and locks after repeated wrong attempts.
- Sensitive fields (passwords, PINs, security codes) are never displayed or logged in readable form.
- The audit trail provides accountability for every access to financial records.

---

# 8. The Plumber Mobile App (Field Operations)

The plumbers and meter readers carry the system into the field as an **installable mobile app** (a Progressive Web App — it installs from the browser, no app-store needed).

**What makes it special: it works without internet.**

1. Before heading out, the plumber downloads their assigned route — the members, previous readings, and current tariffs — onto the phone.
2. In the field, **with no signal**, they:
   - Scan or type a meter number
   - Enter the new reading
   - **Print the bill on the spot** via a portable Bluetooth thermal printer
   - Mark a meter **disconnected** or **reconnected**
3. When signal returns, the phone **syncs automatically**. The sync is safe against duplicates — re-syncing the same reading never double-bills.
4. The field app has its own **re-entry PIN** so a misplaced phone can't expose member data.

This means billing continues in remote sitios where there is no cell coverage, and members get an accurate printed bill immediately.

---

# 9. System Integrity — Why the Numbers Can Be Trusted

- **Single source of truth**: every screen reads the same database, so totals always agree.
- **Separation of duties**: the people who request money are not the ones who approve it, and the auditors approve nothing.
- **The computer does the math**: tariffs, penalties, interest, and amortization are calculated automatically and identically every time.
- **Reconciliation built in**: Share Capital and treasury ledgers are checked against their running balances; any drift is surfaced for the bookkeeper.
- **Everything is traceable**: from a board report you can drill down to the exact receipt and the staff member who issued it.
- **Independent audit sign-off**: the Audit Committee freezes and signs a period's figures, with automatic findings, creating a permanent record of what was reviewed.

---

# 10. Roadmap — Where We Are and What's Next

**Delivered and in use**
- Water billing, loans, savings & CBU, product sales/loans
- Cashier counter, bookkeeping, treasury (banks + cash vault) with approvals
- Manager operations, payroll with approvals & cash advance
- Audit Committee dashboard with overall audit report, ratios, and sign-off
- Plumber field mobile app (offline readings, on-site printing, disconnect/reconnect)
- Online payments, team chat, full security suite, audit log, system monitor

**Underway / planned**
- Importing the historical paper loan ledgers (Jan–May 2026) into the system, verified line by line
- Refinements to dashboards and reports as the committee uses them
- Ongoing tuning of automatic financial-health thresholds to the cooperative's norms

The system is built so new capabilities are added in small, tested steps — each change is verified on a staging (practice) copy before it reaches the live system.

---

# 11. Quick User Guide (per role)

**All staff**
- Open the website, log in with your Employee ID + password (and your authenticator code if prompted).
- If the screen locks after 30 minutes, enter your 4-digit PIN to resume.

**Cashier** — *Counter*
- Search a member → see all their dues → collect → enter the OR number → print. Use the pills to switch between Water, Loan, Sales, Savings, Disbursements, Cash Drawer, and Reports.

**Loan Officer** — *Apply → Release*
- Apply for a member (eligibility shows automatically) → wait for Manager + Bookkeeper approval → click **Release** to send it to the cashier for payout.

**Manager** — *Approve & operate*
- Check the red badges on **Loan Approvals**, **Payroll Approvals**, **Treasury**, and **Expenses** — those are items waiting for you.

**Bookkeeper** — *Records*
- **Members & CBU** for a member's full standing; **Treasury** for banks/vault; **Reports** for the Treasurer's Report; approve loans on **Loan Approvals**.

**Audit Committee** — *Review & sign*
- Open **Overall Audit Report**, choose the month/range, read the figures and **System Remarks**, then **Sign as Audited**. Find signed reports under **Audited Reports** (printable).

**Admin** — *Setup & safety*
- Manage people in **User Management**; configure rates/tariffs in **Settings**; watch **System Monitor** and **Audit Log**.

**Plumber** — *Field*
- Download the route while online → read meters and print bills offline → the app syncs when signal returns.

---

# 12. Closing

This system gives POWASSCO **accurate records, controlled cash handling, instant reporting, and a complete audit trail** — while remaining simple enough that any staff member can do their part from a phone or computer, and a member can check their own balance from home.

Most importantly, it is built around a principle the board can rely on: **no important action happens by one person alone, and nothing of value can be changed without leaving a permanent, reviewable record.**

*— End of document —*
