import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const employeeId = "ADMIN2026";
  const exists = await User.findOne({ employeeId });

  if (exists) {
    console.log("Admin already exists:", employeeId);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash("PowasscoAdmin@2026", 10);

  await User.create({
    employeeId,
    fullName: "System Admin",
    role: "admin",
    status: "active",
    passwordHash
  });

  console.log("âœ… Seeded admin:", employeeId, "password: PowasscoAdmin@2026");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
