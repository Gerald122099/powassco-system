// Apply the senior-citizen discount to EXISTING unpaid / overdue water bills
// WITHOUT re-pricing the base charge from the tariff. The base amount is
// preserved exactly — only discount / amount / totalDue are recomputed as
//   discount = base × rate%,  amount = base − discount,  totalDue = amount + penalty.
//
// This is the "don't touch the bill, just add the 5% discount" path (as
// opposed to recomputeWaterBills, which re-prices the whole bill from the
// current tariff). Idempotent: a bill already at the right discount is left
// alone. Non-senior bills are never touched. Paid bills are never touched.
//
// Multi-meter accounts: the discount only lands on the designated meter
// (same rule as the live billing engine, via discountAppliesToMeter).

import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import WaterSettings from "../models/WaterSettings.js";
import { discountAppliesToMeter } from "../utils/waterBilling.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function applySeniorDiscountToUnpaidBills({ dry = true, rate: forcedRate = null } = {}) {
  const settings = await WaterSettings.findOne().lean();
  const globalRate = Number(forcedRate ?? settings?.seniorDiscount?.discountRate ?? 5);

  const bills = await WaterBill.find({ status: { $in: ["unpaid", "overdue"] } }).lean();
  const pnNos = [...new Set(bills.map((b) => b.pnNo))];
  const members = await WaterMember.find({ pnNo: { $in: pnNos } }).lean();
  const byPn = new Map(members.map((m) => [m.pnNo, m]));

  const summary = { scanned: bills.length, updated: 0, unchanged: 0, skipped: 0, changes: [] };

  for (const bill of bills) {
    const m = byPn.get(bill.pnNo);
    const isSenior = m?.personal?.isSeniorCitizen === true;
    // Eligible only if senior AND (for multi-meter) this is the discount meter.
    if (!isSenior || !discountAppliesToMeter(m, bill.meterNumber)) { summary.skipped++; continue; }

    // Effective rate: the member's own senior rate (defaults to 5) else the
    // global / forced rate.
    const rate = Number(m?.personal?.seniorDiscountRate || globalRate || 5);
    // Preserve the existing base charge — never re-priced here. Fall back to
    // the current amount if an older bill never stored baseAmount.
    const base = round2(Number(bill.baseAmount) > 0 ? bill.baseAmount : bill.amount);
    if (!(base > 0)) { summary.skipped++; continue; }

    const discount = round2(base * (rate / 100));
    const amount = round2(base - discount);
    const totalDue = round2(amount + (Number(bill.penaltyApplied) || 0));

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
      rate,
    });

    if (!dry) {
      // Guard against a concurrent paid-flip at the counter.
      await WaterBill.updateOne(
        { _id: bill._id, status: { $ne: "paid" } },
        {
          $set: {
            baseAmount: base,
            discount,
            discountReason: `Senior Citizen (${rate}%)`,
            amount,
            totalDue,
          },
        }
      );
      summary.updated++;
    }
  }

  return summary;
}
