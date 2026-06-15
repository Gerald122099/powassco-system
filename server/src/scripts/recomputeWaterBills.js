// One-shot maintenance: re-price UNPAID / OVERDUE water bills onto the
// CURRENT Water Settings tariff. Use this only when you deliberately want
// existing unpaid bills to follow a new tariff (e.g. after raising the
// residential minimum). PAID bills are never touched.
//
// By default bills carry the tariff they were created with (see
// tariffSnapshot on WaterBill) so tariff changes are NOT retroactive.
// This tool is the explicit opt-out of that protection, for unpaid bills
// only, with a dry-run preview first.
//
// Idempotent: a bill already matching the current tariff is left alone.
//
// Run with:
//   npm run recompute-water-bills -- --dry            # preview, no writes
//   npm run recompute-water-bills                     # apply
//   npm run recompute-water-bills -- --months=2026-06 # limit to a period
//   npm run recompute-water-bills -- --class=residential

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";
import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import WaterSettings from "../models/WaterSettings.js";
import { calculateWaterBill } from "../utils/waterBilling.js";

dotenv.config();
try { dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); } catch { /* older Node */ }

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function recomputeWaterBills({ months = [], classification = null, dry = true } = {}) {
  const settings = await WaterSettings.findOne();
  if (!settings) throw new Error("Water settings not found");

  const filter = { status: { $in: ["unpaid", "overdue"] } };
  if (Array.isArray(months) && months.length) filter.periodKey = { $in: months };
  if (classification) filter.classification = classification;

  const bills = await WaterBill.find(filter).lean();
  const pnNos = [...new Set(bills.map((b) => b.pnNo))];
  const members = await WaterMember.find({ pnNo: { $in: pnNos } });
  const memberByPn = new Map(members.map((m) => [m.pnNo, m]));

  // The current tariff every re-priced bill will be stamped with.
  const tariffCtx = { tariffs: settings.tariffs, seniorDiscount: settings.seniorDiscount };

  const summary = { scanned: bills.length, updated: 0, unchanged: 0, failed: 0, changes: [] };

  for (const bill of bills) {
    try {
      const member = memberByPn.get(bill.pnNo) || null;
      const calc = await calculateWaterBill(
        Number(bill.consumed) || 0,
        bill.classification || "residential",
        member,
        bill.meterNumber,
        tariffCtx
      );
      const newAmount = round2(calc.amount);
      const oldAmount = round2(bill.amount);

      if (newAmount === oldAmount) { summary.unchanged++; continue; }

      summary.changes.push({
        pnNo: bill.pnNo,
        accountName: bill.accountName,
        periodKey: bill.periodKey,
        meterNumber: bill.meterNumber,
        consumed: bill.consumed,
        oldAmount,
        newAmount,
        delta: round2(newAmount - oldAmount),
      });

      if (!dry) {
        const newTotalDue = round2(newAmount + (Number(bill.penaltyApplied) || 0));
        // Guard against a concurrent paid-flip at the counter.
        await WaterBill.updateOne(
          { _id: bill._id, status: { $ne: "paid" } },
          {
            $set: {
              amount: newAmount,
              baseAmount: round2(calc.baseAmount),
              discount: round2(calc.discount),
              discountReason: calc.discountReason || "",
              tariffUsed: calc.tariffUsed || null,
              tariffSnapshot: tariffCtx,
              totalDue: newTotalDue,
            },
          }
        );
        summary.updated++;
      }
    } catch (e) {
      summary.failed++;
      summary.changes.push({ pnNo: bill.pnNo, periodKey: bill.periodKey, meterNumber: bill.meterNumber, error: e.message });
    }
  }

  return summary;
}

// ─── CLI entry ────────────────────────────────────────────────────────
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error("MONGO_URI is not set in .env"); process.exit(1); }
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const monthsArg = args.find((a) => a.startsWith("--months="));
  const classArg = args.find((a) => a.startsWith("--class="));
  const months = monthsArg ? monthsArg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  const classification = classArg ? classArg.split("=")[1] : null;

  await mongoose.connect(uri);
  console.log(`Connected. dry=${dry} months=${months.join(",") || "(all)"} class=${classification || "(all)"}\n`);

  const summary = await recomputeWaterBills({ months, classification, dry });

  if (summary.changes.length === 0) {
    console.log("No unpaid bill differs from the current tariff — nothing to do.");
  } else {
    console.log(`Bills that ${dry ? "would change" : "changed"}:\n`);
    for (const c of summary.changes) {
      if (c.error) { console.log(`  ${c.pnNo} ${c.periodKey} ${c.meterNumber}  ERROR: ${c.error}`); continue; }
      console.log(`  ${String(c.pnNo).padEnd(8)} ${String(c.periodKey).padEnd(8)} ${String(c.meterNumber).padEnd(10)} ${String(c.consumed).padStart(4)} m³  ₱${c.oldAmount} → ₱${c.newAmount} (${c.delta >= 0 ? "+" : ""}${c.delta})`);
    }
  }
  console.log(`\nscanned=${summary.scanned} updated=${summary.updated} unchanged=${summary.unchanged} failed=${summary.failed}`);
  await mongoose.disconnect();
}

const invokedPath = (process.argv[1] || "").replace(/\\/g, "/");
if (invokedPath && (import.meta.url === `file://${invokedPath}` || import.meta.url.endsWith(invokedPath))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
