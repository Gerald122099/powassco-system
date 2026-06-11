import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { Users, Settings, BarChart3, Banknote, Wallet, FileBarChart, UserCog, ScrollText, ShieldCheck, Inbox, CalendarClock, Megaphone, Boxes, CreditCard, ReceiptText, AlertTriangle, MapPin, Wrench, PiggyBank } from "lucide-react";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import MembersPanel from "../water/panels/MembersPanel";
import MeterMapPanel from "../water/panels/MeterMapPanel";
import DangerZonePanel from "./DangerZonePanel";
import MaintenancePanel from "./MaintenancePanel";
import SavingsSettingsPanel from "./SavingsSettingsPanel";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import WaterSettingsPanel from "./WaterSettingsPanel";
import AnalyticsPanel from "../water/panels/AnalyticsPanel";
import LoanAnalyticsPanel from "../loan/panels/LoanAnalyticsPanel";
import ExpensesPanel from "./ExpensesPanel";
import ReportsPanel from "./ReportsPanel";
import EmployeesPanel from "./EmployeesPanel";
import AuditLogPanel from "./AuditLogPanel";
import SecurityPanel from "./SecurityPanel";
import RequestsPanel from "./RequestsPanel";
import MeetingsPanel from "./MeetingsPanel";
import AnnouncementsPanel from "./AnnouncementsPanel";
import AssetsPanel from "./AssetsPanel";
import PaymentSettingsPanel from "./PaymentSettingsPanel";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "water_bill_officer", label: "Water Bill Officer" },
  { value: "loan_officer", label: "Loan Officer" },
  { value: "meter_reader", label: "Meter Reader (office)" },
  { value: "plumber", label: "Plumber (field reader)" },
  { value: "cashier", label: "Cashier (collects payments)" },
  { value: "bookkeeper", label: "Bookkeeper (transactions + CBU + product loans)" },
];

function roleLabel(role) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

function RoleBadge({ role }) {
  const styles =
    role === "admin"
      ? "bg-slate-900 text-white border-slate-900"
      : role === "water_bill_officer"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : role === "loan_officer"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-purple-50 text-purple-700 border-purple-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${styles}`}>
      {roleLabel(role)}
    </span>
  );
}

function StatusPill({ status }) {
  const active = status === "active";
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold",
        active ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-700",
      ].join(" ")}
    >
      <span className={["h-2 w-2 rounded-full", active ? "bg-green-500" : "bg-slate-500"].join(" ")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function IconButton({ children, onClick, tone = "default", title }) {
  const base =
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition hover:shadow-sm";
  const variant =
    tone === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : tone === "primary"
      ? "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700"
      : "border-slate-200 text-slate-700 hover:bg-slate-50";

  return (
    <button className={`${base} ${variant}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

// UPDATED: Admin Tabs with Analytics
const adminNavItems = [
  { key: "users", label: "User Management", icon: Users, desc: "Create employees, assign roles, manage accounts" },
  { key: "members", label: "Water Members", icon: UserCog, desc: "View, edit, and delete water member accounts" },
  { key: "metermap", label: "Meter Map", icon: MapPin, desc: "Map of every meter pinned by field plumbers — colour-coded by status" },
  { key: "water", label: "Water Settings", icon: Settings, desc: "Tariffs, due dates, penalties, and discounts" },
  { key: "analytics", label: "Water Analytics", icon: BarChart3, desc: "Water billing analytics and summaries" },
  { key: "loans", label: "Loan Analytics", icon: Banknote, desc: "Capital, interest profit, collections, and outstanding" },
  { key: "collections", label: "Overall Collections", icon: ReceiptText, desc: "Combined water + loan daily collection — per-collector audit" },
  { key: "expenses", label: "Expenses", icon: Wallet, desc: "Log pipe repairs, utilities, office costs, and disbursements" },
  { key: "employees", label: "Employees", icon: UserCog, desc: "Register staff, profiles, positions, and salary rates" },
  { key: "reports", label: "Reports", icon: FileBarChart, desc: "Financial reports across expenses and loans" },
  { key: "audit", label: "Audit Log", icon: ScrollText, desc: "System activity — who did what, and when" },
  { key: "requests", label: "Requests", icon: Inbox, desc: "New connection & reconnection requests from the public" },
  { key: "meetings", label: "Calendar & Events", icon: CalendarClock, desc: "Schedule meetings & events shown on staff dashboards" },
  { key: "announcements", label: "Announcements", icon: Megaphone, desc: "Post announcements to the public homepage" },
  { key: "assets", label: "Inventory", icon: Boxes, desc: "Equipment & device inventory with 6-month audits" },
  { key: "payments", label: "Payments", icon: CreditCard, desc: "Online payment mode, QR PH, and transaction fee" },
  { key: "security", label: "Security", icon: ShieldCheck, desc: "Two-factor authentication and access controls" },
  { key: "savings-settings", label: "Savings Policy", icon: PiggyBank, desc: "Interest, minimum balance, opening fee for voluntary savings" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, desc: "One-shot data fixes (e.g. regen amortization on imported loans)" },
  { key: "danger", label: "Danger Zone", icon: AlertTriangle, desc: "Reset operational data — keeps users, employees, settings" },
];

export default function AdminDashboard() {
  const { token, user } = useAuth();

  const [activeTab, setActiveTab] = useState("users"); // Default to users tab
  
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    employeeId: "",
    fullName: "",
    role: "water_bill_officer",
    status: "active",
    password: "",
  });

  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  // App-entry PIN management for the plumber (field reader). Admin only.
  const [pinTarget, setPinTarget] = useState(null);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch("/users", { token });
      setUsers(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "users") {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;

    return users.filter((u) => {
      const emp = String(u.employeeId || "").toLowerCase();
      const name = String(u.fullName || "").toLowerCase();
      const role = String(u.role || "").toLowerCase();
      return emp.includes(t) || name.includes(t) || role.includes(t);
    });
  }, [users, q]);

  function openAdd() {
    setEditing(null);
    setForm({
      employeeId: "",
      fullName: "",
      role: "water_bill_officer",
      status: "active",
      password: "",
    });
    setErr("");
    setModalOpen(true);
  }

  function openEdit(u) {
    setEditing(u);
    setForm({
      employeeId: u.employeeId || "",
      fullName: u.fullName || "",
      role: u.role || "water_bill_officer",
      status: u.status || "active",
      password: "",
    });
    setErr("");
    setModalOpen(true);
  }

  async function save() {
    setErr("");

    const employeeId = form.employeeId.trim();
    const fullName = form.fullName.trim();

    if (!employeeId || !fullName) {
      setErr("Employee ID and Full Name are required.");
      return;
    }

    if (!editing && form.password.trim().length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    try {
      if (!editing) {
        await apiFetch("/users", {
          method: "POST",
          token,
          body: {
            employeeId,
            fullName,
            role: form.role,
            status: form.status,
            password: form.password,
          },
        });
        setToast("✅ User created");
      } else {
        const payload = {
          fullName,
          role: form.role,
          status: form.status,
        };
        if (form.password.trim()) payload.password = form.password.trim();

        await apiFetch(`/users/${editing._id}`, {
          method: "PUT",
          token,
          body: payload,
        });
        setToast("✅ User updated");
      }

      setModalOpen(false);
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeUser(u) {
    if (u.employeeId === user?.employeeId) {
      alert("You cannot delete your own account while logged in.");
      return;
    }
    const ok = confirm(`Delete ${u.employeeId} (${u.fullName})?`);
    if (!ok) return;

    try {
      await apiFetch(`/users/${u._id}`, { method: "DELETE", token });
      setToast("🗑️ User deleted");
      await load();
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <DashboardLayout
      title="Admin"
      accent="slate"
      items={adminNavItems}
      active={activeTab}
      onSelect={setActiveTab}
    >
      {toast && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {toast}
        </div>
      )}

      <div className="mt-6">
        {/* User Management Tab */}
        {activeTab === "users" && (
          <Card>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-black text-slate-900">User Accounts</div>
                <div className="text-xs text-slate-600 mt-1">
                  Create employees, assign roles, activate/deactivate accounts, and reset passwords.
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search Employee ID / Name / Role"
                    className="w-full sm:w-96 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    ⌘K
                  </div>
                </div>

                <IconButton tone="primary" onClick={openAdd} title="Add new user">
                  + Add User
                </IconButton>

                <IconButton onClick={load} title="Refresh list">
                  ↻
                </IconButton>
              </div>
            </div>

            {err && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {err}
              </div>
            )}

            <div className="mt-4 overflow-auto rounded-2xl border border-slate-100 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-600">
                        Loading users...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-600">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u._id} className="border-t hover:bg-slate-50/60">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center">
                              {String(u.fullName || u.employeeId || "U")
                                .trim()
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{u.fullName}</div>
                              <div className="text-xs text-slate-600">{u.employeeId}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <RoleBadge role={u.role} />
                        </td>

                        <td className="py-3 px-4">
                          <StatusPill status={u.status} />
                        </td>

                        <td className="py-3 px-4 text-right space-x-2">
                          <IconButton onClick={() => openEdit(u)} title="Edit user">
                            Edit
                          </IconButton>
                          <IconButton onClick={() => setPinTarget(u)} title="Set / clear app PIN">
                            PIN
                          </IconButton>
                          <IconButton tone="danger" onClick={() => removeUser(u)} title="Delete user">
                            Delete
                          </IconButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Tip: You can search by role keywords like <b>admin</b> or <b>meter</b>.
            </div>
          </Card>
        )}

        {/* Water Members Tab — full CRUD; admin bypasses the dual-control gate */}
        {activeTab === "members" && <MembersPanel />}
        {activeTab === "metermap" && <MeterMapPanel />}

        {/* Water Settings Tab */}
        {activeTab === "water" && <WaterSettingsPanel />}

        {/* Analytics Tab - ADD THIS */}
        {activeTab === "analytics" && <AnalyticsPanel />}

        {/* Loan Analytics Tab */}
        {activeTab === "loans" && <LoanAnalyticsPanel />}

        {/* Overall Collections Tab — combined water + loan daily total */}
        {activeTab === "collections" && <CollectionTodayPanel module="all" />}

        {/* Expenses Tab */}
        {activeTab === "expenses" && <ExpensesPanel />}

        {/* Employees Tab */}
        {activeTab === "employees" && <EmployeesPanel />}

        {/* Reports Tab */}
        {activeTab === "reports" && <ReportsPanel />}

        {/* Audit Log Tab */}
        {activeTab === "audit" && <AuditLogPanel />}

        {/* Security / 2FA Tab */}
        {activeTab === "security" && <SecurityPanel />}

        {/* Service Requests Tab */}
        {activeTab === "requests" && <RequestsPanel />}

        {/* Meetings Tab */}
        {activeTab === "meetings" && <MeetingsPanel />}

        {/* Announcements Tab */}
        {activeTab === "announcements" && <AnnouncementsPanel />}

        {/* Asset Inventory Tab */}
        {activeTab === "assets" && <AssetsPanel />}

        {/* Payment Settings Tab */}
        {activeTab === "payments" && <PaymentSettingsPanel />}

        {/* Danger Zone — irreversible data reset (admin + password + 2FA) */}
        {activeTab === "savings-settings" && <SavingsSettingsPanel />}
        {activeTab === "maintenance" && <MaintenancePanel />}
        {activeTab === "danger" && <DangerZonePanel />}
      </div>

      {/* User Add/Edit Modal */}
      <Modal open={modalOpen} title={editing ? "Edit User" : "Add User"} onClose={() => setModalOpen(false)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Employee ID">
            <input
              disabled={!!editing}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-100"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              placeholder="e.g. EMP001"
            />
          </Field>

          <Field label="Full Name">
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="e.g. Juan Dela Cruz"
            />
          </Field>

          <Field label="Role">
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </Field>

          <div className="md:col-span-2">
            <Field label={editing ? "New Password (optional)" : "Password"}>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? "Leave blank to keep current" : "Minimum 6 characters"}
              />
            </Field>
            <div className="text-xs text-slate-500 mt-1">
              {editing ? "Leave password empty to keep the current one." : "Default suggestion: Admin@123 (change later)."}
            </div>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">
            {err}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button
            className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold hover:bg-emerald-700"
            onClick={save}
          >
            Save
          </button>
        </div>
      </Modal>

      {/* PIN management modal — set or clear the 4-digit app-entry PIN
          on any user. Admin-only. The PIN is used by the Plumber
          dashboard's AppPinLock screen. */}
      <Modal open={!!pinTarget} title={pinTarget ? `App PIN — ${pinTarget.fullName}` : ""} subtitle={pinTarget?.appPinHash ? "PIN is currently set." : "No PIN set on this account."} onClose={() => { setPinTarget(null); setPinValue(""); }} size="sm">
        {pinTarget && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              When a PIN is set, this user must enter it every time they re-open the app (after closing the tab). Use this primarily for plumber (field reader) accounts on shared phones.
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">New 4-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-2xl font-bold tracking-[0.5em]"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={async () => {
                  if (!confirm(`Clear PIN for ${pinTarget.fullName}? They'll no longer be prompted on app open.`)) return;
                  setPinBusy(true);
                  try {
                    await apiFetch(`/auth/admin/pin/${pinTarget._id}`, { method: "DELETE", token });
                    setToast("PIN cleared");
                    setTimeout(() => setToast(""), 2200);
                    setPinTarget(null); setPinValue("");
                  } catch (e) { setErr(e.message); }
                  finally { setPinBusy(false); }
                }}
                disabled={pinBusy || !pinTarget.appPinHash}
                className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-40"
              >
                Clear PIN
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => { setPinTarget(null); setPinValue(""); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
                <button
                  onClick={async () => {
                    if (!/^\d{4}$/.test(pinValue)) return setErr("PIN must be exactly 4 digits.");
                    setPinBusy(true);
                    try {
                      await apiFetch(`/auth/admin/pin/${pinTarget._id}`, { method: "POST", token, body: { pin: pinValue } });
                      setToast(`PIN set for ${pinTarget.fullName}`);
                      setTimeout(() => setToast(""), 2200);
                      setPinTarget(null); setPinValue("");
                    } catch (e) { setErr(e.message); }
                    finally { setPinBusy(false); }
                  }}
                  disabled={pinBusy || pinValue.length !== 4}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pinBusy ? "Saving…" : pinTarget.appPinHash ? "Replace PIN" : "Set PIN"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}