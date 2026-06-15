// Member App home (/app) — the installed Android app opens here.
// A simple hub for members: see saved accounts, jump to Bills or
// Balance, turn on reminders, install the app, and optionally protect
// everything behind a device PIN. All data-on-device (no member login).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import PublicAppInstallBanner from "../../components/PublicAppInstallBanner";
import MemberPinGate from "../../components/MemberPinGate";
import {
  pushSupported, getCurrentSubscription, enablePushForItems, disablePush,
} from "../../lib/pushClient";
import {
  hasMemberPin, setMemberPin, clearMemberPin, lockNow,
} from "../../lib/memberPin";
import {
  Droplets, PiggyBank, Bell, BellOff, ShieldCheck, ShieldOff, ChevronRight, Lock, Download,
} from "lucide-react";

const SAVED_KEY = "pow_inquiry_saved";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}

function MemberAppInner() {
  const [saved] = useState(loadSaved);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pinOn, setPinOn] = useState(hasMemberPin());
  const [pinErr, setPinErr] = useState("");
  const [settingPin, setSettingPin] = useState(false);
  const [pinValue, setPinValue] = useState("");

  useEffect(() => {
    if (!pushSupported()) return;
    getCurrentSubscription().then((s) => setPushOn(!!s)).catch(() => {});
  }, []);

  async function toggleNotifications() {
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        if (saved.length === 0) {
          alert("Save your account in 'My Bills' first, then turn on reminders.");
          return;
        }
        await enablePushForItems(saved.map((s) => ({ kind: s.kind, value: s.value })));
        setPushOn(true);
      }
    } catch (e) {
      alert(e.message || "Could not change reminders.");
    } finally {
      setPushBusy(false);
    }
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pinValue)) { setPinErr("Enter a 4-digit PIN."); return; }
    await setMemberPin(pinValue);
    setPinOn(true);
    setSettingPin(false);
    setPinValue("");
    setPinErr("");
  }
  function removePin() {
    if (!confirm("Remove the app PIN? Anyone with this phone will be able to open the app.")) return;
    clearMemberPin();
    setPinOn(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-12">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">My POWASSCO</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your water bills and balance in one place. {saved.length > 0
              ? `${saved.length} account${saved.length === 1 ? "" : "s"} saved on this phone.`
              : "Save your account to load it automatically next time."}
          </p>
        </div>

        {/* Primary actions */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/inquiry" className="group rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Droplets size={24} /></div>
              <ChevronRight className="text-slate-300 group-hover:text-emerald-500" />
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">My Bills</div>
            <div className="text-sm text-slate-500">See your dues, due dates, history, and pay online.</div>
          </Link>

          <Link to="/check-balance" className="group rounded-3xl border border-pink-100 bg-white p-5 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-100 text-pink-700"><PiggyBank size={24} /></div>
              <ChevronRight className="text-slate-300 group-hover:text-pink-500" />
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">My Balance</div>
            <div className="text-sm text-slate-500">Check your Savings and Share Capital (CBU) with your PIN.</div>
          </Link>
        </div>

        {/* Reminders */}
        {pushSupported() && (
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-2xl ${pushOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {pushOn ? <Bell size={20} /> : <BellOff size={20} />}
              </div>
              <div>
                <div className="font-bold text-slate-800">Bill reminders</div>
                <div className="text-xs text-slate-500">
                  {pushOn
                    ? "On — you'll get a reminder before due & collection days, and daily once overdue."
                    : "Get reminded before due & collection days, and when a new bill is ready."}
                </div>
              </div>
            </div>
            <button onClick={toggleNotifications} disabled={pushBusy}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
                pushOn ? "border border-slate-300 text-slate-700 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}>
              {pushBusy ? "…" : pushOn ? "Turn off" : "Turn on"}
            </button>
          </div>
        )}

        {/* App PIN */}
        <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-2xl ${pinOn ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                {pinOn ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
              </div>
              <div>
                <div className="font-bold text-slate-800">App PIN {pinOn && <span className="text-emerald-600">· on</span>}</div>
                <div className="text-xs text-slate-500">Protect your saved accounts with a 4-digit PIN on this phone.</div>
              </div>
            </div>
            {pinOn ? (
              <div className="flex gap-2">
                <button onClick={() => { lockNow(); window.location.reload(); }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <Lock size={14} /> Lock
                </button>
                <button onClick={removePin}
                  className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
                  Remove
                </button>
              </div>
            ) : (
              <button onClick={() => setSettingPin((v) => !v)}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">
                Set PIN
              </button>
            )}
          </div>

          {settingPin && !pinOn && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="password" inputMode="numeric" maxLength={4} value={pinValue} autoFocus
                onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "")); setPinErr(""); }}
                placeholder="••••"
                className="w-28 rounded-xl border border-slate-200 px-3 py-2.5 text-center font-mono text-2xl tracking-widest"
              />
              <button onClick={savePin} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Save PIN</button>
              {pinErr && <span className="text-xs font-semibold text-red-600">{pinErr}</span>}
            </div>
          )}
        </div>

        {/* Install / APK */}
        <div className="mt-4">
          <PublicAppInstallBanner />
        </div>
        <div className="mt-3 text-center">
          <a href="/downloads/powassco-member.apk" download
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            <Download size={15} /> Download the Android app (.apk)
          </a>
        </div>
      </div>
    </div>
  );
}

export default function MemberAppPage() {
  return (
    <MemberPinGate>
      <MemberAppInner />
    </MemberPinGate>
  );
}
