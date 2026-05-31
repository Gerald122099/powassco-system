// Dual-control modal: when a non-admin user tries to perform a sensitive
// edit, the server returns 403 ADMIN_AUTHZ_REQUIRED. The caller opens this
// modal — an admin enters their own employee ID + password + 2FA code —
// and we exchange that for a short-lived X-Admin-Authz token (10 min)
// stored in sessionStorage. The original request is retried automatically
// by api.js once the token is attached.
//
// Imperative use:
//   const ok = await openAdminAuthz();   // returns true on success
//   await apiFetch(...);                  // retry; api.js attaches header
//
// The modal is mounted once in App.jsx near <Toaster/>.
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { apiFetch, setAdminAuthzToken } from "../lib/api";
import { ShieldAlert } from "lucide-react";

let resolveOpen = null;
export function openAdminAuthz() {
  return new Promise((resolve) => {
    if (resolveOpen) { resolve(false); return; } // already open
    resolveOpen = resolve;
    window.dispatchEvent(new CustomEvent("powassco:open-admin-authz"));
  });
}

export default function AdminAuthzGate() {
  const [open, setOpen] = useState(false);
  const [adminEmployeeId, setAdminId] = useState("");
  const [adminPassword, setAdminPw] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const handler = () => {
      setAdminId(""); setAdminPw(""); setAdminCode(""); setErr("");
      setOpen(true);
    };
    window.addEventListener("powassco:open-admin-authz", handler);
    return () => window.removeEventListener("powassco:open-admin-authz", handler);
  }, []);

  function close(success) {
    setOpen(false);
    if (resolveOpen) { resolveOpen(!!success); resolveOpen = null; }
  }

  async function submit(e) {
    e?.preventDefault?.();
    setErr(""); setBusy(true);
    try {
      const res = await apiFetch("/auth/admin-authz", {
        method: "POST",
        body: { adminEmployeeId: adminEmployeeId.trim(), adminPassword, adminCode: adminCode.trim() },
      });
      // Persist for this tab only; expires when tab closes.
      setAdminAuthzToken(res.authzToken, res.expiresInSeconds || 600);
      close(true);
    } catch (e2) {
      setErr(e2.message || "Authorisation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Admin authorisation required" subtitle="An admin must approve this edit." onClose={() => close(false)} size="sm">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            This is a dual-control action. The admin must enter <b>their own</b> credentials below to grant a 10-minute edit window for this session.
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Admin Employee ID</label>
          <input value={adminEmployeeId} onChange={(e) => setAdminId(e.target.value)} autoFocus className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Admin Password</label>
          <input type="password" value={adminPassword} onChange={(e) => setAdminPw(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Admin Authenticator Code (or recovery code)</label>
          <input value={adminCode} onChange={(e) => setAdminCode(e.target.value.replace(/\s/g, ""))} inputMode="numeric" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono tracking-widest text-center text-lg" placeholder="------" />
        </div>
        {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => close(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button disabled={busy || !adminEmployeeId || !adminPassword || !adminCode} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy ? "Authorising…" : "Authorise edit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
