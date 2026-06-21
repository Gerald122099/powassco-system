// Staff-side product reservations (from the public store).
// Flow: reserved → (office) approved → (cashier) paid → (office) picked_up.
// Office (manager / water officer) verifies + approves BEFORE the cashier can
// collect. Paying deducts stock, logs a product sale, and — for pay-with-
// savings — debits the SavingsAccount + writes a SavingsTransaction.
import express from "express";
import ProductReservation from "../models/ProductReservation.js";
import { ProductLoanCatalog, ProductLoanApplication } from "../models/ProductLoan.js";
import SavingsAccount from "../models/SavingsAccount.js";
import SavingsTransaction from "../models/SavingsTransaction.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const office = [requireAuth, requireRole(["admin", "manager", "water_bill_officer"])];
const pay = [requireAuth, requireRole(["admin", "cashier"])];
const read = [requireAuth, requireRole(["admin", "manager", "water_bill_officer", "cashier", "bookkeeper"])];

const actor = (req) => req.user?.fullName || req.user?.employeeId || "";
const releaseHold = (items) => Promise.all(items.map((it) =>
  ProductLoanCatalog.updateOne({ _id: it.productId }, { $inc: { onHold: -it.quantity } })));

// List reservations (filter by status / search). Newest first.
router.get("/", read, async (req, res) => {
  try {
    const { status = "", q = "", limit = "100" } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [{ code: rx }, { pnNo: rx }, { accountName: rx }, { phone: rx }];
    }
    const lim = Math.min(300, Math.max(1, parseInt(limit, 10) || 100));
    const [items, counts] = await Promise.all([
      ProductReservation.find(filter).sort({ createdAt: -1 }).limit(lim).lean(),
      ProductReservation.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    res.json({ items, byStatus });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Office: approve a reservation (after verifying the member by phone).
router.post("/:id/approve", office, async (req, res) => {
  try {
    const r = await ProductReservation.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Reservation not found." });
    if (r.status !== "reserved") return res.status(400).json({ message: `Only pending reservations can be approved (this one is ${r.status}).` });
    r.status = "approved"; r.approvedBy = actor(req); r.approvedAt = new Date();
    await r.save();
    res.json({ ok: true, reservation: r.toObject() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Office (or admin): cancel a not-yet-paid reservation — releases the hold.
router.post("/:id/cancel", office, async (req, res) => {
  try {
    const r = await ProductReservation.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Reservation not found." });
    if (!["reserved", "approved"].includes(r.status)) return res.status(400).json({ message: `Cannot cancel a ${r.status} reservation.` });
    await releaseHold(r.items);
    r.status = "cancelled"; r.handledBy = actor(req); r.notes = String(req.body?.notes || r.notes || "");
    await r.save();
    res.json({ ok: true, reservation: r.toObject() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Cashier: collect payment. Must be APPROVED first. Deducts stock, logs the
// sale, and debits savings if paymentMethod === "savings".
router.post("/:id/pay", pay, async (req, res) => {
  try {
    const orNo = String(req.body?.orNo || "").trim().toUpperCase();
    if (!orNo) return res.status(400).json({ message: "OR number is required." });
    const r = await ProductReservation.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Reservation not found." });
    if (r.status === "paid" || r.status === "picked_up") return res.status(409).json({ message: "This reservation is already paid." });
    if (r.status !== "approved") return res.status(400).json({ message: "The office must approve this reservation before payment." });

    // Pay-with-savings: race-safe debit + ledger entry (rolled back if the
    // OR collides). Cash payments just record the OR.
    if (r.paymentMethod === "savings") {
      const account = await SavingsAccount.findOne({ pnNo: r.pnNo });
      if (!account || account.status === "closed") return res.status(400).json({ message: "No active savings account for this member." });
      if (Number(account.balance) < r.total) return res.status(400).json({ message: `Insufficient savings (₱${account.balance.toLocaleString()} on file).` });
      const updated = await SavingsAccount.findOneAndUpdate(
        { _id: account._id, balance: { $gte: r.total } },
        { $inc: { balance: -r.total } },
        { new: true }
      );
      if (!updated) return res.status(409).json({ message: "Savings balance changed — retry." });
      try {
        await SavingsTransaction.create({
          pnNo: r.pnNo, type: "withdrawal", amount: r.total, orNo, method: "other",
          balanceAfter: updated.balance, receivedBy: actor(req), note: `Product reservation ${r.code}`,
        });
      } catch (e) {
        await SavingsAccount.updateOne({ _id: account._id }, { $inc: { balance: r.total } }); // rollback
        if (e.code === 11000) return res.status(409).json({ message: `OR ${orNo} already used.` });
        throw e;
      }
    }

    // Deduct stock (release hold + reduce stock) and log a product sale per
    // item so it flows into product analytics / reports.
    const cats = await ProductLoanCatalog.find({ _id: { $in: r.items.map((i) => i.productId) } }).select("capital").lean();
    const capById = new Map(cats.map((c) => [String(c._id), Number(c.capital) || 0]));
    for (const it of r.items) {
      await ProductLoanCatalog.updateOne({ _id: it.productId }, { $inc: { stock: -it.quantity, onHold: -it.quantity } });
      const unitCapital = capById.get(String(it.productId)) || 0;
      await ProductLoanApplication.create({
        pnNo: r.pnNo, accountName: r.accountName, transactionType: "sale",
        productId: it.productId, productName: it.name, productCategory: it.category,
        quantity: it.quantity, unitPrice: it.unitPrice, totalPrice: it.lineTotal,
        unitCapital, totalCapital: unitCapital * it.quantity, profitRecorded: it.lineTotal - unitCapital * it.quantity,
        status: "fully_paid", totalPaid: it.lineTotal, balance: 0,
        payments: [{ orNo, amount: it.lineTotal, method: r.paymentMethod === "savings" ? "other" : "cash", receivedBy: actor(req), note: `Reservation ${r.code}${r.paymentMethod === "savings" ? " (savings)" : ""}` }],
        releasedAt: new Date(), releasedBy: actor(req),
      });
    }

    r.status = "paid"; r.orNo = orNo; r.paidAt = new Date(); r.handledBy = actor(req);
    await r.save();
    res.json({ ok: true, reservation: r.toObject() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Office: mark a paid reservation as picked up.
router.post("/:id/pickup", office, async (req, res) => {
  try {
    const r = await ProductReservation.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Reservation not found." });
    if (r.status !== "paid") return res.status(400).json({ message: "Only paid reservations can be marked picked up." });
    r.status = "picked_up"; r.pickedUpAt = new Date(); r.handledBy = actor(req);
    await r.save();
    res.json({ ok: true, reservation: r.toObject() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;
