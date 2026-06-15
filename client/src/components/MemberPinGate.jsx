// Wraps the member app. If the member set a device PIN, this shows a lock
// screen until the correct PIN is entered (once per app session). If no PIN
// is set, it renders children directly. Local privacy only — see lib/memberPin.js.
import { useState } from "react";
import { hasMemberPin, verifyMemberPin, isUnlocked, setUnlocked } from "../lib/memberPin";
import { Lock, Delete } from "lucide-react";
import logo from "../assets/logo.png";

export default function MemberPinGate({ children }) {
  const [locked, setLocked] = useState(() => hasMemberPin() && !isUnlocked());
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);

  if (!locked) return children;

  async function submit(value) {
    setChecking(true);
    setErr("");
    const ok = await verifyMemberPin(value);
    setChecking(false);
    if (ok) {
      setUnlocked();
      setLocked(false);
    } else {
      setErr("Wrong PIN. Try again.");
      setPin("");
    }
  }

  function press(d) {
    if (checking) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setErr("");
    if (next.length === 4) submit(next);
  }
  function back() { setPin((p) => p.slice(0, -1)); setErr(""); }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-6">
      <img src={logo} alt="POWASSCO" className="h-16 w-16 rounded-2xl object-contain shadow-sm" />
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        <Lock size={12} /> Member App locked
      </div>
      <h1 className="mt-3 text-lg font-bold text-slate-800">Enter your PIN</h1>
      <p className="mt-1 text-xs text-slate-500 text-center max-w-xs">
        This PIN protects your saved accounts on this phone.
      </p>

      <div className="mt-5 flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-4 w-4 rounded-full border-2 ${pin.length > i ? "bg-emerald-600 border-emerald-600" : "border-slate-300"}`} />
        ))}
      </div>
      {err && <div className="mt-3 text-xs font-semibold text-red-600">{err}</div>}

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => press(String(n))}
            className="h-16 w-16 rounded-full bg-white border border-slate-200 text-2xl font-semibold text-slate-700 shadow-sm active:scale-95 active:bg-slate-100">
            {n}
          </button>
        ))}
        <div />
        <button onClick={() => press("0")}
          className="h-16 w-16 rounded-full bg-white border border-slate-200 text-2xl font-semibold text-slate-700 shadow-sm active:scale-95 active:bg-slate-100">
          0
        </button>
        <button onClick={back} aria-label="Delete"
          className="h-16 w-16 rounded-full grid place-items-center text-slate-500 active:scale-95">
          <Delete size={22} />
        </button>
      </div>

      <p className="mt-6 text-[11px] text-slate-400 text-center max-w-xs">
        Forgot your PIN? You can reset it by clearing this site's data in your browser, or reinstalling the app.
        Your bills are always available on the website too.
      </p>
    </div>
  );
}
