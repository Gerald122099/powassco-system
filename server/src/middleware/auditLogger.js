import AuditLog from "../models/AuditLog.js";

// Records every mutating API call (after it completes, so the authenticated
// user set by requireAuth is available). Read-only GETs are not logged.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REDACT = new Set(["password", "passwordHash", "token", "newPassword", "currentPassword", "confirmPassword"]);

const LABELS = [
  [/^\/api\/auth\/login/, "Logged in"],
  [/^\/api\/users/, "User account"],
  [/^\/api\/water\/readings\/batch/, "Batch reading save"],
  [/^\/api\/water\/batches\/import/, "Reading import (mobile)"],
  [/^\/api\/water\/readings/, "Meter reading"],
  [/^\/api\/water\/bills/, "Water bill"],
  [/^\/api\/water\/payments/, "Water payment"],
  [/^\/api\/water\/members/, "Water member"],
  [/^\/api\/water\/settings/, "Water settings"],
  [/^\/api\/water\/batches/, "Reading batch"],
  [/^\/api\/loan\/applications\/[^/]+\/payments/, "Loan payment"],
  [/^\/api\/loan\/applications\/[^/]+\/status/, "Loan status change"],
  [/^\/api\/loan\/applications/, "Loan application"],
  [/^\/api\/loan\/settings/, "Loan settings"],
  [/^\/api\/expenses/, "Expense"],
  [/^\/api\/employees/, "Employee"],
  [/^\/api\/payroll\/settings/, "Payroll settings"],
  [/^\/api\/payroll/, "Payroll"],
];

function labelFor(method, path) {
  if (/^\/api\/auth\/login/.test(path)) return "Logged in";
  const verb = method === "POST" ? "Create" : method === "DELETE" ? "Delete" : "Update";
  const hit = LABELS.find(([re]) => re.test(path));
  return hit ? `${verb}: ${hit[1]}` : `${verb} ${path}`;
}

function sanitize(body) {
  if (!body || typeof body !== "object") return undefined;
  const out = {};
  for (const k of Object.keys(body)) {
    if (REDACT.has(k)) continue;
    const v = body[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "object") out[k] = Array.isArray(v) ? `[${v.length} item(s)]` : "{…}";
    else out[k] = String(v).slice(0, 100);
  }
  return Object.keys(out).length ? out : undefined;
}

export function auditLogger(req, res, next) {
  if (!MUTATING.has(req.method) || !req.path.startsWith("/api/")) return next();

  const meta = sanitize(req.body);
  const isLogin = /^\/api\/auth\/login/.test(req.path);

  res.on("finish", () => {
    // Only record actions tied to a known actor (authenticated, or a login attempt).
    if (!req.user && !isLogin) return;
    const actorName = req.user?.fullName || req.body?.employeeId || "unknown";
    AuditLog.create({
      actorId: String(req.user?.id || req.user?._id || ""),
      actorName,
      actorRole: req.user?.role || (isLogin ? "auth" : ""),
      method: req.method,
      path: (req.originalUrl || req.path).split("?")[0],
      action: labelFor(req.method, req.path),
      statusCode: res.statusCode,
      ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
      meta,
    }).catch(() => {});
  });

  next();
}
