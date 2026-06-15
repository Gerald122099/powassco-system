// Legacy water-bill importer for the cooperative's Excel ledgers
// (server/src/data/legacyWater_<area>.json).
//
// Per account it creates: an Opening-balance bill (2025-12 = ledger
// column 2) + monthly bills (Jan–May 2026) using the ledger's RECORDED
// amounts; payments (OR# + date) applied oldest-first; then reconciled to
// the ledger's final receivable so the member's outstanding matches the
// paper ledger (credit reduces newest dues; overpaid → all paid + excess
// posted to CBU).
//
// PERFORMANCE: all members are loaded once and matched IN MEMORY; existing
// bills/OR#s for the legacy periods are pre-loaded once; and writes are
// batched via insertMany — so a 600-account ledger is a handful of DB
// round-trips instead of thousands. Idempotent.

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
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// Manual name → account-number overrides (pin ambiguous / no-match names).
const NAME_TO_PN = {};

const LEDGERS = {
  loocSur: { file: "legacyWater_loocSur.json", label: "Looc Sur" },
  owakProper: { file: "legacyWater_owakProper.json", label: "Owak Proper" },
  sanMiguel: { file: "legacyWater_sanMiguel.json", label: "San Miguel" },
  baybay: { file: "legacyWater_baybay.json", label: "Baybay" },
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

// Build in-memory lookup over all members (one DB read, then no per-account queries).
function buildIndex(members) {
  const exact = new Map(), folded = new Map(), byPn = new Map();
  const add = (map, key, m) => { if (!map.has(key)) map.set(key, []); map.get(key).push(m); };
  for (const m of members) {
    byPn.set(m.pnNo, m);
    add(exact, norm(m.accountName), m);
    add(folded, norm(fold(m.accountName)), m);
  }
  return { exact, folded, byPn, all: members };
}
function resolveInIndex(parsed, idx) {
  const target = parsed.target;
  if (NAME_TO_PN[target]) { const m = idx.byPn.get(NAME_TO_PN[target]); if (m) return { status: "single", member: m }; }
  let hits = idx.exact.get(norm(target)) || [];
  if (!hits.length) hits = idx.folded.get(norm(fold(target))) || [];
  if (!hits.length && parsed.first) {
    const re = new RegExp(`${esc(parsed.last)}.*${esc(parsed.first)}`, "i");
    hits = idx.all.filter((m) => re.test(m.accountName));
  }
  if (!hits.length) return { status: "none" };
  if (hits.length > 1) return { status: "ambiguous", member: hits[0], candidates: hits.map((h) => ({ pnNo: h.pnNo, accountName: h.accountName })) };
  return { status: "single", member: hits[0] };
}

const PN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function genPnNo(idx) {
  for (let t = 0; t < 50; t++) {
    let s = ""; for (let i = 0; i < 6; i++) s += PN_CHARS[Math.floor(Math.random() * PN_CHARS.length)];
    if (!idx.byPn.has(s) && !(await WaterMember.findOne({ pnNo: s }).select("_id").lean())) return s;
  }
  throw new Error("could not generate unique pnNo");
}
const usedMeters = new Set();
async function genMeterNumber() {
  for (let t = 0; t < 80; t++) {
    const s = String(10000 + Math.floor(Math.random() * 90000));
    if (!usedMeters.has(s) && !(await WaterMember.findOne({ "meters.meterNumber": s }).select("_id").lean())) { usedMeters.add(s); return s; }
  }
  throw new Error("could not generate unique meter number");
}

async function createMember(parsed, lastReading, idx) {
  const pnNo = await genPnNo(idx);
  const meterNumber = await genMeterNumber();
  const member = await WaterMember.create({
    pnNo, accountName: parsed.target, personal: { fullName: parsed.target }, contact: {},
    billing: { classification: parsed.commercial ? "commercial" : "residential" },
    meters: [{ meterNumber, meterStatus: "active", isBillingActive: true, lastReading: Number(lastReading) || 0, meterReaderNotes: parsed.tenant ? `Tenant: ${parsed.tenant}` : "" }],
    accountStatus: "active", statusReason: "Imported from legacy ledger", createdBy: "legacy-import",
  });
  // reflect in the in-memory index so a second row of the same name resolves to it
  const lean = { pnNo, accountName: parsed.target, billing: { classification: parsed.commercial ? "commercial" : "residential" }, meters: [{ meterNumber, meterStatus: "active", isBillingActive: true }] };
  idx.byPn.set(pnNo, lean);
  (idx.exact.get(norm(parsed.target)) || idx.exact.set(norm(parsed.target), []).get(norm(parsed.target))).push(lean);
  return lean;
}

// Returns the meter # for the ledger row; adds one (auto number) if the
// account doesn't have the ledger's meter index yet.
async function ensureMeter(member, parsed, lastReading, dry) {
  const meters = member.meters || [];
  const i = (parsed.meterNo || 1) - 1;
  if (meters[i]) return { meterNumber: String(meters[i].meterNumber).toUpperCase(), added: false };
  if (dry) return { meterNumber: `(new meter #${parsed.meterNo || 1})`, added: true, plan: true };
  const doc = await WaterMember.findOne({ pnNo: member.pnNo });
  if (!doc) return { meterNumber: `(missing pn ${member.pnNo})`, added: false };
  const meterNumber = await genMeterNumber();
  doc.meters.push({ meterNumber, meterStatus: "active", isBillingActive: true, lastReading: Number(lastReading) || 0, meterReaderNotes: parsed.tenant ? `Tenant: ${parsed.tenant} (legacy)` : "Added from legacy ledger" });
  await doc.save();
  member.meters = doc.meters.map((m) => ({ meterNumber: m.meterNumber, meterStatus: m.meterStatus, isBillingActive: m.isBillingActive }));
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
const NOW_DUE = new Date(Date.UTC(2026, 5, 17));
const PERIODS = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];

async function postCbuCredit(member, amount) {
  const refOrNo = `LEGCBU-${member.pnNo}`;
  if (await CbuTransaction.findOne({ refOrNo }).select("_id").lean()) return false;
  const ledger = await CbuTransaction.find({ pnNo: member.pnNo }).select("type amount").lean();
  const prior = ledger.reduce((s, t) => s + (t.type === "credit" ? 1 : -1) * (Number(t.amount) || 0), 0);
  await CbuTransaction.create({
    pnNo: member.pnNo, accountName: member.accountName, type: "credit",
    amount: round2(amount), balanceAfter: round2(prior + amount), source: "water_overpay", refOrNo,
    note: "Legacy ledger overpayment — opening credit", postedBy: "legacy-import",
  });
  return true;
}

async function chunkInsert(Model, docs) {
  let n = 0;
  for (let i = 0; i < docs.length; i += 800) {
    const slice = docs.slice(i, i + 800);
    try { const r = await Model.insertMany(slice, { ordered: false }); n += r.length; }
    catch (e) { if (Array.isArray(e?.insertedDocs)) n += e.insertedDocs.length; else console.error("insertMany:", e.message); }
  }
  return n;
}

export async function importLegacyWater({ area = "loocSur", dry = true, includeUnmatched = false, limit = 0, onProgress = null } = {}) {
  const data = loadData(area);
  const settings = (await WaterSettings.findOne()) || { tariffs: {}, seniorDiscount: {}, dueDayOfMonth: 17 };
  const dueDay = settings.dueDayOfMonth || 17;

  // ── pre-load (one read each) ──
  const idx = buildIndex(await WaterMember.find({}).select("pnNo accountName meters billing").lean());
  const existingBillKeys = new Set();
  const existingOrs = new Set();
  if (!dry) {
    for (const b of await WaterBill.find({ periodKey: { $in: PERIODS } }).select("pnNo periodKey meterNumber").lean())
      existingBillKeys.add(`${b.pnNo}|${b.periodKey}|${String(b.meterNumber).toUpperCase()}`);
    for (const p of await WaterPayment.find({}).select("orNo").lean()) existingOrs.add(p.orNo);
  }

  const r = {
    dry, area: data.area, source: data.source, accounts: data.accounts.length,
    matched: 0, ambiguous: 0, created: 0, metersAdded: 0,
    billsInserted: 0, paymentsInserted: 0, billsSkipped: 0, cbuCredits: 0,
    unmatched: [], reconciled: [], sample: [],
  };

  const billBatch = [];   // { doc, meta } pending insert
  const cbuPending = [];   // { member, amount }
  const total = limit ? Math.min(limit, data.accounts.length) : data.accounts.length;
  let processed = 0;

  for (const acct of data.accounts) {
    if (limit && processed >= limit) break;
    processed++;
    if (onProgress) { try { onProgress(processed, total); } catch { /* best-effort */ } }

    const parsed = parseLedgerName(acct.name);
    const lastReading = [...acct.months].reverse().find((m) => m.present != null)?.present ?? acct.months.find((m) => m.prev != null)?.prev ?? 0;

    const resolved = resolveInIndex(parsed, idx);
    let member = resolved.member || null;
    const kind = resolved.status;
    let createdNow = false, meterAdded = false;

    if (kind === "none") {
      if (!includeUnmatched) { r.unmatched.push({ name: acct.name, target: parsed.target, reason: "no_match" }); continue; }
      if (dry) { r.created++; r.unmatched.push({ name: acct.name, target: parsed.target, reason: "no_match", action: `would CREATE (${parsed.commercial ? "commercial" : "residential"}) + meter` }); continue; }
      member = await createMember(parsed, lastReading, idx); createdNow = true; r.created++;
    } else if (kind === "ambiguous") {
      r.ambiguous++;
      if (!includeUnmatched) { r.unmatched.push({ name: acct.name, target: parsed.target, reason: "ambiguous", candidates: resolved.candidates }); continue; }
    }
    if (kind === "single") r.matched++;

    const mres = await ensureMeter(member, parsed, lastReading, dry);
    const meterNumber = mres.meterNumber;
    if (mres.added && !mres.plan) { meterAdded = true; r.metersAdded++; }
    const classification = parsed.commercial ? "commercial" : (member.billing?.classification || "residential");

    const bills = [];
    if (acct.opening && acct.opening !== 0) bills.push({ period: "2025-12", amount: round2(acct.opening), consumed: 0, prev: null, present: null, opening: true });
    for (const m of acct.months) { if (m.billing == null) continue; bills.push({ period: m.period, amount: round2(m.billing), consumed: m.consumed ?? 0, prev: m.prev, present: m.present }); }
    const payments = [];
    for (const m of acct.months) if (m.pay && m.pay > 0) payments.push({ amount: round2(m.pay), orno: m.orno, date: m.date });

    for (const b of bills) { b.remaining = b.amount; b.paidBy = null; }
    for (const p of payments) {
      let amt = p.amount;
      for (const b of bills) { if (amt <= 0) break; if (b.remaining <= 0.001) continue; const a = Math.min(b.remaining, amt); b.remaining = round2(b.remaining - a); amt = round2(amt - a); if (b.remaining <= 0.001) b.paidBy = p; }
    }
    const computed = round2(bills.reduce((s, b) => s + Math.max(0, b.remaining), 0));
    const target = round2([...acct.months].reverse().find((m) => m.recv != null)?.recv ?? 0);

    let cbuCredit = 0;
    if (target < -0.5) { for (const b of bills) b.remaining = 0; cbuCredit = round2(-target); }
    else if (computed - target > 0.5) { let credit = round2(computed - target); for (const b of bills) { if (credit <= 0) break; if (b.remaining <= 0.001) continue; const a = Math.min(b.remaining, credit); b.remaining = round2(b.remaining - a); credit = round2(credit - a); } }
    const outstanding = round2(bills.reduce((s, b) => s + Math.max(0, b.remaining), 0));
    const reconciles = Math.abs(outstanding - Math.max(0, target)) <= 0.5;
    const paidCount = bills.filter((b) => b.remaining <= 0.001).length;

    if (r.sample.length < 10) r.sample.push({ name: acct.name, pnNo: member.pnNo, accountName: member.accountName, meter: meterNumber, kind, createdNow, meterAdded, classification, bills: bills.length, paid: paidCount, unpaid: bills.length - paidCount, outstanding, ledger: target, cbuCredit, reconciles });
    if (cbuCredit > 0) r.reconciled.push({ name: acct.name, pnNo: member.pnNo, type: "CBU credit", amount: cbuCredit });

    if (dry) continue;

    for (const b of bills) {
      const key = `${member.pnNo}|${b.period}|${meterNumber}`;
      if (existingBillKeys.has(key)) { r.billsSkipped++; continue; }
      existingBillKeys.add(key);
      const isPaid = b.remaining <= 0.001;
      billBatch.push({
        meta: { paidBy: b.paidBy, isPaid, pnNo: member.pnNo, meterNumber, period: b.period, amount: b.amount, classification },
        doc: {
          pnNo: member.pnNo, accountName: member.accountName, classification, addressText: "",
          periodKey: b.period, periodCovered: b.period, meterNumber,
          previousReading: b.prev ?? 0, presentReading: b.present ?? 0, consumed: b.consumed ?? 0,
          meterReadings: b.present != null ? [{ meterNumber, previousReading: b.prev ?? 0, presentReading: b.present ?? 0, rawConsumed: b.consumed ?? 0, multiplier: 1, consumed: b.consumed ?? 0 }] : [],
          amount: b.amount, baseAmount: b.amount, discount: isPaid ? 0 : round2(b.amount - b.remaining),
          discountReason: !isPaid && b.amount - b.remaining > 0.001 ? "Legacy ledger credit/adjustment" : "",
          tariffSnapshot: tariffSnapshotFor(b.period, settings),
          penaltyTypeUsed: "flat", penaltyValueUsed: 0, dueDayUsed: dueDay, graceDaysUsed: 0,
          penaltyApplied: 0, totalDue: isPaid ? b.amount : round2(b.remaining),
          dueDate: isPaid ? dueDateFor(b.period, dueDay) : NOW_DUE, readingDate: dueDateFor(b.period, dueDay),
          readerId: "legacy-import", createdBy: "legacy-import",
          remarks: b.opening ? "Opening balance (legacy ledger)" : "Imported from legacy ledger",
          status: isPaid ? "paid" : "unpaid",
        },
      });
    }
    if (cbuCredit > 0) cbuPending.push({ member, amount: cbuCredit });
  }

  // ── batched writes (apply only) ──
  if (!dry && billBatch.length) {
    let inserted = [];
    for (let i = 0; i < billBatch.length; i += 800) {
      const slice = billBatch.slice(i, i + 800).map((b) => b.doc);
      try { inserted = inserted.concat(await WaterBill.insertMany(slice, { ordered: false })); }
      catch (e) { if (Array.isArray(e?.insertedDocs)) inserted = inserted.concat(e.insertedDocs); else console.error("bill insertMany:", e.message); }
    }
    r.billsInserted += inserted.length;
    const billByKey = new Map(inserted.map((b) => [`${b.pnNo}|${b.periodKey}|${String(b.meterNumber).toUpperCase()}`, b]));
    const payDocs = [];
    for (const { meta } of billBatch) {
      if (!meta.isPaid || !meta.paidBy) continue;
      const bill = billByKey.get(`${meta.pnNo}|${meta.period}|${meta.meterNumber}`);
      if (!bill) continue;
      let orNo = String(meta.paidBy.orno || `LEG-${meta.pnNo}-${meta.period}`);
      if (existingOrs.has(orNo)) orNo = `${orNo}-${meta.meterNumber}`;
      if (existingOrs.has(orNo)) continue;
      existingOrs.add(orNo);
      payDocs.push({
        billId: bill._id, pnNo: meta.pnNo, meterNumber: meta.meterNumber, periodKey: meta.period,
        orNo, method: "cash", amountPaid: meta.amount, amountReceived: meta.amount, classification: meta.classification,
        receivedBy: "legacy-import", paidAt: meta.paidBy.date ? new Date(`${meta.paidBy.date}T00:00:00Z`) : dueDateFor(meta.period, dueDay),
        verified: true, verifiedBy: "legacy-import", verifiedAt: new Date(), notes: `Legacy ledger payment • OR ${meta.paidBy.orno || "n/a"}`,
      });
    }
    if (payDocs.length) r.paymentsInserted += await chunkInsert(WaterPayment, payDocs);
    for (const c of cbuPending) if (await postCbuCredit(c.member, c.amount)) r.cbuCredits++;
  }

  return r;
}
