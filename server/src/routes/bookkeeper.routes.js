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
import WaterBill from "../models/WaterBill.js";
import WaterSettings from "../models/WaterSettings.js";
import LoanApplication from "../models/LoanApplication.js";
import CbuTransaction from "../models/CbuTransaction.js";
import { ProductLoanCatalog, ProductLoanApplication } from "../models/ProductLoan.js";
import LoanSettings from "../models/LoanSettings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "bookkeeper"])];
// Cashier shares product transaction posting (sales, loan payments,
// rental returns) — they're at the counter when those happen. The
// read-only audit endpoints + catalog mutations stay bookkeeper-only.
const cashierGuard = [requireAuth, requireRole(["admin", "bookkeeper", "cashier"])];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function dateRange(fromStr, toStr) {
  const range = {};
  if (fromStr) range.$gte = new Date(fromStr + "T00:00:00");
  if (toStr) range.$lte = new Date(toStr + "T23:59:59.999");
  return Object.keys(range).length ? range : null;
}

// ----- Transactions feed (cashier postings) -----
// Cashier also reads this — they need to look up past ORs at the
// counter ("did we already post this?", "show me yesterday's loan
// payments by member X"). Read-only access.
router.get("/transactions", requireAuth, requireRole(["admin", "bookkeeper", "cashier"]), async (req, res) => {
  try {
    const moduleParam = String(req.query.module || "all").toLowerCase();
    const q = String(req.query.q || "").trim();
    const rangePaidAt = dateRange(req.query.from, req.query.to);

    const baseMatch = {};
    if (rangePaidAt) baseMatch.paidAt = rangePaidAt;

    // Name search: WaterPayment / LoanPayment don't store accountName,
    // so a free-text "Cudis Cinderila" wouldn't match either doc. We
    // first map the query to the set of matching pnNos via WaterMember
    // and OR that into the match.
    const pnFromName = q
      ? (await WaterMember.find({ accountName: { $regex: q, $options: "i" } })
          .select("pnNo")
          .limit(100)
          .lean()).map((m) => m.pnNo)
      : [];

    const orMatch = q
      ? [
          { orNo: { $regex: q, $options: "i" } },
          { pnNo: { $regex: q, $options: "i" } },
          { meterNumber: { $regex: q, $options: "i" } },
          { loanId: { $regex: q, $options: "i" } },
          { borrowerPnNo: { $regex: q, $options: "i" } },
          ...(pnFromName.length ? [{ pnNo: { $in: pnFromName } }, { borrowerPnNo: { $in: pnFromName } }] : []),
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

// ----- Per-member balances (CBU + AR Water + AR Loan + AR Product) -----
// Unified view the bookkeeper opens to see every receivable on an
// account in one row. Each AR column is computed server-side so the
// client doesn't have to fan out per-member.
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
      .sort({ accountName: 1 })
      .limit(500)
      .lean();

    const pnNos = members.map((m) => m.pnNo);

    // AR Water — split into 3 columns matching the paper Cash
    // Disbursement sheet:
    //   • AR Water (base): just bill.amount (water charge only)
    //   • Fines: per-day penalty (₱10/day default) accumulated post-due
    //   • Reconnection Fee: one-shot ₱200 after grace runs out
    // Together they add to bill.totalDue. We pull the reconnection
    // amount from WaterSettings so the split tracks any admin change.
    const waterSettings = await WaterSettings.findOne().lean();
    const reconnectFee = Number(waterSettings?.penaltyAfterGraceAmount ?? 200);

    const waterArAgg = pnNos.length
      ? await WaterBill.aggregate([
          { $match: { pnNo: { $in: pnNos }, status: { $in: ["unpaid", "overdue", "partial"] } } },
          { $project: {
              pnNo: 1,
              amount: 1,
              penaltyApplied: 1,
              subjectForDisconnection: 1,
              reconnectPortion: {
                $cond: [{ $eq: ["$subjectForDisconnection", true] }, reconnectFee, 0],
              },
              finesPortion: {
                $max: [
                  0,
                  { $subtract: [
                      "$penaltyApplied",
                      { $cond: [{ $eq: ["$subjectForDisconnection", true] }, reconnectFee, 0] },
                    ] },
                ],
              },
            } },
          { $group: {
              _id: "$pnNo",
              arWaterBase: { $sum: "$amount" },
              arFines: { $sum: "$finesPortion" },
              arReconnect: { $sum: "$reconnectPortion" },
              billCount: { $sum: 1 },
              disconnectCount: { $sum: { $cond: ["$subjectForDisconnection", 1, 0] } },
            } },
        ])
      : [];
    const waterAr = new Map(waterArAgg.map((x) => [x._id, x]));

    // AR Loan — sum of outstanding balance on every active regular loan
    // grouped by borrowerPnNo. "released" is the only status that means
    // money is actually owed (applied/approved haven't been disbursed).
    const loanArAgg = pnNos.length
      ? await LoanApplication.aggregate([
          { $match: { borrowerPnNo: { $in: pnNos }, status: "released" } },
          { $group: { _id: "$borrowerPnNo", arLoan: { $sum: "$balance" }, loanCount: { $sum: 1 } } },
        ])
      : [];
    const loanAr = new Map(loanArAgg.map((x) => [x._id, x]));

    // AR Product Loan — split into:
    //   • TNPL: product loans where category="materials" (the paper
    //     Cash Disbursement sheet's "AR TNPL" column).
    //   • Other: every other product-loan category (frozen_goods,
    //     rice, rental, appliance, construction, other).
    // Sales paid in full carry no balance so they roll up to 0.
    const productArAgg = pnNos.length
      ? await ProductLoanApplication.aggregate([
          { $match: {
              borrowerPnNo: { $in: pnNos },
              status: { $in: ["active", "released", "approved", "overdue"] },
              transactionType: { $in: ["loan", "rental"] },
            } },
          { $group: {
              _id: { pn: "$borrowerPnNo", isMaterials: { $eq: ["$category", "materials"] } },
              ar: { $sum: "$balance" },
              count: { $sum: 1 },
            } },
        ])
      : [];
    const tnplAr = new Map();      // materials only
    const otherProductAr = new Map(); // everything else
    for (const row of productArAgg) {
      const bucket = row._id.isMaterials ? tnplAr : otherProductAr;
      bucket.set(row._id.pn, { ar: row.ar, count: row.count });
    }

    const enriched = members.map((m) => {
      const w = waterAr.get(m.pnNo);
      const l = loanAr.get(m.pnNo);
      const t = tnplAr.get(m.pnNo);
      const o = otherProductAr.get(m.pnNo);
      const arWaterBase = round2(w?.arWaterBase || 0);
      const arFines = round2(w?.arFines || 0);
      const arReconnect = round2(w?.arReconnect || 0);
      const arWater = round2(arWaterBase + arFines + arReconnect); // legacy alias = totalDue sum
      const arLoan = round2(l?.arLoan || 0);
      const arTnpl = round2(t?.ar || 0);
      const arProduct = round2(o?.ar || 0);
      return {
        ...m,
        arWaterBase,
        arFines,
        arReconnect,
        arWater,
        arWaterCount: w?.billCount || 0,
        disconnectCount: w?.disconnectCount || 0,
        arLoan,
        arLoanCount: l?.loanCount || 0,
        arTnpl,
        arTnplCount: t?.count || 0,
        arProduct,
        arProductCount: o?.count || 0,
        totalReceivable: round2(arWater + arLoan + arTnpl + arProduct),
      };
    });

    const total = round2(enriched.reduce((s, m) => s + Number(m.cbuBalance || 0), 0));
    const totals = {
      cbu: total,
      arWaterBase: round2(enriched.reduce((s, m) => s + m.arWaterBase, 0)),
      arFines: round2(enriched.reduce((s, m) => s + m.arFines, 0)),
      arReconnect: round2(enriched.reduce((s, m) => s + m.arReconnect, 0)),
      arWater: round2(enriched.reduce((s, m) => s + m.arWater, 0)),
      arLoan: round2(enriched.reduce((s, m) => s + m.arLoan, 0)),
      arTnpl: round2(enriched.reduce((s, m) => s + m.arTnpl, 0)),
      arProduct: round2(enriched.reduce((s, m) => s + m.arProduct, 0)),
    };
    totals.totalReceivable = round2(totals.arWater + totals.arLoan + totals.arTnpl + totals.arProduct);

    res.json({ members: enriched, total, totals, count: enriched.length });
  } catch (e) {
    res.status(500).json({ message: "Failed to load member balances." });
  }
});

// Per-member ledger drill-down. Returns CBU history, unpaid water
// bills, outstanding regular loans, and outstanding product loans so
// the bookkeeper can drill into every receivable from one place.
router.get("/members-cbu/:pnNo", ...guard, async (req, res) => {
  try {
    const pnNo = String(req.params.pnNo || "").toUpperCase().trim();
    const member = await WaterMember.findOne({ pnNo }).select("pnNo accountName cbuBalance accountStatus").lean();
    if (!member) return res.status(404).json({ message: "Member not found." });

    const [ledger, waterBills, loans, productLoans] = await Promise.all([
      CbuTransaction.find({ pnNo }).sort({ createdAt: -1 }).limit(200).lean(),
      WaterBill.find({ pnNo, status: { $in: ["unpaid", "overdue", "partial"] } })
        .sort({ periodKey: 1 })
        .select("periodKey meterNumber consumption amount penaltyApplied totalDue subjectForDisconnection daysOverdue status dueDate")
        .lean(),
      LoanApplication.find({ borrowerPnNo: pnNo, status: "released" })
        .sort({ releasedAt: -1 })
        .select("loanId principal balance totalPayment monthlyPayment termMonths releasedAt maturityDate amortizationSchedule")
        .lean(),
      ProductLoanApplication.find({
        borrowerPnNo: pnNo,
        status: { $in: ["active", "released", "approved", "overdue"] },
        transactionType: { $in: ["loan", "rental"] },
      })
        .sort({ createdAt: -1 })
        .select("productName category transactionType principal balance dueDate borrowDate returnDate status")
        .lean(),
    ]);

    res.json({ member, ledger, waterBills, loans, productLoans });
  } catch (e) {
    res.status(500).json({ message: "Failed to load member ledger." });
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
    if (!b.name || !(Number(b.unitPrice) >= 0)) return res.status(400).json({ message: "name and unitPrice are required." });
    const unitPrice = round2(b.unitPrice);
    const capital = Math.max(0, round2(b.capital || 0));
    // Profit defaults to unitPrice − capital when not explicitly
    // sent. Letting the admin override it lets them post a markup
    // that includes handling/storage costs without re-pricing capital.
    const profit = round2("profit" in b ? Number(b.profit) : (unitPrice - capital));
    const allowedCategories = ["frozen_goods", "rice", "materials", "rental", "appliance", "construction", "other"];
    const category = allowedCategories.includes(b.category) ? b.category : "other";
    const isRental = category === "rental" || !!b.isRental;
    const doc = await ProductLoanCatalog.create({
      name: String(b.name).trim(),
      category,
      unitPrice,
      capital,
      profit,
      stock: Number(b.stock) || 0,
      description: String(b.description || ""),
      imageBase64: String(b.imageBase64 || ""),
      minCbuRequired: Number(b.minCbuRequired) || 0,
      isRental,
      rentFee: isRental ? Math.max(0, round2(b.rentFee || 0)) : 0,
      isActive: b.isActive !== false,
      createdBy: req.user?.fullName || req.user?.employeeId || "",
    });
    res.status(201).json(doc);
  } catch (e) { res.status(500).json({ message: e.message || "Failed to create product." }); }
});

router.put("/product-catalog/:id", ...guard, async (req, res) => {
  const allow = ["name", "category", "unitPrice", "capital", "profit", "stock", "description", "imageBase64", "minCbuRequired", "isRental", "rentFee", "isActive"];
  const patch = {};
  for (const k of allow) if (k in req.body) patch[k] = req.body[k];
  // Auto-flip isRental when category becomes "rental" — keeps the
  // two fields in sync regardless of which the form updates.
  if (patch.category === "rental") patch.isRental = true;
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

// Create a product transaction (sale / loan / rental). The shape of
// the request body determines which:
//   transactionType: "sale"   — pnNo OR (customerName + customerContact)
//                               required; balance closes immediately;
//                               a single payment record is appended.
//   transactionType: "loan"   — pnNo required (members only);
//                               termDays comes from LoanSettings.
//                               productTerms[category]; balance >0.
//   transactionType: "rental" — pnNo required; borrowDate +
//                               returnDate required; charges rentFee
//                               upfront; status stays "active" until
//                               POST /:id/return.
router.post("/product-applications", ...cashierGuard, async (req, res) => {
  try {
    const b = req.body || {};
    const transactionType = ["sale", "loan", "rental"].includes(b.transactionType) ? b.transactionType : "loan";
    const productId = String(b.productId || "");
    const quantity = Math.max(1, Number(b.quantity) || 1);

    const product = await ProductLoanCatalog.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found." });
    if (!product.isActive) return res.status(400).json({ message: "Product is inactive." });
    if (product.stock > 0 && quantity > product.stock) {
      return res.status(400).json({ message: "Insufficient stock." });
    }

    // Member resolution. Sales accept either a member or walk-in
    // (customerName + optional customerContact). Loans and rentals
    // require a member (we need an account to bill against).
    const pnNo = String(b.pnNo || "").toUpperCase().trim();
    let member = null;
    if (pnNo) {
      member = await WaterMember.findOne({ pnNo });
      if (!member) return res.status(404).json({ message: `Member ${pnNo} not found.` });
    }
    if (transactionType !== "sale" && !member) {
      return res.status(400).json({ message: "Loans and rentals require a registered member (Account Number)." });
    }
    const customerName = String(b.customerName || "").trim();
    const customerContact = String(b.customerContact || "").trim();
    if (transactionType === "sale" && !member && !customerName) {
      return res.status(400).json({ message: "Walk-in sales need either a member Account Number or a customer name." });
    }

    const unitPrice = round2(product.unitPrice);
    const totalPrice = round2(unitPrice * quantity);
    const unitCapital = round2(product.capital || 0);
    const totalCapital = round2(unitCapital * quantity);
    const profitRecorded = round2(totalPrice - totalCapital);

    if (transactionType === "loan" && member) {
      // CBU eligibility on loans (existing behaviour).
      if (Number(member.cbuBalance || 0) < Number(product.minCbuRequired || 0)) {
        return res.status(400).json({
          message: `Member's CBU (₱${member.cbuBalance}) is below required ₱${product.minCbuRequired}.`,
        });
      }
    }

    // Per-category term lookup for loans and rentals.
    const s = await LoanSettings.findOne();
    const termDays =
      transactionType === "loan" || transactionType === "rental"
        ? Number(s?.productTerms?.[product.category] || 0)
        : 0;

    const now = new Date();
    const dueDate = termDays > 0 ? new Date(now.getTime() + termDays * 86400000) : null;

    // Rental-specific fields. rentFee is charged at borrow time and
    // becomes the only "amount" the member owes upfront unless the
    // operator overrides it (b.rentFee). Late penalty is computed
    // on return.
    const isRental = transactionType === "rental";
    const rentFee = isRental ? Math.max(0, round2(b.rentFee ?? product.rentFee ?? 0)) : 0;
    const borrowDate = isRental ? (b.borrowDate ? new Date(b.borrowDate) : now) : undefined;
    const returnDate = isRental
      ? (b.returnDate ? new Date(b.returnDate) : dueDate)
      : undefined;

    // Initial balance: sale closes immediately; loan = totalPrice;
    // rental = rentFee (penalty accrues on return).
    const initialBalance =
      transactionType === "sale" ? 0
        : transactionType === "rental" ? rentFee
        : totalPrice;

    const doc = await ProductLoanApplication.create({
      pnNo: member?.pnNo || "",
      accountName: member?.accountName || "",
      customerName: member ? "" : customerName,
      customerContact: member ? "" : customerContact,
      transactionType,
      productId: product._id,
      productName: product.name,
      productCategory: product.category,
      quantity,
      unitPrice,
      totalPrice,
      unitCapital,
      totalCapital,
      profitRecorded,
      termDays,
      dueDate,
      rentFee,
      borrowDate,
      returnDate,
      balance: initialBalance,
      // Sale: record the full payment now; status closes immediately.
      totalPaid: transactionType === "sale" ? totalPrice : 0,
      payments:
        transactionType === "sale"
          ? [{
              orNo: String(b.orNo || "").toUpperCase().trim(),
              amount: totalPrice,
              method: b.method || "cash",
              paidAt: now,
              receivedBy: req.user?.fullName || req.user?.employeeId || "",
              note: "Walk-in sale",
            }]
          : [],
      status:
        transactionType === "sale" ? "fully_paid"
          : transactionType === "rental" ? "active"
          : "approved",
      approvedAt: now,
      approvedBy: req.user?.fullName || req.user?.employeeId || "",
      releasedAt: transactionType === "sale" || transactionType === "rental" ? now : null,
      releasedBy:
        transactionType === "sale" || transactionType === "rental"
          ? (req.user?.fullName || req.user?.employeeId || "")
          : "",
      remarks: String(b.remarks || ""),
    });

    // Stock decrement for sales / loans (rentals come back, so no
    // permanent stock loss).
    if (transactionType !== "rental" && product.stock > 0) {
      await ProductLoanCatalog.findByIdAndUpdate(product._id, { $inc: { stock: -quantity } });
    }

    res.status(201).json(doc);
  } catch (e) {
    console.error("product-applications create error:", e);
    res.status(500).json({ message: e.message || "Failed to create transaction." });
  }
});

// Record a payment against a product LOAN. Cashier-accessible so the
// counter can post catch-up payments without going through the
// bookkeeper screen.
router.post("/product-applications/:id/pay", ...cashierGuard, async (req, res) => {
  try {
    const amount = round2(Number(req.body?.amount || 0));
    if (!(amount > 0)) return res.status(400).json({ message: "Amount must be > 0." });
    const app = await ProductLoanApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Transaction not found." });
    if (app.transactionType === "sale") {
      return res.status(400).json({ message: "Sales close at the counter — they don't accept additional payments." });
    }
    if (app.balance <= 0) {
      return res.status(400).json({ message: "No outstanding balance." });
    }
    const applied = Math.min(amount, app.balance);
    app.payments.push({
      orNo: String(req.body?.orNo || "").toUpperCase().trim(),
      amount: applied,
      method: req.body?.method || "cash",
      paidAt: new Date(),
      receivedBy: req.user?.fullName || req.user?.employeeId || "",
      note: String(req.body?.note || ""),
    });
    app.totalPaid = round2((app.totalPaid || 0) + applied);
    app.balance = round2(app.balance - applied);
    if (app.balance <= 0) {
      app.status = app.transactionType === "rental" ? "returned" : "fully_paid";
    }
    await app.save();
    res.json({ ok: true, application: app, applied });
  } catch (e) {
    console.error("product-applications pay error:", e);
    res.status(500).json({ message: e.message || "Payment failed." });
  }
});

// Mark a rental returned. Computes any late-return penalty and adds
// it to the balance; cashier then posts a payment for the full
// (rentFee + penalty − already_paid) amount via /pay.
router.post("/product-applications/:id/return", ...cashierGuard, async (req, res) => {
  try {
    const app = await ProductLoanApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Transaction not found." });
    if (app.transactionType !== "rental") {
      return res.status(400).json({ message: "Only rentals can be returned." });
    }
    if (app.returnedAt) {
      return res.status(400).json({ message: "Already returned." });
    }
    const now = new Date();
    const due = app.returnDate ? new Date(app.returnDate) : null;
    let penalty = 0;
    if (due && now > due) {
      const lateDays = Math.ceil((now - due) / 86400000);
      const s = await LoanSettings.findOne();
      const rate = Number(s?.productTerms?.rentalLatePenaltyPerDay || 0);
      penalty = round2(lateDays * rate);
    }
    app.returnedAt = now;
    app.latePenalty = penalty;
    app.balance = round2(Math.max(0, app.balance + penalty));
    // If still owes money (rentFee not paid yet OR new penalty),
    // status stays "overdue" / "active" so the cashier knows to
    // collect. If everything's paid, mark returned.
    if (app.balance <= 0) {
      app.status = "returned";
    } else {
      app.status = penalty > 0 ? "overdue" : "active";
    }
    await app.save();
    res.json({ ok: true, application: app, lateDays: penalty > 0 ? Math.ceil((now - due) / 86400000) : 0, penalty });
  } catch (e) {
    console.error("product-applications return error:", e);
    res.status(500).json({ message: e.message || "Return failed." });
  }
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
