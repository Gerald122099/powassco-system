import express from "express";
import crypto from "crypto";
import ServiceRequest from "../../models/ServiceRequest.js";

const router = express.Router();
const norm = (s) => String(s || "").trim().toLowerCase();

// Public submission of a service request (new connection / reconnection).
// Mounted under /api/public so it's covered by the strict public rate limit.
router.post("/", async (req, res) => {
  const b = req.body || {};
  const type = b.type;
  if (!["new_connection", "reconnection"].includes(type)) {
    return res.status(400).json({ message: "Invalid request type." });
  }
  const fullName = String(b.fullName || "").trim();
  const phone = String(b.phone || "").trim();
  if (!fullName || !phone) return res.status(400).json({ message: "Name and contact number are required." });

  const doc = { type, fullName, phone, email: String(b.email || "").trim(), message: String(b.message || "").trim() };
  let basis;

  if (type === "new_connection") {
    const address = String(b.address || "").trim();
    if (!address) return res.status(400).json({ message: "Full address is required." });
    doc.address = address;
    doc.installationType = String(b.installationType || "").trim();
    basis = `nc|${norm(phone)}|${norm(address)}`;
  } else {
    const accountNumber = String(b.accountNumber || "").trim();
    const meterNumber = String(b.meterNumber || "").trim();
    if (!accountNumber || !meterNumber) {
      return res.status(400).json({ message: "Account number and meter number are required." });
    }
    doc.accountNumber = accountNumber.toUpperCase();
    doc.meterNumber = meterNumber.toUpperCase();
    basis = `rc|${norm(accountNumber)}|${norm(meterNumber)}|${norm(phone)}`;
  }

  doc.dedupeKey = crypto.createHash("sha256").update(basis).digest("hex");

  // Spam guard: block an identical request that's still open.
  const existing = await ServiceRequest.findOne({ dedupeKey: doc.dedupeKey, status: { $in: ["pending", "in_progress"] } });
  if (existing) {
    return res.status(409).json({ message: "We already received this request and will contact you. No need to resubmit." });
  }

  await ServiceRequest.create(doc);
  res.status(201).json({ ok: true, message: "Request submitted. We'll contact you on the number you provided." });
});

export default router;
