// Petty cash — the cashier's small imprest fund. Replenish adds cash to
// the fund; vouchers spend it on minor expenses. The running balance is
// always recomputed from non-voided rows, so it can't drift. Separate from
// the main cash-drawer reconciliation.
import express from "express";
import PettyCash, { PETTY_CASH_CATEGORIES } from "../models/PettyCash.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const viewGuard = [requireAuth, requireRole(["admin", "manager", "audit_committee", "cashier", "bookkeeper"])];
const writeGuard = [requireAuth, requireRole(["admin", "cashier"])];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const actor = (req) => req.user?.fullName || req.user?.employeeId || "";

// Live fund balance from non-voided rows.
async function fundBalance() {
  const rows = await PettyCash.find({ voided: false }).select("type amount").lean();
  let fund = 0, spent = 0;
  for (const t of rows) {
    if (t.type === "replenish") fund += t.amount;
    else spent += t.amount;
  }
  return { fund: round2(fund), spent: round2(spent), balance: round2(fund - spent) };
}

// Summary + ledger (most recent first, each row carrying its running balance).
router.get("/", ...viewGuard, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const all = await PettyCash.find({ voided: false }).sort({ date: 1, createdAt: 1 }).lean();
    let running = 0, fund = 0, spent = 0;
    for (const t of all) {
      if (t.type === "replenish") { running += t.amount; fund += t.amount; }
      else { running -= t.amount; spent += t.amount; }
      t.running = round2(running);
    }
    const transactions = all.slice(-limit).reverse();
    res.json({
      fund: round2(fund), spent: round2(spent), balance: round2(fund - spent),
      count: all.length, categories: PETTY_CASH_CATEGORIES, transactions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add cash to the fund (establish or replenish).
router.post("/replenish", ...writeGuard, async (req, res) => {
  try {
    const { amount, reference = "", notes = "", date } = req.body || {};
    const amt = round2(amount);
    if (!(amt > 0)) return res.status(400).json({ error: "Amount must be greater than 0." });
    const doc = await PettyCash.create({
      type: "replenish", amount: amt, reference: String(reference).trim(),
      description: String(notes).trim(), date: date ? new Date(date) : new Date(), recordedBy: actor(req),
    });
    res.status(201).json({ ok: true, id: doc._id, ...(await fundBalance()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Spend from the fund. Blocks an overdraw.
router.post("/voucher", ...writeGuard, async (req, res) => {
  try {
    const { amount, category = "", description = "", payee = "", reference = "", date } = req.body || {};
    const amt = round2(amount);
    if (!(amt > 0)) return res.status(400).json({ error: "Amount must be greater than 0." });
    const { balance } = await fundBalance();
    if (amt > balance + 0.001) {
      return res.status(400).json({ error: `Insufficient petty cash — balance is ₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Replenish first.` });
    }
    const doc = await PettyCash.create({
      type: "voucher", amount: amt, category: String(category).trim(),
      description: String(description).trim(), payee: String(payee).trim(),
      reference: String(reference).trim(), date: date ? new Date(date) : new Date(), recordedBy: actor(req),
    });
    res.status(201).json({ ok: true, id: doc._id, ...(await fundBalance()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Soft-void a row (mistake correction). Balance recomputes automatically.
router.post("/:id/void", ...writeGuard, async (req, res) => {
  try {
    const { reason = "" } = req.body || {};
    const doc = await PettyCash.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found." });
    if (!doc.voided) {
      doc.voided = true; doc.voidedBy = actor(req); doc.voidedAt = new Date(); doc.voidReason = String(reason).trim();
      await doc.save();
    }
    res.json({ ok: true, ...(await fundBalance()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
