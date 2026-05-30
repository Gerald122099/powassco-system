// Bookkeeper — read-only audit of every cashier transaction + CBU ledger
// per account + product-loan catalogue + analytics.
//
//   GET  /api/bookkeeper/transactions?module=all|water|loan&from=&to=&q=
//   GET  /api/bookkeeper/members-cbu?q=
//   GET  /api/bookkeeper/analytics?from=&to=
//
//   GET  /api/bookkeeper/product-catalog
//   POST /api/bookkeeper/product-catalog
//   PUT  /api/bookkeeper/product-catalog/:id
//   DELETE /api/bookkeeper/product-catalog/:id
//
//   GET  /api/bookkeeper/product-applications
//   POST /api/bookkeeper/product-applications              — bookkeeper grants/approves
//   POST /api/bookkeeper/product-applications/:id/release  — debit CBU + decrement stock

import express from "express";
import WaterPayment from "../models/WaterPayment.js";
import LoanPayment from "../models/LoanPayment.js";
import WaterMember from "../models/WaterMember.js";
import CbuTransaction from "../models/CbuTransaction.js";
import { ProductLoanCatalog, ProductLoanApplication } from "../models/ProductLoan.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "bookkeeper"])];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function dateRange(fromStr, toStr) {
  const range = {};
  if (fromStr) range.$gte = new Date(fromStr + "T00:00:00");
  if (toStr) range.$lte = new Date(toStr + "T23:59:59.999");
  return Object.keys(range).length ? range : null;
}

// ----- Transactions feed (cashier postings) -----
router.get("/transactions", ...guard, async (req, res) => {
  try {
    const moduleParam = String(req.query.module || "all").toLowerCase();
    const q = String(req.query.q || "").trim();
    const rangePaidAt = dateRange(req.query.from, req.query.to);

    const baseMatch = {};
    if (rangePaidAt) baseMatch.paidAt = rangePaidAt;

    const orMatch = q
      ? [
          { orNo: { $regex: q, $options: "i" } },
          { pnNo: { $regex: q, $options: "i" } },
          { meterNumber: { $regex: q, $options: "i" } },
          { loanId: { $regex: q, $options: "i" } },
          { borrowerPnNo: { $regex: q, $options: "i" } },
        ]
      : null;

    const wantWater = moduleParam === "all" || moduleParam === "water";
    const wantLoan = moduleParam === "all" || moduleParam === "loan";

    const [waterDocs, loanDocs] = await Promise.all([
      wantWater
        ? WaterPayment.find(orMatch ? { ...baseMatch, $or: orMatch } : baseMatch).sort({ paidAt: -1 }).limit(500).lean()
        : Promise.resolve([]),
      wantLoan
        ? LoanPayment.find(orMatch ? { ...baseMatch, $or: orMatch } : baseMatch).sort({ paidAt: -1 }).limit(500).lean()
        : Promise.resolve([]),
    ]);

    // Attach account names (water docs already carry pnNo; loan docs use borrowerPnNo)
    const pnSet = new Set();
    waterDocs.forEach((d) => pnSet.add(d.pnNo));
    loanDocs.forEach((d) => pnSet.add(d.borrowerPnNo));
    const members = await WaterMember.find({ pnNo: { $in: [...pnSet] } }).select("pnNo accountName").lean();
    const nameByPn = new Map(members.map((m) => [m.pnNo, m.accountName]));

    const water = waterDocs.map((d) => ({
      _id: d._id, module: "water", orNo: d.orNo, paidAt: d.paidAt, method: d.method,
      pnNo: d.pnNo, accountName: nameByPn.get(d.pnNo) || "",
      meterNumber: d.meterNumber, periodKey: d.periodKey,
      amountDue: d.amountPaid, amountReceived: d.amountReceived || d.amountPaid, cbuExcess: d.cbuExcess || 0,
      receivedBy: d.receivedBy || "",
    }));
    const loan = loanDocs.map((d) => ({
      _id: d._id, module: "loan", orNo: d.orNo, paidAt: d.paidAt, method: d.method,
      pnNo: d.borrowerPnNo, accountName: nameByPn.get(d.borrowerPnNo) || "",
      loanId: d.loanId, periodsCovered: d.periodsCovered || 1,
      amountDue: d.amountPaid, amountReceived: d.amountReceived || d.amountPaid, cbuExcess: d.cbuExcess || 0,
      receivedBy: d.receivedBy || "",
    }));

    const totals = {
      water: {
        count: water.length,
        amountReceived: round2(water.reduce((s, x) => s + (x.amountReceived || 0), 0)),
        amountDue: round2(water.reduce((s, x) => s + (x.amountDue || 0), 0)),
        cbuExcess: round2(water.reduce((s, x) => s + (x.cbuExcess || 0), 0)),
      },
      loan: {
        count: loan.length,
        amountReceived: round2(loan.reduce((s, x) => s + (x.amountReceived || 0), 0)),
        amountDue: round2(loan.reduce((s, x) => s + (x.amountDue || 0), 0)),
        cbuExcess: round2(loan.reduce((s, x) => s + (x.cbuExcess || 0), 0)),
      },
    };
    totals.grand = {
      count: totals.water.count + totals.loan.count,
      amountReceived: round2(totals.water.amountReceived + totals.loan.amountReceived),
      amountDue: round2(totals.water.amountDue + totals.loan.amountDue),
      cbuExcess: round2(totals.water.cbuExcess + totals.loan.cbuExcess),
    };

    res.json({ water, loan, totals });
  } catch (e) {
    console.error("bookkeeper/transactions:", e);
    res.status(500).json({ message: "Failed to load transactions." });
  }
});

// ----- Per-member CBU balances + history -----
router.get("/members-cbu", ...guard, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = q
      ? { $or: [
          { pnNo: { $regex: q, $options: "i" } },
          { accountName: { $regex: q, $options: "i" } },
        ] }
      : {};
    const members = await WaterMember.find(filter)
      .select("pnNo accountName cbuBalance accountStatus")
      .sort({ cbuBalance: -1, accountName: 1 })
      .limit(500)
      .lean();

    const total = round2(members.reduce((s, m) => s + Number(m.cbuBalance || 0), 0));
    res.json({ members, total, count: members.length });
  } catch (e) {
    res.status(500).json({ message: "Failed to load CBU." });
  }
});

// Per-member CBU history (last N ledger entries).
router.get("/members-cbu/:pnNo", ...guard, async (req, res) => {
  try {
    const pnNo = String(req.params.pnNo || "").toUpperCase().trim();
    const member = await WaterMember.findOne({ pnNo }).select("pnNo accountName cbuBalance accountStatus").lean();
    if (!member) return res.status(404).json({ message: "Member not found." });
    const ledger = await CbuTransaction.find({ pnNo }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ member, ledger });
  } catch (e) {
    res.status(500).json({ message: "Failed to load CBU history." });
  }
});

// ----- Analytics summary -----
router.get("/analytics", ...guard, async (req, res) => {
  try {
    const rangePaidAt = dateRange(req.query.from, req.query.to);
    const match = rangePaidAt ? { paidAt: rangePaidAt } : {};

    const [waterAgg, loanAgg, cbuTotal] = await Promise.all([
      WaterPayment.aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, due: { $sum: "$amountPaid" }, received: { $sum: "$amountReceived" }, cbu: { $sum: "$cbuExcess" } } },
      ]),
      LoanPayment.aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, due: { $sum: "$amountPaid" }, received: { $sum: "$amountReceived" }, cbu: { $sum: "$cbuExcess" } } },
      ]),
      WaterMember.aggregate([
        { $group: { _id: null, total: { $sum: "$cbuBalance" } } },
      ]),
    ]);

    const w = waterAgg[0] || { count: 0, due: 0, received: 0, cbu: 0 };
    const l = loanAgg[0] || { count: 0, due: 0, received: 0, cbu: 0 };
    res.json({
      water: { count: w.count, amountDue: round2(w.due), amountReceived: round2(w.received), cbu: round2(w.cbu) },
      loan: { count: l.count, amountDue: round2(l.due), amountReceived: round2(l.received), cbu: round2(l.cbu) },
      grand: {
        count: w.count + l.count,
        amountDue: round2(w.due + l.due),
        amountReceived: round2(w.received + l.received),
        cbu: round2(w.cbu + l.cbu),
      },
      cbuOutstanding: round2((cbuTotal[0]?.total) || 0),
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to load analytics." });
  }
});

// ----- Product loan catalogue -----
router.get("/product-catalog", ...guard, async (req, res) => {
  const items = await ProductLoanCatalog.find().sort({ isActive: -1, name: 1 }).lean();
  res.json(items);
});

router.post("/product-catalog", ...guard, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !(Number(b.unitPrice) > 0)) return res.status(400).json({ message: "name and unitPrice are required." });
    const doc = await ProductLoanCatalog.create({
      name: String(b.name).trim(),
      category: String(b.category || "").trim(),
      unitPrice: round2(b.unitPrice),
      stock: Number(b.stock) || 0,
      description: String(b.description || ""),
      imageBase64: String(b.imageBase64 || ""),
      minCbuRequired: Number(b.minCbuRequired) || 0,
      isActive: b.isActive !== false,
      createdBy: req.user?.fullName || req.user?.employeeId || "",
    });
    res.status(201).json(doc);
  } catch (e) { res.status(500).json({ message: e.message || "Failed to create product." }); }
});

router.put("/product-catalog/:id", ...guard, async (req, res) => {
  const allow = ["name", "category", "unitPrice", "stock", "description", "imageBase64", "minCbuRequired", "isActive"];
  const patch = {};
  for (const k of allow) if (k in req.body) patch[k] = req.body[k];
  const doc = await ProductLoanCatalog.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!doc) return res.status(404).json({ message: "Product not found." });
  res.json(doc);
});

router.delete("/product-catalog/:id", ...guard, async (req, res) => {
  await ProductLoanCatalog.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ----- Product loan applications -----
router.get("/product-applications", ...guard, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const filter = status ? { status } : {};
  const apps = await ProductLoanApplication.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  res.json(apps);
});

router.post("/product-applications", ...guard, async (req, res) => {
  try {
    const b = req.body || {};
    const pnNo = String(b.pnNo || "").toUpperCase().trim();
    const productId = String(b.productId || "");
    const quantity = Math.max(1, Number(b.quantity) || 1);

    const member = await WaterMember.findOne({ pnNo });
    if (!member) return res.status(404).json({ message: "Member not found." });
    const product = await ProductLoanCatalog.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found." });
    if (!product.isActive) return res.status(400).json({ message: "Product is inactive." });
    if (product.stock > 0 && quantity > product.stock) return res.status(400).json({ message: "Insufficient stock." });

    const totalPrice = round2(product.unitPrice * quantity);
    if (totalPrice < Number(product.minCbuRequired || 0) && Number(member.cbuBalance || 0) < Number(product.minCbuRequired || 0)) {
      return res.status(400).json({ message: `Member's CBU (₱${member.cbuBalance}) is below required ₱${product.minCbuRequired}.` });
    }

    const doc = await ProductLoanApplication.create({
      pnNo: member.pnNo, accountName: member.accountName,
      productId: product._id, productName: product.name, productCategory: product.category,
      quantity, unitPrice: product.unitPrice, totalPrice, balance: totalPrice,
      status: "approved",
      approvedAt: new Date(), approvedBy: req.user?.fullName || req.user?.employeeId || "",
      remarks: String(b.remarks || ""),
    });
    res.status(201).json(doc);
  } catch (e) { res.status(500).json({ message: e.message || "Failed to create application." }); }
});

// Release a product loan — optionally apply CBU as down/full payment.
router.post("/product-applications/:id/release", ...guard, async (req, res) => {
  try {
    const useCbu = Math.max(0, Number(req.body?.useCbu) || 0);
    const app = await ProductLoanApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Application not found." });
    if (app.status === "released" || app.status === "fully_paid") return res.status(400).json({ message: "Already released." });

    const member = await WaterMember.findOne({ pnNo: app.pnNo });
    if (!member) return res.status(404).json({ message: "Member not found." });

    const cbuApplied = round2(Math.min(useCbu, Number(member.cbuBalance || 0), app.totalPrice));
    if (cbuApplied > 0) {
      member.cbuBalance = round2(Number(member.cbuBalance || 0) - cbuApplied);
      await member.save();
      await CbuTransaction.create({
        pnNo: member.pnNo, accountName: member.accountName,
        type: "debit", amount: cbuApplied, balanceAfter: member.cbuBalance,
        source: "product_loan_charge", productLoanId: app._id,
        note: `Applied to product loan: ${app.productName} × ${app.quantity}`,
        postedBy: req.user?.fullName || req.user?.employeeId || "",
      });
    }

    app.cbuApplied = cbuApplied;
    app.balance = round2(app.totalPrice - cbuApplied);
    app.status = app.balance <= 0 ? "fully_paid" : "released";
    app.releasedAt = new Date();
    app.releasedBy = req.user?.fullName || req.user?.employeeId || "";
    await app.save();

    // Decrement catalogue stock (best-effort).
    if (app.productId) {
      await ProductLoanCatalog.findByIdAndUpdate(app.productId, { $inc: { stock: -app.quantity } });
    }

    res.json({ ok: true, application: app, newCbuBalance: member.cbuBalance });
  } catch (e) { res.status(500).json({ message: e.message || "Release failed." }); }
});

export default router;
