// One-shot maintenance: rebuild the `charges[]` breakdown on imported
// legacy loans.
//
// Why this exists: the importExistingLoans.js script stored deductions as
// a single line — { key: "legacy_deduction", label: "Deductions (legacy)" }
// — because the paper ledger didn't keep a per-item breakdown. The
// cooperative's STANDARD deduction is ₱620, broken down across 6 line
// items (Service Fee ₱100 + Capital Build-up ₱100 + Filing Fee ₱100 +
// Collateral Risk Fund ₱100 + Notarial Fee ₱200 + Processing Fee ₱20).
// This script rewrites the legacy single-line entry into that 6-line
// breakdown so the cashier / bookkeeper / borrower can see the proper
// itemization on the OR.
//
// Rules (operator-confirmed):
//   - totalCharges === standardTotal (₱620): replace with the 6 standard lines.
//   - totalCharges  >  standardTotal (₱620): replace with the 6 standard lines
//     + an "Other loan deductions" line for the excess.
//   - totalCharges  <  standardTotal (₱620): LEAVE ALONE. The paper ledger
//     recorded a smaller deduction and we don't have data to break it down.
//   - Already a multi-line breakdown: skip (idempotent).
//
// Standard source of truth: LoanSettings.charges if populated; otherwise
// falls back to the hardcoded DEFAULT_BREAKDOWN below.

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";
import LoanApplication from "../models/LoanApplication.js";
import LoanSettings from "../models/LoanSettings.js";

dotenv.config();
try { dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); } catch { /* older Node */ }

const args = new Set(process.argv.slice(2));
const ALL = args.has("--all");
const DRY = args.has("--dry");

const DEFAULT_BREAKDOWN = [
  { key: "serviceFee", label: "Service fee", type: "flat", value: 100 },
  { key: "capitalBuildUp", label: "Capital Build-up / pledge", type: "flat", value: 100 },
  { key: "filingFee", label: "Filing Fee", type: "flat", value: 100 },
  { key: "collateralRiskFund", label: "Collateral Risk Fund", type: "flat", value: 100 },
  { key: "notarialFee", label: "Notarial Fee", type: "flat", value: 200 },
  { key: "processingFee", label: "Others / Processing Fee", type: "flat", value: 20 },
];

export async function rebuildLoanCharges({ all = false, dry = false } = {}) {
  const filter = { status: "released" };
  if (!all) filter.createdBy = "import-script";

  // Source of truth for the standard breakdown: LoanSettings.charges if
  // the admin has configured them, otherwise the hardcoded defaults
  // (which match the cooperative's disclosure example).
  const settings = await LoanSettings.findOne().lean();
  const rawBreakdown = (settings?.charges?.length ? settings.charges : DEFAULT_BREAKDOWN)
    .filter((c) => c.type === "flat") // percent rules would need principal context
    .map((c) => ({
      key: c.key,
      label: c.label,
      type: "flat",
      value: Number(c.value) || 0,
      amount: Number(c.value) || 0,
    }));
  const standardTotal = rawBreakdown.reduce((s, c) => s + c.amount, 0);

  const loans = await LoanApplication.find(filter).lean();
  const summary = { scanned: loans.length, updated: 0, skipped: 0, standardTotal, changes: [] };

  for (const loan of loans) {
    const totalCharges = Number(loan.totalCharges) || 0;
    const currentCharges = loan.charges || [];
    const isLegacySingleLine = currentCharges.length === 1
      && currentCharges[0].key === "legacy_deduction";

    // Already a proper multi-line breakdown — leave it.
    if (!isLegacySingleLine) {
      summary.skipped++;
      continue;
    }

    // Below-₱620: operator chose to leave as-is.
    if (totalCharges < standardTotal) {
      summary.skipped++;
      continue;
    }

    const newCharges = rawBreakdown.map((c) => ({ ...c }));
    const excess = totalCharges - standardTotal;
    if (excess > 0) {
      newCharges.push({
        key: "otherLoanDeductions",
        label: "Other loan deductions",
        type: "flat",
        value: excess,
        amount: excess,
      });
    }

    summary.changes.push({
      loanId: loan.loanId,
      borrower: loan.borrowerName,
      principal: Number(loan.principal) || 0,
      totalCharges,
      standardTotal,
      excess,
      newLines: newCharges.length,
    });

    if (!dry) {
      await LoanApplication.updateOne(
        { _id: loan._id },
        { $set: { charges: newCharges } }
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

  const summary = await rebuildLoanCharges({ all: ALL, dry: DRY });

  if (summary.changes.length === 0) {
    console.log("Nothing to rebuild — every scanned loan either has a proper breakdown already, or has a sub-₱620 deduction that we leave alone.");
  } else {
    console.log(`Loans that ${DRY ? "would be" : "were"} rewritten (standard total = ₱${summary.standardTotal}):\n`);
    for (const c of summary.changes) {
      console.log(
        `  ${c.loanId.padEnd(14)} ${c.borrower.padEnd(28)} ` +
        `P=₱${c.principal.toLocaleString().padStart(8)}  ` +
        `total=₱${c.totalCharges.toLocaleString().padStart(6)}  ` +
        `standard=₱${c.standardTotal}  excess=₱${c.excess.toLocaleString()}  ` +
        `→ ${c.newLines} line(s)`
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
