// One-shot importer for the January 2026 "Summary of Loan Released"
// page from the legacy paper ledger.
//
// Run with:  npm run import-loans   (cwd = server/)
//
// Each row in LOANS below becomes a LoanApplication doc with:
//   - status = "released"
//   - releasedAt = the row's release date (parsed from the
//     "month of January 2026" header, releasedOn column below)
//   - principal, totalCharges = deduction, netProceeds (no per-item
//     breakdown — the paper ledger only kept the lump sum)
//   - termMonths = 6 (uniform across the page)
//   - monthlyPayment / amortization computed via the same helper the
//     normal Apply Loan flow uses
//   - firstPaymentDate = the month after release, maturityDate = +6
//   - balance = totalPayment (cashier catches up via the normal
//     /cashier/pay-loan flow — Jan/Feb/Mar/Apr/May/Jun installments)
//
// Borrower resolution
//   The legacy ledger only has last + first name. We resolve to a
//   WaterMember's pnNo by case-insensitive substring match on
//   `${last}, ${first}` against accountName. If multiple members
//   share a name, the script logs the candidates and skips that row —
//   the operator imports those manually via the UI.

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";
import WaterMember from "../models/WaterMember.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanSettings from "../models/LoanSettings.js";
import { computeAmortization } from "../utils/loanAmortization.js";

dotenv.config();
try { dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); } catch { /* older Node */ }

// ─── Source data ───────────────────────────────────────────────────
// Released in January 2026 (date column from the ledger). Where the
// row in the screenshot had a date written, that's used; the rest
// inherit the previous row's date (paper ledger convention).
const LOANS = [
  { last: "Uypala",      first: "Analiza",  principal: 50000, deduction: 3020, releasedOn: "2026-01-05" },
  { last: "Manabat",     first: "Analy",    principal:  5000, deduction:  320, releasedOn: "2026-01-12" },
  { last: "Mariano",     first: "Babelyn",  principal:  4000, deduction:  260, releasedOn: "2026-01-12" },
  { last: "Yray",        first: "Dexter",   principal: 50000, deduction: 3020, releasedOn: "2026-01-22" },
  { last: "Bocales",     first: "Teodoro",  principal:  6000, deduction:  380, releasedOn: "2026-01-22" },
  { last: "Peniones",    first: "Pelita",   principal:  5000, deduction:  320, releasedOn: "2026-01-23" },
  { last: "Legarte",     first: "Manuel",   principal: 12000, deduction:  740, releasedOn: "2026-01-24" },
  { last: "Espana",      first: "Letecia",  principal:  7000, deduction:  440, releasedOn: "2026-01-26" },
  { last: "Cose",        first: "Marivel",  principal: 10000, deduction:  620, releasedOn: "2026-01-27" },
  { last: "Palange",     first: "Kennedy",  principal: 15000, deduction:  920, releasedOn: "2026-01-28" },
  { last: "Serdoncillo", first: "Marites",  principal: 10000, deduction:  620, releasedOn: "2026-01-28" },
  { last: "Gemarino",    first: "Vivincia", principal:  7000, deduction:  440, releasedOn: "2026-01-28" },
  { last: "Momo",        first: "Jesusa",   principal:  5000, deduction:  320, releasedOn: "2026-01-30" },
  { last: "Narvasa",     first: "Clarita",  principal: 10000, deduction:  620, releasedOn: "2026-01-30" },
  { last: "Quinones",    first: "Marlyn",   principal:  8000, deduction:  500, releasedOn: "2026-01-30" },
  { last: "Songkip",     first: "Maricris", principal:  7000, deduction:  440, releasedOn: "2026-01-30" },
  { last: "Serad",       first: "Sandra",   principal: 15000, deduction:  920, releasedOn: "2026-01-30" },
  { last: "Ondoy",       first: "Aida",     principal: 10000, deduction:  620, releasedOn: "2026-01-30" },
  { last: "Versoza",     first: "Marilou",  principal:  4000, deduction:  260, releasedOn: "2026-01-30" },
  { last: "Aliviado",    first: "Lenelyn",  principal:  4000, deduction:  260, releasedOn: "2026-01-30" },
  { last: "Aliviado",    first: "Marinel",  principal:  3000, deduction:  200, releasedOn: "2026-01-30" },
  { last: "Lardes",      first: "Danilo",   principal:  5000, deduction:  320, releasedOn: "2026-01-30" },
];

const TERM_MONTHS = 6;

// Manual override table for known legacy-ledger ↔ canonical-name
// divergences (spelling variants, missing ñ, etc.). Maps the
// "Last, First" string from LOANS below to the WaterMember.pnNo we
// want to attach the loan to. Edit this when an operator finds a
// new mismatch — keeps the resolver branch simple.
const NAME_TO_PN = {
  "Uypala, Analiza":   "PZKL4G",  // Uypala, Annaliza
  "Espana, Letecia":   "L6SG34",  // España, Letecia
  "Gemarino, Vivincia":"QPNC2G",  // Gemarino, Vivencia
  "Quinones, Marlyn":  "6U6VQX",  // Quiñones, Marlyn
  "Aliviado, Marinel": "ED3VMY",  // Aliviado, Mareniel
  // Two Bocales, Teodoro members exist (#1 and #2 on the migrated
  // ledger). Operator confirmed the Jan-22 ₱6,000 loan belongs to
  // Teodoro #1 (PT4ZK6).
  "Bocales, Teodoro":  "PT4ZK6",
};

// Normalise diacritics so "España" and "Espana" can find each other.
function fold(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Try to find the canonical WaterMember for a "last, first" pair.
// Returns { ok: true, member } | { ok: false, candidates: [...] }.
async function resolveMember(last, first) {
  const target = `${last.trim()}, ${first.trim()}`;

  // 0) Manual override wins.
  if (NAME_TO_PN[target]) {
    const m = await WaterMember.findOne({ pnNo: NAME_TO_PN[target] }).select("pnNo accountName").lean();
    if (m) return { ok: true, member: m };
  }

  // 1) Exact "Last, First" match — case-insensitive but accent-aware.
  const exactRe = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  let hits = await WaterMember.find({ accountName: exactRe }).select("pnNo accountName").lean();

  // 2) Accent-folded exact match — handles "Espana" → "España".
  if (hits.length === 0) {
    const foldedTarget = fold(target).toLowerCase();
    const candidates = await WaterMember.find({
      accountName: new RegExp(`^${fold(last).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    }).select("pnNo accountName").lean();
    hits = candidates.filter((c) => fold(c.accountName).toLowerCase() === foldedTarget);
  }

  // 3) Loose substring (Last AND First somewhere in name).
  if (hits.length === 0) {
    const looseRe = new RegExp(`${last.trim()}.*${first.trim()}`, "i");
    hits = await WaterMember.find({ accountName: looseRe }).select("pnNo accountName").lean();
  }

  if (hits.length === 0) return { ok: false, candidates: [], reason: "no_match" };
  if (hits.length > 1) return { ok: false, candidates: hits, reason: "ambiguous" };
  return { ok: true, member: hits[0] };
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const settings = (await LoanSettings.findOne()) || {};
  const rate = Number(settings.interestRatePerMonth ?? 2.5);

  let inserted = 0;
  let skipped = 0;
  const failed = [];

  for (const row of LOANS) {
    try {
      // Resolve borrower
      const res = await resolveMember(row.last, row.first);
      if (!res.ok) {
        failed.push({ name: `${row.last}, ${row.first}`, reason: res.reason, candidates: res.candidates });
        continue;
      }
      const member = res.member;

      // Idempotency — if this exact (pnNo, releasedAt, principal) tuple
      // already exists, skip. Lets us re-run the script safely.
      const releasedAt = new Date(`${row.releasedOn}T00:00:00`);
      const existing = await LoanApplication.findOne({
        borrowerPnNo: member.pnNo,
        principal: row.principal,
        releasedAt: { $gte: releasedAt, $lt: addMonths(releasedAt, 0) === releasedAt ? new Date(releasedAt.getTime() + 86400000) : new Date(releasedAt.getTime() + 86400000) },
      }).select("_id").lean();
      if (existing) {
        skipped++;
        continue;
      }

      // Amortization
      const amort = computeAmortization({
        principal: row.principal,
        monthlyRatePct: rate,
        termMonths: TERM_MONTHS,
      });
      // Backfill amortization due-dates from the release date.
      const firstPaymentDate = addMonths(releasedAt, 1);
      const schedule = (amort.rows || []).map((r, i) => ({
        ...r,
        dueDate: addMonths(firstPaymentDate, i),
      }));
      const maturityDate = schedule[schedule.length - 1]?.dueDate || addMonths(firstPaymentDate, TERM_MONTHS - 1);

      // Single-line charge — the paper ledger didn't break it down.
      const charges = [{
        key: "legacy_deduction",
        label: "Deductions (legacy)",
        type: "flat",
        value: row.deduction,
        amount: row.deduction,
      }];
      const netProceeds = Number((row.principal - row.deduction).toFixed(2));

      const doc = await LoanApplication.create({
        borrowerPnNo: member.pnNo,
        borrowerName: `${row.last}, ${row.first}`,
        borrowerAddress: "",
        borrowerStatus: "active",
        loanType: "regular",
        purpose: "Imported from legacy ledger (Jan 2026 release)",
        modeOfPayment: "monthly",
        principal: row.principal,
        interestRatePerMonth: rate,
        termMonths: TERM_MONTHS,
        monthlyPayment: amort.monthlyPayment,
        totalPayment: amort.totalPayment,
        totalInterest: amort.totalInterest,
        amortizationSchedule: schedule,
        charges,
        totalCharges: row.deduction,
        netProceeds,
        status: "released",
        appliedAt: releasedAt,
        approvedAt: releasedAt,
        releasedAt,
        firstPaymentDate,
        maturityDate,
        totalPaid: 0,
        balance: amort.totalPayment,
        remarks: "Imported from legacy paper ledger.",
        createdBy: "import-script",
        approvedBy: "import-script",
        releasedBy: "import-script",
      });

      inserted++;
      console.log(`  ✓ ${doc.loanId}  ${doc.borrowerName}  ₱${row.principal} → ₱${amort.monthlyPayment}/mo`);
    } catch (e) {
      failed.push({ name: `${row.last}, ${row.first}`, reason: "error", error: e.message });
      console.error(`  ✗ ${row.last}, ${row.first}:`, e.message);
    }
  }

  console.log(`\nDone. inserted=${inserted}  skipped=${skipped}  failed=${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFailed rows — import these manually via the Loan Apply form:");
    for (const f of failed) {
      const cand = f.candidates && f.candidates.length > 0
        ? ` (candidates: ${f.candidates.map((c) => `${c.pnNo}=${c.accountName}`).join("; ")})`
        : "";
      console.log(`  - ${f.name}: ${f.reason}${cand}`);
    }
  }
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("Import crashed:", e);
  process.exit(1);
});
