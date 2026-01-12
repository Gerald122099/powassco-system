const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

export async function apiFetch(
  path,
  { method = "GET", body, token, headers: extraHeaders } = {}
) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const finalToken =
    token ||
    localStorage.getItem("pow_token") ||   // ✅ MATCH AuthContext
    sessionStorage.getItem("pow_token");

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
      ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}
