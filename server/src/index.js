import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import authRoutes from "../routes/auth.routes.js";
import usersRoutes from "../routes/users.routes.js";

import waterMembersRoutes from "../routes/water/waterMembers.routes.js";
import waterBillsRoutes from "../routes/water/waterBills.routes.js";
import waterPaymentsRoutes from "../routes/water/waterPayments.routes.js";
import waterSettingsRoutes from "../routes/water/waterSettings.routes.js";
import waterAnalyticsRoutes from "../routes/water/waterAnalytics.routes.js";
import waterReadingsRoutes from "../routes/water/waterReadings.routes.js";
import waterInquiryRoutes from "../routes/public/waterInquiry.routes.js";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ CORS (frontend not deployed yet is OK)
app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = ["http://localhost:5173", process.env.CLIENT_ORIGIN].filter(Boolean);
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.options("*", cors());

// ✅ Health route (should work even if Mongo env is wrong)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ✅ Mongo cache (serverless-safe)
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ✅ Only connect to DB for non-health routes
app.use(async (req, res, next) => {
  if (req.path === "/api/health") return next();
  try {
    await connectDB();
    next();
  } catch (e) {
    console.error("Mongo connect error:", e);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

app.use("/api/water/members", waterMembersRoutes);
app.use("/api/water/bills", waterBillsRoutes);
app.use("/api/water/payments", waterPaymentsRoutes);
app.use("/api/water/settings", waterSettingsRoutes);
app.use("/api/water/analytics", waterAnalyticsRoutes);
app.use("/api/water/readings", waterReadingsRoutes);
app.use("/api/public/water", waterInquiryRoutes);

// ✅ Export for Vercel
export default app;

// ✅ Local dev only
if (process.env.VERCEL !== "1") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`✅ Server running on :${PORT}`));
}
