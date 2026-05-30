import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import Navbar from "../components/Navbar";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const { login, verify2FA, user, token } = useAuth();
  const nav = useNavigate();

  // Already signed in? Skip the form entirely (handles cold-start of the
  // installed PWA when start_url is /employee-login, and any refresh of
  // /employee-login during an active session).
  useEffect(() => {
    if (!token || !user) return;
    const role = user.role;
    if (role === "admin") nav("/admin", { replace: true });
    else if (role === "water_bill_officer") nav("/water", { replace: true });
    else if (role === "loan_officer") nav("/loan", { replace: true });
    else if (role === "meter_reader") nav("/meter", { replace: true });
    else if (role === "plumber") nav("/plumber", { replace: true });
    else if (role === "cashier") nav("/cashier", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  const [step, setStep] = useState("login"); // "login" | "2fa" | "recover" | "forgot"
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 2FA step
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [newPass, setNewPass] = useState("");

  function goStep(s) {
    setStep(s);
    setError("");
    setNotice("");
    setCode("");
    setNewPass("");
  }

  async function onRecover(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/auth/recover-2fa", { method: "POST", body: { employeeId: employeeId.trim(), code: code.trim() } });
      setNotice(res.message || "2FA reset. You can log in and set it up again.");
      setStep("login");
    } catch (err) {
      setError(err?.message || "Recovery failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onForgot(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/auth/reset-password-2fa", { method: "POST", body: { employeeId: employeeId.trim(), code: code.trim(), newPassword: newPass } });
      setNotice(res.message || "Password updated. You can now log in.");
      setStep("login");
    } catch (err) {
      setError(err?.message || "Reset failed.");
    } finally {
      setLoading(false);
    }
  }

  function routeAfter(data) {
    if (data.mustSetup2FA) return nav("/setup-2fa");
    const role = data.user?.role;
    if (role === "admin") nav("/admin");
    else if (role === "water_bill_officer") nav("/water");
    else if (role === "loan_officer") nav("/loan");
    else if (role === "meter_reader") nav("/meter");
    else if (role === "plumber") nav("/plumber");
    else if (role === "cashier") nav("/cashier");
    else nav("/dashboard");
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(employeeId.trim(), password);
      if (data.twoFactorRequired) {
        setChallengeToken(data.challengeToken);
        setStep("2fa");
        return;
      }
      routeAfter(data);
    } catch (err) {
      setError(err?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await verify2FA(challengeToken, code.trim(), remember);
      routeAfter(data);
    } catch (err) {
      setError(err?.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 flex items-center justify-center p-4 pt-24">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <img src={logo} alt="POWASSCO Logo" className="h-24 w-24 rounded-3xl object-contain" />
              <h1 className="mt-4 text-xl font-extrabold text-slate-900">POWASSCO Multipurpose Cooperative</h1>
              <p className="mt-1 text-sm text-slate-500">Integrated Cooperative Management System</p>
            </div>

            <div className="my-6 h-px bg-slate-200" />

            {notice && <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm">{notice}</div>}

            {step === "login" && (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Employee ID</label>
                  <input
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-green-200 focus:border-green-400"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g. ADMIN001"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Password</label>
                  <div className="mt-1 relative">
                    <input
                      type={showPass ? "text" : "password"}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 pr-16 text-sm focus:outline-none focus:ring-4 focus:ring-green-200 focus:border-green-400"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      {showPass ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

                <button disabled={loading} className="w-full rounded-2xl bg-green-600 text-white py-3 font-semibold hover:bg-green-700 disabled:opacity-60 transition">
                  {loading ? "Signing in..." : "Sign In"}
                </button>
                <div className="flex justify-between text-xs font-semibold text-slate-500">
                  <button type="button" onClick={() => goStep("forgot")} className="hover:text-slate-700">Forgot password?</button>
                  <button type="button" onClick={() => goStep("recover")} className="hover:text-slate-700">Lost authenticator?</button>
                </div>
              </form>
            )}

            {step === "2fa" && (
              <form onSubmit={onVerify} className="space-y-4">
                <div className="text-center">
                  <div className="text-base font-bold text-slate-900">Two-Factor Verification</div>
                  <p className="mt-1 text-sm text-slate-500">New device detected. Enter the 6-digit code from your authenticator app.</p>
                </div>
                <input
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] focus:outline-none focus:ring-4 focus:ring-green-200 focus:border-green-400"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="------"
                />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember this device (skip 2FA here next time)
                </label>

                {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

                <button disabled={loading || code.length < 6} className="w-full rounded-2xl bg-green-600 text-white py-3 font-semibold hover:bg-green-700 disabled:opacity-60 transition">
                  {loading ? "Verifying..." : "Verify"}
                </button>
                <button type="button" onClick={() => { setStep("login"); setCode(""); setError(""); }} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">
                  Back to login
                </button>
              </form>
            )}

            {step === "recover" && (
              <form onSubmit={onRecover} className="space-y-4">
                <div className="text-center">
                  <div className="text-base font-bold text-slate-900">Reset 2FA with a Recovery Code</div>
                  <p className="mt-1 text-sm text-slate-500">Lost your authenticator? Enter your Employee ID and one of your backup recovery codes.</p>
                </div>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-green-200" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" />
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center font-mono tracking-widest focus:outline-none focus:ring-4 focus:ring-green-200" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" />
                {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}
                <button disabled={loading} className="w-full rounded-2xl bg-green-600 text-white py-3 font-semibold hover:bg-green-700 disabled:opacity-60">{loading ? "Verifying..." : "Reset 2FA"}</button>
                <button type="button" onClick={() => goStep("login")} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">Back to login</button>
              </form>
            )}

            {step === "forgot" && (
              <form onSubmit={onForgot} className="space-y-4">
                <div className="text-center">
                  <div className="text-base font-bold text-slate-900">Reset Password</div>
                  <p className="mt-1 text-sm text-slate-500">Verify with a 2FA code (or recovery code) to set a new password. No 2FA? Contact the admin.</p>
                </div>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-green-200" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" />
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center font-mono tracking-widest focus:outline-none focus:ring-4 focus:ring-green-200" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit or recovery code" />
                <input type="password" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-green-200" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="New password (min 6 chars)" />
                {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}
                <button disabled={loading} className="w-full rounded-2xl bg-green-600 text-white py-3 font-semibold hover:bg-green-700 disabled:opacity-60">{loading ? "Updating..." : "Reset Password"}</button>
                <button type="button" onClick={() => goStep("login")} className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700">Back to login</button>
              </form>
            )}
          </div>

          <div className="mt-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} POWASSCO Multipurpose Cooperative</div>
        </div>
      </div>
    </>
  );
}
