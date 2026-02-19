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
import waterBatchesRoutes from "./routes/water/waterBatches.routes.js";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ CORS - Allow all necessary origins
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.45:5173",  // Your network IP
  "http://100.100.137.248:5173", // Other network IP
  process.env.CLIENT_ORIGIN,
].filter(Boolean));

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    console.log("⚠️ Blocked origin:", origin); // Log blocked origins for debugging
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

// ✅ WATER MODULE
app.use("/api/water/members", waterMembersRoutes);
app.use("/api/water/bills", waterBillsRoutes);
app.use("/api/water/payments", waterPaymentsRoutes);
app.use("/api/water/settings", waterSettingsRoutes);
app.use("/api/water/analytics", waterAnalyticsRoutes);
app.use("/api/water/readings", waterReadingsRoutes);
app.use("/api/public/water", waterInquiryRoutes);
app.use("/api/water/batches", waterBatchesRoutes);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
    
    // Listen on all network interfaces (0.0.0.0)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`   Local: http://localhost:${PORT}`);
      console.log(`   Network: http://192.168.1.45:${PORT}`);
      console.log(`   Network: http://100.100.137.248:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Server start error:", err);
    process.exit(1);
  }
}

start();