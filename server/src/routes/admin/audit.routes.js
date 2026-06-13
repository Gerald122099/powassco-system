import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authenticator } from "otplib";
import AuditLog from "../../models/AuditLog.js";
import User from "../../models/User.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

router.get("/", requireAuth, requireRole(["admin", "audit_committee"]), async (req, res) => {
  const { q = "", actor = "", action = "", category = "", kind = "", from = "", to = "", page = "1", limit = "25" } = req.query;
  const filter = {};
  if (actor) filter.actorName = new RegExp(String(actor).trim(), "i");
  if (action) filter.action = new RegExp(String(action).trim(), "i");
  if (category) filter.category = category;
  if (kind) filter.actionKind = kind;
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ actorName: rx }, { action: rx }, { path: rx }, { actorRole: rx }];
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, limit: lim });
});

// POST /api/audit/reset — wipe the audit log. Admin + password + 2FA + the
// exact confirmation phrase "RESET AUDIT LOG". Body: { password, code, confirm }.
// A single seed row is created right after the wipe so the act of clearing
// is itself recorded (the audit log can never be "silently" empty).
router.post("/reset", guard, async (req, res) => {
  const password = String(req.body?.password || "");
  const code = String(req.body?.code || "").replace(/\s/g, "");
  const confirm = String(req.body?.confirm || "");
  if (confirm !== "RESET AUDIT LOG") {
    return res.status(400).json({ message: 'Type the exact phrase "RESET AUDIT LOG" to confirm.' });
  }
  if (!password || !code) return res.status(400).json({ message: "Admin password and authenticator code are required." });

  const admin = await User.findById(req.user._id);
  if (!admin || admin.role !== "admin") return res.status(403).json({ message: "Admin role required." });
  const pwOk = await bcrypt.compare(password, admin.passwordHash);
  if (!pwOk) return res.status(401).json({ message: "Wrong password." });
  if (!admin.twoFactorEnabled) return res.status(403).json({ message: "Admin must have 2FA enrolled to reset the audit log." });

  let codeOk = authenticator.verify({ token: code, secret: admin.twoFactorSecret });
  if (!codeOk) {
    const h = sha256(code.toUpperCase().replace(/[\s-]/g, ""));
    const rc = (admin.recoveryCodes || []).find((x) => x.codeHash === h && !x.used);
    if (rc) { rc.used = true; rc.usedAt = new Date(); await admin.save(); codeOk = true; }
  }
  if (!codeOk) return res.status(401).json({ message: "Invalid authenticator code." });

  const before = await AuditLog.countDocuments();
  await AuditLog.deleteMany({});

  // Seed a single record so the audit log is never silently empty.
  await AuditLog.create({
    actorId: String(admin._id),
    actorName: admin.fullName || admin.employeeId,
    actorRole: admin.role,
    method: "POST",
    path: "/api/audit/reset",
    action: `Audit log reset — ${before} previous entry(ies) deleted`,
    category: "security",
    statusCode: 200,
    ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
  });
  res.json({ ok: true, deleted: before });
});

export default router;
