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
  [/^\/api\/expenses\/[^/]+\/approve/, "Expense approval"],
  [/^\/api\/expenses\/[^/]+\/reject/, "Expense rejection"],
  [/^\/api\/expenses\/[^/]+\/disburse/, "Cash disbursement"],
  [/^\/api\/expenses/, "Expense"],
  [/^\/api\/employees/, "Employee"],
  [/^\/api\/payroll\/settings/, "Payroll settings"],
  [/^\/api\/payroll/, "Payroll"],
  [/^\/api\/adjustments\/[^/]+\/approve/, "Balance adjustment approval"],
  [/^\/api\/adjustments\/[^/]+\/reject/, "Balance adjustment rejection"],
  [/^\/api\/adjustments/, "Balance adjustment request"],
  [/^\/api\/savings\/settings/, "Savings settings"],
  [/^\/api\/savings\/open/, "Savings account open"],
  [/^\/api\/savings\/deposit/, "Savings deposit"],
  [/^\/api\/savings\/withdraw/, "Savings withdrawal"],
  [/^\/api\/savings\/[^/]+\/reset-pin/, "Savings PIN reset"],
  [/^\/api\/savings\/[^/]+\/close/, "Savings account close"],
  [/^\/api\/cashier\/pay-water/, "Water payment (cashier)"],
  [/^\/api\/cashier\/pay-loan/, "Loan payment (cashier)"],
  [/^\/api\/bookkeeper\/product-applications/, "Product transaction"],
  [/^\/api\/bookkeeper\/product-catalog/, "Product catalog"],
  [/^\/api\/admin\/maintenance/, "Maintenance run"],
  [/^\/api\/admin\/data-reset/, "DATA RESET"],
];

function labelFor(method, path) {
  if (/^\/api\/auth\/login/.test(path)) return "Logged in";
  if (/^\/api\/auth\/logout/.test(path)) return "Logged out";
  if (/^\/api\/auth\/2fa\/enable/.test(path)) return "Enabled 2FA";
  if (/^\/api\/auth\/2fa\/disable/.test(path)) return "Disabled 2FA";
  if (/^\/api\/auth\/2fa\/admin\/reset/.test(path)) return "Admin reset a user's 2FA";
  if (/^\/api\/auth\/2fa\/recovery-codes|^\/api\/auth\/2fa\/admin\/recovery-codes/.test(path)) return "Generated recovery codes";
  const verb = method === "POST" ? "Create" : method === "DELETE" ? "Delete" : "Update";
  const hit = LABELS.find(([re]) => re.test(path));
  return hit ? `${verb}: ${hit[1]}` : `${verb} ${path}`;
}

function categoryFor(path) {
  if (/^\/api\/auth\/(login|logout)/.test(path)) return "session";
  if (/^\/api\/auth\/2fa|^\/api\/auth\/recover|^\/api\/auth\/reset-password|^\/api\/users|reset-pin/.test(path)) return "security";
  return "general";
}

// Verb category — drives the colored badge in the Audit Log panel.
// "adjust"/"approve"/"payment"/"delete" are the crucial ones the
// operator wants to spot at a glance; insert/update are routine.
function actionKindFor(method, path) {
  if (/\/approve$/.test(path)) return "approve";
  if (/\/reject$/.test(path)) return "reject";
  if (/^\/api\/adjustments/.test(path)) return "adjust";
  if (/^\/api\/admin\/maintenance|^\/api\/admin\/data-reset/.test(path)) return "adjust";
  if (/pay-water|pay-loan|\/payments|\/deposit|\/withdraw|\/disburse/.test(path)) return "payment";
  if (method === "DELETE") return "delete";
  if (method === "POST") return "insert";
  return "update"; // PUT / PATCH
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
      category: categoryFor(req.path),
      actionKind: actionKindFor(req.method, req.path),
      statusCode: res.statusCode,
      ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(),
      meta,
    }).catch(() => {});
  });

  next();
}
