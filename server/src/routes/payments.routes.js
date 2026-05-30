import express from "express";
import PaymentSettings from "../models/PaymentSettings.js";
import OnlinePayment from "../models/OnlinePayment.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { postOnlinePayment } from "../utils/postOnlinePayment.js";

const router = express.Router();

async function getSettings() {
  let s = await PaymentSettings.findOne();
  if (!s) s = await PaymentSettings.create({});
  return s;
}

// ---- Admin: QR + fee settings ----
const adminGuard = [requireAuth, requireRole(["admin"])];
router.get("/settings", ...adminGuard, async (req, res) => res.json(await getSettings()));
router.put("/settings", ...adminGuard, async (req, res) => {
  const s = await getSettings();
  const allow = ["onlineEnabled", "mode", "qrImage", "onlineFee", "payeeName", "instructions", "paymongoSecretKey", "paymongoPublicKey", "xenditApiKey", "pspActive"];
  for (const k of allow) if (k in req.body) s[k] = req.body[k];
  s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
  await s.save();
  res.json(s);
});

// ---- Officers: pending online payments to verify ----
const officerGuard = [requireAuth, requireRole(["admin", "water_bill_officer", "loan_officer"])];

function scopeModule(req) {
  if (req.user.role === "water_bill_officer") return "water";
  if (req.user.role === "loan_officer") return "loan";
  return null; // admin: any
}

router.get("/online", ...officerGuard, async (req, res) => {
  const { status = "pending", module = "" } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const scoped = scopeModule(req);
  if (scoped) filter.module = scoped;
  else if (module) filter.module = module;
  const items = await OnlinePayment.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json(items);
});

router.post("/online/:id/verify", ...officerGuard, async (req, res) => {
  const op = await OnlinePayment.findById(req.params.id);
  if (!op) return res.status(404).json({ message: "Payment not found." });
  if (op.status !== "pending") return res.status(400).json({ message: "Already processed." });
  const scoped = scopeModule(req);
  if (scoped && scoped !== op.module) return res.status(403).json({ message: "Not your module to verify." });

  const orNo = String(req.body.orNo || "").trim();
  if (!orNo) return res.status(400).json({ message: "OR number is required." });

  try {
    const updated = await postOnlinePayment(op, { orNo, receivedBy: req.user?.fullName || req.user?.employeeId || "" });
    res.json({ ok: true, onlinePayment: updated });
  } catch (e) {
    if (e.code === "DUP_OR") return res.status(409).json({ message: e.message });
    res.status(400).json({ message: e.message });
  }
});

router.post("/online/:id/reject", ...officerGuard, async (req, res) => {
  const op = await OnlinePayment.findById(req.params.id);
  if (!op) return res.status(404).json({ message: "Payment not found." });
  const scoped = scopeModule(req);
  if (scoped && scoped !== op.module) return res.status(403).json({ message: "Not your module." });
  op.status = "rejected";
  op.rejectionReason = String(req.body.reason || "").trim();
  op.verifiedBy = req.user?.fullName || req.user?.employeeId || "";
  op.verifiedAt = new Date();
  await op.save();
  res.json({ ok: true });
});

export default router;
