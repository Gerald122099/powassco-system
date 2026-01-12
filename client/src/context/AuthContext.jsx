import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

  async function login(employeeId, password) {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: { employeeId, password }
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    setToken("");
    setUser(null);
  }

  const value = useMemo(() => ({ token, user, login, logout }), [token, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}