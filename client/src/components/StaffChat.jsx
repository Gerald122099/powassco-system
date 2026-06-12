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
import { MessageCircle, X, Send, Pencil, Trash2, Check, Camera, SmilePlus, Monitor } from "lucide-react";

const CHAT_ROLES = new Set(["admin", "manager", "cashier", "loan_officer", "water_bill_officer", "bookkeeper"]);
const LAST_SEEN_KEY = "pow_chat_last_seen";

const ROLE_LABEL = {
  admin: "★ ADMIN",
  manager: "Manager",
  cashier: "Cashier",
  loan_officer: "Loan Officer",
  water_bill_officer: "Water Officer",
  bookkeeper: "Bookkeeper",
};
// Admin gets a distinct gold badge + their messages render with an
// amber name so the boss's word stands out in the thread.
const ROLE_TONE = {
  admin: "bg-amber-400 text-amber-950 ring-1 ring-amber-500",
  manager: "bg-indigo-100 text-indigo-800",
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
  const [seenList, setSeenList] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  // Editing state: which message id is being edited + draft text.
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  // Popup preview of the newest incoming message while the panel is
  // closed. Auto-dismisses; click opens the chat.
  const [preview, setPreview] = useState(null); // { name, text }
  const previewTimer = useRef(null);
  const lastNotifiedId = useRef("");
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
    if (newest) {
      localStorage.setItem(LAST_SEEN_KEY, newest._id);
      apiFetch("/chat/seen", { method: "POST", token, body: { lastId: newest._id } }).catch(() => {});
    }
    setUnread(0);
  }, [token]);

  const myId = String(user?.id || user?._id || "");

  const poll = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await apiFetch("/chat", { token });
      const msgs = res.items || [];
      setMessages(msgs);
      setSeenList(res.seen || []);
      if (openRef.current) {
        markSeen(msgs);
      } else {
        setUnread(recomputeUnread(msgs));
        // Popup preview for the newest message from someone else that
        // we haven't already previewed and is newer than last-seen.
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY) || "";
        const newest = [...msgs].reverse().find((m) => !m.deleted && m.fromId !== myId);
        if (newest && newest._id > lastSeen && newest._id !== lastNotifiedId.current) {
          lastNotifiedId.current = newest._id;
          setPreview({ name: newest.fromName, text: newest.text });
          clearTimeout(previewTimer.current);
          previewTimer.current = setTimeout(() => setPreview(null), 6000);
        }
      }
    } catch {
      /* polling errors are silent — next tick retries */
    }
  }, [allowed, token, markSeen, recomputeUnread, myId]);

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

  // Screenshot tool (Phase 12): capture the screen, drag to crop,
  // send straight into the chat for support reports.
  const [shot, setShot] = useState(null);        // full-frame data URL
  const [cropRect, setCropRect] = useState(null); // {x,y,w,h} in displayed px
  const shotImgRef = useRef(null);
  const dragRef = useRef(null);

  async function captureScreen() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => setTimeout(r, 350)); // let the frame settle
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      track.stop();
      stream.getTracks().forEach((t) => t.stop());
      setCropRect(null);
      setShot(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      /* user cancelled the share picker */
    }
  }

  function cropMouseDown(e) {
    const box = e.currentTarget.getBoundingClientRect();
    dragRef.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    setCropRect({ x: dragRef.current.x, y: dragRef.current.y, w: 0, h: 0 });
  }
  function cropMouseMove(e) {
    if (!dragRef.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const cx = Math.min(Math.max(e.clientX - box.left, 0), box.width);
    const cy = Math.min(Math.max(e.clientY - box.top, 0), box.height);
    setCropRect({
      x: Math.min(dragRef.current.x, cx),
      y: Math.min(dragRef.current.y, cy),
      w: Math.abs(cx - dragRef.current.x),
      h: Math.abs(cy - dragRef.current.y),
    });
  }
  function cropMouseUp() { dragRef.current = null; }

  async function sendShot(useCrop) {
    const img = shotImgRef.current;
    if (!img) return;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const r = useCrop && cropRect && cropRect.w > 8 && cropRect.h > 8
      ? { x: cropRect.x * scaleX, y: cropRect.y * scaleY, w: cropRect.w * scaleX, h: cropRect.h * scaleY }
      : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    // Downscale so the payload stays small (max 1280px wide).
    const outW = Math.min(1280, r.w);
    const outH = Math.round((outW / r.w) * r.h);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const src = new Image();
    src.src = shot;
    await new Promise((res) => { src.onload = res; });
    canvas.getContext("2d").drawImage(src, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
    let quality = 0.7;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 650000 && quality > 0.3) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    try {
      const msg = await apiFetch("/chat", { method: "POST", token, body: { text: text.trim(), imageData: dataUrl } });
      setText("");
      setShot(null);
      setMessages((prev) => {
        const next = [...prev, msg];
        localStorage.setItem(LAST_SEEN_KEY, msg._id);
        return next;
      });
    } catch (err) { alert(err.message); }
  }

  async function setPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024) { alert("Photo must be 100KB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiFetch("/chat/avatar", { method: "POST", token, body: { avatar: reader.result } });
        alert("Photo saved — it shows on your new messages.");
      } catch (err) { alert(err.message); }
    };
    reader.readAsDataURL(file);
  }

  async function react(m, emoji) {
    try {
      const updated = await apiFetch(`/chat/${m._id}/react`, { method: "POST", token, body: { emoji } });
      setMessages((prev) => prev.map((x) => (x._id === m._id ? updated : x)));
    } catch (err) { alert(err.message); }
  }

  return (
    <>
      {/* Incoming-message preview popup (closed state only) */}
      {!open && preview && (
        <button
          onClick={() => { setPreview(null); setOpen(true); markSeen(messages); }}
          className="fixed bottom-24 right-5 z-50 max-w-[18rem] rounded-2xl border border-emerald-200 bg-white p-3 text-left shadow-2xl animate-[fadeIn_.2s_ease-out]"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
            <MessageCircle size={12} /> {preview.name}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-700">{preview.text}</div>
          <div className="mt-1 text-[10px] text-slate-400">Click to open chat</div>
        </button>
      )}

      {/* Launcher */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setPreview(null); markSeen(messages); }}
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
            <div className="flex items-center gap-1">
              <label className="cursor-pointer rounded-lg p-1 hover:bg-emerald-700" title="Set my profile photo">
                <Camera size={15} />
                <input type="file" accept="image/*" onChange={setPhoto} className="hidden" />
              </label>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-emerald-700">
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {messages.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No messages yet — say hi!</div>
            ) : messages.map((m) => {
              const mine = m.fromId === myId;
              const canModerate = mine || user?.role === "admin";
              if (m.deleted) {
                return (
                  <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[80%] rounded-2xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs italic text-slate-400">
                      message deleted
                    </div>
                  </div>
                );
              }
              if (editingId === m._id) {
                return (
                  <div key={m._id} className="flex justify-end">
                    <div className="w-[85%] rounded-2xl border border-emerald-300 bg-white p-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        autoFocus
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      />
                      <div className="mt-1 flex justify-end gap-1">
                        <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><X size={12} /></button>
                        <button
                          onClick={async () => {
                            const t = editDraft.trim();
                            if (!t) return;
                            try {
                              const updated = await apiFetch(`/chat/${m._id}`, { method: "PATCH", token, body: { text: t } });
                              setMessages((prev) => prev.map((x) => (x._id === m._id ? updated : x)));
                              setEditingId(null);
                            } catch (err) { alert(err.message); }
                          }}
                          className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m._id} className={`group flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (
                    m.fromAvatar
                      ? <img src={m.fromAvatar} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover border border-slate-200" />
                      : <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-white">{(m.fromName || "?").slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className={`relative max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${mine ? "bg-emerald-600 text-white" : "bg-white border border-slate-200"}`}>
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className={`text-[11px] font-bold ${mine ? "text-emerald-100" : m.fromRole === "admin" ? "text-amber-600" : "text-slate-800"}`}>
                        {mine ? "You" : m.fromName}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${mine ? "bg-emerald-700 text-emerald-100" : ROLE_TONE[m.fromRole] || "bg-slate-100 text-slate-600"}`}>
                        {ROLE_LABEL[m.fromRole] || m.fromRole}
                      </span>
                    </div>
                    {m.imageData && (
                      <a href={m.imageData} target="_blank" rel="noopener noreferrer" title="Open full size">
                        <img src={m.imageData} alt="screenshot" className="mb-1 max-h-48 rounded-lg border border-black/10" />
                      </a>
                    )}
                    {m.text && <div className={`whitespace-pre-wrap text-sm ${mine ? "" : "text-slate-800"}`}>{m.text}</div>}
                    <div className={`mt-0.5 flex items-center justify-end gap-1 text-[9px] ${mine ? "text-emerald-100" : "text-slate-400"}`}>
                      {m.editedAt && <span className="italic">edited</span>}
                      <span>{fmtTime(m.createdAt)}</span>
                    </div>
                    {(m.reactions || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.reactions.map((rx, i) => (
                          <span key={i} title={`${rx.by} (${rx.byRole})`}
                            className={`rounded-full px-1.5 py-0.5 text-[11px] ${rx.byRole === "admin" ? "bg-amber-200 ring-1 ring-amber-400" : "bg-slate-100"}`}>
                            {rx.byRole === "admin" ? "👑" : ""}{rx.emoji}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={`absolute -bottom-2 ${mine ? "-left-2" : "-right-2"} hidden gap-0.5 group-hover:flex`}>
                      {["👍", "❤️", "😂", "✅"].map((e) => (
                        <button key={e} onClick={() => react(m, e)}
                          className="rounded-full border border-slate-200 bg-white px-1 text-[11px] shadow hover:scale-110">
                          {e}
                        </button>
                      ))}
                    </div>
                    {canModerate && (
                      <div className={`absolute -top-2 ${mine ? "-left-2" : "-right-2"} hidden gap-0.5 group-hover:flex`}>
                        {mine && (
                          <button
                            onClick={() => { setEditingId(m._id); setEditDraft(m.text); }}
                            className="rounded-full border border-slate-200 bg-white p-1 text-slate-500 shadow hover:text-emerald-600"
                            title="Edit"
                          >
                            <Pencil size={10} />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!window.confirm("Delete this message?")) return;
                            try {
                              await apiFetch(`/chat/${m._id}`, { method: "DELETE", token });
                              setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, deleted: true, text: "" } : x)));
                            } catch (err) { alert(err.message); }
                          }}
                          className="rounded-full border border-slate-200 bg-white p-1 text-slate-500 shadow hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(() => {
            const last = messages[messages.length - 1];
            if (!last) return null;
            const seenBy = seenList.filter(
              (x) => x.userId !== myId && x.lastSeenId && x.lastSeenId >= last._id
            );
            if (!seenBy.length) return null;
            return (
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-1 text-right text-[10px] text-slate-400">
                Seen by {seenBy.map((x) => x.name).join(", ")}
              </div>
            );
          })()}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
            <button
              type="button"
              onClick={captureScreen}
              title="Send a screenshot (pick screen, then crop)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300"
            >
              <Monitor size={15} />
            </button>
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
      {/* Screenshot crop overlay */}
      {shot && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/70 p-4">
          <div className="mb-2 rounded-xl bg-white/90 px-4 py-1.5 text-xs font-semibold text-slate-700">
            Drag to crop, then send — or send the full screen.
          </div>
          <div
            className="relative max-h-[70vh] max-w-[90vw] cursor-crosshair select-none overflow-hidden rounded-xl border-2 border-white/40"
            onMouseDown={cropMouseDown}
            onMouseMove={cropMouseMove}
            onMouseUp={cropMouseUp}
            onMouseLeave={cropMouseUp}
          >
            <img ref={shotImgRef} src={shot} alt="capture" className="max-h-[70vh] max-w-[90vw]" draggable={false} />
            {cropRect && cropRect.w > 2 && (
              <div
                className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/15"
                style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
              />
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setShot(null)} className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">Cancel</button>
            <button onClick={() => sendShot(false)} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">Send full screen</button>
            <button
              onClick={() => sendShot(true)}
              disabled={!cropRect || cropRect.w < 9}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Send selection
            </button>
          </div>
        </div>
      )}
    </>
  );
}
