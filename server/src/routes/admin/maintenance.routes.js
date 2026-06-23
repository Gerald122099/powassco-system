// Admin-only one-shot maintenance endpoints.
//
// Currently exposes:
//   POST /api/admin/maintenance/regen-loan-amortization
//     Rebuilds amortizationSchedule on existing loans whose schedules
//     predate the whole-peso amortization fix (commit 5cc9225). The
//     underlying logic lives in scripts/regenLoanAmortization.js so the
//     same code path can also run from the CLI (npm run regen-amort).
//
// Safety:
//   - admin role required
//   - body must include { confirm: "REGEN AMORT" }
//   - { dry: true } (default) returns a preview with no writes
//   - { all: true } widens the scan from import-script loans to every
//     released loan (use only if a non-import loan also drifted)

import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { regenLoanAmortization } from "../../scripts/regenLoanAmortization.js";
import { rebuildLoanCharges } from "../../scripts/rebuildLoanCharges.js";
import { importLegacyLoans, LEGACY_LOAN_BATCHES, fixWaterMemberNames } from "../../utils/legacyLoanImport.js";
import { recomputeWaterBills } from "../../scripts/recomputeWaterBills.js";
import { applySeniorDiscountToUnpaidBills } from "../../scripts/applySeniorDiscount.js";
import { importLegacyWater, LEGACY_WATER_AREAS, importWaterRoster, WATER_ROSTER_AREAS, importMemberPuroks, purokImportAreas, dedupeWaterMembers, mergeSplitMeterDuplicates, findDuplicateMembers, purgeArchivedDuplicates } from "../../utils/legacyWaterImport.js";
import { emitJobProgress } from "../../realtime.js";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import WaterSettings from "../../models/WaterSettings.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

router.post("/regen-loan-amortization", guard, async (req, res) => {
  const { confirm, all = false, dry = true } = req.body || {};
  if (confirm !== "REGEN AMORT") {
    return res.status(400).json({ error: 'Pass { confirm: "REGEN AMORT" } to proceed.' });
  }
  try {
    const summary = await regenLoanAmortization({ all: Boolean(all), dry: Boolean(dry) });
    res.json({ mode: { all: Boolean(all), dry: Boolean(dry) }, ...summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rebuild-loan-charges", guard, async (req, res) => {
  const { confirm, all = false, dry = true } = req.body || {};
  if (confirm !== "REBUILD CHARGES") {
    return res.status(400).json({ error: 'Pass { confirm: "REBUILD CHARGES" } to proceed.' });
  }
  try {
    const summary = await rebuildLoanCharges({ all: Boolean(all), dry: Boolean(dry) });
    res.json({ mode: { all: Boolean(all), dry: Boolean(dry) }, ...summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Available legacy-loan batches + row counts (for the UI month picker).
router.get("/legacy-loans/batches", guard, (req, res) => {
  res.json(Object.fromEntries(Object.entries(LEGACY_LOAN_BATCHES).map(([k, v]) => [k, v.length])));
});

// Import legacy loans from the embedded monthly batches. Dry-run by
// default — returns per-row resolution (account matched / NOT FOUND /
// ambiguous) + net proceeds so the admin verifies on prod before
// applying. Idempotent: existing (pnNo, principal, releasedAt-day)
// loans are skipped.
router.post("/import-legacy-loans", guard, async (req, res) => {
  const { confirm, months = [], dry = true, jobId = "" } = req.body || {};
  if (confirm !== "IMPORT LEGACY LOANS") {
    return res.status(400).json({ error: 'Pass { confirm: "IMPORT LEGACY LOANS" } to proceed.' });
  }
  try {
    let lastEmit = 0;
    const onProgress = jobId ? (processed, total) => {
      const now = Date.now();
      if (processed === total || now - lastEmit >= 200) { lastEmit = now; emitJobProgress(jobId, { processed, total, pct: Math.round((processed / total) * 100) }); }
    } : null;
    const summary = await importLegacyLoans({ months: Array.isArray(months) ? months : [], dry: Boolean(dry), onProgress });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Re-price UNPAID / OVERDUE water bills onto the CURRENT tariff. Dry-run
// by default — returns each bill's old → new amount so the admin verifies
// before applying. PAID bills are never touched; bills already matching
// the current tariff are left alone (idempotent). Optional filters:
// months[] (periodKeys) and classification.
router.post("/recompute-water-bills", guard, async (req, res) => {
  const { confirm, months = [], classification = null, dry = true } = req.body || {};
  if (confirm !== "RECOMPUTE WATER BILLS") {
    return res.status(400).json({ error: 'Pass { confirm: "RECOMPUTE WATER BILLS" } to proceed.' });
  }
  try {
    const summary = await recomputeWaterBills({
      months: Array.isArray(months) ? months : [],
      classification: classification || null,
      dry: Boolean(dry),
    });
    res.json({ mode: { dry: Boolean(dry), months, classification: classification || null }, ...summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Give EVERY senior citizen a flat discount (default 5%) on ALL tiers, and
// apply it to their existing unpaid/overdue bills WITHOUT re-pricing the base
// charge (base preserved; only the discount is subtracted). This:
//   1. sets the global seniorDiscount = { discountRate: rate, applicableTiers: [] (all) }
//      so NEW bills also get it,
//   2. clears each member's per-member tier override (so they inherit the global),
//   3. applies the discount to existing unpaid bills (base preserved).
// Paid bills are never touched. Dry-run previews the affected bills.
//   body: { confirm: "SYNC MEMBER DISCOUNT", dry, rate }
router.post("/sync-member-discount", guard, async (req, res) => {
  const { confirm, dry = true, rate: rawRate } = req.body || {};
  if (confirm !== "SYNC MEMBER DISCOUNT") {
    return res.status(400).json({ error: 'Pass { confirm: "SYNC MEMBER DISCOUNT" } to proceed.' });
  }
  try {
    const rate = Math.max(0, Math.min(100, Number(rawRate ?? 5)));
    const seniorCount = await WaterMember.countDocuments({ "personal.isSeniorCitizen": true });
    const membersWithOverride = await WaterMember.countDocuments({ "billing.discountApplicableTiers": { $exists: true } });

    if (dry) {
      const preview = await applySeniorDiscountToUnpaidBills({ dry: true, rate });
      return res.json({ dry: true, rate, seniorCount, membersWithOverride, billsAffected: preview.changes.length, preview });
    }

    // 1. Global setting → rate% for ALL tiers, so future bills get it too.
    await WaterSettings.updateOne({}, { $set: { "seniorDiscount.discountRate": rate, "seniorDiscount.applicableTiers": [] } }, { upsert: true });
    // 2. Clear per-member tier overrides so members inherit the global setting.
    const r = await WaterMember.updateMany({}, { $unset: { "billing.discountApplicableTiers": "" } });
    const membersUpdated = r.modifiedCount ?? r.nModified ?? 0;
    // 3. Apply the discount to existing unpaid bills (base preserved).
    const applied = await applySeniorDiscountToUnpaidBills({ dry: false, rate });
    res.json({ dry: false, rate, seniorCount, membersUpdated, applied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import legacy water bills + payments from the embedded ledger
// (LoocSur). Dry-run by default — returns matched/unmatched accounts,
// per-account paid/unpaid + outstanding vs the ledger receivable
// (reconcile flags), so the admin verifies on prod before applying.
// Idempotent: existing (pnNo, periodKey, meterNumber) bills are skipped.
router.get("/legacy-water/areas", guard, (req, res) => res.json(LEGACY_WATER_AREAS));

router.post("/import-legacy-water", guard, async (req, res) => {
  const { confirm, area = "loocSur", dry = true, limit = 0, includeUnmatched = false, jobId = "" } = req.body || {};
  if (confirm !== "IMPORT LEGACY WATER") {
    return res.status(400).json({ error: 'Pass { confirm: "IMPORT LEGACY WATER" } to proceed.' });
  }
  try {
    // Throttle progress emits to ~5/sec so the socket isn't flooded.
    let lastEmit = 0;
    const onProgress = jobId ? (processed, total) => {
      const now = Date.now();
      if (processed === total || now - lastEmit >= 200) {
        lastEmit = now;
        emitJobProgress(jobId, { processed, total, pct: Math.round((processed / total) * 100) });
      }
    } : null;
    const summary = await importLegacyWater({ area: String(area || "loocSur"), dry: Boolean(dry), includeUnmatched: Boolean(includeUnmatched), limit: Number(limit) || 0, onProgress });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create the water-member ACCOUNTS from the master roster (watermember.xlsx)
// that aren't in the system yet — no bills/readings, just account + meter(s).
// Dry-run by default: returns owners / already-exist / would-create counts +
// a per-owner create list so the admin verifies before applying. Idempotent:
// created owners resolve as existing on a re-run.
router.get("/water-roster/areas", guard, (req, res) => res.json(WATER_ROSTER_AREAS));

// Populate the Purok registry + assign each member to a purok from the
// purok-divided roster (waterMemberPuroks.json). Dry-run by default —
// reports puroks to create + members matched/assigned/unmatched.
router.get("/member-puroks/areas", guard, (req, res) => res.json(purokImportAreas()));

// Dedupe water members: archive empty duplicate accounts (no transactions),
// keep the ones with history. Dry-run by default. Never hard-deletes.
router.post("/dedupe-water-members", guard, async (req, res) => {
  const { confirm, dry = true } = req.body || {};
  if (confirm !== "DEDUPE WATER MEMBERS") {
    return res.status(400).json({ error: 'Pass { confirm: "DEDUPE WATER MEMBERS" } to proceed.' });
  }
  try {
    res.json(await dedupeWaterMembers({ dry: Boolean(dry), fuzzy: Boolean(req.body?.fuzzy) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// HARD-DELETE the archived duplicate accounts (dedupe/merge leftovers with
// zero transactions). Irreversible. Dry-run by default.
router.post("/purge-archived-duplicates", guard, async (req, res) => {
  const { confirm, dry = true } = req.body || {};
  if (confirm !== "PURGE DUPLICATES") {
    return res.status(400).json({ error: 'Pass { confirm: "PURGE DUPLICATES" } to proceed.' });
  }
  try {
    res.json(await purgeArchivedDuplicates({ dry: Boolean(dry) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Merge split-meter duplicate accounts (acct A meter #1 + acct B meter #2
// → one account with both meters; transactions re-pointed, empties archived).
// Dry-run by default. Skips meter-overlap groups + any group with a loan.
router.post("/merge-split-meters", guard, async (req, res) => {
  const { confirm, dry = true } = req.body || {};
  if (confirm !== "MERGE SPLIT METERS") {
    return res.status(400).json({ error: 'Pass { confirm: "MERGE SPLIT METERS" } to proceed.' });
  }
  try {
    res.json(await mergeSplitMeterDuplicates({ dry: Boolean(dry), fuzzy: Boolean(req.body?.fuzzy) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Correct water-member name typos so the legacy loan import matches them
// (rows where the LOAN-register name is the correct spelling). Dry-run
// by default; idempotent.
router.post("/fix-water-names", guard, async (req, res) => {
  const { confirm, dry = true } = req.body || {};
  if (confirm !== "FIX WATER NAMES") {
    return res.status(400).json({ error: 'Pass { confirm: "FIX WATER NAMES" } to proceed.' });
  }
  try {
    res.json(await fixWaterMemberNames({ dry: Boolean(dry) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Find water members with duplicate account names — exact, or with
// fuzzy=1 also near-identical spellings (e.g. "Cudis, Cinderila" vs
// "Cudis, Cindirela"). includeInactive=1 also scans archived accounts.
router.get("/duplicate-members", guard, async (req, res) => {
  try {
    res.json(await findDuplicateMembers({
      includeInactive: req.query.includeInactive === "1",
      fuzzy: req.query.fuzzy === "1",
    }));
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to scan duplicates." });
  }
});

router.post("/import-member-puroks", guard, async (req, res) => {
  const { confirm, area = "all", dry = true } = req.body || {};
  if (confirm !== "IMPORT PUROKS") {
    return res.status(400).json({ error: 'Pass { confirm: "IMPORT PUROKS" } to proceed.' });
  }
  try {
    const summary = await importMemberPuroks({ area: String(area || "all"), dry: Boolean(dry) });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/import-water-roster", guard, async (req, res) => {
  const { confirm, area = "all", dry = true, jobId = "" } = req.body || {};
  if (confirm !== "IMPORT WATER ROSTER") {
    return res.status(400).json({ error: 'Pass { confirm: "IMPORT WATER ROSTER" } to proceed.' });
  }
  try {
    let lastEmit = 0;
    const onProgress = jobId ? (processed, total) => {
      const now = Date.now();
      if (processed === total || now - lastEmit >= 200) {
        lastEmit = now;
        emitJobProgress(jobId, { processed, total, pct: Math.round((processed / total) * 100) });
      }
    } : null;
    const summary = await importWaterRoster({ area: String(area || "all"), dry: Boolean(dry), onProgress });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
