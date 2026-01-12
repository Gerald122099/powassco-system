import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).select("-passwordHash");
  res.json(users);
});

const createSchema = z.object({
  employeeId: z.string().min(2),
  fullName: z.string().min(2),
  role: z.enum(["admin", "water_bill_officer", "loan_officer", "meter_reader"]),
  password: z.string().min(6),
  status: z.enum(["active", "inactive"]).optional()
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const exists = await User.findOne({ employeeId: parsed.data.employeeId });
  if (exists) return res.status(409).json({ message: "Employee ID already exists" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await User.create({
    employeeId: parsed.data.employeeId,
    fullName: parsed.data.fullName,
    role: parsed.data.role,
    passwordHash,
    status: parsed.data.status || "active"
  });

  res.status(201).json({ id: user._id });
});

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  role: z.enum(["admin", "water_bill_officer", "loan_officer", "meter_reader"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  password: z.string().min(6).optional()
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

  const updates = { ...parsed.data };
  if (updates.password) {
    updates.passwordHash = await bcrypt.hash(updates.password, 10);
    delete updates.password;
  }

  await User.findByIdAndUpdate(req.params.id, updates);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
