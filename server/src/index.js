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
app.use(express.json());

// ✅ CORS
const allowedOrigins = new Set([
  "http://localhost:5173",
  process.env.CLIENT_ORIGIN,
].filter(Boolean));

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// auth/users
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

// ✅ WATER MODULE (clean)
app.use("/api/water/members", waterMembersRoutes);
app.use("/api/water/bills", waterBillsRoutes);
app.use("/api/water/payments", waterPaymentsRoutes);
app.use("/api/water/settings", waterSettingsRoutes);
app.use("/api/water/analytics", waterAnalyticsRoutes);
app.use("/api/water/readings", waterReadingsRoutes);
app.use("/api/public/water", waterInquiryRoutes);


const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`✅ Server running on :${PORT}`));
  } catch (err) {
    console.error("❌ Server start error:", err);
    process.exit(1);
  }
}

start();
