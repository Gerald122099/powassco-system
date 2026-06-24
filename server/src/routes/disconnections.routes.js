// Disconnection + Reconnection workflow.
//
// Queues:
//   • Pending Disconnect — meters with overdue bill grace exhausted OR whose
//     borrower has an unpaid loan past due. Visible to admin, water bill
//     officer, plumber. Officer or plumber can mark "disconnected".
//   • Disconnected — meters that have been physically disconnected. Still
//     visible for status reference.
//   • Pending Reconnect — meters whose account has been reactivated by the
//     water bill officer after settlement. Plumber or officer marks
//     "reconnected" to flip them back to active.
//
// Removed: the old admin-only "confirm disconnection" endpoint. Officers
// and plumbers now act directly.

import express from "express";
import WaterBill from "../models/WaterBill.js";
import WaterMember from "../models/WaterMember.js";
import WaterSettings from "../models/WaterSettings.js";
import LoanApplication from "../models/LoanApplication.js";
import { ProductLoanApplication } from "../models/ProductLoan.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const viewGuard = [requireAuth, requireRole(["admin", "water_bill_officer", "meter_reader", "plumber", "loan_officer"])];
const actGuard = [requireAuth, requireRole(["admin", "water_bill_officer", "plumber"])];
const officerGuard = [requireAuth, requireRole(["admin", "water_bill_officer"])];

const up = (s) => String(s || "").toUpperCase().trim();

function buildAddressText(addr = {}) {
  return [addr.houseLotNo, addr.streetSitioPurok, addr.barangay, addr.municipalityCity].filter(Boolean).join(", ");
}

// Compute loan-driven disconnections. Operator rule (updated 2026-06-24): a
// released loan whose final due date (maturityDate) has PASSED with a balance
// still outstanding makes ALL the borrower's meters subject for disconnection
// — i.e. "after the due day", matching the product-loan rule. (This replaced
// the earlier 6-month grace.) Surfacing here only lists candidates; a plumber
// must still physically disconnect before any reconnection fee applies.
async function loanDrivenPnos(now = new Date()) {
  const loans = await LoanApplication.find({
    status: "released",
    balance: { $gt: 0 },
    maturityDate: { $ne: null, $lt: now },
  })
    .select("loanId borrowerPnNo borrowerName balance maturityDate")
    .lean();
  const pn = new Map(); // pnNo -> [{ loanId, owed }]
  for (const l of loans) {
    const key = up(l.borrowerPnNo);
    if (!pn.has(key)) pn.set(key, []);
    pn.get(key).push({ loanId: l.loanId, owed: Number(l.balance) || 0 });
  }
  return pn;
}

// Product-loan-driven disconnections: an OPEN product loan / rental past its
// due date makes ALL of the borrower's meters subject for disconnection.
async function productLoanDrivenPnos(now = new Date()) {
  const items = await ProductLoanApplication.find({
    transactionType: { $in: ["loan", "rental"] },
    balance: { $gt: 0 },
    dueDate: { $ne: null, $lt: now },
    status: { $nin: ["fully_paid", "returned", "cancelled", "rejected"] },
  }).select("pnNo productName balance dueDate").lean();
  const pn = new Map();
  for (const p of items) {
    const key = up(p.pnNo);
    if (!key) continue;
    if (!pn.has(key)) pn.set(key, []);
    pn.get(key).push({ productName: p.productName, owed: Number(p.balance) || 0 });
  }
  return pn;
}

// GET /api/disconnections
// Returns: { pendingDisconnect, disconnected, pendingReconnect }
router.get("/", ...viewGuard, async (req, res) => {
  try {
    const now = new Date();

    // 1) Bill-driven pending: bills past grace, flagged subjectForDisconnection.
    const billsOverdue = await WaterBill.find({
      status: { $in: ["overdue", "unpaid"] },
      subjectForDisconnection: true,
    })
      .select("pnNo accountName meterNumber periodCovered totalDue dueDate daysOverdue")
      .lean();

    // 2) Loan-driven pending: borrower's loan past due → ALL of borrower's meters are subject.
    const loanMap = await loanDrivenPnos(now);
    // 2b) Product-loan-driven: overdue product loan / rental → all meters subject.
    const productLoanMap = await productLoanDrivenPnos(now);

    // Index bill-driven entries by pn+meter
    const meterRows = new Map();
    for (const b of billsOverdue) {
      const k = `${up(b.pnNo)}|${up(b.meterNumber)}`;
      if (!meterRows.has(k)) meterRows.set(k, {
        pnNo: b.pnNo, accountName: b.accountName, meterNumber: b.meterNumber,
        periods: [], unpaidCount: 0, totalOwed: 0, oldestDue: b.dueDate,
        daysOverdue: 0, remark: "Unpaid water bills",
      });
      const r = meterRows.get(k);
      r.periods.push(b.periodCovered);
      r.unpaidCount += 1;
      r.totalOwed += Number(b.totalDue) || 0;
      if (Number(b.daysOverdue) > r.daysOverdue) r.daysOverdue = Number(b.daysOverdue);
      if (new Date(b.dueDate) < new Date(r.oldestDue)) r.oldestDue = b.dueDate;
    }

    // 3) Join member data (status of each meter + address + ALL meters for loan-driven).
    const candidatePns = new Set([...meterRows.keys()].map((k) => k.split("|")[0]).concat([...loanMap.keys()]).concat([...productLoanMap.keys()]));
    const members = await WaterMember.find({ pnNo: { $in: [...candidatePns] } })
      .select("pnNo accountName meters address")
      .lean();

    const memberByPn = new Map(members.map((m) => [up(m.pnNo), m]));

    // Add loan-driven rows for every active meter on each affected member.
    for (const [pnNo, loans] of loanMap) {
      const m = memberByPn.get(pnNo);
      if (!m) continue;
      const remark = `Unpaid loans (${loans.map((l) => l.loanId).join(", ")})`;
      for (const mt of m.meters || []) {
        const k = `${up(pnNo)}|${up(mt.meterNumber)}`;
        if (!meterRows.has(k)) meterRows.set(k, {
          pnNo, accountName: m.accountName, meterNumber: mt.meterNumber,
          periods: [], unpaidCount: 0, totalOwed: 0, oldestDue: null,
          daysOverdue: 0, remark,
        });
        // If bills already flagged this meter, append the loan remark.
        else meterRows.get(k).remark = `${meterRows.get(k).remark} + ${remark}`;
      }
    }

    // Add product-loan-driven rows for every meter on each affected member.
    for (const [pnNo, items] of productLoanMap) {
      const m = memberByPn.get(pnNo);
      if (!m) continue;
      const remark = `Unpaid product loans (${items.map((i) => i.productName).filter(Boolean).slice(0, 3).join(", ")})`;
      for (const mt of m.meters || []) {
        const k = `${up(pnNo)}|${up(mt.meterNumber)}`;
        if (!meterRows.has(k)) meterRows.set(k, {
          pnNo, accountName: m.accountName, meterNumber: mt.meterNumber,
          periods: [], unpaidCount: 0, totalOwed: 0, oldestDue: null,
          daysOverdue: 0, remark,
        });
        else meterRows.get(k).remark = `${meterRows.get(k).remark} + ${remark}`;
      }
    }

    // Bucket each row by current meter status.
    const pendingDisconnect = [];
    const disconnected = [];
    const pendingReconnect = [];

    for (const row of meterRows.values()) {
      const m = memberByPn.get(up(row.pnNo));
      const meter = m ? (m.meters || []).find((mt) => up(mt.meterNumber) === up(row.meterNumber)) : null;
      row.address = m ? buildAddressText(m.address) : "";
      row.currentStatus = meter?.meterStatus || "active";
      row.totalOwed = Number(row.totalOwed.toFixed(2));
      if (meter?.disconnectionRemarks) row.diskRemarks = meter.disconnectionRemarks;

      if (row.currentStatus === "disconnected") {
        disconnected.push(row);
      } else {
        pendingDisconnect.push(row);
      }
    }

    // Pending reconnect: scan all meters that are disconnected AND have
    // reconnectionRequested = true (set by officer when account is settled).
    const reconAllMembers = await WaterMember.find({ "meters.reconnectionRequested": true })
      .select("pnNo accountName meters address")
      .lean();
    for (const m of reconAllMembers) {
      for (const mt of m.meters || []) {
        if (mt.reconnectionRequested) {
          pendingReconnect.push({
            pnNo: m.pnNo,
            accountName: m.accountName,
            meterNumber: mt.meterNumber,
            address: buildAddressText(m.address),
            currentStatus: mt.meterStatus,
            requestedAt: mt.reconnectionRequestedAt,
            requestedBy: mt.reconnectionRequestedBy,
          });
        }
      }
    }

    pendingDisconnect.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
    res.json({
      pendingDisconnect,
      disconnected,
      pendingReconnect,
      counts: {
        pendingDisconnect: pendingDisconnect.length,
        disconnected: disconnected.length,
        pendingReconnect: pendingReconnect.length,
      },
    });
  } catch (e) {
    console.error("disconnections list error:", e);
    res.status(500).json({ message: "Failed to load disconnections." });
  }
});

// Mark a specific meter as disconnected. Allowed: officer + plumber + admin.
router.post("/mark-disconnected", ...actGuard, async (req, res) => {
  const { pnNo, meterNumber, remarks = "" } = req.body || {};
  const member = await WaterMember.findOne({ pnNo: up(pnNo) });
  if (!member) return res.status(404).json({ message: "Account not found." });
  const meter = (member.meters || []).find((m) => up(m.meterNumber) === up(meterNumber));
  if (!meter) return res.status(404).json({ message: "Meter not found on this account." });

  // Snapshot the reconnection fee owed for this meter (unless already set).
  const settings = await WaterSettings.findOne().select("reconnectionFee").lean();
  const fee = Math.max(0, Number(settings?.reconnectionFee ?? 200));

  meter.meterStatus = "disconnected";
  meter.isBillingActive = false;
  meter.disconnectionRemarks = remarks || "Subject for disconnection (unpaid)";
  meter.disconnectedAt = new Date();
  meter.disconnectedBy = req.user?.fullName || req.user?.employeeId || "";
  meter.reconnectionRequested = false;
  meter.reconnectionRequestedAt = null;
  meter.reconnectionRequestedBy = "";
  if (!(Number(meter.reconnectionFeeDue) > 0)) meter.reconnectionFeeDue = fee;
  // A disconnected meter suspends the account (lifted on reconnection request /
  // reconnection-fee collection).
  if (member.accountStatus === "active") member.accountStatus = "suspended";
  await member.save();
  res.json({ ok: true, message: `Meter ${meterNumber} marked as disconnected.`, reconnectionFeeDue: meter.reconnectionFeeDue });
});

// Officer activates the account → ALL meters linked are queued for reconnection.
// Plumber / officer then physically reconnects each one. Allowed: officer + admin.
router.post("/request-reconnect", ...officerGuard, async (req, res) => {
  const { pnNo } = req.body || {};
  const member = await WaterMember.findOne({ pnNo: up(pnNo) });
  if (!member) return res.status(404).json({ message: "Account not found." });

  member.accountStatus = "active";
  let queued = 0;
  const now = new Date();
  const requestedBy = req.user?.fullName || req.user?.employeeId || "";
  for (const mt of member.meters || []) {
    if (mt.meterStatus === "disconnected") {
      mt.reconnectionRequested = true;
      mt.reconnectionRequestedAt = now;
      mt.reconnectionRequestedBy = requestedBy;
      queued += 1;
    }
  }
  await member.save();
  res.json({ ok: true, message: `Account activated. ${queued} meter(s) queued for reconnection.`, queued });
});

// Mark a meter as physically reconnected. Allowed: officer + plumber + admin.
router.post("/mark-reconnected", ...actGuard, async (req, res) => {
  const { pnNo, meterNumber } = req.body || {};
  const member = await WaterMember.findOne({ pnNo: up(pnNo) });
  if (!member) return res.status(404).json({ message: "Account not found." });
  const meter = (member.meters || []).find((m) => up(m.meterNumber) === up(meterNumber));
  if (!meter) return res.status(404).json({ message: "Meter not found on this account." });
  if (!meter.reconnectionRequested) return res.status(400).json({ message: "Meter is not pending reconnection." });

  meter.meterStatus = "active";
  meter.isBillingActive = true;
  meter.reconnectionRequested = false;
  meter.reconnectedAt = new Date();
  meter.reconnectedBy = req.user?.fullName || req.user?.employeeId || "";
  meter.disconnectionRemarks = "";
  meter.reconnectionFeeDue = 0; // cleared on reconnection
  // Reactivate the account once no meter is left disconnected.
  if (!(member.meters || []).some((m) => m.meterStatus === "disconnected") && member.accountStatus === "suspended") {
    member.accountStatus = "active";
  }
  await member.save();
  res.json({ ok: true, message: `Meter ${meterNumber} reconnected.` });
});

export default router;
