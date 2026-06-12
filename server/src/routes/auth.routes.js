import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { authenticator } from "otplib";
import { z } from "zod";
import User from "../models/User.js";
import AuthSettings from "../models/AuthSettings.js";
import AuditLog from "../models/AuditLog.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const ISSUER = "POWASSCO";

const loginSchema = z.object({
  employeeId: z.string().min(2),
  password: z.string().min(4),
  deviceToken: z.string().optional(),
});

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function clientIp(req) {
  return (req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim();
}
// Long JWT lifetime so a tab/PWA reopen never lands on the login page during
// normal use. The actual *security* boundary is the 2-hour device-inactivity
// window enforced at login time (a stolen-token attacker still needs to clear
// the 2FA challenge if the device hasn't been used recently).
function sessionToken(user) {
  return jwt.sign(
    { id: user._id.toString(), employeeId: user.employeeId, role: user.role, fullName: user.fullName },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}
// Window during which a remembered device skips the authenticator challenge.
// Beyond this, the user re-verifies even on a known device.
const DEVICE_TRUST_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
function challengeToken(user) {
  return jwt.sign({ id: user._id.toString(), purpose: "2fa" }, process.env.JWT_SECRET, { expiresIn: "5m" });
}
function publicUser(user) {
  return { id: user._id, employeeId: user.employeeId, fullName: user.fullName, role: user.role };
}
async function getAuthSettings() {
  let s = await AuthSettings.findOne();
  if (!s) s = await AuthSettings.create({});
  return s;
}
// Remember the current device so it skips 2FA next time. Returns the raw token.
async function rememberDevice(user, req) {
  const raw = crypto.randomBytes(32).toString("hex");
  user.knownDevices = (user.knownDevices || []).filter((d) => d.tokenHash); // tidy
  user.knownDevices.push({ tokenHash: sha256(raw), ip: clientIp(req), lastSeen: new Date() });
  if (user.knownDevices.length > 10) user.knownDevices = user.knownDevices.slice(-10);
  await user.save();
  return raw;
}
function deviceKnown(user, deviceToken) {
  if (!deviceToken) return null;
  const h = sha256(deviceToken);
  return (user.knownDevices || []).find((d) => d.tokenHash === h) || null;
}

// ---- Login ----
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
  const { employeeId, password, deviceToken } = parsed.data;

  const user = await User.findOne({ employeeId });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.status !== "active") return res.status(403).json({ message: "Account inactive" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const settings = await getAuthSettings();

  if (user.twoFactorEnabled) {
    const known = deviceKnown(user, deviceToken);
    const nowIp = clientIp(req);
    const recentlyActive = known && (Date.now() - new Date(known.lastSeen || 0).getTime()) < DEVICE_TRUST_WINDOW_MS;
    const sameIp = known && String(known.ip || "") === String(nowIp || "");

    // Admin role: never skip — every admin login goes through 2FA.
    // Non-admin: skip only when the device is remembered, recently active
    //            (≤ 2h), AND the IP hasn't changed since last sign-in.
    const canSkip = user.role !== "admin" && recentlyActive && sameIp;

    if (canSkip) {
      known.lastSeen = new Date();
      known.ip = nowIp;
      await user.save();
      return res.json({ token: sessionToken(user), user: publicUser(user) });
    }
    // New device, new IP, idle > 2h, or admin — require the authenticator code.
    return res.json({
      twoFactorRequired: true,
      challengeToken: challengeToken(user),
      reason: !known ? "new_device" : !sameIp ? "new_ip" : !recentlyActive ? "idle" : "policy",
    });
  }

  // Not enrolled. If the admin enforces 2FA, sign them in but require setup.
  const token = sessionToken(user);
  if (settings.enforce2FA) {
    return res.json({ token, user: publicUser(user), mustSetup2FA: true });
  }
  return res.json({ token, user: publicUser(user) });
});

// ---- Verify the 2FA code for a new-device login ----
router.post("/2fa/verify", async (req, res) => {
  const { challengeToken: ct, code, rememberDevice: remember } = req.body || {};
  if (!ct || !code) return res.status(400).json({ message: "Code is required." });
  let decoded;
  try {
    decoded = jwt.verify(ct, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Your verification session expired. Please log in again." });
  }
  if (decoded.purpose !== "2fa") return res.status(400).json({ message: "Invalid challenge." });

  const user = await User.findById(decoded.id);
  if (!user || !user.twoFactorEnabled) return res.status(400).json({ message: "2FA is not set up." });

  const valid = authenticator.verify({ token: String(code).replace(/\s/g, ""), secret: user.twoFactorSecret });
  if (!valid) return res.status(401).json({ message: "Invalid or expired code." });

  let newDeviceToken;
  if (remember) newDeviceToken = await rememberDevice(user, req);

  res.json({ token: sessionToken(user), user: publicUser(user), deviceToken: newDeviceToken });
});

// ---- 2FA status for the signed-in user ----
router.get("/2fa/status", requireAuth, async (req, res) => {
  const settings = await getAuthSettings();
  res.json({ enabled: !!req.user.twoFactorEnabled, enforced: !!settings.enforce2FA });
});

// ---- Begin enrollment: generate a secret + otpauth URI for the QR ----
router.post("/2fa/setup", requireAuth, async (req, res) => {
  const secret = authenticator.generateSecret();
  req.user.twoFactorPendingSecret = secret;
  await req.user.save();
  const otpauth = authenticator.keyuri(req.user.employeeId, ISSUER, secret);
  res.json({ secret, otpauth });
});

// ---- Confirm enrollment with a code from the authenticator ----
router.post("/2fa/enable", requireAuth, async (req, res) => {
  const { code } = req.body || {};
  const pending = req.user.twoFactorPendingSecret;
  if (!pending) return res.status(400).json({ message: "Start setup first." });
  const valid = authenticator.verify({ token: String(code || "").replace(/\s/g, ""), secret: pending });
  if (!valid) return res.status(401).json({ message: "Invalid code. Check your authenticator app." });

  req.user.twoFactorSecret = pending;
  req.user.twoFactorPendingSecret = "";
  req.user.twoFactorEnabled = true;
  const deviceToken = await rememberDevice(req.user, req); // trust the enrolling device
  res.json({ ok: true, deviceToken });
});

// ---- Disable 2FA (requires a current code) ----
router.post("/2fa/disable", requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (req.user.twoFactorEnabled) {
    const valid = authenticator.verify({ token: String(code || "").replace(/\s/g, ""), secret: req.user.twoFactorSecret });
    if (!valid) return res.status(401).json({ message: "Enter a valid code to turn off 2FA." });
  }
  req.user.twoFactorEnabled = false;
  req.user.twoFactorSecret = "";
  req.user.twoFactorPendingSecret = "";
  req.user.knownDevices = [];
  await req.user.save();
  res.json({ ok: true });
});

// ---- Admin self-reset: clear own 2FA so they can re-setup ----
// Admins lose authenticator devices too. This lets a signed-in admin clear
// their own 2FA (on a session opened from a remembered device, or right after
// an admin peer reset them) and walk through enrollment again. Audited.
router.post("/2fa/self-reset", requireAuth, requireRole(["admin"]), async (req, res) => {
  const u = req.user;
  u.twoFactorEnabled = false;
  u.twoFactorSecret = "";
  u.twoFactorPendingSecret = "";
  u.knownDevices = [];
  await u.save();
  await auditSecurity(req, u, "Admin self-reset of own 2FA", 200);
  res.json({ ok: true, message: "2FA cleared. Set it up again to re-enable." });
});

// ---- Admin: enforce toggle ----
router.get("/2fa/admin/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
  res.json(await getAuthSettings());
});
router.put("/2fa/admin/settings", requireAuth, requireRole(["admin"]), async (req, res) => {
  const s = await getAuthSettings();
  if ("enforce2FA" in req.body) s.enforce2FA = !!req.body.enforce2FA;
  s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
  await s.save();
  res.json(s);
});

// ---- Admin: reset a user's 2FA (lost-device recovery) ----
router.post("/2fa/admin/reset/:userId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ message: "User not found." });
  u.twoFactorEnabled = false;
  u.twoFactorSecret = "";
  u.twoFactorPendingSecret = "";
  u.knownDevices = [];
  await u.save();
  res.json({ ok: true });
});

// ---- Recovery (backup) codes ----
function genRecoveryCodes(n = 10) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}
const normCode = (c) => String(c || "").toUpperCase().replace(/[\s-]/g, "");
const hashCode = (c) => sha256(normCode(c));

async function auditSecurity(req, user, action, statusCode = 200) {
  try {
    await AuditLog.create({
      actorId: String(user?._id || ""),
      actorName: user?.fullName || req.body?.employeeId || "unknown",
      actorRole: user?.role || "auth",
      method: req.method,
      path: (req.originalUrl || req.path).split("?")[0],
      action,
      category: "security",
      statusCode,
      ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
    });
  } catch {
    /* best-effort */
  }
}

// Generate fresh codes for the signed-in user (shown once, store securely).
router.post("/2fa/recovery-codes", requireAuth, async (req, res) => {
  const codes = genRecoveryCodes();
  req.user.recoveryCodes = codes.map((c) => ({ codeHash: hashCode(c), used: false }));
  await req.user.save();
  res.json({ codes });
});

// Admin generates codes for any account (incl. admins).
router.post("/2fa/admin/recovery-codes/:userId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ message: "User not found." });
  const codes = genRecoveryCodes();
  u.recoveryCodes = codes.map((c) => ({ codeHash: hashCode(c), used: false }));
  await u.save();
  res.json({ codes, employeeId: u.employeeId, fullName: u.fullName });
});

// Use a recovery code to reset 2FA (authenticator lost). Public.
router.post("/recover-2fa", async (req, res) => {
  const { employeeId, code } = req.body || {};
  if (!employeeId || !code) return res.status(400).json({ message: "Employee ID and recovery code are required." });
  const user = await User.findOne({ employeeId: String(employeeId).trim() });
  if (user) {
    const h = hashCode(code);
    const rc = (user.recoveryCodes || []).find((x) => x.codeHash === h && !x.used);
    if (rc) {
      rc.used = true;
      rc.usedAt = new Date();
      user.twoFactorEnabled = false;
      user.twoFactorSecret = "";
      user.twoFactorPendingSecret = "";
      user.knownDevices = [];
      await user.save();
      await auditSecurity(req, user, "2FA reset via recovery code");
      return res.json({ ok: true, message: "Recovery successful. 2FA has been reset — log in and set it up again." });
    }
  }
  await auditSecurity(req, user, "Failed 2FA recovery attempt", 401);
  return res.status(401).json({ message: "Invalid employee ID or recovery code." });
});

// Reset password using a 2FA code or a recovery code. Public (no email needed).
router.post("/reset-password-2fa", async (req, res) => {
  const { employeeId, code, newPassword } = req.body || {};
  if (!employeeId || !code || !newPassword) return res.status(400).json({ message: "All fields are required." });
  if (String(newPassword).length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
  const user = await User.findOne({ employeeId: String(employeeId).trim() });
  if (!user || !user.twoFactorEnabled) {
    return res.status(400).json({ message: "Password self-reset requires 2FA on the account. Please contact the admin." });
  }
  let ok = authenticator.verify({ token: String(code).replace(/\s/g, ""), secret: user.twoFactorSecret });
  if (!ok) {
    const h = hashCode(code);
    const rc = (user.recoveryCodes || []).find((x) => x.codeHash === h && !x.used);
    if (rc) {
      rc.used = true;
      rc.usedAt = new Date();
      ok = true;
    }
  }
  if (!ok) {
    await auditSecurity(req, user, "Failed password reset (bad 2FA/recovery code)", 401);
    return res.status(401).json({ message: "Invalid code." });
  }
  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  await user.save();
  await auditSecurity(req, user, "Password reset via 2FA", 200);
  res.json({ ok: true, message: "Password updated. You can now log in." });
});

// Logout — recorded by the audit logger (session category).
router.post("/logout", requireAuth, async (req, res) => {
  res.json({ ok: true });
});

// ----------------------------------------------------------------------
// App-entry PIN (currently used by the Plumber dashboard). Admin sets a
// 4-digit code per user; the installed PWA prompts for it every time
// the user re-opens the app. Independent from the 2FA flow — this is a
// fast "is the right person holding the phone" check, not a session
// challenge.
// ----------------------------------------------------------------------

// Anyone authenticated can check whether their account has a PIN set
// and (sessionless) verify it.
router.get("/pin-status", requireAuth, async (req, res) => {
  res.json({
    hasPin: !!req.user?.appPinHash,
    setAt: req.user?.appPinSetAt || null,
  });
});

router.post("/pin-verify", requireAuth, async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (!pin) return res.status(400).json({ message: "PIN is required." });
  if (!req.user.appPinHash) return res.status(409).json({ message: "No PIN is set on this account." });
  const ok = await bcrypt.compare(pin, req.user.appPinHash);
  if (!ok) return res.status(401).json({ message: "Wrong PIN." });
  res.json({ ok: true });
});

// Self-set the lock-screen PIN. First-time set is open to any
// authenticated user (the idle lock prompts for it); changing an
// existing PIN requires the current one (or an admin reset below).
router.post("/pin-set", requireAuth, async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  const currentPin = String(req.body?.currentPin || "").trim();
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: "PIN must be exactly 4 digits." });
  const u = await User.findById(req.user.id || req.user._id);
  if (!u) return res.status(404).json({ message: "User not found." });
  if (u.appPinHash) {
    const ok = currentPin && (await bcrypt.compare(currentPin, u.appPinHash));
    if (!ok) return res.status(401).json({ message: "Current PIN is wrong — ask an admin to reset it if forgotten." });
  }
  u.appPinHash = await bcrypt.hash(pin, 10);
  u.appPinSetAt = new Date();
  u.appPinSetBy = u.fullName || u.employeeId || "";
  await u.save();
  await auditSecurity(req, u, `${u.fullName || u.employeeId} set their own lock-screen PIN`);
  res.json({ ok: true });
});

// Admin set / clear a PIN on any user.
router.post("/admin/pin/:userId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: "PIN must be exactly 4 digits." });
  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ message: "User not found." });
  u.appPinHash = await bcrypt.hash(pin, 10);
  u.appPinSetAt = new Date();
  u.appPinSetBy = req.user?.fullName || req.user?.employeeId || "";
  await u.save();
  await auditSecurity(req, u, `Admin set app PIN for ${u.fullName || u.employeeId}`);
  res.json({ ok: true });
});

router.delete("/admin/pin/:userId", requireAuth, requireRole(["admin"]), async (req, res) => {
  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ message: "User not found." });
  u.appPinHash = "";
  u.appPinSetAt = null;
  u.appPinSetBy = "";
  await u.save();
  await auditSecurity(req, u, `Admin cleared app PIN for ${u.fullName || u.employeeId}`);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------
// Password step-up — used by the field reader when editing a reading that
// was already synced. Cheaper / more familiar than a TOTP prompt, and
// the audit log captures who edited what.
// ----------------------------------------------------------------------
router.post("/verify-password", requireAuth, async (req, res) => {
  const password = String(req.body?.password || "");
  if (!password) return res.status(400).json({ message: "Password is required." });
  const ok = await bcrypt.compare(password, req.user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Wrong password." });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------
// Admin authorisation (dual-control / four-eyes) for sensitive edits.
//
// Water bill officers (and other non-admin roles) cannot edit certain
// records by themselves. An admin must enter THEIR employee ID + password
// + current authenticator code on the officer's screen. The server issues
// a short-lived JWT (10 min) tied to the officer's session; the officer's
// next mutating request carries it in the X-Admin-Authz header and is
// allowed through.
// ----------------------------------------------------------------------
const ADMIN_AUTHZ_TTL = "10m";

router.post("/admin-authz", requireAuth, async (req, res) => {
  const { adminEmployeeId, adminPassword, adminCode } = req.body || {};
  if (!adminEmployeeId || !adminPassword || !adminCode) {
    return res.status(400).json({ message: "Admin employee ID, password, and authenticator code are required." });
  }
  const admin = await User.findOne({ employeeId: String(adminEmployeeId).trim() });
  if (!admin) return res.status(401).json({ message: "Invalid admin credentials." });
  if (admin.role !== "admin") return res.status(403).json({ message: "That account is not an admin." });
  if (admin.status !== "active") return res.status(403).json({ message: "Admin account is inactive." });

  const pwOk = await bcrypt.compare(String(adminPassword), admin.passwordHash);
  if (!pwOk) return res.status(401).json({ message: "Invalid admin credentials." });

  let codeOk = false;
  if (admin.twoFactorEnabled && admin.twoFactorSecret) {
    codeOk = authenticator.verify({ token: String(adminCode).replace(/\s/g, ""), secret: admin.twoFactorSecret });
  }
  if (!codeOk) {
    // Recovery-code fallback so a lost-phone admin can still authorise.
    const h = sha256(String(adminCode).toUpperCase().replace(/[\s-]/g, ""));
    const rc = (admin.recoveryCodes || []).find((x) => x.codeHash === h && !x.used);
    if (rc) { rc.used = true; rc.usedAt = new Date(); await admin.save(); codeOk = true; }
  }
  if (!codeOk) return res.status(401).json({ message: "Invalid admin authenticator code." });
  if (!admin.twoFactorEnabled) {
    return res.status(403).json({ message: "The admin account must have 2FA enrolled to authorise edits." });
  }

  const authzToken = jwt.sign(
    {
      purpose: "admin_authz",
      grantedBy: admin._id.toString(),
      grantedByName: admin.fullName || admin.employeeId,
      grantedFor: req.user._id.toString(),
    },
    process.env.JWT_SECRET,
    { expiresIn: ADMIN_AUTHZ_TTL }
  );

  await auditSecurity(req, admin, `Admin authorised edit for ${req.user.fullName || req.user.employeeId}`, 200);
  res.json({ ok: true, authzToken, expiresInSeconds: 600 });
});

export default router;
