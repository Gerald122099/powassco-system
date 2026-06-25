import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("pow_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("pow_user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) localStorage.setItem("pow_token", token);
    else localStorage.removeItem("pow_token");

    if (user) localStorage.setItem("pow_user", JSON.stringify(user));
    else localStorage.removeItem("pow_user");
  }, [token, user]);

  // Sync the admin-set receipt style (Payment Settings) to this device. The
  // thermal receipt builder reads pow_receipt_style synchronously, so we cache
  // the system-wide value here on each app load. Public route — no auth needed.
  useEffect(() => {
    apiFetch("/public/payments/info")
      .then((info) => {
        const st = info?.receiptStyle === "dotmatrix" ? "dotmatrix" : "classic";
        try { localStorage.setItem("pow_receipt_style", st); } catch { /* ignore */ }
      })
      .catch(() => { /* offline — keep last cached style */ });
  }, []);

  const getDeviceToken = () => localStorage.getItem("pow_device") || "";
  const storeDeviceToken = (t) => {
    if (t) localStorage.setItem("pow_device", t);
  };

  function applySession(data) {
    if (data?.token) {
      setToken(data.token);
      setUser(data.user);
    }
    if (data?.deviceToken) storeDeviceToken(data.deviceToken);
  }

  // Returns the raw response so the caller can branch on
  // twoFactorRequired / mustSetup2FA. Only sets the session if a token came back.
  async function login(employeeId, password) {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: { employeeId, password, deviceToken: getDeviceToken() },
    });
    if (!data.twoFactorRequired) applySession(data);
    return data;
  }

  // Completes a new-device login by verifying the authenticator code.
  async function verify2FA(challengeToken, code, rememberDevice = true) {
    const data = await apiFetch("/auth/2fa/verify", {
      method: "POST",
      body: { challengeToken, code, rememberDevice },
    });
    applySession(data);
    return data;
  }

  // Logout keeps the remembered device so the user isn't re-challenged on their own phone.
  function logout() {
    // Best-effort audit log of the logout before clearing the session.
    if (token) apiFetch("/auth/logout", { method: "POST", token }).catch(() => {});
    setToken("");
    setUser(null);
  }

  const value = { token, user, login, logout, verify2FA, storeDeviceToken };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthCtx);
}