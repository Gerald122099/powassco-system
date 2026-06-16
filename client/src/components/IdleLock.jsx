// Idle lock screen — after 30 minutes without activity the dashboard
// blanks behind a full-screen PIN gate. Mounted once in DashboardLayout
// so every office dashboard (admin, manager, water, loan, cashier,
// bookkeeper) gets it automatically.
//
// PIN = the account's appPin (same one the field app uses). First lock
// with no PIN set walks the user through creating one. The last-activity
// timestamp persists in localStorage so refreshing the page can't
// bypass the lock; signing out fully is always available as an escape.
//
// Entry is a phone-style on-screen keypad (tap the digits) that also
// accepts the physical keyboard; it auto-submits once 4 digits are in.

import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Lock, LogOut, Delete } from "lucide-react";

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = "pow_last_activity";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

// Four-dot PIN progress indicator.
function PinDots({ length, error }) {
  return (
    <div className="flex items-center justify-center gap-3.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={[
            "h-3.5 w-3.5 rounded-full border-2 transition-all duration-150",
            error
              ? "border-red-400 bg-red-400"
              : i < length
                ? "scale-110 border-emerald-600 bg-emerald-600"
                : "border-slate-300 bg-transparent",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// On-screen numeric keypad (1-9, 0, backspace).
function Keypad({ onDigit, onBackspace, disabled }) {
  const keyClass =
    "h-14 rounded-2xl bg-slate-100 text-2xl font-semibold text-slate-800 transition hover:bg-slate-200 active:scale-95 active:bg-emerald-100 disabled:opacity-40";
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)} className={keyClass}>
          {k}
        </button>
      ))}
      <span /> {/* empty bottom-left cell */}
      <button type="button" disabled={disabled} onClick={() => onDigit("0")} className={keyClass}>
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        aria-label="Backspace"
        className="flex h-14 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-100 active:scale-95 disabled:opacity-40"
      >
        <Delete size={24} />
      </button>
    </div>
  );
}

export default function IdleLock() {
  const { token, user, logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(null); // null = unknown
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState("");      // first entry during PIN creation
  const [stage, setStage] = useState("enter"); // "enter" | "confirm" (create flow)
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
        setErr(""); setPin(""); setFirst(""); setStage("enter");
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
    setPin(""); setFirst(""); setStage("enter"); setErr("");
  }, []);

  const verifyPin = useCallback(async (value) => {
    setBusy(true); setErr("");
    try {
      await apiFetch("/auth/pin-verify", { method: "POST", token, body: { pin: value } });
      unlock();
    } catch (e2) {
      setErr(e2.message || "Wrong PIN.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }, [token, unlock]);

  const setNewPin = useCallback(async (value) => {
    setBusy(true); setErr("");
    try {
      await apiFetch("/auth/pin-set", { method: "POST", token, body: { pin: value } });
      unlock();
    } catch (e2) {
      setErr(e2.message || "Could not set PIN.");
      setPin(""); setFirst(""); setStage("enter");
    } finally {
      setBusy(false);
    }
  }, [token, unlock]);

  // Append a digit, then act once 4 are in (auto-submit / advance).
  const pushDigit = useCallback((d) => {
    if (busy) return;
    setErr("");
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) {
        if (hasPin === false) {
          // Creating a PIN: enter → confirm → set.
          if (stage === "enter") {
            setFirst(next);
            setStage("confirm");
            setTimeout(() => setPin(""), 180); // brief fill, then clear for confirm
            return next;
          }
          if (next === first) {
            setNewPin(next);
          } else {
            setErr("PINs do not match — try again.");
            setFirst(""); setStage("enter");
            setTimeout(() => setPin(""), 180);
          }
          return next;
        }
        verifyPin(next); // unlocking
      }
      return next;
    });
  }, [busy, hasPin, stage, first, verifyPin, setNewPin]);

  const backspace = useCallback(() => {
    if (busy) return;
    setErr("");
    setPin((prev) => prev.slice(0, -1));
  }, [busy]);

  // Physical keyboard support while locked.
  useEffect(() => {
    if (!locked) return undefined;
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); pushDigit(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, pushDigit, backspace]);

  if (!token || !locked) return null;

  const creating = hasPin === false;
  const heading = creating
    ? (stage === "confirm" ? "Confirm your new PIN" : "Create a 4-digit PIN")
    : "Screen locked";
  const sub = creating
    ? (stage === "confirm" ? "Re-enter the PIN to confirm." : "No PIN on this account yet — set one to unlock.")
    : `${user?.fullName || user?.employeeId} — locked after 30 minutes of inactivity.`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Lock size={26} />
        </div>
        <div className="mt-3 text-lg font-bold text-slate-900">{heading}</div>
        <div className="mt-0.5 text-sm text-slate-500">{sub}</div>

        <div className="mb-4 mt-5">
          <PinDots length={pin.length} error={!!err} />
        </div>

        {err && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>
        )}

        <Keypad onDigit={pushDigit} onBackspace={backspace} disabled={busy} />

        <div className="mt-3 h-4 text-xs font-semibold text-emerald-700">{busy ? "Checking…" : ""}</div>

        <button
          onClick={logout}
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          <LogOut size={12} /> Sign out instead (forgot PIN? ask an admin to reset it)
        </button>
      </div>
    </div>
  );
}
