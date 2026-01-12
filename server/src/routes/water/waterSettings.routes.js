// server/routes/water/waterSettings.routes.js
import express from "express";
import WaterSettings from "../../models/WaterSettings.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();

// ✅ Only admin can edit settings (recommended)
const guard = [requireAuth, requireRole(["admin"])];

const DEFAULTS = {
  ratePerCubic: 0,
  penaltyType: "flat",
  penaltyValue: 0,
  dueDayOfMonth: 15,
  graceDays: 0,

  // ✅ NEW
  readingStartDayOfMonth: 1,
  readingWindowDays: 7,
};

router.get("/", ...guard, async (req, res) => {
  let s = await WaterSettings.findOne();
  if (!s) s = await WaterSettings.create(DEFAULTS);
  res.json(s);
});

router.put("/", ...guard, async (req, res) => {
  const {
    ratePerCubic,
    penaltyType,
    penaltyValue,
    dueDayOfMonth,
    graceDays,

    // ✅ NEW
    readingStartDayOfMonth,
    readingWindowDays,
  } = req.body || {};

  let s = await WaterSettings.findOne();
  if (!s) s = await WaterSettings.create(DEFAULTS);

  s.ratePerCubic = Number(ratePerCubic ?? s.ratePerCubic);
  s.penaltyType = penaltyType || s.penaltyType;
  s.penaltyValue = Number(penaltyValue ?? s.penaltyValue);

  if (dueDayOfMonth !== undefined) s.dueDayOfMonth = Math.min(31, Math.max(1, Number(dueDayOfMonth)));
  if (graceDays !== undefined) s.graceDays = Math.min(60, Math.max(0, Number(graceDays)));

  // ✅ NEW
  if (readingStartDayOfMonth !== undefined)
    s.readingStartDayOfMonth = Math.min(31, Math.max(1, Number(readingStartDayOfMonth)));

  if (readingWindowDays !== undefined)
    s.readingWindowDays = Math.min(31, Math.max(1, Number(readingWindowDays)));

  await s.save();
  res.json(s);
});

export default router;
