import express from "express";
import Expense, { EXPENSE_CATEGORIES } from "../../models/Expense.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];

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
router.get("/categories", guard, (req, res) => {
  res.json(EXPENSE_CATEGORIES);
});

// List with filters: q, category, from, to, page, limit
router.get("/", guard, async (req, res) => {
  const { q = "", category = "", from = "", to = "", page = "1", limit = "15" } = req.query;
  const filter = {};
  if (category) filter.category = category;
  const dr = dateRange(from, to);
  if (dr) filter.date = dr;
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ category: rx }, { description: rx }, { payee: rx }, { reference: rx }];
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
router.get("/summary", guard, async (req, res) => {
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
  const { date, category, description, payee, amount, reference, paymentMethod, notes } = req.body;
  if (!category || !String(category).trim()) return res.status(400).json({ message: "Category is required." });
  if (!(Number(amount) >= 0)) return res.status(400).json({ message: "A valid amount is required." });
  const exp = await Expense.create({
    date: date ? new Date(date) : new Date(),
    category: String(category).trim(),
    description: description || "",
    payee: payee || "",
    amount: Number(amount),
    reference: reference || "",
    paymentMethod: paymentMethod || "cash",
    notes: notes || "",
    recordedBy: req.user?.fullName || req.user?.employeeId || "",
  });
  res.status(201).json(exp);
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
