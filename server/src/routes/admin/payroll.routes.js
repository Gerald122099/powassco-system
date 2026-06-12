import express from "express";
import Payroll from "../../models/Payroll.js";
import PayrollSettings from "../../models/PayrollSettings.js";
import Employee from "../../models/Employee.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { computePayroll } from "../../utils/payrollCompute.js";

const router = express.Router();
// Bookkeeper now owns payroll day-to-day; admin retains full access.
const guard = [requireAuth, requireRole(["admin", "bookkeeper"])];

async function getSettings() {
  let s = await PayrollSettings.findOne();
  if (!s) s = await PayrollSettings.create({});
  return s;
}

function cleanLines(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((l) => ({ label: String(l.label || "").trim(), amount: Number(l.amount) || 0 }))
    .filter((l) => l.label || l.amount);
}

// ---- Settings ----
router.get("/settings", guard, async (req, res) => res.json(await getSettings()));
router.put("/settings", guard, async (req, res) => {
  const s = await getSettings();
  for (const k of ["sss", "philhealth", "pagibig", "withholding"]) if (k in req.body) s[k] = req.body[k];
  s.updatedBy = req.user?.fullName || req.user?.employeeId || "";
  await s.save();
  res.json(s);
});

// ---- Compute preview (no save) ----
router.post("/compute", guard, async (req, res) => {
  const settings = await getSettings();
  const result = computePayroll({
    basicPay: Number(req.body.basicPay) || 0,
    overtimePay: Number(req.body.overtimePay) || 0,
    allowances: cleanLines(req.body.allowances),
    otherDeductions: cleanLines(req.body.otherDeductions),
    settings,
  });
  res.json(result);
});

// ---- List ----
router.get("/", requireAuth, requireRole(["admin", "manager", "bookkeeper", "cashier"]), async (req, res) => {
  const { employee = "", status = "", from = "", to = "", page = "1", limit = "15" } = req.query;
  const filter = {};
  if (employee) filter.employee = employee;
  if (status) filter.status = status;
  if (from || to) {
    filter.periodEnd = {};
    if (from) filter.periodEnd.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.periodEnd.$lte = end;
    }
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const [items, total] = await Promise.all([
    Payroll.find(filter).sort({ payDate: -1, createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    Payroll.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, limit: lim });
});

// ---- Summary ----
router.get("/summary", guard, async (req, res) => {
  const { from = "", to = "" } = req.query;
  const match = {};
  if (from || to) {
    match.periodEnd = {};
    if (from) match.periodEnd.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      match.periodEnd.$lte = end;
    }
  }
  const [t] = await Payroll.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        gross: { $sum: "$grossPay" },
        net: { $sum: "$netPay" },
        sss: { $sum: "$sss" },
        philhealth: { $sum: "$philhealth" },
        pagibig: { $sum: "$pagibig" },
        withholdingTax: { $sum: "$withholdingTax" },
        totalDeductions: { $sum: "$totalDeductions" },
      },
    },
  ]);
  res.json({
    count: t?.count || 0,
    gross: t?.gross || 0,
    net: t?.net || 0,
    sss: t?.sss || 0,
    philhealth: t?.philhealth || 0,
    pagibig: t?.pagibig || 0,
    withholdingTax: t?.withholdingTax || 0,
    totalDeductions: t?.totalDeductions || 0,
  });
});

router.get("/:id", guard, async (req, res) => {
  const p = await Payroll.findById(req.params.id).lean();
  if (!p) return res.status(404).json({ message: "Payslip not found." });
  res.json(p);
});

// ---- Create payslip ----
router.post("/", guard, async (req, res) => {
  const b = req.body || {};
  const emp = await Employee.findById(b.employee);
  if (!emp) return res.status(400).json({ message: "Select a valid employee." });
  if (!b.periodStart || !b.periodEnd) return res.status(400).json({ message: "Pay period is required." });

  const settings = await getSettings();
  const allowances = cleanLines(b.allowances);
  const otherDeductions = cleanLines(b.otherDeductions);
  const c = computePayroll({
    basicPay: Number(b.basicPay) || 0,
    overtimePay: Number(b.overtimePay) || 0,
    allowances,
    otherDeductions,
    settings,
  });

  const slip = await Payroll.create({
    employee: emp._id,
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode || "",
    position: emp.position || "",
    periodStart: new Date(b.periodStart),
    periodEnd: new Date(b.periodEnd),
    payDate: b.payDate ? new Date(b.payDate) : new Date(),
    rateType: emp.rateType,
    rate: emp.rate,
    daysWorked: Number(b.daysWorked) || 0,
    basicPay: c.basicPay,
    overtimePay: c.overtimePay,
    allowances,
    grossPay: c.grossPay,
    sss: c.sss,
    philhealth: c.philhealth,
    pagibig: c.pagibig,
    withholdingTax: c.withholdingTax,
    otherDeductions,
    totalDeductions: c.totalDeductions,
    netPay: c.netPay,
    recordedBy: req.user?.fullName || req.user?.employeeId || "",
    notes: b.notes || "",
    type: "regular",
    status: "pending", // manager approves, then cashier disburses
  });
  res.status(201).json(slip);
});

// Employee cash advance — same approval chain, netPay = the advance.
// Recovered later via otherDeductions on a future payslip.
router.post("/cash-advance", requireAuth, requireRole(["admin", "manager", "bookkeeper"]), async (req, res) => {
  const b = req.body || {};
  const emp = await Employee.findById(b.employee);
  if (!emp) return res.status(400).json({ message: "Select a valid employee." });
  const amount = Math.round((Number(b.amount) + Number.EPSILON) * 100) / 100;
  if (!(amount > 0)) return res.status(400).json({ message: "Amount must be > 0." });
  const now = new Date();
  const slip = await Payroll.create({
    employee: emp._id,
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode || "",
    position: emp.position || "",
    periodStart: now,
    periodEnd: now,
    payDate: now,
    rateType: emp.rateType,
    rate: emp.rate,
    grossPay: amount,
    netPay: amount,
    recordedBy: req.user?.fullName || req.user?.employeeId || "",
    notes: b.notes || "Cash advance",
    type: "cash_advance",
    status: "pending",
  });
  res.status(201).json(slip);
});

// Manager approval (first signature) / rejection.
router.post("/:id/approve", requireAuth, requireRole(["admin", "manager"]), async (req, res) => {
  const p = await Payroll.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    { $set: { status: "approved", approvedBy: req.user?.fullName || "", approvedAt: new Date() } },
    { new: true }
  );
  if (!p) return res.status(409).json({ message: "Payslip is not pending." });
  res.json(p);
});
router.post("/:id/reject", requireAuth, requireRole(["admin", "manager"]), async (req, res) => {
  const p = await Payroll.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    { $set: { status: "rejected", rejectedBy: req.user?.fullName || "", rejectNote: String(req.body?.note || "").trim() } },
    { new: true }
  );
  if (!p) return res.status(409).json({ message: "Payslip is not pending." });
  res.json(p);
});

router.delete("/:id", guard, async (req, res) => {
  const p = await Payroll.findByIdAndDelete(req.params.id);
  if (!p) return res.status(404).json({ message: "Payslip not found." });
  res.json({ ok: true });
});

export default router;
