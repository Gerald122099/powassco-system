import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import User from "../models/User.js";

const router = express.Router();

const loginSchema = z.object({
  employeeId: z.string().min(2),
  password: z.string().min(4)
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const { employeeId, password } = parsed.data;

  const user = await User.findOne({ employeeId });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.status !== "active") {
    return res.status(403).json({ message: "Account inactive" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      employeeId: user.employeeId
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: {
      id: user._id,
      employeeId: user.employeeId,
      fullName: user.fullName,
      role: user.role
    }
  });
});

export default router;
