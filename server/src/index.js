import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";

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
import loanRoutes from "./routes/loan/loans.routes.js";
import expensesRoutes from "./routes/admin/expenses.routes.js";
import employeesRoutes from "./routes/admin/employees.routes.js";
import payrollRoutes from "./routes/admin/payroll.routes.js";
import auditRoutes from "./routes/admin/audit.routes.js";
import publicRequestsRoutes from "./routes/public/requests.routes.js";
import adminRequestsRoutes from "./routes/admin/requests.routes.js";
import meetingsRoutes from "./routes/meetings.routes.js";

import { auditLogger } from "./middleware/auditLogger.js";
import { ensureBootstrapAdmin } from "./utils/ensureAdmin.js";

dotenv.config();

const app = express();
// Behind Render's proxy: trust one hop so rate limiting keys on the real client IP.
app.set("trust proxy", 1);
app.use(express.json());

// ✅ CORS - allow configured origins. CLIENT_ORIGIN may be a comma-separated list.
const envOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, "")) // trim + drop trailing slash
  .filter(Boolean);

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.45:5173",
  "http://100.100.137.248:5173",
  "https://powassco.site",
  "https://www.powassco.site",
  ...envOrigins,
]);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // non-browser clients (curl, server-to-server)
    const normalized = origin.replace(/\/+$/, "");
    if (allowedOrigins.has(normalized)) return cb(null, true);
    console.log("⚠️ Blocked origin:", origin);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// root + health (work even when the DB is down — useful for uptime checks)
app.get("/", (req, res) => res.json({ service: "POWASSCO API", ok: true }));
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  })
);

// ---- Rate limiting (DDoS / brute-force protection) ----
// Health route above is already matched, so it is never throttled.
const limiterOpts = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again shortly." },
};
// Strictest on the PUBLIC (unauthenticated) endpoints — the most exposed surface.
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 40, ...limiterOpts });
// Brute-force protection on login.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, ...limiterOpts });
// Generous cap on everything else (normal authenticated app usage).
const generalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, ...limiterOpts });

app.use("/api/public", publicLimiter);
app.use("/api/auth", authLimiter);
app.use("/api", generalLimiter);

// Audit every mutating API call (records the authenticated actor on finish)
app.use(auditLogger);

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
app.use("/api/public/requests", publicRequestsRoutes);
app.use("/api/water/batches", waterBatchesRoutes);

// ✅ LOAN MODULE
app.use("/api/loan", loanRoutes);

// ✅ ADMIN: EXPENSES / EMPLOYEES / PAYROLL / AUDIT
app.use("/api/expenses", expensesRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/requests", adminRequestsRoutes);
app.use("/api/meetings", meetingsRoutes);

// JSON 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

// Central error handler — returns JSON (with CORS headers) instead of hanging
app.use((err, req, res, _next) => {
  console.error("Route error:", err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

// Start listening IMMEDIATELY so the platform can route traffic and /api/health
// responds even while the database is still connecting or unreachable. A DB
// outage must not take the whole HTTP server down.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// Connect to MongoDB independently, with retry.
async function connectDB() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not set. Add it to the host's environment variables.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("✅ MongoDB connected");
    try {
      await ensureBootstrapAdmin();
    } catch (e) {
      console.error("⚠️  Bootstrap admin seeding failed (continuing):", e.message);
    }
  } catch (err) {
    console.error("❌ MongoDB connection failed; retrying in 5s:", err.message);
    setTimeout(connectDB, 5000);
  }
}

connectDB();

// Never crash the process on an unhandled async error.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});