// client/src/lib/api.js

const RAW_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
const API_BASE = RAW_BASE.replace(/\/+$/, "");

// Keys
const TOKEN_KEY = "pow_token";
const USER_KEY = "pow_user";

// In-memory cache (faster than reading localStorage every request)
let globalToken = localStorage.getItem(TOKEN_KEY) || "";

// ----- Admin-authz token (dual-control short-lived JWT) -----
// Lives in sessionStorage so it expires when the tab closes. Also tracks
// the timestamp so we can pre-emptively drop expired tokens client-side.
const AUTHZ_KEY = "pow_admin_authz";
const AUTHZ_EXP_KEY = "pow_admin_authz_exp";

export function setAdminAuthzToken(token, ttlSeconds = 600) {
  if (!token) {
    sessionStorage.removeItem(AUTHZ_KEY);
    sessionStorage.removeItem(AUTHZ_EXP_KEY);
    return;
  }
  sessionStorage.setItem(AUTHZ_KEY, token);
  sessionStorage.setItem(AUTHZ_EXP_KEY, String(Date.now() + ttlSeconds * 1000));
}

export function getAdminAuthzToken() {
  const t = sessionStorage.getItem(AUTHZ_KEY);
  const exp = Number(sessionStorage.getItem(AUTHZ_EXP_KEY) || 0);
  if (!t || !exp || Date.now() >= exp) {
    if (t || exp) { sessionStorage.removeItem(AUTHZ_KEY); sessionStorage.removeItem(AUTHZ_EXP_KEY); }
    return "";
  }
  return t;
}

// Helpers
function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function clearAuthStorage() {
  globalToken = "";
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Call this after login/logout.
 * - If you pass a token, it writes to both memory + localStorage
 * - If null/empty, it clears both
 */
export function setAuthToken(token) {
  globalToken = token || "";
  setStoredToken(globalToken);
}

/**
 * Optional helper if you ever want to read the current token
 */
export function getAuthToken() {
  // always prefer latest localStorage value
  const stored = getStoredToken();
  if (stored && stored !== globalToken) globalToken = stored;
  return globalToken;
}

/**
 * Helper for file downloads (like CSV exports)
 */
export async function apiDownload(path, { token, filename } = {}) {
  const cleanPath = String(path).startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE}${cleanPath}`;

  const storedToken = getStoredToken();
  const finalToken = token || storedToken || globalToken;

  if (finalToken && finalToken !== globalToken) globalToken = finalToken;

  const headers = {
    ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
  };

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename || `download_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);

  return { success: true, filename: a.download };
}

export async function apiFetch(
  path,
  { method = "GET", body, token, headers: extraHeaders } = {}
) {
  const cleanPath = String(path).startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE}${cleanPath}`;

  // Token priority:
  // 1) explicitly passed token
  // 2) latest from localStorage (in case login happened without setAuthToken)
  // 3) in-memory globalToken
  const storedToken = getStoredToken();
  const finalToken = token || storedToken || globalToken;

  // Keep memory synced
  if (finalToken && finalToken !== globalToken) globalToken = finalToken;

  // The device token lets the server freshen this device's lastSeen on every
  // authenticated request — keeps users inside the 2-hour 2FA-skip window
  // while they're actively using the app.
  const deviceToken = localStorage.getItem("pow_device") || "";
  const adminAuthz = getAdminAuthzToken();

  const headers = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
    ...(deviceToken ? { "X-Device-Token": deviceToken } : {}),
    ...(adminAuthz ? { "X-Admin-Authz": `Bearer ${adminAuthz}` } : {}),
    ...(extraHeaders || {}),
  };

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Network error. Please check server or connection.");
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    // Dual-control: server says an admin must authorise this edit. Open
    // the AdminAuthzGate, then retry the original request once.
    if (data?.code === "ADMIN_AUTHZ_REQUIRED") {
      // Lazy-import to avoid a cycle with the React UI tree.
      const { openAdminAuthz } = await import("../components/AdminAuthzGate.jsx");
      const ok = await openAdminAuthz();
      if (ok) {
        // Retry once with the freshly-set X-Admin-Authz header.
        return apiFetch(path, { method, body, token, headers: extraHeaders });
      }
      throw new Error(data?.message || "Admin authorisation cancelled.");
    }
    // If your backend sometimes sends 403 for expired/invalid token,
    // you can optionally clear on BOTH 401 and 403:
    if (res.status === 401) {
      clearAuthStorage();
      throw new Error(data?.message || data?.error || "Unauthorized - Please login again");
    }

    // Optional: if you want to force logout on 403 only when token is invalid:
    // (leave commented unless you want this behavior)
    // if (res.status === 403 && String(data?.message || "").toLowerCase().includes("token")) {
    //   clearAuthStorage();
    // }

    throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
  }

  return data;
}

// Optional: Add a default export for convenience
export default {
  fetch: apiFetch,
  download: apiDownload,
  setAuthToken,
  getAuthToken,
};