import bcrypt from "bcryptjs";
import User from "../models/User.js";

// Creates the bootstrap admin if it doesn't already exist. Idempotent and safe
// to call on every server boot. Requires an active mongoose connection.
// Override the defaults via SEED_ADMIN_ID / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME.
export async function ensureBootstrapAdmin() {
  const employeeId = process.env.SEED_ADMIN_ID || "ADMIN2026";
  const password = process.env.SEED_ADMIN_PASSWORD || "PowasscoAdmin@2026";
  const fullName = process.env.SEED_ADMIN_NAME || "System Admin";

  const exists = await User.findOne({ employeeId });
  if (exists) {
    console.log(`ℹ️  Bootstrap admin already exists: ${employeeId}`);
    return { created: false };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    employeeId,
    fullName,
    role: "admin",
    status: "active",
    passwordHash,
  });
  console.log(`✅ Seeded bootstrap admin: ${employeeId}`);
  return { created: true };
}
