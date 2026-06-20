// App-entry PIN lock. Wraps the plumber's dashboard: when admin has set a
// 4-digit PIN on the user, the field reader must enter it every time they
// re-open the installed PWA (tab close → fresh sessionStorage → unlock
// flag gone → lock screen re-shows). After three wrong tries the lockout
// progressively delays retries.
//
// localStorage:  pow_pin_session_id  — unique-per-tab; cleared by clearing
//                                       site data / closing & reopening.
// sessionStorage: pow_pin_unlocked   — flag set after a correct PIN.
//                                       Cleared automatically on tab close.
//
// We deliberately use sessionStorage for the unlock flag (per-tab,
// auto-expires) and an inline lock screen instead of a router-level
// redirect so deep links into Field Mode still work after unlock.
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import { Lock, KeyRound } from "lucide-react";

const UNLOCK_KEY = "pow_pin_unlocked";
const ATTEMPT_KEY = "pow_pin_attempts";

// SHA-256 → hex. Used to cache the PIN locally (after a successful ONLINE
// unlock) so the field reader can still unlock OFFLINE with the same PIN.
async function sha256Hex(s) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // crypto.subtle unavailable (non-secure context)
  }
}

export default function AppPinLock({ children }) {
  const { user, logout } = useAuth();
  const [hasPin, setHasPin] = useState(null); // null = checking
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(UNLOCK_KEY) === "1");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const uid = user?._id || user?.employeeId || "";

  // Determine whether this user has a PIN. CRITICAL for offline field use:
  // never block on the network — a refresh with no signal must not get stuck
  // on "Checking…". Offline we use the last known status cached locally;
  // online we ask the server but cap the wait so a flaky link can't hang.
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    if (unlocked) { setHasPin(true); return; }
    const cachedStatus = localStorage.getItem(`pow_haspin_${uid}`) === "1";

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setHasPin(cachedStatus);
      return;
    }
    (async () => {
      const statusP = apiFetch("/auth/pin-status").then((r) => ({ has: !!r.hasPin })).catch(() => null);
      const timeoutP = new Promise((res) => setTimeout(() => res("timeout"), 5000));
      const out = await Promise.race([statusP, timeoutP]);
      if (cancelled) return;
      if (out && out !== "timeout") {
        setHasPin(out.has);
        try { localStorage.setItem(`pow_haspin_${uid}`, out.has ? "1" : "0"); } catch { /* quota */ }
      } else {
        setHasPin(cachedStatus); // timed out or network failed → cached value
      }
    })();
    return () => { cancelled = true; };
  }, [user, unlocked, uid]);

  // Brute-force-friction: each successive wrong PIN bumps a cooldown
  // before the next try. Resets on a correct entry or after 10 minutes.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function unlockNow() {
    sessionStorage.setItem(UNLOCK_KEY, "1");
    sessionStorage.removeItem(ATTEMPT_KEY);
    setUnlocked(true);
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (cooldown > 0) return;
    if (!/^\d{4}$/.test(pin)) return setErr("Enter your 4-digit PIN.");
    setBusy(true); setErr("");
    try {
      const enteredHash = await sha256Hex(`${pin}:${uid}`);
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      if (online) {
        try {
          await apiFetch("/auth/pin-verify", { method: "POST", body: { pin } });
          // Cache the PIN hash so the SAME pin unlocks offline next time.
          if (enteredHash) { try { localStorage.setItem(`pow_pinhash_${uid}`, enteredHash); } catch { /* quota */ } }
          return unlockNow();
        } catch (err) {
          // A real connection drop mid-request → fall through to offline
          // verify. A genuine online failure (wrong PIN) → surface it.
          if (navigator.onLine) throw err;
        }
      }
      // Offline: verify against the hash cached on the last online unlock.
      const cached = localStorage.getItem(`pow_pinhash_${uid}`);
      if (cached && enteredHash && cached === enteredHash) return unlockNow();
      throw new Error(cached ? "Wrong PIN." : "You're offline — connect to the internet once to enable offline unlock.");
    } catch (e2) {
      const tries = Number(sessionStorage.getItem(ATTEMPT_KEY) || 0) + 1;
      sessionStorage.setItem(ATTEMPT_KEY, String(tries));
      setCooldown(tries >= 5 ? 60 : tries >= 3 ? 10 : 0);
      setErr(e2.message || "Wrong PIN.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return children;          // not signed in — let auth flow handle it
  if (hasPin === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Checking…
      </div>
    );
  }
  if (!hasPin || unlocked) return children;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-purple-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <img src={logo} alt="POWASSCO" className="h-16 w-16 rounded-2xl object-contain" />
          <h1 className="mt-3 inline-flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Lock size={18} className="text-purple-600" /> Enter your PIN
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Hello <b>{user.fullName}</b>. The admin set a 4-digit PIN on your account. Enter it to open Field Mode.
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-center text-3xl font-bold tracking-[0.6em] focus:border-purple-300 focus:outline-none focus:ring-4 focus:ring-purple-100"
          />
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">
              {err}
            </div>
          )}
          {cooldown > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-800">
              Too many tries. Try again in {cooldown}s.
            </div>
          )}
          <button
            disabled={busy || cooldown > 0 || pin.length !== 4}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 text-base font-bold text-white shadow-sm active:scale-95 disabled:opacity-50"
          >
            <KeyRound size={18} /> {busy ? "Verifying…" : "Unlock"}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 active:bg-slate-50"
          >
            Forgot PIN? Log out and ask the admin
          </button>
        </form>
      </div>
    </div>
  );
}
