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
import { importLegacyLoans, LEGACY_LOAN_BATCHES } from "../../utils/legacyLoanImport.js";
import { recomputeWaterBills } from "../../scripts/recomputeWaterBills.js";
import { importLegacyWater } from "../../utils/legacyWaterImport.js";

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
  const { confirm, months = [], dry = true } = req.body || {};
  if (confirm !== "IMPORT LEGACY LOANS") {
    return res.status(400).json({ error: 'Pass { confirm: "IMPORT LEGACY LOANS" } to proceed.' });
  }
  try {
    const summary = await importLegacyLoans({ months: Array.isArray(months) ? months : [], dry: Boolean(dry) });
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

// Import legacy water bills + payments from the embedded ledger
// (LoocSur). Dry-run by default — returns matched/unmatched accounts,
// per-account paid/unpaid + outstanding vs the ledger receivable
// (reconcile flags), so the admin verifies on prod before applying.
// Idempotent: existing (pnNo, periodKey, meterNumber) bills are skipped.
router.post("/import-legacy-water", guard, async (req, res) => {
  const { confirm, dry = true, limit = 0, includeUnmatched = false } = req.body || {};
  if (confirm !== "IMPORT LEGACY WATER") {
    return res.status(400).json({ error: 'Pass { confirm: "IMPORT LEGACY WATER" } to proceed.' });
  }
  try {
    const summary = await importLegacyWater({ dry: Boolean(dry), includeUnmatched: Boolean(includeUnmatched), limit: Number(limit) || 0 });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
