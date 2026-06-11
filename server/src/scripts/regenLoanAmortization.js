// One-shot maintenance: rebuild amortizationSchedule on existing loans
// using the current whole-peso `computeAmortization` (see commit 5cc9225).
//
// Why this exists: the legacy paper-ledger import script (importExistingLoans.js)
// was authored BEFORE the whole-peso fix, so the loans it created have
// schedules with centavo amounts that don't match the cooperative's
// paper ledger. The cashier's period picker reads from amortizationSchedule,
// so those imported loans show "off-by-centavos" rows.
//
// What it does
//   For each LoanApplication where:
//     - status is "released"  (active, unpaid loans only)
//     - createdBy === "import-script"  (default; pass --all to widen)
//   it recomputes the schedule from (principal, interestRatePerMonth,
//   termMonths), PRESERVING each row's original dueDate (so the
//   month-grid the cashier sees doesn't shift), then updates:
//       monthlyPayment, totalPayment, totalInterest, balance,
//       amortizationSchedule
//
// Idempotent: running twice produces no further changes.
//
// Run with:
//   npm run regen-amort          # import-script loans only
//   npm run regen-amort -- --all # every released loan
//   npm run regen-amort -- --dry # preview, no writes

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";
import LoanApplication from "../models/LoanApplication.js";
import LoanPayment from "../models/LoanPayment.js";
import { computeAmortization } from "../utils/loanAmortization.js";

dotenv.config();
try { dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); } catch { /* older Node */ }

const args = new Set(process.argv.slice(2));
const ALL = args.has("--all");
const DRY = args.has("--dry");

export async function regenLoanAmortization({ all = false, dry = false } = {}) {
  const filter = { status: "released" };
  if (!all) filter.createdBy = "import-script";

  const loans = await LoanApplication.find(filter).lean();
  const summary = { scanned: loans.length, updated: 0, skipped: 0, changes: [] };

  for (const loan of loans) {
    const principal = Number(loan.principal) || 0;
    const rate = Number(loan.interestRatePerMonth) || 0;
    const term = Number(loan.termMonths) || 0;
    if (!principal || !term) {
      summary.skipped++;
      continue;
    }

    const amort = computeAmortization({
      principal,
      monthlyRatePct: rate,
      termMonths: term,
    });

    // Preserve original dueDate per row — only the money columns change.
    const oldRows = loan.amortizationSchedule || [];
    const newRows = amort.rows.map((r, i) => ({
      ...r,
      dueDate: oldRows[i]?.dueDate ?? null,
    }));

    // Drift check — skip if everything already matches (idempotent).
    const drift = newRows.some((r, i) => {
      const o = oldRows[i] || {};
      return (
        Number(o.payment) !== r.payment ||
        Number(o.principal) !== r.principal ||
        Number(o.interest) !== r.interest
      );
    }) || Number(loan.monthlyPayment) !== amort.monthlyPayment;

    if (!drift) {
      summary.skipped++;
      continue;
    }

    // Recompute outstanding balance = totalPayment - sum(payments).
    const payments = await LoanPayment.find({ loanId: loan.loanId }).lean();
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const newBalance = Math.max(0, amort.totalPayment - totalPaid);

    summary.changes.push({
      loanId: loan.loanId,
      borrower: loan.borrowerName,
      principal,
      term,
      monthlyBefore: Number(loan.monthlyPayment) || 0,
      monthlyAfter: amort.monthlyPayment,
      totalBefore: Number(loan.totalPayment) || 0,
      totalAfter: amort.totalPayment,
      balanceBefore: Number(loan.balance) || 0,
      balanceAfter: newBalance,
      totalPaid,
    });

    if (!dry) {
      await LoanApplication.updateOne(
        { _id: loan._id },
        {
          $set: {
            monthlyPayment: amort.monthlyPayment,
            totalPayment: amort.totalPayment,
            totalInterest: amort.totalInterest,
            balance: newBalance,
            amortizationSchedule: newRows,
          },
        }
      );
      summary.updated++;
    }
  }

  return summary;
}

// ─── CLI entry ────────────────────────────────────────────────────────
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set in .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`Connected. mode=${ALL ? "all-released" : "import-script-only"} dry=${DRY}\n`);

  const summary = await regenLoanAmortization({ all: ALL, dry: DRY });

  if (summary.changes.length === 0) {
    console.log("No drift found — every scanned loan already matches the current amortization.");
  } else {
    console.log(`Loans that ${DRY ? "would be" : "were"} updated:\n`);
    for (const c of summary.changes) {
      console.log(
        `  ${c.loanId.padEnd(14)} ${c.borrower.padEnd(28)} ` +
        `P=₱${c.principal.toLocaleString().padStart(8)}  ` +
        `monthly ₱${c.monthlyBefore} → ₱${c.monthlyAfter}  ` +
        `total ₱${c.totalBefore} → ₱${c.totalAfter}  ` +
        `balance ₱${c.balanceBefore} → ₱${c.balanceAfter} (paid ₱${c.totalPaid})`
      );
    }
  }
  console.log(`\nscanned=${summary.scanned}  updated=${summary.updated}  skipped=${summary.skipped}`);
  await mongoose.disconnect();
}

const invokedPath = process.argv[1] || "";
const normalizedInvoked = invokedPath.replace(/\\/g, "/");
if (normalizedInvoked && (
  import.meta.url === `file://${normalizedInvoked}` ||
  import.meta.url.endsWith(normalizedInvoked)
)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
