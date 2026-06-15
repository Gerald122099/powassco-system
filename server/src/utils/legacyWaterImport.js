// Legacy water-bill importer for the paper/Excel monthly ledger
// (server/src/data/legacyWater_loocSur.json, parsed from LoocSur.xlsx).
//
// For each account it creates, per period:
//   • an Opening-balance bill (2025-12 = ledger column 2)
//   • a monthly bill for Jan–May 2026 using the ledger's RECORDED amount
//     (already reflects the progressive tariff, senior, commercial)
//   • payments (with the ledger OR# + date) applied oldest-first (FIFO);
//     a fully-covered bill is marked PAID, the rest stay due so the
//     member's CURRENT outstanding = the ledger's final receivable.
//
// Tariff per period is snapshotted onto each bill: residential 0–5 min is
// ₱74 for periods ≤ 2026-03 and ₱135 for ≥ 2026-04 (so a future recompute
// keeps old bills on the old tariff). Unpaid legacy bills are dated to the
// current collection (2026-06-17) so no back-dated penalties accrue —
// matching the penalty-free ledger receivable.
//
// Name rules (from the ledger): "Last, First" + optional "# N" (the
// account's meter number N), "(tenant)" (sub-user of that meter),
// "(comm.)" (commercial), "- sc" (senior). Only Last, First is matched.
//
// Idempotent: existing bills (pnNo, periodKey, meterNumber) and their
// payments are skipped, so re-running never double-inserts.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import WaterMember from "../models/WaterMember.js";
import WaterBill from "../models/WaterBill.js";
import WaterPayment from "../models/WaterPayment.js";
import WaterSettings from "../models/WaterSettings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Manual name → account-number overrides; fill after the dry-run reveals
// unmatched names (same pattern as the loan import).
const NAME_TO_PN = {};

let DATA = null;
function loadData() {
  if (!DATA) {
    const file = path.join(__dirname, "../data/legacyWater_loocSur.json");
    DATA = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return DATA;
}

// Decompose a ledger name into matchable parts.
export function parseLedgerName(raw) {
  let s = String(raw || "").trim();
  let commercial = false, senior = false, meterNo = null, tenant = null;
  if (/\(comm\.?\)/i.test(s)) { commercial = true; s = s.replace(/\(comm\.?\)/ig, " "); }
  if (/[-–]\s*sc\b/i.test(s)) { senior = true; s = s.replace(/[-–]\s*sc\b/ig, " "); }
  s = s.replace(/[-–]\s*(new|old)\b/ig, " ");
  const mm = s.match(/#\s*(\d+)/);
  if (mm) { meterNo = parseInt(mm[1], 10); s = s.replace(/#\s*\d+/, " "); }
  const tm = s.match(/\(([^)]*)\)/);
  if (tm) { tenant = tm[1].trim(); s = s.replace(/\([^)]*\)/g, " "); }
  s = s.replace(/\s+/g, " ").trim().replace(/[,\s]+$/, "");
  let last = s, first = "";
  const ci = s.indexOf(",");
  if (ci >= 0) { last = s.slice(0, ci).trim(); first = s.slice(ci + 1).trim(); }
  return { last, first, meterNo, tenant, commercial, senior, target: first ? `${last}, ${first}` : last };
}

async function resolveMember(parsed) {
  const target = parsed.target;
  if (NAME_TO_PN[target]) {
    const m = await WaterMember.findOne({ pnNo: NAME_TO_PN[target] }).lean();
    if (m) return { ok: true, member: m };
  }
  let hits = await WaterMember.find({ accountName: new RegExp(`^${esc(target)}$`, "i") }).lean();
  if (!hits.length) {
    const ft = fold(target).toLowerCase();
    const cands = await WaterMember.find({ accountName: new RegExp(`^${esc(fold(parsed.last))}`, "i") }).lean();
    hits = cands.filter((c) => fold(c.accountName).toLowerCase() === ft);
  }
  if (!hits.length && parsed.first) {
    hits = await WaterMember.find({ accountName: new RegExp(`${esc(parsed.last)}.*${esc(parsed.first)}`, "i") }).lean();
  }
  if (!hits.length) return { ok: false, reason: "no_match" };
  if (hits.length > 1) return { ok: false, reason: "ambiguous", candidates: hits.map((h) => ({ pnNo: h.pnNo, accountName: h.accountName })) };
  return { ok: true, member: hits[0] };
}

// Pick the account's Nth meter (meterNo) — else its single/primary meter.
function pickMeter(member, meterNo) {
  const meters = member.meters || [];
  if (meterNo && meters.length >= meterNo) return meters[meterNo - 1];
  const active = meters.filter((m) => m.meterStatus === "active");
  return active[0] || meters[0] || null;
}

const periodLE = (p, ref) => p <= ref; // "YYYY-MM" string compare is chronological

// Build the tariff snapshot for a period: residential 0–5 min = 74 (≤Mar) / 135 (≥Apr).
function tariffSnapshotFor(period, settings) {
  const min05 = periodLE(period, "2026-03") ? 74 : 135;
  const clone = JSON.parse(JSON.stringify(settings.tariffs || {}));
  for (const t of (clone.residential || [])) {
    if (String(t.tier).trim() === "0-5") t.flatAmount = min05;
  }
  return { tariffs: clone, seniorDiscount: settings.seniorDiscount || {} };
}

function dueDateFor(periodKey, dueDay = 17) {
  const [y, m] = periodKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, Math.min(dueDay, 28))); // month after period
  return d;
}
const NOW_DUE = new Date(Date.UTC(2026, 5, 17)); // 2026-06-17 — unpaid legacy bills "due now", no back-penalty

/**
 * @returns { dry, accounts, billsInserted, paymentsInserted, matched, unmatched[], reconcileFlags[], summary }
 */
export async function importLegacyWater({ dry = true, limit = 0, includeFlagged = false } = {}) {
  const data = loadData();
  const settings = (await WaterSettings.findOne()) || { tariffs: {}, seniorDiscount: {}, dueDayOfMonth: 17 };
  const dueDay = settings.dueDayOfMonth || 17;

  const result = {
    dry, source: data.source,
    accounts: data.accounts.length,
    matched: 0, billsInserted: 0, paymentsInserted: 0, billsSkipped: 0,
    deferredOnApply: 0,
    unmatched: [], reconcileFlags: [], sample: [],
  };

  let processed = 0;
  for (const acct of data.accounts) {
    if (limit && processed >= limit) break;
    processed++;
    const parsed = parseLedgerName(acct.name);
    const res = await resolveMember(parsed);
    if (!res.ok) {
      result.unmatched.push({ name: acct.name, target: parsed.target, reason: res.reason, candidates: res.candidates || [] });
      continue;
    }
    const member = res.member;
    const meter = pickMeter(member, parsed.meterNo);
    const meterNumber = String(meter?.meterNumber || `M${parsed.meterNo || 1}`).toUpperCase();
    const classification = parsed.commercial ? "commercial" : (member.billing?.classification || "residential");
    result.matched++;

    // ---- build the bill list (period order) ----
    const bills = [];
    if (acct.opening && acct.opening !== 0) {
      bills.push({ period: "2025-12", amount: round2(acct.opening), consumed: 0, prev: null, present: null, opening: true });
    }
    for (const m of acct.months) {
      if (m.billing == null) continue;
      bills.push({ period: m.period, amount: round2(m.billing), consumed: m.consumed ?? 0, prev: m.prev, present: m.present });
    }
    // payments in month order (each pays the running balance oldest-first)
    const payments = [];
    for (const m of acct.months) {
      if (m.pay && m.pay > 0) payments.push({ amount: round2(m.pay), orno: m.orno, date: m.date, period: m.period });
    }

    // ---- FIFO apply ----
    for (const b of bills) { b.remaining = b.amount; b.paidBy = null; }
    for (const p of payments) {
      let amt = p.amount;
      for (const b of bills) {
        if (amt <= 0) break;
        if (b.remaining <= 0.001) continue;
        const applied = Math.min(b.remaining, amt);
        b.remaining = round2(b.remaining - applied);
        amt = round2(amt - applied);
        if (b.remaining <= 0.001) b.paidBy = p; // the payment that closed it
      }
    }
    const outstanding = round2(bills.reduce((s, b) => s + Math.max(0, b.remaining), 0));
    const sheetRecv = round2([...acct.months].reverse().find((m) => m.recv != null)?.recv ?? 0);
    const reconciles = Math.abs(outstanding - sheetRecv) <= 0.5;
    if (!reconciles) {
      result.reconcileFlags.push({ name: acct.name, pnNo: member.pnNo, computed: outstanding, sheet: sheetRecv, diff: round2(outstanding - sheetRecv) });
    }

    const paidCount = bills.filter((b) => b.remaining <= 0.001).length;
    if (result.sample.length < 8) {
      result.sample.push({
        name: acct.name, pnNo: member.pnNo, accountName: member.accountName, meter: meterNumber,
        classification, bills: bills.length, paid: paidCount, unpaid: bills.length - paidCount,
        outstanding, sheetReceivable: sheetRecv, reconciles,
      });
    }

    if (dry) continue;

    // On APPLY, skip accounts that don't reconcile to the ledger (credits /
    // adjustments) so we never post a wrong balance. They're handled in a
    // dedicated pass; pass includeFlagged:true to force them.
    if (!reconciles && !includeFlagged) { result.deferredOnApply++; continue; }

    // ---- WRITE ----
    for (const b of bills) {
      const isPaid = b.remaining <= 0.001;
      const filter = { pnNo: member.pnNo, periodKey: b.period, meterNumber };
      const exists = await WaterBill.findOne(filter).select("_id").lean();
      if (exists) { result.billsSkipped++; continue; }
      const snap = tariffSnapshotFor(b.period, settings);
      const realDue = dueDateFor(b.period, dueDay);
      const bill = await WaterBill.create({
        pnNo: member.pnNo, accountName: member.accountName, classification,
        addressText: member.fullAddress || "",
        periodKey: b.period, periodCovered: b.period, meterNumber,
        previousReading: b.prev ?? 0, presentReading: b.present ?? 0, consumed: b.consumed ?? 0,
        meterReadings: b.present != null ? [{ meterNumber, previousReading: b.prev ?? 0, presentReading: b.present ?? 0, rawConsumed: b.consumed ?? 0, multiplier: 1, consumed: b.consumed ?? 0 }] : [],
        amount: b.amount, baseAmount: b.amount, discount: 0,
        tariffSnapshot: snap,
        penaltyTypeUsed: "flat", penaltyValueUsed: 0, dueDayUsed: dueDay, graceDaysUsed: 0,
        penaltyApplied: 0, totalDue: b.amount,
        // paid → its real due date; unpaid → current collection so no back-penalty
        dueDate: isPaid ? realDue : NOW_DUE,
        readingDate: realDue, readerId: "legacy-import", createdBy: "legacy-import",
        remarks: b.opening ? "Opening balance (legacy ledger)" : "Imported from legacy ledger (LoocSur)",
        status: isPaid ? "paid" : "unpaid",
      });
      result.billsInserted++;

      if (isPaid && b.paidBy) {
        // OR unique: use the ledger OR; on collision suffix with the meter.
        let orNo = String(b.paidBy.orno || `LEG-${member.pnNo}-${b.period}`);
        const dup = await WaterPayment.findOne({ orNo }).select("_id").lean();
        if (dup) orNo = `${orNo}-${meterNumber}`;
        const paidAt = b.paidBy.date ? new Date(`${b.paidBy.date}T00:00:00Z`) : realDue;
        try {
          await WaterPayment.create({
            billId: bill._id, pnNo: member.pnNo, meterNumber, periodKey: b.period,
            orNo, method: "cash", amountPaid: b.amount, amountReceived: b.amount,
            classification, receivedBy: "legacy-import", paidAt, verified: true,
            verifiedBy: "legacy-import", verifiedAt: new Date(),
            notes: `Legacy ledger payment • OR ${b.paidBy.orno || "n/a"}`,
          });
          result.paymentsInserted++;
        } catch (e) {
          // non-fatal — the bill is still recorded paid
          if (e?.code !== 11000) console.error("legacy water payment:", e.message);
        }
      }
    }
  }

  return result;
}
