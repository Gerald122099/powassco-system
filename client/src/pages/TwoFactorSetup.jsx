import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import { ShieldCheck } from "lucide-react";

export default function TwoFactorSetup() {
  const { token, storeDeviceToken, user } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === "admin";

  const [enabled, setEnabled] = useState(false);
  const [enforced, setEnforced] = useState(false);
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setErr("");
    setBusy(true);
    try {
      const { secret: s, otpauth } = await apiFetch("/auth/2fa/setup", { method: "POST", token });
      setSecret(s);
      setQr(await QRCode.toDataURL(otpauth, { width: 240, margin: 1 }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    apiFetch("/auth/2fa/status", { token })
      .then((st) => {
        setEnabled(!!st.enabled);
        setEnforced(!!st.enforced);
        if (!st.enabled) startSetup();
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selfReset() {
    if (!window.confirm("Reset your 2FA?\n\nYour current authenticator will stop working and known devices will be forgotten. You'll set up 2FA again now.")) return;
    setErr(""); setMsg(""); setBusy(true);
    try {
      await apiFetch("/auth/2fa/self-reset", { method: "POST", token });
      setEnabled(false);
      setCode("");
      await startSetup();
      setMsg("2FA cleared. Scan the new QR to re-enroll.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function enable(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const data = await apiFetch("/auth/2fa/enable", { method: "POST", token, body: { code: code.trim() } });
      if (data.deviceToken) storeDeviceToken(data.deviceToken);
      setEnabled(true);
      setMsg("Two-factor authentication is now ON for your account.");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <img src={logo} alt="POWASSCO" className="h-16 w-16 rounded-2xl object-contain" />
          <h1 className="mt-3 flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <ShieldCheck size={20} className="text-emerald-600" /> Two-Factor Setup
          </h1>
          {enforced && !enabled && (
            <p className="mt-1 text-sm text-amber-600">Your administrator requires two-factor authentication.</p>
          )}
        </div>

        <div className="my-5 h-px bg-slate-200" />

        {err && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</div>}
        {msg && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">{msg}</div>}

        {enabled ? (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              ✓ 2FA is enabled on your account.
            </div>
            <button onClick={() => nav("/dashboard")} className="w-full rounded-2xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700">
              Continue
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={selfReset}
                disabled={busy}
                className="w-full rounded-2xl border border-amber-300 bg-amber-50 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
              >
                Reset &amp; re-setup my 2FA
              </button>
            )}
            {isAdmin && (
              <p className="text-xs text-slate-500">
                Lost your authenticator? Use this to clear your 2FA and set it up again. This action is recorded in the security audit log.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={enable} className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Install <b>Google Authenticator</b> (or Microsoft Authenticator) on your phone.</li>
              <li>Scan this QR code, or enter the key manually.</li>
              <li>Type the 6-digit code it shows to confirm.</li>
            </ol>

            <div className="flex flex-col items-center gap-2">
              {qr ? <img src={qr} alt="2FA QR" className="h-48 w-48 rounded-xl border border-slate-200 p-2" /> : <div className="h-48 w-48 animate-pulse rounded-xl bg-slate-100" />}
              {secret && (
                <div className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-xs tracking-wider text-slate-600 break-all">{secret}</div>
              )}
            </div>

            <input
              inputMode="numeric"
              maxLength={6}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] focus:outline-none focus:ring-4 focus:ring-green-200 focus:border-green-400"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="------"
            />

            <button disabled={busy || code.length < 6} className="w-full rounded-2xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60">
              {busy ? "Verifying..." : "Enable 2FA"}
            </button>
            {!enforced && (
              <button type="button" onClick={() => nav("/dashboard")} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">
                Skip for now
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
