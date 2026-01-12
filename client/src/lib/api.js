const RAW_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
const API_BASE = RAW_BASE.replace(/\/+$/, ""); // remove trailing slashes

export async function apiFetch(
  path,
  { method = "GET", body, token, headers: extraHeaders } = {}
) {
  const cleanPath = String(path).startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE}${cleanPath}`;

  const finalToken =
    token ||
    localStorage.getItem("pow_token") ||
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
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}
