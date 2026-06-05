// One-off cleanup: delete every WaterMember tagged arCategory="AR-TNPL".
// Created after the operator confirmed those rows were imported by mistake
// (the TNPL ledger members are not actually new water-customers — they
// were a duplicate snapshot of sitio members listed without sitio).
// Safe to run because none of these rows have bills/readings yet — they
// were inserted minutes before this cleanup.

import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";
import WaterMember from "../models/WaterMember.js";

dotenv.config();

try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch {
  /* older Node */
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const before = await WaterMember.countDocuments({ arCategory: "AR-TNPL" });
  console.log(`Found ${before} member(s) with arCategory='AR-TNPL'.`);
  if (before === 0) {
    await mongoose.disconnect();
    return;
  }
  const result = await WaterMember.deleteMany({ arCategory: "AR-TNPL" });
  console.log(`Deleted ${result.deletedCount} member(s).`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("Cleanup crashed:", e);
  process.exit(1);
});
