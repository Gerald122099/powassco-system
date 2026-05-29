import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { authenticator } from "otplib";
import { z } from "zod";
import User from "../models/User.js";
import AuthSettings from "../models/AuthSettings.js";
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
function sessionToken(user) {
  return jwt.sign(
    { id: user._id.toString(), employeeId: user.employeeId, role: user.role, fullName: user.fullName },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}
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
    if (known) {
      known.lastSeen = new Date();
      known.ip = clientIp(req);
      await user.save();
      return res.json({ token: sessionToken(user), user: publicUser(user) });
    }
    // New device → require the authenticator code.
    return res.json({ twoFactorRequired: true, challengeToken: challengeToken(user) });
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

export default router;
