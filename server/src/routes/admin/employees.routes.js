import express from "express";
import Employee, { EMPLOYEE_POSITIONS } from "../../models/Employee.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";

const router = express.Router();
// Bookkeeper runs payroll, which needs employee read access. Writes
// (create/update/delete) remain admin-only via the writeGuard below.
const guard = [requireAuth, requireRole(["admin", "manager", "bookkeeper"])];
const writeGuard = [requireAuth, requireRole(["admin", "manager"])];

async function nextEmployeeCode() {
  const last = await Employee.findOne({ employeeCode: /^EMP-\d+$/ }).sort({ createdAt: -1 }).lean();
  let n = 1;
  if (last?.employeeCode) {
    const m = last.employeeCode.match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `EMP-${String(n).padStart(4, "0")}`;
}

router.get("/positions", guard, (req, res) => res.json(EMPLOYEE_POSITIONS));

router.get("/", guard, async (req, res) => {
  const { q = "", status = "", position = "", page = "1", limit = "20" } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (position) filter.position = position;
  if (q) {
    const rx = new RegExp(String(q).trim(), "i");
    filter.$or = [{ fullName: rx }, { employeeCode: rx }, { position: rx }, { contactNo: rx }];
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ fullName: 1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Employee.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, limit: lim });
});

router.get("/:id", guard, async (req, res) => {
  const emp = await Employee.findById(req.params.id).lean();
  if (!emp) return res.status(404).json({ message: "Employee not found." });
  res.json(emp);
});

router.post("/", writeGuard, async (req, res) => {
  const b = req.body || {};
  if (!b.fullName || !String(b.fullName).trim()) return res.status(400).json({ message: "Full name is required." });
  const employeeCode = b.employeeCode?.trim() || (await nextEmployeeCode());
  const emp = await Employee.create({ ...b, employeeCode, fullName: String(b.fullName).trim() });
  res.status(201).json(emp);
});

router.put("/:id", writeGuard, async (req, res) => {
  const allow = [
    "employeeCode", "fullName", "position", "department", "sex", "civilStatus", "birthDate",
    "contactNo", "email", "address", "tin", "sssNo", "philhealthNo", "pagibigNo",
    "dateHired", "employmentType", "status", "rateType", "rate", "notes",
  ];
  const update = {};
  for (const k of allow) if (k in req.body) update[k] = req.body[k];
  const emp = await Employee.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!emp) return res.status(404).json({ message: "Employee not found." });
  res.json(emp);
});

router.delete("/:id", writeGuard, async (req, res) => {
  const emp = await Employee.findByIdAndDelete(req.params.id);
  if (!emp) return res.status(404).json({ message: "Employee not found." });
  res.json({ ok: true });
});

export default router;
