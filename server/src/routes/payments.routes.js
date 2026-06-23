import express from "express";
import PaymentSettings from "../models/PaymentSettings.js";
import OnlinePayment from "../models/OnlinePayment.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { postOnlinePayment } from "../utils/postOnlinePayment.js";
import { envOverrides } from "../utils/pspCreds.js";

const router = express.Router();

async function getSettings() {
  let s = await PaymentSettings.findOne();
  if (!s) s = await PaymentSettings.create({});
  return s;
}

// ---- Admin: QR + fee settings ----
const adminGuard = [requireAuth, requireRole(["admin"])];
router.get("/settings", ...adminGuard, async (req, res) => {
  const s = await getSettings();
  // Tell the UI which credentials are managed by host env vars (read-only).
  res.json({ ...s.toObject(), envOverrides: envOverrides() });
});
router.put("/settings", ...adminGuard, async (req, res) => {
  const s = await getSettings();
  const allow = ["onlineEnabled", "mode", "qrImage", "onlineFee", "payeeName", "instructions", "paymongoSecretKey", "paymongoPublicKey", "paymongoWebhookSecret", "xenditApiKey", "xenditCallbackToken", "pspActive"];
  // Never let DB values overwrite host-env values (env wins).
  const env = envOverrides();
  for (const k of allow) if (k in req.body && !env[k]) s[k] = req.body[k];
  s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
  await s.save();
  res.json({ ...s.toObject(), envOverrides: env });
});

// ---- Admin: recent PSP webhook deliveries (audit / readiness check) ----
// Read-only feed of incoming webhook events so the admin can confirm the
// provider is reaching us and signatures verify, once the integration is
// activated. rawPayload is intentionally excluded (can be large / sensitive).
router.get("/webhook-events", ...adminGuard, async (req, res) => {
  const items = await WebhookEvent.find({})
    .sort({ createdAt: -1 })
    .limit(40)
    .select("provider eventType providerRef signatureValid result errorMessage parsedSummary createdAt")
    .lean();
  res.json(items);
});

// ---- Officers + cashier: pending online payments to verify ----
// Cashier is included so the counter can issue the OR + post a GCash/online
// payment (realtime-marks the account paid). Scope still limits officers to
// their own module; admin + cashier see all.
const officerGuard = [requireAuth, requireRole(["admin", "cashier", "water_bill_officer", "loan_officer"])];

function scopeModule(req) {
  if (req.user.role === "water_bill_officer") return "water";
  if (req.user.role === "loan_officer") return "loan";
  return null; // admin / cashier: any
}

// Non-secret status flag so the cashier UI knows whether to SHOW the online /
// GCash queue at all. Returns no keys — only whether online is accepted, the
// mode, and the pending count (scoped to the caller's module).
router.get("/online-status", ...officerGuard, async (req, res) => {
  const s = await getSettings();
  const enabled = s.onlineEnabled !== false;
  let pendingCount = 0;
  if (enabled) {
    const scoped = scopeModule(req);
    const f = { status: "pending" };
    if (scoped) f.module = scoped;
    pendingCount = await OnlinePayment.countDocuments(f);
  }
  res.json({ enabled, mode: s.mode, pspActive: !!s.pspActive, payeeName: s.payeeName || "", pendingCount });
});

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
