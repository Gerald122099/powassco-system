import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const { login, verify2FA } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState("login"); // "login" | "2fa"
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 2FA step
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);

  function routeAfter(data) {
    if (data.mustSetup2FA) return nav("/setup-2fa");
    const role = data.user?.role;
    if (role === "admin") nav("/admin");
    else if (role === "water_bill_officer") nav("/water");
    else if (role === "loan_officer") nav("/loan");
    else nav("/meter");
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

            {step === "login" ? (
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
              </form>
            ) : (
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
          </div>

          <div className="mt-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} POWASSCO Multipurpose Cooperative</div>
        </div>
      </div>
    </>
  );
}
