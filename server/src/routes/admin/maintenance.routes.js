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

export default router;
