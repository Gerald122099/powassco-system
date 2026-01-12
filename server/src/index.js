import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import authRoutes from "../routes/auth.routes.js";

dotenv.config();

const app = express();
app.use(express.json());

// ================= CORS =================
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === process.env.CLIENT_ORIGIN) return cb(null, true);
      if (origin === "http://localhost:5173") return cb(null, true);
      return cb(null, true);
    },
    credentials: true
  })
);

// ================= HEALTH =================
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ================= DB (SERVERLESS SAFE) =================
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI)
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Connect DB only for API routes (skip health)
app.use(async (req, res, next) => {
  if (req.path === "/api/health") return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Mongo error:", err);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// ================= ROUTES =================
app.use("/api/auth", authRoutes);

// ================= EXPORT =================
export default app;

// ================= LOCAL DEV =================
if (process.env.VERCEL !== "1") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
}
