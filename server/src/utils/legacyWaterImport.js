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
import Purok from "../models/Purok.js";
import WaterReading from "../models/WaterReading.js";
import LoanApplication from "../models/LoanApplication.js";

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

// Roster (master member-name list) — used by importWaterRoster to create the
// accounts that exist on paper but aren't in the system yet.
const ROSTER_FILE = "waterMemberRoster.json";
// Roster area label (as written in the xlsx) → importer area key.
const ROSTER_AREAS = {
  loocSur: "Looc Sur", sanMiguel: "San Miguel", owakProper: "Owak Proper", baybay: "Baybay, Owak",
};
export const WATER_ROSTER_AREAS = [{ key: "all", label: "All areas" }, ...Object.entries(ROSTER_AREAS).map(([key, label]) => ({ key, label }))];
function loadRoster() {
  if (!DATA[ROSTER_FILE]) DATA[ROSTER_FILE] = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/", ROSTER_FILE), "utf8"));
  return DATA[ROSTER_FILE];
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
    unmatched: [], reconciled: [], disambiguated: [], sample: [],
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

    let resolved = resolveInIndex(parsed, idx);
    let forcedMeter = null;
    // Duplicate-name accounts: pick the candidate whose meter's last reading
    // matches the ledger row's STARTING reading (so the meter lands on the
    // right account automatically — no manual override needed).
    let ambigDiag = null;
    if (resolved.status === "ambiguous") {
      // Compare each candidate meter's last reading against ALL of this
      // row's ledger readings (Jan prev + every month's present), since the
      // system reading could sit at any point in the period.
      const ledgerReadings = [acct.months[0]?.prev, ...acct.months.map((m) => m.present)].filter((v) => v != null).map(Number);
      let best = null, bestMeter = null, bestDiff = Infinity;
      const candInfo = [];
      for (const cand of resolved.candidates) {
        const cm = idx.byPn.get(cand.pnNo);
        const meters = (cm?.meters || []).map((mt) => {
          const lr = Number(mt.lastReading) || 0;
          const d = ledgerReadings.length ? Math.min(...ledgerReadings.map((x) => Math.abs(lr - x))) : Infinity;
          if (d < bestDiff) { bestDiff = d; best = cm; bestMeter = mt; }
          return { meter: mt.meterNumber, reading: lr, status: mt.meterStatus, diff: Number.isFinite(d) ? round2(d) : null };
        });
        candInfo.push({ pnNo: cand.pnNo, accountName: cand.accountName, meters });
      }
      if (best && bestMeter && bestDiff <= 5) {
        resolved = { status: "single", member: best };
        forcedMeter = String(bestMeter.meterNumber).toUpperCase();
        r.disambiguated.push({ name: acct.name, pnNo: best.pnNo, meter: forcedMeter, meterReading: bestMeter.lastReading || 0, ledgerPrev: ledgerReadings[0] ?? null, diff: round2(bestDiff) });
      } else {
        ambigDiag = { ledgerReadings, candidates: candInfo, bestDiff: Number.isFinite(bestDiff) ? round2(bestDiff) : null };
      }
    }
    let member = resolved.member || null;
    const kind = resolved.status;
    let createdNow = false, meterAdded = false;

    if (kind === "none") {
      if (!includeUnmatched) { r.unmatched.push({ name: acct.name, target: parsed.target, reason: "no_match" }); continue; }
      if (dry) { r.created++; r.unmatched.push({ name: acct.name, target: parsed.target, reason: "no_match", action: `would CREATE (${parsed.commercial ? "commercial" : "residential"}) + meter` }); continue; }
      member = await createMember(parsed, lastReading, idx); createdNow = true; r.created++;
    } else if (kind === "ambiguous") {
      r.ambiguous++;
      if (!includeUnmatched) { r.unmatched.push({ name: acct.name, target: parsed.target, reason: "ambiguous", candidates: resolved.candidates, diag: ambigDiag }); continue; }
    }
    if (kind === "single") r.matched++;

    let meterNumber, meterAddedFlag = false;
    if (forcedMeter) {
      meterNumber = forcedMeter;
    } else {
      const mres = await ensureMeter(member, parsed, lastReading, dry);
      meterNumber = mres.meterNumber;
      if (mres.added && !mres.plan) { meterAddedFlag = true; r.metersAdded++; }
    }
    meterAdded = meterAddedFlag;
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

// ── Roster importer ───────────────────────────────────────────────────────
// Creates the water-member ACCOUNTS that exist on the master name list
// (waterMemberRoster.json) but aren't in the system yet. No bills/readings —
// just the account + its meter(s). Matched names are left untouched.
//
// Multi-meter owners appear as several "Last, First # N" rows; these are
// grouped into ONE account whose meter count = the number of roster lines for
// that name. Idempotent: created owners resolve as existing on a re-run, so
// re-applying creates nothing.
export async function importWaterRoster({ area = "all", dry = true, onProgress = null } = {}) {
  const roster = loadRoster();
  const wantLabel = area && area !== "all" ? (ROSTER_AREAS[area] || area) : null;
  const rows = wantLabel ? roster.members.filter((m) => m.area === wantLabel) : roster.members;

  // Ledger footer/aggregate rows that leaked into the name column.
  const SKIP = /^(sub-?\s*total|grand\s*total|abstract|total|names?)$/i;
  // Group roster lines by AREA + parsed base name → one owner (each line = a
  // meter). Area is in the key so same-named accounts in different barangays
  // stay separate; an owner's "# N" lines are always under one barangay.
  const groups = new Map();
  let skipped = 0;
  for (const row of rows) {
    const parsed = parseLedgerName(row.name);
    if (!parsed.target || SKIP.test(parsed.target.trim())) { skipped++; continue; }
    const key = `${row.area}|${norm(parsed.target)}`;
    let g = groups.get(key);
    if (!g) { g = { target: parsed.target, area: row.area, commercial: false, senior: false, lines: 0, raw: [] }; groups.set(key, g); }
    g.commercial = g.commercial || parsed.commercial;
    g.senior = g.senior || parsed.senior;
    g.lines++;
    if (g.raw.length < 4) g.raw.push(row.name);
  }

  const idx = buildIndex(await WaterMember.find({}).select("pnNo accountName meters billing").lean());
  // In-memory unique generators (we already hold every existing pn + meter).
  const localPns = new Set(idx.byPn.keys());
  const localMeters = new Set();
  for (const m of idx.all) for (const mt of (m.meters || [])) localMeters.add(String(mt.meterNumber).toUpperCase());
  const PN6 = () => { for (;;) { let s = ""; for (let i = 0; i < 6; i++) s += PN_CHARS[Math.floor(Math.random() * PN_CHARS.length)]; if (!localPns.has(s)) { localPns.add(s); return s; } } };
  const METER5 = () => { for (;;) { const s = String(10000 + Math.floor(Math.random() * 90000)); if (!localMeters.has(s)) { localMeters.add(s); return s; } } };

  const byArea = {};
  const r = {
    dry, area, rosterRows: rows.length, skipped, owners: groups.size,
    exists: 0, ambiguous: 0, toCreate: 0, metersToCreate: 0, created: 0, metersCreated: 0,
    byArea, sample: [], createList: [],
  };
  const bump = (a, k) => { (byArea[a] = byArea[a] || { exists: 0, create: 0 })[k]++; };

  const docs = [];
  const total = groups.size;
  let processed = 0;
  for (const g of groups.values()) {
    processed++;
    if (onProgress) { try { onProgress(processed, total); } catch { /* best-effort */ } }

    const parsed = { last: "", first: "", target: g.target, commercial: g.commercial, senior: g.senior, tenant: null, meterNo: null };
    const resolved = resolveInIndex(parsed, idx);
    if (resolved.status !== "none") {
      r.exists++; bump(g.area, "exists");
      if (resolved.status === "ambiguous") r.ambiguous++;
      continue;
    }

    const meterCount = Math.max(1, g.lines);
    const classification = g.commercial ? "commercial" : "residential";
    r.toCreate++; r.metersToCreate += meterCount; bump(g.area, "create");
    if (r.createList.length < 300) r.createList.push({ name: g.target, area: g.area, classification, meters: meterCount, senior: g.senior, raw: g.raw });
    if (r.sample.length < 12) r.sample.push({ name: g.target, area: g.area, classification, meters: meterCount, senior: g.senior });
    if (dry) continue;

    const meters = [];
    for (let i = 0; i < meterCount; i++) meters.push({ meterNumber: METER5(), meterStatus: "active", isBillingActive: true, lastReading: 0, meterReaderNotes: "Added from member roster" });
    docs.push({
      pnNo: PN6(), accountName: g.target, personal: { fullName: g.target }, contact: {},
      address: { barangay: g.area || "" }, billing: { classification },
      meters, accountStatus: "active", statusReason: "Imported from member roster", createdBy: "legacy-import",
    });
  }

  if (!dry && docs.length) {
    let inserted = 0;
    for (let i = 0; i < docs.length; i += 500) {
      const slice = docs.slice(i, i + 500);
      try { const res = await WaterMember.insertMany(slice, { ordered: false }); inserted += res.length; }
      catch (e) { if (Array.isArray(e?.insertedDocs)) inserted += e.insertedDocs.length; else console.error("roster insertMany:", e.message); }
    }
    r.created = inserted;
    r.metersCreated = docs.reduce((s, d) => s + d.meters.length, 0);
  }

  return r;
}

// ── Purok importer ─────────────────────────────────────────────────────
// Populates the Purok registry + assigns each member to a purok from the
// purok-divided roster (waterMemberPuroks.json — each "Area: / Names" block
// in watermember.xlsx is one purok, numbered Purok 1..N per area). Matches
// names to existing accounts in memory; dry-run-first + idempotent.
const PUROK_FILE = "waterMemberPuroks.json";
function loadPurokData() {
  if (!DATA[PUROK_FILE]) DATA[PUROK_FILE] = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/", PUROK_FILE), "utf8"));
  return DATA[PUROK_FILE];
}
export function purokImportAreas() {
  const recs = loadPurokData().records || [];
  const m = new Map();
  for (const r of recs) m.set(r.area, (m.get(r.area) || 0) + 1);
  return [{ key: "all", label: "All areas" }, ...[...m.keys()].map((a) => ({ key: a, label: a }))];
}

export async function importMemberPuroks({ area = "all", dry = true } = {}) {
  const records = (loadPurokData().records || []).filter((r) => area === "all" || r.area === area);
  const idx = buildIndex(await WaterMember.find({}).select("pnNo accountName meters billing address purok").lean());

  const r = { dry, area, records: records.length, puroksToCreate: 0, puroksCreated: 0, matched: 0, ambiguous: 0, assigned: 0, areaCorrected: 0, unmatched: [], sample: [] };

  // distinct (area, purok) → registry entries to ensure
  const wantPuroks = new Map(); // `${area}__${purok}` -> { barangay, name, order }
  for (const rec of records) {
    const key = `${rec.area}__${rec.purok}`;
    if (!wantPuroks.has(key)) wantPuroks.set(key, { barangay: rec.area, name: rec.purok, order: parseInt(String(rec.purok).replace(/\D/g, ""), 10) || 0 });
  }
  const existing = new Set((await Purok.find(area === "all" ? {} : { barangay: area }).select("barangay name").lean()).map((p) => `${p.barangay}__${p.name}`));
  const newPuroks = [];
  for (const p of wantPuroks.values()) {
    if (existing.has(`${p.barangay}__${p.name}`)) continue;
    r.puroksToCreate++;
    if (!dry) newPuroks.push({ ...p, createdBy: "purok-import" });
  }
  if (!dry && newPuroks.length) {
    try { const res = await Purok.insertMany(newPuroks, { ordered: false }); r.puroksCreated = res.length; }
    catch (e) { r.puroksCreated = Array.isArray(e?.insertedDocs) ? e.insertedDocs.length : 0; }
  }

  // assign members
  const bulk = [];
  for (const rec of records) {
    const parsed = parseLedgerName(rec.name);
    const res = resolveInIndex(parsed, idx);
    if (res.status === "none") { r.unmatched.push({ name: rec.name, area: rec.area, purok: rec.purok, reason: "no_match" }); continue; }
    if (res.status === "ambiguous") r.ambiguous++;
    r.matched++;
    const m = res.member;
    const movedArea = (m.address?.barangay || "") !== rec.area;
    if (r.sample.length < 12) r.sample.push({ name: rec.name, pnNo: m.pnNo, accountName: m.accountName, area: rec.area, purok: rec.purok, kind: res.status, wasArea: m.address?.barangay || "" });
    if (movedArea) r.areaCorrected = (r.areaCorrected || 0) + 1;
    // The lists you sent are the source of truth for BOTH the area
    // (barangay) and the purok — so a member saved under a stray "Owak"
    // is moved into "Owak Proper" when matched by name.
    if (!dry) bulk.push({ updateOne: { filter: { pnNo: m.pnNo }, update: { $set: { purok: rec.purok, "address.barangay": rec.area } } } });
  }
  if (!dry && bulk.length) {
    for (let i = 0; i < bulk.length; i += 1000) {
      const wr = await WaterMember.bulkWrite(bulk.slice(i, i + 1000), { ordered: false });
      r.assigned += (wr.modifiedCount || 0);
    }
  } else if (dry) r.assigned = r.matched;

  return r;
}

// ── Duplicate detection: exact + fuzzy (typo) name matching ────────────
// Levenshtein distance with an early-out past 2 edits (our typo threshold).
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  if (Math.abs(m - n) > 2) return 9;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > 2) return 9; // whole row already past threshold
    prev = cur;
  }
  return prev[n];
}
// Two names (same last name, blocked) are "typo twins" when their FIRST
// names are within a length-aware edit distance: 1 edit on 5+ chars or 2
// edits on 8+ chars. This catches Cinderila/Cindirela (2 edits, 9 chars)
// and Marivel/Maribel (1 edit) but NOT Lorna/Myrna (2 edits, 5 chars) or
// Jose/Rose (1 edit, 4 chars), which are different people.
const _firstOf = (folded) => { const i = folded.indexOf(","); return (i >= 0 ? folded.slice(i + 1) : folded).trim(); };
function typoTwins(fa, fb) {
  const a = _firstOf(fa), b = _firstOf(fb);
  if (a === b) return true;
  const d = lev(a, b), mx = Math.max(a.length, b.length);
  return (d === 1 && mx >= 5) || (d === 2 && mx >= 8);
}
// Group members by name. exact = identical normalized name; fuzzy = also
// clusters typo-twin names within the same last-name block.
function groupMembersByName(members, { fuzzy = false } = {}) {
  if (!fuzzy) {
    const map = new Map();
    for (const m of members) { const k = norm(m.accountName); if (!k) continue; if (!map.has(k)) map.set(k, []); map.get(k).push(m); }
    return [...map.values()];
  }
  const byLast = new Map();
  for (const m of members) {
    const f = norm(fold(m.accountName)); if (!f) continue;
    const last = f.split(",")[0].trim();
    if (!byLast.has(last)) byLast.set(last, []);
    byLast.get(last).push({ m, f });
  }
  const clusters = [];
  for (const arr of byLast.values()) {
    const parent = arr.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { if (typoTwins(arr[i].f, arr[j].f)) parent[find(i)] = find(j); }
    const gm = new Map();
    for (let i = 0; i < arr.length; i++) { const r = find(i); if (!gm.has(r)) gm.set(r, []); gm.get(r).push(arr[i].m); }
    for (const g of gm.values()) clusters.push(g);
  }
  return clusters;
}

// Report duplicate-name groups (exact or fuzzy), incl. each account's status.
export async function findDuplicateMembers({ includeInactive = false, fuzzy = false } = {}) {
  const match = includeInactive ? {} : { accountStatus: "active" };
  const members = await WaterMember.find(match).select("pnNo accountName purok address.barangay accountStatus meters").lean();
  const groups = groupMembersByName(members, { fuzzy })
    .filter((g) => g.length > 1)
    .map((g) => ({
      _id: norm(g[0].accountName),
      count: g.length,
      accounts: g.map((m) => ({ pnNo: m.pnNo, accountName: m.accountName, purok: m.purok || "", barangay: m.address?.barangay || "", status: m.accountStatus, meters: (m.meters || []).length })),
    }))
    .sort((a, b) => b.count - a.count || a._id.localeCompare(b._id))
    .slice(0, 1000);
  return { groups, groupCount: groups.length, totalDupAccounts: groups.reduce((s, g) => s + g.count, 0), fuzzy };
}

// ── Dedupe water members ───────────────────────────────────────────────
// The legacy imports created duplicate accounts (same name, different pn).
// This keeps every account that has ANY transaction history and ARCHIVES
// (accountStatus="inactive") the EMPTY duplicates. For a name where no copy
// has history, it keeps one (prefers a purok-assigned, then oldest) and
// archives the rest. NEVER hard-deletes; groups where 2+ copies both have
// history are left for manual review. Dry-run-first.
export async function dedupeWaterMembers({ dry = true, fuzzy = false } = {}) {
  const all = await WaterMember.find({ accountStatus: "active" })
    .select("pnNo accountName purok address.barangay meters createdAt").lean();

  const dupGroups = groupMembersByName(all, { fuzzy }).filter((g) => g.length > 1);
  const dupPns = dupGroups.flatMap((g) => g.map((m) => m.pnNo));

  const r = { dry, fuzzy, dupGroups: dupGroups.length, dupAccounts: dupPns.length, kept: 0, archived: 0, review: [], sample: [] };
  if (!dupPns.length) return r;

  const [billPns, payPns, readPns, cbuPns, loanPns] = await Promise.all([
    WaterBill.distinct("pnNo", { pnNo: { $in: dupPns } }),
    WaterPayment.distinct("pnNo", { pnNo: { $in: dupPns } }),
    WaterReading.distinct("pnNo", { pnNo: { $in: dupPns } }),
    CbuTransaction.distinct("pnNo", { pnNo: { $in: dupPns } }),
    LoanApplication.distinct("borrowerPnNo", { borrowerPnNo: { $in: dupPns } }),
  ]);
  const hasActivity = new Set([...billPns, ...payPns, ...readPns, ...cbuPns, ...loanPns].map(String));

  const archivePns = [];
  for (const g of dupGroups) {
    const withAct = g.filter((m) => hasActivity.has(m.pnNo));
    let keep, drop;
    if (withAct.length >= 1) {
      keep = withAct;
      drop = g.filter((m) => !hasActivity.has(m.pnNo));
      if (withAct.length > 1) r.review.push({ name: g[0].accountName, pnNos: withAct.map((m) => m.pnNo) });
    } else {
      const sorted = [...g].sort((a, b) => (b.purok ? 1 : 0) - (a.purok ? 1 : 0) || new Date(a.createdAt) - new Date(b.createdAt));
      keep = [sorted[0]];
      drop = sorted.slice(1);
    }
    r.kept += keep.length;
    for (const d of drop) archivePns.push(d.pnNo);
    if (r.sample.length < 15) r.sample.push({ name: g[0].accountName, total: g.length, keep: keep.map((m) => `${m.pnNo}${hasActivity.has(m.pnNo) ? "*" : ""}`), archive: drop.map((m) => m.pnNo) });
  }
  r.archived = archivePns.length;

  if (!dry && archivePns.length) {
    for (let i = 0; i < archivePns.length; i += 1000) {
      await WaterMember.updateMany(
        { pnNo: { $in: archivePns.slice(i, i + 1000) } },
        { $set: { accountStatus: "inactive", statusReason: "Duplicate with no transactions — archived during dedupe", statusDate: new Date() } }
      );
    }
  }
  return r;
}

// ── Merge split-meter duplicates ───────────────────────────────────────
// When one owner's meters got split across duplicate-name accounts (acct A
// = meter #1, acct B = meter #2), combine all meters onto ONE account,
// re-point that account's bills/payments/readings/CBU to the kept pn, and
// archive the emptied secondaries. Only merges when the meter numbers DON'T
// overlap (a clean split); skips any group that has a loan. Dry-run-first.
const _nm = (s) => String(s || "").toUpperCase().trim();
export async function mergeSplitMeterDuplicates({ dry = true, fuzzy = false } = {}) {
  const all = await WaterMember.find({ accountStatus: "active" })
    .select("pnNo accountName billing purok address.barangay meters createdAt").lean();
  const dupGroups = groupMembersByName(all, { fuzzy }).filter((g) => g.length > 1);

  const r = { dry, fuzzy, dupGroups: dupGroups.length, merged: 0, accountsArchived: 0, metersMoved: 0, skippedOverlap: 0, skippedLoan: 0, review: [], sample: [] };
  if (!dupGroups.length) return r;

  const allPns = dupGroups.flatMap((g) => g.map((m) => m.pnNo));
  const [billC, payC, readC, cbuC, loanPns] = await Promise.all([
    WaterBill.aggregate([{ $match: { pnNo: { $in: allPns } } }, { $group: { _id: "$pnNo", n: { $sum: 1 } } }]),
    WaterPayment.aggregate([{ $match: { pnNo: { $in: allPns } } }, { $group: { _id: "$pnNo", n: { $sum: 1 } } }]),
    WaterReading.aggregate([{ $match: { pnNo: { $in: allPns } } }, { $group: { _id: "$pnNo", n: { $sum: 1 } } }]),
    CbuTransaction.aggregate([{ $match: { pnNo: { $in: allPns } } }, { $group: { _id: "$pnNo", n: { $sum: 1 } } }]),
    LoanApplication.distinct("borrowerPnNo", { borrowerPnNo: { $in: allPns } }),
  ]);
  const act = new Map();
  for (const arr of [billC, payC, readC, cbuC]) for (const x of arr) act.set(String(x._id), (act.get(String(x._id)) || 0) + x.n);
  const loanSet = new Set(loanPns.map(String));

  for (const g of dupGroups) {
    const counts = new Map();
    for (const m of g) for (const mt of (m.meters || [])) { const mn = _nm(mt.meterNumber); if (mn) counts.set(mn, (counts.get(mn) || 0) + 1); }
    if ([...counts.values()].some((c) => c > 1)) { r.skippedOverlap++; continue; } // same meter on 2 accts → not a clean split
    if (g.some((m) => loanSet.has(m.pnNo))) { r.skippedLoan++; r.review.push({ name: g[0].accountName, reason: "has loan — review", pnNos: g.map((m) => m.pnNo) }); continue; }

    const sorted = [...g].sort((a, b) => (act.get(b.pnNo) || 0) - (act.get(a.pnNo) || 0) || (b.meters?.length || 0) - (a.meters?.length || 0) || new Date(a.createdAt) - new Date(b.createdAt));
    const primary = sorted[0], secondaries = sorted.slice(1);
    const secPns = secondaries.map((s) => s.pnNo);
    const secMeters = secondaries.flatMap((s) => s.meters || []);

    r.merged++; r.accountsArchived += secondaries.length; r.metersMoved += secMeters.length;
    if (r.sample.length < 15) r.sample.push({ name: g[0].accountName, primary: primary.pnNo, secondaries: secPns, totalMeters: (primary.meters?.length || 0) + secMeters.length });

    if (!dry) {
      const doc = await WaterMember.findOne({ pnNo: primary.pnNo });
      if (doc) {
        const have = new Set((doc.meters || []).map((mt) => _nm(mt.meterNumber)));
        for (const mt of secMeters) {
          const mn = _nm(mt.meterNumber);
          if (mn && !have.has(mn)) { doc.meters.push({ meterNumber: mt.meterNumber, meterStatus: mt.meterStatus || "active", isBillingActive: mt.isBillingActive !== false, lastReading: mt.lastReading || 0, meterReaderNotes: mt.meterReaderNotes || "" }); have.add(mn); }
        }
        await doc.save();
      }
      await Promise.all([
        WaterBill.updateMany({ pnNo: { $in: secPns } }, { $set: { pnNo: primary.pnNo, accountName: primary.accountName } }),
        WaterPayment.updateMany({ pnNo: { $in: secPns } }, { $set: { pnNo: primary.pnNo } }),
        WaterReading.updateMany({ pnNo: { $in: secPns } }, { $set: { pnNo: primary.pnNo } }),
        CbuTransaction.updateMany({ pnNo: { $in: secPns } }, { $set: { pnNo: primary.pnNo, accountName: primary.accountName } }),
      ]);
      await WaterMember.updateMany({ pnNo: { $in: secPns } }, { $set: { accountStatus: "inactive", statusReason: `Merged into ${primary.pnNo}`, statusDate: new Date() } });
    }
  }
  return r;
}
