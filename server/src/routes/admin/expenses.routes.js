import express from "express";
import Expense, { EXPENSE_CATEGORIES } from "../../models/Expense.js";
import { BankAccount, TreasuryTransaction } from "../../models/Treasury.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "manager"])];
// Read-side endpoints (categories, list, summary) are also useful for
// the bookkeeper / cashier so the disbursement queue and reports can
// look up the same data without a duplicate route. Cashier needs access
// for the Disbursements tab; bookkeeper for cash-out reporting.
const readGuard = [requireAuth, requireRole(["admin", "manager", "audit_committee", "bookkeeper", "cashier"])];

function dateRange(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
}

// Suggested categories for the UI dropdown
router.get("/categories", readGuard, (req, res) => {
  res.json(EXPENSE_CATEGORIES);
});

// List with filters: q, category, status, from, to, page, limit
router.get("/", readGuard, async (req, res) => {
  const { q = "", category = "", status = "", from = "", to = "", page = "1", limit = "15" } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (status) {
    // Comma-separated list ("pending,approved") is supported so the
    // cashier's disbursement queue can ask for both with one call.
    const arr = String(status).split(",").map((s) => s.trim()).filter(Boolean);
    filter.status = arr.length === 1 ? arr[0] : { $in: arr };
  }
  const dr = dateRange(from, to);
  if (dr) filter.date = dr;
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ category: rx }, { description: rx }, { payee: rx }, { reference: rx }, { disbursementOr: rx }];
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const [items, total] = await Promise.all([
    Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Expense.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, limit: lim });
});

// Summary: total + breakdown by category (optionally within a date range)
router.get("/summary", readGuard, async (req, res) => {
  const { from = "", to = "" } = req.query;
  const match = {};
  const dr = dateRange(from, to);
  if (dr) match.date = dr;

  const [totals] = await Expense.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const byCategory = await Expense.aggregate([
    { $match: match },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  res.json({
    total: totals?.total || 0,
    count: totals?.count || 0,
    byCategory: byCategory.map((c) => ({ category: c._id || "Uncategorized", total: c.total, count: c.count })),
  });
});

router.post("/", guard, async (req, res) => {
  const { date, category, description, payee, amount, reference, paymentMethod, notes, asRequest } = req.body;
  if (!category || !String(category).trim()) return res.status(400).json({ message: "Category is required." });
  if (!(Number(amount) >= 0)) return res.status(400).json({ message: "A valid amount is required." });
  const userName = req.user?.fullName || req.user?.employeeId || "";
  // asRequest=true → file a disbursement REQUEST for the cashier to pay.
  // asRequest=false (default) → admin records a past-tense expense
  // directly (legacy behavior; immediately disbursed).
  const useRequestFlow = !!asRequest;
  const exp = await Expense.create({
    date: date ? new Date(date) : new Date(),
    category: String(category).trim(),
    description: description || "",
    payee: payee || "",
    amount: Number(amount),
    reference: reference || "",
    paymentMethod: paymentMethod || "cash",
    notes: notes || "",
    recordedBy: userName,
    status: useRequestFlow ? "pending" : "disbursed",
    requestedBy: useRequestFlow ? userName : "",
    // For direct-entry (legacy) rows the admin IS the disburser of
    // record, so the timestamps + name are filled inline.
    disbursedBy: useRequestFlow ? "" : userName,
    disbursedAt: useRequestFlow ? null : new Date(),
  });
  res.status(201).json(exp);
});

// Admin approve — a pending request becomes approved; cashier will see
// it in the disbursement queue.
router.post("/:id/approve", guard, async (req, res) => {
  const exp = await Expense.findById(req.params.id);
  if (!exp) return res.status(404).json({ message: "Expense not found." });
  if (exp.status !== "pending") {
    return res.status(409).json({ message: `Expense is ${exp.status}, can't approve.` });
  }
  exp.status = "approved";
  exp.approvedBy = req.user?.fullName || req.user?.employeeId || "";
  exp.approvedAt = new Date();
  await exp.save();
  res.json(exp);
});

// Admin reject — a pending request is declined.
router.post("/:id/reject", guard, async (req, res) => {
  const exp = await Expense.findById(req.params.id);
  if (!exp) return res.status(404).json({ message: "Expense not found." });
  if (exp.status !== "pending" && exp.status !== "approved") {
    return res.status(409).json({ message: `Expense is ${exp.status}, can't reject.` });
  }
  exp.status = "rejected";
  exp.rejectedBy = req.user?.fullName || req.user?.employeeId || "";
  exp.rejectedAt = new Date();
  exp.rejectionReason = String(req.body?.reason || "").trim();
  await exp.save();
  res.json(exp);
});

// Cashier disburse — records the OR / DV number and flips the row to
// disbursed. Only approved rows can be disbursed (no double-spend).
// Lives on this route so cashier + admin both hit the same endpoint;
// the route guard widens to include cashier.
router.post("/:id/disburse", requireAuth, requireRole(["admin", "manager", "cashier"]), async (req, res) => {
  const { disbursementOr, paymentMethod, notes } = req.body || {};
  if (!disbursementOr || !String(disbursementOr).trim()) {
    return res.status(400).json({ message: "OR / DV number is required." });
  }
  const exp = await Expense.findById(req.params.id);
  if (!exp) return res.status(404).json({ message: "Expense not found." });
  if (exp.status !== "approved") {
    return res.status(409).json({ message: `Expense is ${exp.status}, can't disburse.` });
  }
  const who = req.user?.fullName || req.user?.employeeId || "";
  const method = paymentMethod || exp.paymentMethod || "cash";
  const amount = Math.round((Number(exp.amount) + Number.EPSILON) * 100) / 100;

  // Bank or cheque: money leaves a registered coop bank account, not
  // the drawer. Conditional $inc refuses to overdraw; the treasury
  // ledger records the outflow with the DV number as the reference.
  if (method === "bank" || method === "check") {
    const acct = await BankAccount.findOneAndUpdate(
      { _id: req.body?.bankAccountId, status: "active", balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );
    if (!acct) {
      return res.status(400).json({ message: "Pick a bank account with sufficient balance for this disbursement." });
    }
    exp.bankAccountId = acct._id;
    exp.disbursedBank = `${acct.bankName} ····${String(acct.accountNumber).slice(-4)}`;
    await TreasuryTransaction.create({
      target: "bank", bankAccountId: acct._id, type: "out", amount,
      balanceAfter: Math.round((Number(acct.balance) + Number.EPSILON) * 100) / 100,
      refNo: String(disbursementOr).trim(), by: who,
      note: `Expense disbursement (${method}) — ${exp.category}: ${exp.payee || exp.description || ""}`,
    });
  }
  // Cash leaves the drawer — that subtraction happens via the daily
  // summary (disbursed cash expenses), checked by the cashier UI.

  exp.status = "disbursed";
  exp.disbursedBy = who;
  exp.disbursedAt = new Date();
  exp.disbursementOr = String(disbursementOr).trim();
  exp.paymentMethod = method;
  if (notes) exp.notes = String(notes).trim();
  await exp.save();
  res.json(exp);
});

router.put("/:id", guard, async (req, res) => {
  const allow = ["date", "category", "description", "payee", "amount", "reference", "paymentMethod", "notes"];
  const update = {};
  for (const k of allow) if (k in req.body) update[k] = req.body[k];
  if ("amount" in update && !(Number(update.amount) >= 0)) return res.status(400).json({ message: "Invalid amount." });
  if ("date" in update && update.date) update.date = new Date(update.date);
  const exp = await Expense.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!exp) return res.status(404).json({ message: "Expense not found." });
  res.json(exp);
});

router.delete("/:id", guard, async (req, res) => {
  const exp = await Expense.findByIdAndDelete(req.params.id);
  if (!exp) return res.status(404).json({ message: "Expense not found." });
  res.json({ ok: true });
});

export default router;
