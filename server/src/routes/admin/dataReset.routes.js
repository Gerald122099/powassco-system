// Admin-only "Reset transactional data" endpoint.
//
// Wipes every operational record (members, bills, payments, readings,
// batches, loans, online payments, CBU ledger, product-loan applications)
// while preserving everything that takes manual setup to recreate:
// users, employees, tariffs/settings, catalogues, audit log, meetings,
// announcements, public requests, expenses, assets, payroll.
//
// Three layers of safety:
//   1. requireRole(["admin"])
//   2. Admin must re-enter their password and a current 2FA code (or a
//      one-time recovery code).
//   3. Body must include the exact confirmation phrase "RESET ALL DATA".

import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authenticator } from "otplib";
import { requireAuth, requireRole } from "../../middleware/auth.js";

import User from "../../models/User.js";
import AuditLog from "../../models/AuditLog.js";
import WaterMember from "../../models/WaterMember.js";
import WaterBill from "../../models/WaterBill.js";
import WaterPayment from "../../models/WaterPayment.js";
import WaterReading from "../../models/WaterReading.js";
import WaterBatch from "../../models/WaterBatch.js";
import LoanApplication from "../../models/LoanApplication.js";
import LoanPayment from "../../models/LoanPayment.js";
import OnlinePayment from "../../models/OnlinePayment.js";
import CbuTransaction from "../../models/CbuTransaction.js";
import { ProductLoanApplication } from "../../models/ProductLoan.js";

const router = express.Router();
const guard = [requireAuth, requireRole(["admin"])];
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// The collections this endpoint will wipe. Anything not in this list is
// preserved — users, employees, all *Settings, ProductLoanCatalog,
// AuditLog, WebhookEvent, Meeting, Announcement, PublicRequest, Expense,
// Asset, Payroll, PayrollSettings, etc.
const TARGETS = [
  { key: "waterMembers", model: WaterMember, label: "Water members" },
  { key: "waterBills", model: WaterBill, label: "Water bills" },
  { key: "waterPayments", model: WaterPayment, label: "Water payments" },
  { key: "waterReadings", model: WaterReading, label: "Water readings" },
  { key: "waterBatches", model: WaterBatch, label: "Plumber batches" },
  { key: "loanApplications", model: LoanApplication, label: "Loan applications" },
  { key: "loanPayments", model: LoanPayment, label: "Loan payments" },
  { key: "onlinePayments", model: OnlinePayment, label: "Online payments" },
  { key: "cbuTransactions", model: CbuTransaction, label: "CBU ledger entries" },
  { key: "productLoanApplications", model: ProductLoanApplication, label: "Product-loan applications" },
];

// GET /api/admin/data-reset/preview — counts only, no writes.
router.get("/preview", ...guard, async (req, res) => {
  const out = {};
  for (const t of TARGETS) {
    try { out[t.key] = { label: t.label, count: await t.model.countDocuments() }; }
    catch { out[t.key] = { label: t.label, count: 0, error: true }; }
  }
  res.json({ targets: out });
});

// POST /api/admin/data-reset
// Body: { password, code, confirm: "RESET ALL DATA" }
router.post("/", ...guard, async (req, res) => {
  const password = String(req.body?.password || "");
  const code = String(req.body?.code || "").replace(/\s/g, "");
  const confirm = String(req.body?.confirm || "");

  if (confirm !== "RESET ALL DATA") {
    return res.status(400).json({ message: 'Type the exact phrase "RESET ALL DATA" to confirm.' });
  }
  if (!password) return res.status(400).json({ message: "Admin password is required." });
  if (!code) return res.status(400).json({ message: "Admin authenticator code is required." });

  const admin = await User.findById(req.user._id);
  if (!admin) return res.status(401).json({ message: "Session user not found." });
  if (admin.role !== "admin") return res.status(403).json({ message: "Admin role required." });

  const pwOk = await bcrypt.compare(password, admin.passwordHash);
  if (!pwOk) return res.status(401).json({ message: "Wrong password." });

  if (!admin.twoFactorEnabled) {
    return res.status(403).json({ message: "Admin must have 2FA enrolled to run a data reset." });
  }

  let codeOk = authenticator.verify({ token: code, secret: admin.twoFactorSecret });
  if (!codeOk) {
    const h = sha256(code.toUpperCase().replace(/[\s-]/g, ""));
    const rc = (admin.recoveryCodes || []).find((x) => x.codeHash === h && !x.used);
    if (rc) { rc.used = true; rc.usedAt = new Date(); await admin.save(); codeOk = true; }
  }
  if (!codeOk) return res.status(401).json({ message: "Invalid authenticator code." });

  // Run the deletions. Independent per collection — partial success is fine
  // to report (the audit row captures whatever succeeded). We don't use a
  // single transaction because the free Atlas tier doesn't support multi-doc
  // transactions across collections without a replica set, and the order
  // here is forgiving (no FK constraints in Mongoose).
  const results = {};
  for (const t of TARGETS) {
    try {
      const r = await t.model.deleteMany({});
      results[t.key] = { label: t.label, deleted: r?.deletedCount ?? 0 };
    } catch (e) {
      results[t.key] = { label: t.label, deleted: 0, error: e.message };
    }
  }

  // Audit (security category).
  try {
    const totalDeleted = Object.values(results).reduce((s, x) => s + (x.deleted || 0), 0);
    await AuditLog.create({
      actorId: String(admin._id),
      actorName: admin.fullName || admin.employeeId,
      actorRole: admin.role,
      method: "POST",
      path: "/api/admin/data-reset",
      action: `Reset transactional data — ${totalDeleted} record(s) deleted across ${TARGETS.length} collection(s)`,
      category: "security",
      statusCode: 200,
      ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
    });
  } catch { /* best-effort */ }

  res.json({ ok: true, message: "Data reset completed.", results });
});

export default router;
