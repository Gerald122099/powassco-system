// client/src/lib/api.js

const RAW_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
const API_BASE = RAW_BASE.replace(/\/+$/, "");

// Keys
const TOKEN_KEY = "pow_token";
const USER_KEY = "pow_user";

// In-memory cache (faster than reading localStorage every request)
let globalToken = localStorage.getItem(TOKEN_KEY) || "";

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

  console.log(`[API Download] ${cleanPath}`);

  try {
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
  } catch (error) {
    console.error("[API Download] Error:", error);
    throw error;
  }
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

  const headers = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
    ...(extraHeaders || {}),
  };

  console.log(`[API] ${method} ${cleanPath}`, {
    url,
    hasExplicitToken: !!token,
    hasStoredToken: !!storedToken,
    hasGlobalToken: !!globalToken,
    authHeader: headers.Authorization ? "Bearer ***" : "none",
  });

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    console.error("[API] Network error:", networkErr);
    throw new Error("Network error. Please check server or connection.");
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  console.log(`[API] Response ${res.status}:`, data?.message || text?.slice(0, 200));

  if (!res.ok) {
    // If your backend sometimes sends 403 for expired/invalid token,
    // you can optionally clear on BOTH 401 and 403:
    if (res.status === 401) {
      clearAuthStorage();
      throw new Error(data?.message || "Unauthorized - Please login again");
    }

    // Optional: if you want to force logout on 403 only when token is invalid:
    // (leave commented unless you want this behavior)
    // if (res.status === 403 && String(data?.message || "").toLowerCase().includes("token")) {
    //   clearAuthStorage();
    // }

    throw new Error(data?.message || `Request failed (${res.status})`);
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