import express from "express";
import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const viewGuard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader"])];
const adminGuard = [requireAuth, requireRole(["admin"])];
const up = (s) => String(s || "").toUpperCase().trim();

// List meters pending disconnection: unpaid bills past their due date + grace.
// Officers and readers see it as a notification; only admin confirms.
router.get("/", ...viewGuard, async (req, res) => {
  const now = new Date();
  const overdue = await WaterBill.find({
    status: { $in: ["unpaid", "overdue"] },
    dueDate: { $lt: now },
  })
    .select("pnNo accountName meterNumber periodCovered totalDue dueDate")
    .lean();

  const map = new Map();
  for (const b of overdue) {
    const key = `${up(b.pnNo)}|${up(b.meterNumber)}`;
    if (!map.has(key)) {
      map.set(key, {
        pnNo: b.pnNo, accountName: b.accountName, meterNumber: b.meterNumber,
        periods: [], unpaidCount: 0, totalOwed: 0, oldestDue: b.dueDate,
      });
    }
    const g = map.get(key);
    g.periods.push(b.periodCovered);
    g.unpaidCount += 1;
    g.totalOwed += b.totalDue || 0;
    if (new Date(b.dueDate) < new Date(g.oldestDue)) g.oldestDue = b.dueDate;
  }

  // Attach current meter status (so disconnected ones are separated).
  const pnNos = [...new Set([...map.values()].map((x) => x.pnNo))];
  const members = await WaterMember.find({ pnNo: { $in: pnNos } }).select("pnNo meters addressText address").lean();
  const statusByKey = new Map();
  const addrByPn = new Map();
  for (const m of members) {
    addrByPn.set(m.pnNo, m.addressText || "");
    for (const mt of m.meters || []) statusByKey.set(`${up(m.pnNo)}|${up(mt.meterNumber)}`, mt.meterStatus);
  }

  const items = [...map.entries()].map(([key, v]) => ({
    ...v,
    address: addrByPn.get(v.pnNo) || "",
    currentStatus: statusByKey.get(key) || "active",
    totalOwed: Number(v.totalOwed.toFixed(2)),
  }));

  const pending = items.filter((x) => x.currentStatus !== "disconnected").sort((a, b) => new Date(a.oldestDue) - new Date(b.oldestDue));
  const disconnected = items.filter((x) => x.currentStatus === "disconnected");

  res.json({ pending, disconnected, pendingCount: pending.length });
});

// Admin confirms disconnection of a specific meter (not automatic).
router.post("/confirm", ...adminGuard, async (req, res) => {
  const { pnNo, meterNumber } = req.body || {};
  const member = await WaterMember.findOne({ pnNo: up(pnNo) });
  if (!member) return res.status(404).json({ message: "Account not found." });
  const meter = (member.meters || []).find((m) => up(m.meterNumber) === up(meterNumber));
  if (!meter) return res.status(404).json({ message: "Meter not found on this account." });
  meter.meterStatus = "disconnected";
  meter.isBillingActive = false;
  await member.save();
  res.json({ ok: true, message: `Meter ${meterNumber} disconnected.` });
});

// Admin reconnects a meter (e.g., after settlement).
router.post("/reconnect", ...adminGuard, async (req, res) => {
  const { pnNo, meterNumber } = req.body || {};
  const member = await WaterMember.findOne({ pnNo: up(pnNo) });
  if (!member) return res.status(404).json({ message: "Account not found." });
  const meter = (member.meters || []).find((m) => up(m.meterNumber) === up(meterNumber));
  if (!meter) return res.status(404).json({ message: "Meter not found on this account." });
  meter.meterStatus = "active";
  meter.isBillingActive = true;
  await member.save();
  res.json({ ok: true, message: `Meter ${meterNumber} reconnected.` });
});

export default router;
