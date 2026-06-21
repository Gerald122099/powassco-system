import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import compression from "compression";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";

import waterMembersRoutes from "./routes/water/waterMembers.routes.js";
import waterBillsRoutes from "./routes/water/waterBills.routes.js";
import waterPaymentsRoutes from "./routes/water/waterPayments.routes.js";
import waterSettingsRoutes from "./routes/water/waterSettings.routes.js";
import waterAnalyticsRoutes from "./routes/water/waterAnalytics.routes.js";
import waterReadingsRoutes from "./routes/water/waterReadings.routes.js";
import puroksRoutes from "./routes/water/puroks.routes.js";
import waterInquiryRoutes from "./routes/public/waterInquiry.routes.js";
import waterBatchesRoutes from "./routes/water/waterBatches.routes.js";
import loanRoutes from "./routes/loan/loans.routes.js";
import expensesRoutes from "./routes/admin/expenses.routes.js";
import employeesRoutes from "./routes/admin/employees.routes.js";
import payrollRoutes from "./routes/admin/payroll.routes.js";
import auditRoutes from "./routes/admin/audit.routes.js";
import publicRequestsRoutes from "./routes/public/requests.routes.js";
import publicProductsRoutes from "./routes/public/products.routes.js";
import productReservationsRoutes from "./routes/productReservations.routes.js";
import adminRequestsRoutes from "./routes/admin/requests.routes.js";
import meetingsRoutes from "./routes/meetings.routes.js";
import publicAnnouncementsRoutes from "./routes/public/announcements.routes.js";
import publicPushRoutes from "./routes/public/push.routes.js";
import adminAnnouncementsRoutes from "./routes/admin/announcements.routes.js";
import assetsRoutes from "./routes/admin/assets.routes.js";
import publicPaymentsRoutes from "./routes/public/payments.routes.js";
import publicSavingsInquiryRoutes from "./routes/public/savingsInquiry.routes.js";
import devFeedbackRoutes from "./routes/public/devFeedback.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import disconnectionsRoutes from "./routes/disconnections.routes.js";
import webhooksRoutes from "./routes/webhooks.routes.js";
import cashierRoutes from "./routes/cashier.routes.js";
import pettyCashRoutes from "./routes/pettyCash.routes.js";
import collectionsRoutes from "./routes/collections.routes.js";
import bookkeeperRoutes from "./routes/bookkeeper.routes.js";
import savingsRoutes from "./routes/savings.routes.js";
import adjustmentsRoutes from "./routes/adjustments.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import treasuryRoutes from "./routes/treasury.routes.js";
import dataResetRoutes from "./routes/admin/dataReset.routes.js";
import maintenanceRoutes from "./routes/admin/maintenance.routes.js";
import remindersRoutes from "./routes/admin/reminders.routes.js";
import errorsRoutes from "./routes/admin/errors.routes.js";
import auditReportRoutes from "./routes/auditReport.routes.js";

import { auditLogger } from "./middleware/auditLogger.js";
import { ensureBootstrapAdmin } from "./utils/ensureAdmin.js";
import { startSavingsInterestJob } from "./jobs/savingsInterest.js";
import { startBillReminderJob } from "./jobs/billReminders.js";
import { startReservationExpiryJob } from "./jobs/reservationExpiry.js";
import { initRealtime, startChangeStream } from "./realtime.js";

dotenv.config();

const app = express();
// Behind Render's proxy: trust one hop so rate limiting keys on the real client IP.
app.set("trust proxy", 1);
// Security headers (HSTS, no-sniff, frameguard, etc.). CSP/CORP disabled so the
// cross-origin Vercel frontend can still call this API.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
// Gzip every JSON response. The /water/readings/my-batch payload is
// the dominant one — hundreds of member docs with repeated keys — and
// compresses to ~20% of its raw size. Cuts a 200-member batch download
// over a weak Cebu cell signal from ~8s to ~1.5s.
app.use(compression());
// Capture rawBody too — PayMongo signs webhook payloads, so the receiver
// needs the exact byte string the PSP signed (not the parsed object).
app.use(express.json({ limit: "3mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
// Strip any $/.-prefixed keys from inputs — defense against NoSQL operator injection.
app.use(mongoSanitize());

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
  // Capacitor native app (Android/iOS) WebView origins — the bundled
  // member app calls this API from one of these.
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  ...envOrigins,
]);

// Vercel preview deployments produce URLs like
//   https://powassco-staging-git-staging-<user>.vercel.app  (branch URL)
//   https://powassco-staging-<hash>-<user>.vercel.app       (commit URL)
// We can't enumerate these in advance because the hash changes per commit,
// so the staging API accepts any *.vercel.app origin belonging to the
// powassco-staging / powassco-system-staging projects.
function isPowasscoVercelPreview(origin) {
  return /^https:\/\/(powassco|powassco-staging|powassco-system-staging)[A-Za-z0-9-]*\.vercel\.app$/.test(origin);
}

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // non-browser clients (curl, server-to-server)
    const normalized = origin.replace(/\/+$/, "");
    if (allowedOrigins.has(normalized)) return cb(null, true);
    if (isPowasscoVercelPreview(normalized)) return cb(null, true);
    console.log("⚠️ Blocked origin:", origin);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Device-Token","X-Admin-Authz"],
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
app.use("/api/public/products", publicProductsRoutes);
app.use("/api/public/announcements", publicAnnouncementsRoutes);
app.use("/api/public/payments", publicPaymentsRoutes);
app.use("/api/public/savings-inquiry", publicSavingsInquiryRoutes);
app.use("/api/public/dev-feedback", devFeedbackRoutes);
app.use("/api/public/push", publicPushRoutes);
app.use("/api/water/batches", waterBatchesRoutes);
app.use("/api/water/puroks", puroksRoutes);

// ✅ LOAN MODULE
app.use("/api/loan", loanRoutes);

// ✅ ADMIN: EXPENSES / EMPLOYEES / PAYROLL / AUDIT
app.use("/api/expenses", expensesRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/requests", adminRequestsRoutes);
app.use("/api/product-reservations", productReservationsRoutes);
app.use("/api/meetings", meetingsRoutes);
app.use("/api/announcements", adminAnnouncementsRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/disconnections", disconnectionsRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/cashier", cashierRoutes);
app.use("/api/petty-cash", pettyCashRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/bookkeeper", bookkeeperRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/adjustments", adjustmentsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/treasury", treasuryRoutes);
app.use("/api/admin/data-reset", dataResetRoutes);
app.use("/api/admin/maintenance", maintenanceRoutes);
app.use("/api/admin/reminders", remindersRoutes);
app.use("/api/admin/errors", errorsRoutes);
app.use("/api/audit-report", auditReportRoutes);

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
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// Real-time layer (Socket.IO). Reuses the same CORS allowlist + Vercel
// preview matcher as the REST API. The change stream is started after
// Mongo connects (below).
initRealtime(httpServer, { allowedOrigins, isPreview: isPowasscoVercelPreview });

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
    // Hourly savings-interest check; no-op until the admin sets a
    // non-zero rate in Savings Policy. Idempotent per period.
    startSavingsInterestJob();
    // Hourly tick that runs the water-bill reminder pass once a day at
    // the configured local hour. Idempotent per (bill, day) via ReminderLog.
    startBillReminderJob();
    // Release unclaimed store reservations (free held stock, mark no-show).
    startReservationExpiryJob();
    // Real-time: watch the DB for changes and ping subscribed clients.
    startChangeStream(mongoose.connection);
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