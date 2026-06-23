// Apply the senior-citizen discount to EXISTING unpaid / overdue water bills.
//
// The bill is re-derived from its OWN tariff snapshot (so the base / minimum
// charge it was issued with is preserved — we do NOT move it onto a newer
// tariff) but with the CURRENT senior-discount rules (rate + applicable
// tiers). calculateWaterBill returns base, discount and net SEPARATELY, so:
//   • the gross base is always correct (never has the discount baked in), and
//   • bills whose discount had previously been folded into their base are
//     REPAIRED (base restored, discount shown on its own line).
//
// This replaces an earlier "base-preserving" version that multiplied an
// already-net amount by the rate again — double-discounting and corrupting
// baseAmount (e.g. a ₱450.60 base showed as ₱428.07 = 450.60 × 0.95).
//
// Idempotent. Non-senior accounts + paid bills are never touched. Multi-meter
// accounts discount the designated meter only (handled inside calculateWaterBill).

import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import WaterSettings from "../models/WaterSettings.js";
import { calculateWaterBill } from "../utils/waterBilling.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function applySeniorDiscountToUnpaidBills({ dry = true, rate: forcedRate = null, pnNo = null } = {}) {
  const settingsDoc = await WaterSettings.findOne();
  const settings = settingsDoc ? settingsDoc.toObject() : {};
  // Current discount rules: rate (optionally forced) + applicable tiers.
  const seniorCtx = { ...(settings.seniorDiscount || {}) };
  if (forcedRate != null) seniorCtx.discountRate = Number(forcedRate);
  const curTariffs = settings.tariffs;

  const billFilter = { status: { $in: ["unpaid", "overdue"] } };
  if (pnNo) billFilter.pnNo = String(pnNo).toUpperCase().trim();

  const bills = await WaterBill.find(billFilter).lean();
  const pnNos = [...new Set(bills.map((b) => b.pnNo))];
  const members = await WaterMember.find({ pnNo: { $in: pnNos } });
  const byPn = new Map(members.map((m) => [m.pnNo, m]));

  const summary = { scanned: bills.length, updated: 0, cleared: 0, unchanged: 0, skipped: 0, changes: [] };

  for (const bill of bills) {
    const m = byPn.get(bill.pnNo);
    // Only senior accounts are ever touched; everyone else is left alone.
    if (m?.personal?.isSeniorCitizen !== true) { summary.skipped++; continue; }

    // Re-price from the bill's OWN tariff era (preserve the base it was billed
    // with) but with the CURRENT senior-discount rules. Force the per-member
    // rate when a rate was supplied so it's authoritative over the member's
    // stored rate.
    const memberForCalc = forcedRate != null
      ? { ...m.toObject(), personal: { ...m.toObject().personal, seniorDiscountRate: Number(forcedRate) } }
      : m;
    const ctx = { tariffs: bill.tariffSnapshot?.tariffs || curTariffs, seniorDiscount: seniorCtx };

    let calc;
    try {
      calc = await calculateWaterBill(Number(bill.consumed) || 0, bill.classification || "residential", memberForCalc, bill.meterNumber, ctx);
    } catch { summary.skipped++; continue; }

    const base = round2(calc.baseAmount);
    const discount = round2(calc.discount);
    const amount = round2(calc.amount);
    if (!(base > 0)) { summary.skipped++; continue; }
    const totalDue = round2(amount + (Number(bill.penaltyApplied) || 0));
    const eligible = discount > 0;

    const moved =
      round2(bill.baseAmount || 0) !== base ||
      round2(bill.discount || 0) !== discount ||
      round2(bill.amount || 0) !== amount ||
      round2(bill.totalDue || 0) !== totalDue;
    if (!moved) { summary.unchanged++; continue; }

    summary.changes.push({
      pnNo: bill.pnNo,
      accountName: bill.accountName,
      periodKey: bill.periodKey,
      meterNumber: bill.meterNumber,
      base,
      oldAmount: round2(bill.amount),
      newAmount: amount,
      discount,
      rate: Number(seniorCtx.discountRate || 0),
      eligible,
    });

    if (!dry) {
      // Guard against a concurrent paid-flip at the counter.
      await WaterBill.updateOne(
        { _id: bill._id, status: { $ne: "paid" } },
        {
          $set: {
            baseAmount: base,
            discount,
            discountReason: calc.discountReason || (eligible ? `Senior Citizen (${seniorCtx.discountRate}%)` : ""),
            amount,
            totalDue,
          },
        }
      );
      if (eligible) summary.updated++; else summary.cleared++;
    }
  }

  return summary;
}
