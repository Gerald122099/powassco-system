// Floating staff chat — one shared team room for the office roles.
// Mounted inside DashboardLayout so every dashboard gets it for free;
// renders nothing for excluded roles (plumber, meter_reader).
//
// Bottom-right launcher button with an unread badge. Unread = messages
// newer than the last-seen message id stored in localStorage, so the
// count survives reloads without any server-side read-tracking.
//
// Polling: 5s while the panel is open, 30s while closed (badge only).

import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { MessageCircle, X, Send } from "lucide-react";

const CHAT_ROLES = new Set(["admin", "cashier", "loan_officer", "water_bill_officer", "bookkeeper"]);
const LAST_SEEN_KEY = "pow_chat_last_seen";

const ROLE_LABEL = {
  admin: "Admin",
  cashier: "Cashier",
  loan_officer: "Loan Officer",
  water_bill_officer: "Water Officer",
  bookkeeper: "Bookkeeper",
};
const ROLE_TONE = {
  admin: "bg-slate-200 text-slate-800",
  cashier: "bg-emerald-100 text-emerald-800",
  loan_officer: "bg-blue-100 text-blue-800",
  water_bill_officer: "bg-cyan-100 text-cyan-800",
  bookkeeper: "bg-violet-100 text-violet-800",
};

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function StaffChat() {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef(null);
  const openRef = useRef(false);
  openRef.current = open;

  const allowed = user && CHAT_ROLES.has(user.role);

  const recomputeUnread = useCallback((msgs) => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY) || "";
    if (!lastSeen) return msgs.length ? Math.min(msgs.length, 99) : 0;
    return msgs.filter((m) => m._id > lastSeen).length;
  }, []);

  const markSeen = useCallback((msgs) => {
    const newest = msgs[msgs.length - 1];
    if (newest) localStorage.setItem(LAST_SEEN_KEY, newest._id);
    setUnread(0);
  }, []);

  const poll = useCallback(async () => {
    if (!allowed) return;
    try {
      setMessages((prev) => prev); // no-op to keep linter happy on deps
      const newestId = undefined; // always re-pull last 100 — simple and bounded
      const res = await apiFetch("/chat", { token });
      const msgs = res.items || [];
      setMessages(msgs);
      if (openRef.current) {
        markSeen(msgs);
      } else {
        setUnread(recomputeUnread(msgs));
      }
    } catch {
      /* polling errors are silent — next tick retries */
    }
  }, [allowed, token, markSeen, recomputeUnread]);

  // Poll loop: faster while open.
  useEffect(() => {
    if (!allowed) return;
    poll();
    const interval = setInterval(poll, open ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [allowed, open, poll]);

  // Auto-scroll to bottom on new messages while open.
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages.length]);

  if (!allowed) return null;

  async function send(e) {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch("/chat", { method: "POST", token, body: { text: t } });
      setText("");
      setMessages((prev) => {
        const next = [...prev, msg];
        localStorage.setItem(LAST_SEEN_KEY, msg._id);
        return next;
      });
    } catch (err) {
      alert(err.message || "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => { setOpen(true); markSeen(messages); }}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl transition hover:bg-emerald-700"
          title="Team chat"
        >
          <MessageCircle size={24} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-96">
          <div className="flex items-center justify-between bg-emerald-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-bold">
              <MessageCircle size={16} /> Team Chat
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-emerald-700">
              <X size={16} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {messages.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No messages yet — say hi!</div>
            ) : messages.map((m) => {
              const mine = m.fromId === String(user?.id || user?._id || "");
              return (
                <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${mine ? "bg-emerald-600 text-white" : "bg-white border border-slate-200"}`}>
                    {!mine && (
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-800">{m.fromName}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${ROLE_TONE[m.fromRole] || "bg-slate-100 text-slate-600"}`}>
                          {ROLE_LABEL[m.fromRole] || m.fromRole}
                        </span>
                      </div>
                    )}
                    <div className={`whitespace-pre-wrap text-sm ${mine ? "" : "text-slate-800"}`}>{m.text}</div>
                    <div className={`mt-0.5 text-right text-[9px] ${mine ? "text-emerald-100" : "text-slate-400"}`}>
                      {fmtTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message the team…"
              maxLength={1000}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <button
              disabled={sending || !text.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
