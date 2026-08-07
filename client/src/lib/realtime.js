// Client real-time: one Socket.IO connection for the logged-in staff
// session + a useRealtime() hook. The server only sends lightweight
// "data:changed" pings per topic; the hook calls your refetch so the
// screen reloads fresh data through the normal authenticated API.
//
// Usage:
//   useRealtime("payments", load);              // single topic
//   useRealtime(["payments", "water-bills"], load);
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

function apiOrigin() {
  const base = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
  return base.replace(/\/?api\/?$/, "").replace(/\/+$/, "");
}

let socket = null;
let socketToken = null;

// Returns the shared socket, (re)connecting with the current auth token.
// No token (logged-out / public visitor) → null, so we never open an
// unauthenticated socket.
export function getSocket() {
  const token = (typeof localStorage !== "undefined" && localStorage.getItem("pow_token")) || "";
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  if (socket) { try { socket.disconnect(); } catch { /* ignore */ } socket = null; }
  socketToken = token;
  socket = io(apiOrigin(), {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function closeSocket() {
  if (socket) { try { socket.disconnect(); } catch { /* ignore */ } socket = null; socketToken = null; }
}

// Subscribe to one or more topics; runs `onChange(msg)` when the server
// reports that topic changed. Re-subscribes automatically after a reconnect.
export function useRealtime(topics, onChange) {
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; }); // keep latest callback without re-subscribing
  const key = Array.isArray(topics) ? topics.join(",") : String(topics || "");
  useEffect(() => {
    if (!key) return undefined;
    const list = key.split(",").filter(Boolean);
    const s = getSocket();
    if (!s) return undefined;
    const handler = (msg) => { if (msg && list.includes(msg.topic)) cb.current?.(msg); };
    const sub = () => s.emit("subscribe", list);
    sub();
    s.on("connect", sub); // re-join rooms after a reconnect
    s.on("data:changed", handler);
    return () => {
      s.off("connect", sub);
      s.off("data:changed", handler);
      try { s.emit("unsubscribe", list); } catch { /* ignore */ }
    };
  }, [key]);
}

// Which staff userIds currently hold a live socket connection (green/red
// presence dots — e.g. team chat). Request/response, not a one-time push:
// the underlying socket is a shared singleton reused across the whole app,
// so a component mounting this hook has usually missed the original
// connect event — it asks "presence:subscribe" and gets a fresh snapshot
// back, then follows incremental "presence:changed" events after that.
export function useOnlinePresence() {
  const [online, setOnline] = useState(() => new Set());
  useEffect(() => {
    const s = getSocket();
    if (!s) return undefined;
    const onSnapshot = (msg) => setOnline(new Set(msg?.online || []));
    const onChanged = (msg) => {
      if (!msg?.userId) return;
      setOnline((prev) => {
        const next = new Set(prev);
        if (msg.online) next.add(msg.userId);
        else next.delete(msg.userId);
        return next;
      });
    };
    const requestSnapshot = () => s.emit("presence:subscribe");
    s.on("presence:snapshot", onSnapshot);
    s.on("presence:changed", onChanged);
    s.on("connect", requestSnapshot);
    if (s.connected) requestSnapshot();
    return () => {
      s.off("presence:snapshot", onSnapshot);
      s.off("presence:changed", onChanged);
      s.off("connect", requestSnapshot);
    };
  }, []);
  return online;
}
