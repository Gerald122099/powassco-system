// Legacy water-bill importer for the LoocSur Excel ledger
// (server/src/data/legacyWater_loocSur.json).
//
// Per account it creates: an Opening-balance bill (2025-12 = ledger
// column 2) + monthly bills (Jan–May 2026) using the ledger's RECORDED
// amounts; payments (OR# + date) applied oldest-first; the result is
// reconciled to the ledger's final receivable so the member's CURRENT
// outstanding matches the paper ledger to the centavo:
//   • ledger > computed → a "ledger credit" reduces the newest dues
//   • ledger < 0 (overpaid) → all bills paid + the excess posted to CBU
//
// Account resolution (by name "Last, First"; "# N" = meter number,
// "(tenant)" = sub-user, "(comm.)" = commercial, "- sc" = senior):
//   • single match → that account
//   • ambiguous (duplicates) → the FIRST candidate (reported so it can be
//     redirected via NAME_TO_PN)
//   • no match → a NEW account is created (auto #, auto meter, classified
//     from the ledger flag, seeded with the latest reading)
// If the matched account lacks the ledger's meter # N, a meter is added
// (auto number).
//
// Tariff per period is snapshotted (residential 0–5 min ₱74 ≤ 2026-03,
// ₱135 ≥ 2026-04). Unpaid legacy bills are dated 2026-06-17 so no
// back-dated penalties accrue. Idempotent on (pnNo, periodKey, meterNumber)
// bills, on created accounts (matched by name on re-run), on added meters,
// and on the CBU credit (refOrNo LEGCBU-<pn>).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import WaterMember from "../models/WaterMember.js";
import WaterBill from "../models/WaterBill.js";
import WaterPayment from "../models/WaterPayment.js";
import WaterSettings from "../models/WaterSettings.js";
import CbuTransaction from "../models/CbuTransaction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Manual name → account-number overrides (fill to pin ambiguous/no-match names).
const NAME_TO_PN = {};

// Available legacy water ledgers (Excel files parsed into JSON).
const LEDGERS = {
  loocSur: { file: "legacyWater_loocSur.json", label: "Looc Sur" },
  owakProper: { file: "legacyWater_owakProper.json", label: "Owak Proper" },
};
export const LEGACY_WATER_AREAS = Object.entries(LEDGERS).map(([key, v]) => ({ key, label: v.label }));

const DATA = {};
function loadData(area) {
  const led = LEDGERS[area] || LEDGERS.loocSur;
  if (!DATA[led.file]) DATA[led.file] = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/", led.file), "utf8"));
  return DATA[led.file];
}

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

// resolve → { status: "single"|"ambiguous"|"none", member?, candidates? }
async function resolveMember(parsed) {
  const target = parsed.target;
  if (NAME_TO_PN[target]) {
    const m = await WaterMember.findOne({ pnNo: NAME_TO_PN[target] });
    if (m) return { status: "single", member: m };
  }
  let hits = await WaterMember.find({ accountName: new RegExp(`^${esc(target)}$`, "i") });
  if (!hits.length) {
    const ft = fold(target).toLowerCase();
    const cands = await WaterMember.find({ accountName: new RegExp(`^${esc(fold(parsed.last))}`, "i") });
    hits = cands.filter((c) => fold(c.accountName).toLowerCase() === ft);
  }
  if (!hits.length && parsed.first) {
    hits = await WaterMember.find({ accountName: new RegExp(`${esc(parsed.last)}.*${esc(parsed.first)}`, "i") });
  }
  if (!hits.length) return { status: "none" };
  if (hits.length > 1) return { status: "ambiguous", member: hits[0], candidates: hits.map((h) => ({ pnNo: h.pnNo, accountName: h.accountName })) };
  return { status: "single", member: hits[0] };
}

const PN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function genPnNo() {
  for (let t = 0; t < 50; t++) {
    let s = ""; for (let i = 0; i < 6; i++) s += PN_CHARS[Math.floor(Math.random() * PN_CHARS.length)];
    if (!(await WaterMember.findOne({ pnNo: s }).select("_id").lean())) return s;
  }
  throw new Error("could not generate unique pnNo");
}
async function genMeterNumber() {
  for (let t = 0; t < 80; t++) {
    const s = String(10000 + Math.floor(Math.random() * 90000));
    if (!(await WaterMember.findOne({ "meters.meterNumber": s }).select("_id").lean())) return s;
  }
  throw new Error("could not generate unique meter number");
}

async function createMember(parsed, lastReading) {
  const pnNo = await genPnNo();
  const meterNumber = await genMeterNumber();
  const member = await WaterMember.create({
    pnNo, accountName: parsed.target,
    personal: { fullName: parsed.target },
    contact: {},
    billing: { classification: parsed.commercial ? "commercial" : "residential" },
    meters: [{
      meterNumber, meterStatus: "active", isBillingActive: true,
      lastReading: Number(lastReading) || 0,
      meterReaderNotes: parsed.tenant ? `Tenant: ${parsed.tenant}` : "",
    }],
    accountStatus: "active",
    statusReason: "Imported from legacy ledger (LoocSur)",
    createdBy: "legacy-import",
  });
  return member;
}

// Ensure the account has a meter for ledger meter# N; add one if missing.
async function ensureMeter(member, parsed, lastReading, dry) {
  const meters = member.meters || [];
  const idx = (parsed.meterNo || 1) - 1;
  if (meters[idx]) return { meterNumber: String(meters[idx].meterNumber).toUpperCase(), added: false };
  // need to add
  if (dry) return { meterNumber: `(new meter #${parsed.meterNo || 1})`, added: true, plan: true };
  const meterNumber = await genMeterNumber();
  member.meters.push({
    meterNumber, meterStatus: "active", isBillingActive: true,
    lastReading: Number(lastReading) || 0,
    meterReaderNotes: parsed.tenant ? `Tenant: ${parsed.tenant} (legacy)` : "Added from legacy ledger",
  });
  await member.save();
  return { meterNumber: meterNumber.toUpperCase(), added: true };
}

const periodLE = (p, ref) => p <= ref;
function tariffSnapshotFor(period, settings) {
  const min05 = periodLE(period, "2026-03") ? 74 : 135;
  const clone = JSON.parse(JSON.stringify(settings.tariffs || {}));
  for (const t of (clone.residential || [])) if (String(t.tier).trim() === "0-5") t.flatAmount = min05;
  return { tariffs: clone, seniorDiscount: settings.seniorDiscount || {} };
}
function dueDateFor(periodKey, dueDay = 17) {
  const [y, m] = periodKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, Math.min(dueDay, 28)));
}
const NOW_DUE = new Date(Date.UTC(2026, 5, 17)); // 2026-06-17

async function postCbuCredit(member, amount) {
  const refOrNo = `LEGCBU-${member.pnNo}`;
  const existing = await CbuTransaction.findOne({ refOrNo }).select("_id").lean();
  if (existing) return false;
  const ledger = await CbuTransaction.find({ pnNo: member.pnNo }).select("type amount").lean();
  const prior = ledger.reduce((s, t) => s + (t.type === "credit" ? 1 : -1) * (Number(t.amount) || 0), 0);
  await CbuTransaction.create({
    pnNo: member.pnNo, accountName: member.accountName, type: "credit",
    amount: round2(amount), balanceAfter: round2(prior + amount),
    source: "water_overpay", refOrNo,
    note: "Legacy ledger overpayment (LoocSur) — opening credit", postedBy: "legacy-import",
  });
  return true;
}

/**
 * @param dry            preview only (no writes)
 * @param includeUnmatched  also create accounts / add meters for none/ambiguous
 * @param limit          cap accounts processed (testing)
 */
export async function importLegacyWater({ area = "loocSur", dry = true, includeUnmatched = false, limit = 0, onProgress = null } = {}) {
  const data = loadData(area);
  const settings = (await WaterSettings.findOne()) || { tariffs: {}, seniorDiscount: {}, dueDayOfMonth: 17 };
  const dueDay = settings.dueDayOfMonth || 17;

  const r = {
    dry, area: data.area, source: data.source, accounts: data.accounts.length,
    matched: 0, ambiguous: 0, created: 0, metersAdded: 0,
    billsInserted: 0, paymentsInserted: 0, billsSkipped: 0, cbuCredits: 0,
    deferred: 0,
    unmatched: [], reconciled: [], sample: [],
  };

  const total = limit ? Math.min(limit, data.accounts.length) : data.accounts.length;
  let processed = 0;
  for (const acct of data.accounts) {
    if (limit && processed >= limit) break;
    processed++;
    if (onProgress) { try { onProgress(processed, total); } catch { /* progress is best-effort */ } }
    const parsed = parseLedgerName(acct.name);
    const lastReading = [...acct.months].reverse().find((m) => m.present != null)?.present
      ?? acct.months.find((m) => m.prev != null)?.prev ?? 0;

    let resolved = await resolveMember(parsed);
    let member = resolved.member || null;
    let kind = resolved.status; // single | ambiguous | none
    let createdNow = false, meterAdded = false;

    if (kind === "none") {
      if (!includeUnmatched) { r.unmatched.push({ name: acct.name, target: parsed.target, reason: "no_match" }); continue; }
      if (dry) {
        r.created++;
        r.unmatched.push({ name: acct.name, target: parsed.target, reason: "no_match", action: `would CREATE account (${parsed.commercial ? "commercial" : "residential"}) + meter` });
        continue; // can't build real bills without the created pn in dry mode
      }
      member = await createMember(parsed, lastReading); createdNow = true; r.created++;
    } else if (kind === "ambiguous") {
      r.ambiguous++;
      if (!includeUnmatched) { r.unmatched.push({ name: acct.name, target: parsed.target, reason: "ambiguous", candidates: resolved.candidates }); continue; }
    }
    if (kind === "single") r.matched++;

    // meter (add if the ledger meter # isn't on the account yet)
    const mres = await ensureMeter(member, parsed, lastReading, dry && !includeUnmatched ? true : dry);
    const meterNumber = mres.meterNumber;
    if (mres.added) { meterAdded = true; if (!mres.plan) r.metersAdded++; }
    const classification = parsed.commercial ? "commercial" : (member.billing?.classification || "residential");

    // ---- bills ----
    const bills = [];
    if (acct.opening && acct.opening !== 0) bills.push({ period: "2025-12", amount: round2(acct.opening), consumed: 0, prev: null, present: null, opening: true });
    for (const m of acct.months) {
      if (m.billing == null) continue;
      bills.push({ period: m.period, amount: round2(m.billing), consumed: m.consumed ?? 0, prev: m.prev, present: m.present });
    }
    const payments = [];
    for (const m of acct.months) if (m.pay && m.pay > 0) payments.push({ amount: round2(m.pay), orno: m.orno, date: m.date });

    for (const b of bills) { b.remaining = b.amount; b.paidBy = null; }
    for (const p of payments) {
      let amt = p.amount;
      for (const b of bills) {
        if (amt <= 0) break;
        if (b.remaining <= 0.001) continue;
        const a = Math.min(b.remaining, amt); b.remaining = round2(b.remaining - a); amt = round2(amt - a);
        if (b.remaining <= 0.001) b.paidBy = p;
      }
    }
    const computed = round2(bills.reduce((s, b) => s + Math.max(0, b.remaining), 0));
    const target = round2([...acct.months].reverse().find((m) => m.recv != null)?.recv ?? 0);

    // ---- reconcile to the ledger ----
    let cbuCredit = 0;
    if (target < -0.5) {
      for (const b of bills) b.remaining = 0;          // overpaid → everything paid
      cbuCredit = round2(-target);                      // excess → CBU
    } else if (computed - target > 0.5) {
      let credit = round2(computed - target);           // ledger credit/adjustment
      for (const b of bills) { if (credit <= 0) break; if (b.remaining <= 0.001) continue; const a = Math.min(b.remaining, credit); b.remaining = round2(b.remaining - a); credit = round2(credit - a); }
    }
    const outstanding = round2(bills.reduce((s, b) => s + Math.max(0, b.remaining), 0));
    const reconciles = Math.abs(outstanding - Math.max(0, target)) <= 0.5;
    const paidCount = bills.filter((b) => b.remaining <= 0.001).length;

    if (r.sample.length < 10) {
      r.sample.push({ name: acct.name, pnNo: member.pnNo, accountName: member.accountName, meter: meterNumber, kind, createdNow, meterAdded, classification, bills: bills.length, paid: paidCount, unpaid: bills.length - paidCount, outstanding, ledger: target, cbuCredit, reconciles });
    }
    if (cbuCredit > 0) r.reconciled.push({ name: acct.name, pnNo: member.pnNo, type: "CBU credit", amount: cbuCredit });

    if (dry) continue;

    // ---- WRITE ----
    for (const b of bills) {
      const isPaid = b.remaining <= 0.001;
      const filter = { pnNo: member.pnNo, periodKey: b.period, meterNumber };
      if (await WaterBill.findOne(filter).select("_id").lean()) { r.billsSkipped++; continue; }
      const totalDue = isPaid ? b.amount : round2(b.remaining);
      const discount = isPaid ? 0 : round2(b.amount - b.remaining);
      const realDue = dueDateFor(b.period, dueDay);
      const bill = await WaterBill.create({
        pnNo: member.pnNo, accountName: member.accountName, classification, addressText: member.fullAddress || "",
        periodKey: b.period, periodCovered: b.period, meterNumber,
        previousReading: b.prev ?? 0, presentReading: b.present ?? 0, consumed: b.consumed ?? 0,
        meterReadings: b.present != null ? [{ meterNumber, previousReading: b.prev ?? 0, presentReading: b.present ?? 0, rawConsumed: b.consumed ?? 0, multiplier: 1, consumed: b.consumed ?? 0 }] : [],
        amount: b.amount, baseAmount: b.amount, discount,
        discountReason: discount > 0 ? "Legacy ledger credit/adjustment" : "",
        tariffSnapshot: tariffSnapshotFor(b.period, settings),
        penaltyTypeUsed: "flat", penaltyValueUsed: 0, dueDayUsed: dueDay, graceDaysUsed: 0,
        penaltyApplied: 0, totalDue,
        dueDate: isPaid ? realDue : NOW_DUE, readingDate: realDue,
        readerId: "legacy-import", createdBy: "legacy-import",
        remarks: b.opening ? "Opening balance (legacy ledger)" : "Imported from legacy ledger (LoocSur)",
        status: isPaid ? "paid" : "unpaid",
      });
      r.billsInserted++;

      if (isPaid && b.paidBy) {
        let orNo = String(b.paidBy.orno || `LEG-${member.pnNo}-${b.period}`);
        if (await WaterPayment.findOne({ orNo }).select("_id").lean()) orNo = `${orNo}-${meterNumber}`;
        try {
          await WaterPayment.create({
            billId: bill._id, pnNo: member.pnNo, meterNumber, periodKey: b.period,
            orNo, method: "cash", amountPaid: b.amount, amountReceived: b.amount, classification,
            receivedBy: "legacy-import", paidAt: b.paidBy.date ? new Date(`${b.paidBy.date}T00:00:00Z`) : realDue,
            verified: true, verifiedBy: "legacy-import", verifiedAt: new Date(),
            notes: `Legacy ledger payment • OR ${b.paidBy.orno || "n/a"}`,
          });
          r.paymentsInserted++;
        } catch (e) { if (e?.code !== 11000) console.error("legacy water payment:", e.message); }
      }
    }
    if (cbuCredit > 0 && (await postCbuCredit(member, cbuCredit))) r.cbuCredits++;
  }

  return r;
}
