import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// Throttle device.lastSeen writes so we don't hit Mongo on every single
// request — once per minute per device is plenty for the 2-hour window logic.
const HEARTBEAT_THROTTLE_MS = 60 * 1000;
const lastTouchedAt = new Map(); // key: `${userId}:${tokenHash}` → ms

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "Invalid token user" });

    req.user = user;

    // Heartbeat: if the client passed its device token, freshen the matching
    // knownDevice.lastSeen so re-logins from this device skip 2FA inside the
    // 2-hour window. Fire-and-forget so it never blocks the response.
    const deviceToken = req.headers["x-device-token"];
    if (deviceToken && Array.isArray(user.knownDevices) && user.knownDevices.length) {
      const tokenHash = sha256(deviceToken);
      const key = `${user._id}:${tokenHash}`;
      const last = lastTouchedAt.get(key) || 0;
      if (Date.now() - last > HEARTBEAT_THROTTLE_MS) {
        lastTouchedAt.set(key, Date.now());
        User.updateOne(
          { _id: user._id, "knownDevices.tokenHash": tokenHash },
          { $set: { "knownDevices.$.lastSeen": new Date() } }
        ).catch(() => {});
      }
    }

    next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function requireRole(roles = []) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
