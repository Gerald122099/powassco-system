// Idle lock screen — after 30 minutes without activity the dashboard
// blanks behind a full-screen PIN gate. Mounted once in DashboardLayout
// so every office dashboard (admin, manager, water, loan, cashier,
// bookkeeper) gets it automatically.
//
// PIN = the account's appPin (same one the field app uses). First lock
// with no PIN set walks the user through creating one. The last-activity
// timestamp persists in localStorage so refreshing the page can't
// bypass the lock; signing out fully is always available as an escape.

import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Lock, LogOut } from "lucide-react";

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = "pow_last_activity";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

export default function IdleLock() {
  const { token, user, logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(null); // null = unknown
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const lastRef = useRef(Date.now());
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  // Activity tracking — throttled writes to localStorage (every 15s)
  // so a busy cashier doesn't hammer storage on every mousemove.
  useEffect(() => {
    if (!token) return;
    let lastWrite = 0;
    const bump = () => {
      if (lockedRef.current) return; // activity while locked doesn't count
      lastRef.current = Date.now();
      if (Date.now() - lastWrite > 15000) {
        lastWrite = Date.now();
        try { localStorage.setItem(LAST_ACTIVITY_KEY, String(lastRef.current)); } catch { /* full */ }
      }
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    // A refresh restores the persisted timestamp — locking immediately
    // if the user walked away with the tab closed/reloaded.
    const persisted = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    if (persisted) lastRef.current = Math.min(lastRef.current, persisted);

    const check = setInterval(() => {
      if (!lockedRef.current && Date.now() - lastRef.current >= IDLE_MS) {
        setErr(""); setPin(""); setConfirm("");
        setLocked(true);
      }
    }, 30000);
    if (Date.now() - lastRef.current >= IDLE_MS) setLocked(true);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(check);
    };
  }, [token]);

  // When locked, find out whether this account has a PIN yet.
  useEffect(() => {
    if (!locked || !token) return;
    apiFetch("/auth/pin-status", { token })
      .then((r) => setHasPin(!!r.hasPin))
      .catch(() => setHasPin(true)); // assume yes — verify will tell the truth
  }, [locked, token]);

  const unlock = useCallback(() => {
    lastRef.current = Date.now();
    try { localStorage.setItem(LAST_ACTIVITY_KEY, String(lastRef.current)); } catch { /* full */ }
    setLocked(false);
    setPin(""); setConfirm(""); setErr("");
  }, []);

  async function submit(e) {
    e?.preventDefault?.();
    setErr("");
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be 4 digits."); return; }
    setBusy(true);
    try {
      if (hasPin === false) {
        if (pin !== confirm) { setErr("PINs do not match."); setBusy(false); return; }
        await apiFetch("/auth/pin-set", { method: "POST", token, body: { pin } });
        unlock();
      } else {
        await apiFetch("/auth/pin-verify", { method: "POST", token, body: { pin } });
        unlock();
      }
    } catch (e2) {
      setErr(e2.message || "Wrong PIN.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !locked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Lock size={26} />
        </div>
        <div className="mt-3 text-lg font-bold text-slate-900">Screen locked</div>
        <div className="mt-0.5 text-sm text-slate-500">
          {user?.fullName || user?.employeeId} — locked after 30 minutes of inactivity.
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {hasPin === false && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No PIN on this account yet — create one now to unlock.
            </div>
          )}
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder={hasPin === false ? "New 4-digit PIN" : "Enter your 4-digit PIN"}
            className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em]"
          />
          {hasPin === false && (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              placeholder="Confirm PIN"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em]"
            />
          )}
          {err && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>}
          <button
            disabled={busy || pin.length !== 4 || (hasPin === false && confirm.length !== 4)}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Checking…" : hasPin === false ? "Create PIN & Unlock" : "Unlock"}
          </button>
        </form>

        <button
          onClick={logout}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          <LogOut size={12} /> Sign out instead (forgot PIN? ask an admin to reset it)
        </button>
      </div>
    </div>
  );
}
