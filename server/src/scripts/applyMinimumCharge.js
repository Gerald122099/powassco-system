// Raise the lowest (minimum-charge) tariff tier to a flat amount — e.g. the
// residential 0-5 m³ minimum from ₱74 to ₱135 — effective a given billing
// PERIOD onward, then re-price the affected UNPAID / OVERDUE bills.
//
// "Effective from a period" + "don't touch earlier bills": only bills whose
// periodKey is >= fromPeriod (YYYY-MM) are re-priced; anything before that is
// left exactly as-is, and PAID bills are never touched (money already
// collected). The re-price keeps each bill's metered consumption and excess
// tiers — only the minimum bracket (and the discount derived from it) moves —
// so the existing bill is otherwise untouched.
//
// Dry-run shows every bill's old → new amount before anything is written;
// idempotent (a bill already at the new amount is left alone).

import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import WaterSettings from "../models/WaterSettings.js";
import { calculateWaterBill } from "../utils/waterBilling.js";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function applyMinimumCharge({ amount = 135, fromPeriod = "2026-04", classification = "residential", dry = true } = {}) {
  const settings = await WaterSettings.findOne();
  if (!settings) throw new Error("Water settings not found");

  // Plain copy of the tariff array so we can build the new pricing context
  // (and preview) without persisting on a dry run.
  const tariffsObj = settings.toObject().tariffs || {};
  const arr = (tariffsObj[classification] || []).map((t) => ({ ...t }));
  const active = arr.filter((t) => t.isActive).sort((a, b) => Number(a.minConsumption) - Number(b.minConsumption));
  const minTier = active[0];
  if (!minTier) throw new Error(`No active ${classification} tariff configured`);
  const oldMin = Number(minTier.flatAmount) || 0;

  // Set the lowest tier to a flat <amount> (the minimum charge bracket).
  for (const t of arr) {
    if (String(t.tier) === String(minTier.tier)) { t.chargeType = "flat"; t.flatAmount = amount; }
  }
  const newTariffs = { ...tariffsObj, [classification]: arr };
  const ctx = { tariffs: newTariffs, seniorDiscount: settings.toObject().seniorDiscount };

  // Persist the tariff change so NEW bills use it too (apply only).
  if (!dry) {
    await WaterSettings.updateOne({}, { $set: { [`tariffs.${classification}`]: arr } });
  }

  // Re-price unpaid/overdue bills of this class from <fromPeriod> onward.
  const bills = await WaterBill.find({
    status: { $in: ["unpaid", "overdue"] },
    classification,
    periodKey: { $gte: fromPeriod },
  }).lean();
  const pnNos = [...new Set(bills.map((b) => b.pnNo))];
  const members = await WaterMember.find({ pnNo: { $in: pnNos } });
  const byPn = new Map(members.map((m) => [m.pnNo, m]));

  const summary = { minOld: oldMin, minNew: amount, fromPeriod, classification, scanned: bills.length, updated: 0, unchanged: 0, failed: 0, changes: [] };

  for (const bill of bills) {
    try {
      const member = byPn.get(bill.pnNo) || null;
      const calc = await calculateWaterBill(
        Number(bill.consumed) || 0,
        bill.classification || classification,
        member,
        bill.meterNumber,
        ctx
      );
      const newAmount = round2(calc.amount);
      const oldAmount = round2(bill.amount);
      if (newAmount === oldAmount && round2(bill.baseAmount || 0) === round2(calc.baseAmount)) {
        summary.unchanged++; continue;
      }

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
        await WaterBill.updateOne(
          { _id: bill._id, status: { $ne: "paid" } },
          {
            $set: {
              amount: newAmount,
              baseAmount: round2(calc.baseAmount),
              discount: round2(calc.discount),
              discountReason: calc.discountReason || "",
              tariffUsed: calc.tariffUsed || null,
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
