import express from "express";
import crypto from "crypto";
import { ProductLoanCatalog } from "../../models/ProductLoan.js";
import ProductReservation from "../../models/ProductReservation.js";
import WaterMember from "../../models/WaterMember.js";
import SavingsAccount from "../../models/SavingsAccount.js";
import StoreSettings from "../../models/StoreSettings.js";

const router = express.Router();

const NO_SHOW_LIMIT = 2;        // 2 no-shows...
const BAN_MONTHS = 3;           // ...blocks reservations for 3 months.
const HOLD_DAYS = 2;            // reservation hold window.
const MAX_ACTIVE = 2;           // max open (unclaimed) reservations per account.
const MAX_QTY = 50;             // max units per line item.

// How many no-shows the member has inside the ban window, and whether blocked.
async function noShowStatus(pnNo) {
  const since = new Date(Date.now() - BAN_MONTHS * 30 * 24 * 60 * 60 * 1000);
  const count = await ProductReservation.countDocuments({ pnNo, status: "no_show", updatedAt: { $gte: since } });
  return { count, blocked: count >= NO_SHOW_LIMIT };
}

// Public store catalog — active products with image / price / stock for the
// public Products page. Stock 0 is still returned (shown "Not available" /
// greyed) so members can see the full range. Mounted under /api/public so the
// strict public rate limit applies.
router.get("/", async (req, res) => {
  try {
    const raw = await ProductLoanCatalog.find({ isActive: true })
      .select("name category unitPrice stock onHold imageBase64 description isRental rentFee")
      .sort({ category: 1, name: 1 })
      .lean();
    // Expose AVAILABLE (stock − onHold) so reserved-but-unpaid units don't
    // show as buyable; hide the raw onHold from the public payload.
    const items = raw.map(({ onHold, ...p }) => ({ ...p, available: Math.max(0, (Number(p.stock) || 0) - (Number(onHold) || 0)) }));
    const s = await StoreSettings.findOne({ key: "store" }).lean();
    res.json({ items, announcement: s?.announcementActive ? s.announcement : "", now: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load products." });
  }
});

// Verify a member account number before reserving — returns the name so the
// store can show "Reserving as <name>", and whether they're temporarily
// blocked for repeated no-shows.
router.post("/verify-account", async (req, res) => {
  try {
    const pnNo = String(req.body?.pnNo || "").trim().toUpperCase();
    if (!pnNo) return res.status(400).json({ message: "Enter your account number." });
    const m = await WaterMember.findOne({ pnNo }).select("pnNo accountName accountStatus").lean();
    if (!m) return res.status(404).json({ ok: false, message: "Account number not found. Please check it or visit the office." });
    const ns = await noShowStatus(pnNo);
    const sav = await SavingsAccount.findOne({ pnNo, status: "active" }).select("balance").lean();
    res.json({
      ok: true, pnNo: m.pnNo, accountName: m.accountName,
      blocked: ns.blocked, noShows: ns.count,
      hasSavings: !!sav, savingsBalance: sav ? sav.balance : 0,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Could not verify account." });
  }
});

// Create a reservation. Validates the member, the no-show ban, and stock
// availability (stock − onHold), then holds the stock atomically.
router.post("/reserve", async (req, res) => {
  try {
    const pnNo = String(req.body?.pnNo || "").trim().toUpperCase();
    const phone = String(req.body?.phone || "").trim();
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const pickupRaw = req.body?.pickupDate;
    const paymentMethod = req.body?.paymentMethod === "savings" ? "savings" : "cash";

    if (!pnNo || !phone) return res.status(400).json({ message: "Account number and phone are required." });
    if (rawItems.length === 0) return res.status(400).json({ message: "Your cart is empty." });

    const member = await WaterMember.findOne({ pnNo }).select("pnNo accountName").lean();
    if (!member) return res.status(404).json({ message: "Account number not found." });

    const ns = await noShowStatus(pnNo);
    if (ns.blocked) {
      return res.status(403).json({ message: "Reservations are temporarily unavailable for this account (2 unclaimed reservations). Please try again after the 3-month period or visit the office." });
    }
    // Cap concurrent open reservations so one account can't tie up stock.
    const activeCount = await ProductReservation.countDocuments({ pnNo, status: { $in: ["reserved", "approved"] } });
    if (activeCount >= MAX_ACTIVE) {
      return res.status(429).json({ message: `You already have ${activeCount} open reservation(s). Please claim or cancel them before reserving again.` });
    }

    // Validate pickup date: a real date, not in the past, not a Sunday, within 4 days.
    let pickupDate = null;
    if (pickupRaw) {
      // Parse "YYYY-MM-DD" as a calendar date so the weekday check is tz-safe.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(pickupRaw));
      const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(pickupRaw);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid pickup date." });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const max = new Date(today); max.setDate(max.getDate() + 4);
      if (d < today) return res.status(400).json({ message: "Pickup date can't be in the past." });
      if (d > max) return res.status(400).json({ message: "Pickup date must be within the next few days." });
      if (d.getDay() === 0) return res.status(400).json({ message: "We're closed on Sundays — pick another day." });
      pickupDate = d;
    }

    // Load products + build validated, server-priced item snapshots.
    const ids = [...new Set(rawItems.map((i) => String(i.productId)))];
    const products = await ProductLoanCatalog.find({ _id: { $in: ids }, isActive: true }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const items = [];
    for (const ri of rawItems) {
      const p = byId.get(String(ri.productId));
      const qty = Math.floor(Number(ri.quantity) || 0);
      if (!p) return res.status(400).json({ message: "One of the items is no longer available." });
      if (qty < 1) return res.status(400).json({ message: `Invalid quantity for ${p.name}.` });
      if (qty > MAX_QTY) return res.status(400).json({ message: `Max ${MAX_QTY} per item — for larger orders, please visit the office.` });
      const avail = (Number(p.stock) || 0) - (Number(p.onHold) || 0);
      if (qty > avail) return res.status(409).json({ message: `Only ${Math.max(0, avail)} left of "${p.name}".` });
      items.push({ productId: p._id, name: p.name, category: p.category, unitPrice: p.unitPrice, quantity: qty, lineTotal: p.unitPrice * qty });
    }
    const total = items.reduce((s, it) => s + it.lineTotal, 0);

    // Pay-with-savings: require an active savings account with enough balance.
    // (Actual debit happens at the cashier after the office approves.)
    if (paymentMethod === "savings") {
      const sav = await SavingsAccount.findOne({ pnNo, status: "active" }).select("balance").lean();
      if (!sav) return res.status(400).json({ message: "No active savings account for this number. Choose 'Pay at cashier' instead." });
      if ((Number(sav.balance) || 0) < total) {
        return res.status(400).json({ message: `Savings balance (₱${Number(sav.balance).toFixed(2)}) is not enough for this order (₱${total.toFixed(2)}).` });
      }
    }

    // Hold stock atomically per item; roll back if any can't be held.
    const held = [];
    for (const it of items) {
      const upd = await ProductLoanCatalog.findOneAndUpdate(
        { _id: it.productId, isActive: true, $expr: { $gte: [{ $subtract: ["$stock", "$onHold"] }, it.quantity] } },
        { $inc: { onHold: it.quantity } }
      );
      if (!upd) {
        for (const h of held) await ProductLoanCatalog.updateOne({ _id: h.productId }, { $inc: { onHold: -h.quantity } });
        return res.status(409).json({ message: `"${it.name}" just sold out. Please adjust your cart.` });
      }
      held.push(it);
    }

    // Unique short code (retry on the rare collision).
    let code, doc;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = "R-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      try {
        doc = await ProductReservation.create({
          code, pnNo, accountName: member.accountName, phone, items, total, paymentMethod,
          holdExpiresAt: new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000),
          pickupDate,
        });
        break;
      } catch (e) { if (e.code !== 11000) throw e; }
    }
    if (!doc) {
      for (const h of held) await ProductLoanCatalog.updateOne({ _id: h.productId }, { $inc: { onHold: -h.quantity } });
      return res.status(500).json({ message: "Could not create the reservation. Please try again." });
    }

    res.status(201).json({
      ok: true,
      code: doc.code,
      accountName: doc.accountName,
      total: doc.total,
      paymentMethod: doc.paymentMethod,
      holdExpiresAt: doc.holdExpiresAt,
      message: `Reservation ${doc.code} received! Our office will verify and call ${phone} to confirm. Once approved, ${paymentMethod === "savings" ? "we'll deduct it from your savings at the cashier" : "pay at the cashier"}. We hold your items for ${HOLD_DAYS} days.`,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Could not create the reservation." });
  }
});

export default router;
