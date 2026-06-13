import io

def patch(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    for a, b in pairs:
        assert a in s, f"anchor missing in {path}: {a[:60]}"
        s = s.replace(a, b)
    io.open(path, "w", encoding="utf-8").write(s)

# 1) User model enum
patch("src/models/User.js", [(
 'enum: ["admin", "manager", "water_bill_officer", "loan_officer", "meter_reader", "plumber", "cashier", "bookkeeper"],',
 'enum: ["admin", "manager", "audit_committee", "water_bill_officer", "loan_officer", "meter_reader", "plumber", "cashier", "bookkeeper"],')])

# 2) users.routes zod enums (create + update — the manager bug taught us)
s = io.open("src/routes/users.routes.js", encoding="utf-8").read()
s = s.replace('z.enum(["admin", "manager", "water_bill_officer", "loan_officer", "meter_reader", "plumber", "cashier", "bookkeeper"])',
'z.enum(["admin", "manager", "audit_committee", "water_bill_officer", "loan_officer", "meter_reader", "plumber", "cashier", "bookkeeper"])')
io.open("src/routes/users.routes.js", "w", encoding="utf-8").write(s)

# 3) Read guards — audit_committee is VIEW-ONLY everywhere.
# bookkeeper transactions feed (inline guard)
patch("src/routes/bookkeeper.routes.js", [
 ('router.get("/transactions", requireAuth, requireRole(["admin", "manager", "bookkeeper", "cashier"]), async (req, res) => {',
  'router.get("/transactions", requireAuth, requireRole(["admin", "manager", "audit_committee", "bookkeeper", "cashier"]), async (req, res) => {'),
 # product analytics gets its own inline guard (the module guard also covers writes)
 ('router.get("/product-analytics", ...guard, async (req, res) => {',
  'router.get("/product-analytics", requireAuth, requireRole(["admin", "manager", "audit_committee", "bookkeeper"]), async (req, res) => {'),
])

# collections/today
patch("src/routes/collections.routes.js", [(
 'requireRole(["admin", "manager", "cashier", "water_bill_officer", "loan_officer"])',
 'requireRole(["admin", "manager", "audit_committee", "cashier", "water_bill_officer", "loan_officer"])')])

# loan collections-summary (inline) + summary gets inline read guard
patch("src/routes/loan/loans.routes.js", [
 ('router.get("/collections-summary", requireAuth, requireRole(["admin", "manager", "loan_officer", "bookkeeper"]), async (req, res) => {',
  'router.get("/collections-summary", requireAuth, requireRole(["admin", "manager", "audit_committee", "loan_officer", "bookkeeper"]), async (req, res) => {'),
 ('router.get("/summary", guard, async (req, res) => {',
  'router.get("/summary", requireAuth, requireRole(["admin", "manager", "audit_committee", "loan_officer", "bookkeeper"]), async (req, res) => {'),
])

# water analytics
patch("src/routes/water/waterAnalytics.routes.js", [(
 'const guard = [requireAuth, requireRole(["admin", "manager", "water_bill_officer", "meter_reader"])];',
 'const guard = [requireAuth, requireRole(["admin", "manager", "audit_committee", "water_bill_officer", "meter_reader"])];')])

# treasury view guard (writes are blocked inside: filer + approver role checks)
patch("src/routes/treasury.routes.js", [(
 'const viewGuard = [requireAuth, requireRole(["admin", "manager", "bookkeeper", "cashier"])];',
 'const viewGuard = [requireAuth, requireRole(["admin", "manager", "audit_committee", "bookkeeper", "cashier"])];')])

# drawer summary
patch("src/routes/cashier.routes.js", [(
 'router.get("/drawer-summary", requireAuth, requireRole(["admin", "manager", "cashier", "bookkeeper"]), async (req, res) => {',
 'router.get("/drawer-summary", requireAuth, requireRole(["admin", "manager", "audit_committee", "cashier", "bookkeeper"]), async (req, res) => {')])

# audit log read (NOT reset — that stays admin-only)
patch("src/routes/admin/audit.routes.js", [(
 'router.get("/", guard, async (req, res) => {',
 'router.get("/", requireAuth, requireRole(["admin", "audit_committee"]), async (req, res) => {')])

# expenses read (list/summary) for oversight
patch("src/routes/admin/expenses.routes.js", [
 ('const readGuard = [requireAuth, requireRole(["admin", "manager", "bookkeeper", "cashier"])];',
  'const readGuard = [requireAuth, requireRole(["admin", "manager", "audit_committee", "bookkeeper", "cashier"])];'),
 ('router.get("/summary", guard, async (req, res) => {',
  'router.get("/summary", readGuard, async (req, res) => {'),
])
print("guards ok")
