// Cashier lookup — strictly read-only.
// The cashier receives cash and writes a paper OR receipt by hand.
// They never mark anything paid here; the consumer then walks the OR receipt
// over to the water_bill_officer (or loan_officer) who inputs the OR number
// and marks the specific bill/loan as paid via the existing officer panels.
//
// Two surfaces:
//   GET /api/cashier/water?q=...   — by PN no OR meter number
//   GET /api/cashier/loan?q=...    — by loan ID, reference code, borrower name, or PN no

import express from "express";
import WaterMember from "../models/WaterMember.js";
import WaterBill from "../models/WaterBill.js";
import WaterPayment from "../models/WaterPayment.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanPayment from "../models/LoanPayment.js";
import OnlinePayment from "../models/OnlinePayment.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin", "cashier", "water_bill_officer", "loan_officer"])];

const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => String(s || "").trim().toUpperCase();

// ------ WATER LOOKUP ------
// Search a member by PN no, meter number, OR account name.
// If a name matches multiple accounts the response is a candidate list so the
// cashier can pick the exact one before issuing an OR.
router.get("/water", ...guard, async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    if (!raw || raw.length < 2) return res.status(400).json({ message: "Enter a PN No, meter number, or account name (at least 2 characters)." });
    const q = raw.toUpperCase();

    const rxStart = new RegExp("^" + escapeRegex(q), "i");
    const rxAny = new RegExp(escapeRegex(raw), "i");

    // Try PN first (exact → prefix), then meter number (exact → prefix), then accountName (any-position, case-insensitive).
    let member =
      (await WaterMember.findOne({ pnNo: q }).lean()) ||
      (await WaterMember.findOne({ pnNo: rxStart }).lean()) ||
      (await WaterMember.findOne({ "meters.meterNumber": q }).lean()) ||
      (await WaterMember.findOne({ "meters.meterNumber": rxStart }).lean());

    if (!member) {
      const nameMatches = await WaterMember.find({ accountName: rxAny })
        .select("pnNo accountName address meters accountStatus")
        .sort({ accountName: 1 })
        .limit(20)
        .lean();
      if (nameMatches.length === 0) {
        return res.status(404).json({ message: "No account found for that PN, meter number, or name." });
      }
      if (nameMatches.length > 1) {
        return res.json({
          candidates: nameMatches.map((m) => ({
            pnNo: m.pnNo,
            accountName: m.accountName,
            accountStatus: m.accountStatus,
            address: [m.address?.streetSitioPurok, m.address?.barangay].filter(Boolean).join(", "),
            meters: (m.meters || []).filter((mt) => mt.meterStatus === "active").map((mt) => mt.meterNumber),
          })),
        });
      }
      member = nameMatches[0];
    }

    // Bills (all — sorted newest first). Compute outstanding from unpaid/overdue.
    const bills = await WaterBill.find({ pnNo: member.pnNo })
      .sort({ periodCovered: -1 })
      .select("pnNo meterNumber periodCovered periodKey consumed previousReading presentReading baseAmount discount penaltyApplied totalDue status dueDate paidAt orNo")
      .lean();

    // Last few payments (so the cashier can sanity-check "already paid recently?").
    const billIds = bills.map((b) => b._id);
    const payments = billIds.length
      ? await WaterPayment.find({ billId: { $in: billIds } })
          .sort({ paidAt: -1 })
          .limit(20)
          .select("billId pnNo meterNumber orNo amountPaid paidAt receivedBy method")
          .lean()
      : [];

    // Online payments still in pending review — flag so cashier doesn't double-collect.
    const pendingOnline = await OnlinePayment.find({
      module: "water",
      pnNo: member.pnNo,
      status: "pending",
    })
      .select("meterNumber periodKey amountToPay referenceId createdAt")
      .lean();

    const unpaid = bills.filter((b) => b.status !== "paid");
    const totalDue = unpaid.reduce((sum, b) => sum + (Number(b.totalDue) || 0), 0);

    res.json({
      member: {
        pnNo: member.pnNo,
        accountName: member.accountName,
        accountStatus: member.accountStatus,
        classification: member.billing?.classification,
        address: [member.address?.houseLotNo, member.address?.streetSitioPurok, member.address?.barangay, member.address?.municipalityCity].filter(Boolean).join(", "),
        contact: member.contact?.mobileNumber || "",
        meters: (member.meters || [])
          .filter((m) => m.meterStatus === "active")
          .map((m) => ({ meterNumber: m.meterNumber, meterBrand: m.meterBrand, meterSize: m.meterSize, lastReading: m.lastReading })),
      },
      bills,
      unpaidCount: unpaid.length,
      totalDue,
      recentPayments: payments,
      pendingOnline,
    });
  } catch (e) {
    console.error("Cashier water lookup error:", e);
    res.status(500).json({ message: "Lookup failed. Please try again." });
  }
});

// ------ LOAN LOOKUP ------
// Search by loan ID, reference code, borrower name, or PN no.
router.get("/loan", ...guard, async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    if (!raw || raw.length < 2) return res.status(400).json({ message: "Enter a loan ID, reference code, borrower name, or PN No." });
    const q = raw.toUpperCase();
    const rx = new RegExp(escapeRegex(raw), "i");

    const loans = await LoanApplication.find({
      $or: [
        { loanId: q },
        { loanId: rx },
        { referenceCode: q },
        { referenceCode: rx },
        { borrowerPnNo: q },
        { borrowerName: rx },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select(
        "loanId referenceCode borrowerPnNo borrowerName principal monthlyPayment totalPayment totalPaid balance status releasedAt maturityDate firstPaymentDate termMonths interestRatePerMonth createdAt"
      )
      .lean();

    if (loans.length === 0) return res.status(404).json({ message: "No loan found for that query." });

    const loanIds = loans.map((l) => l.loanId);

    const [recentPayments, pendingOnline] = await Promise.all([
      LoanPayment.find({ loanId: { $in: loanIds } })
        .sort({ paidAt: -1 })
        .limit(30)
        .select("loanId orNo method amountPaid paidAt receivedBy")
        .lean(),
      OnlinePayment.find({ module: "loan", loanId: { $in: loanIds }, status: "pending" })
        .select("loanId amountToPay referenceId createdAt")
        .lean(),
    ]);

    res.json({ loans, recentPayments, pendingOnline });
  } catch (e) {
    console.error("Cashier loan lookup error:", e);
    res.status(500).json({ message: "Lookup failed. Please try again." });
  }
});

export default router;
