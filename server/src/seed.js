import dotenv from "dotenv";
import mongoose from "mongoose";
import { ensureBootstrapAdmin } from "./utils/ensureAdmin.js";

dotenv.config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await ensureBootstrapAdmin();
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("Seed error:", e);
    process.exit(1);
  }
})();
