import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";

import waterMembersRoutes from "./routes/water/waterMembers.routes.js";
import waterBillsRoutes from "./routes/water/waterBills.routes.js";
import waterPaymentsRoutes from "./routes/water/waterPayments.routes.js";
import waterSettingsRoutes from "./routes/water/waterSettings.routes.js";
import waterAnalyticsRoutes from "./routes/water/waterAnalytics.routes.js";
import waterReadingsRoutes from "./routes/water/waterReadings.routes.js";
import waterInquiryRoutes from "./routes/public/waterInquiry.routes.js";

dotenv.config();

const app = express();

/* =========================
   BASIC MIDDLEWARE
========================= */
app.use(express.json());
app.set("trust proxy", 1);

/* =========================
   CORS (VERCEL + LOCAL)
========================= */
const allowedOrigins = new Set(
  [
    "http://localhost:5173",
    process.env.CLIENT_ORIGIN, // e.g. https://powassco-system.vercel.app
  ].filter(Boolean)
);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow curl / health checks
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false); // ❗ do NOT throw error
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =========================
   HEALTH CHECK
========================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "running" });
});

/* =========================
   AUTH / USERS
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

/* =========================
   WATER MODULE
========================= */
app.use("/api/water/members", waterMembersRoutes);
app.use("/api/water/bills", waterBillsRoutes);
app.use("/api/water/payments", waterPaymentsRoutes);
app.use("/api/water/settings", waterSettingsRoutes);
app.use("/api/water/analytics", waterAnalyticsRoutes);
app.use("/api/water/readings", waterReadingsRoutes);
app.use("/api/public/water", waterInquiryRoutes);

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(500).json({ message: "Internal server error" });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Server start error:", err);
    process.exit(1);
  }
}

start();
