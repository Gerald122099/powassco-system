import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { apiFetch } from "../../lib/api";
import { CalendarDays, Eye, Share2, ArrowLeft, X, ChevronLeft, ChevronRight, Loader2, Check } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:5000/api").replace(/\/+$/, "");
// ?v=updatedAt busts the long browser cache when a post's images change.
const imgUrl = (id, idx, ver = 0) => `${API_BASE}/public/events/${id}/image/${idx}?v=${ver}`;

// Formal reactions only — no "haha".
const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
  { key: "support", emoji: "🙏", label: "Support" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "sad", emoji: "😢", label: "Sad" },
];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");

export default function EventsPage() {
  const { id } = useParams();
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 pb-16 pt-24">
        <div className="mx-auto max-w-3xl">
          {id ? <EventDetail id={id} /> : <EventsList />}
        </div>
      </div>
    </>
  );
}

function EventsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/public/events")
      .then((r) => setItems(r.items || []))
      .catch((e) => setErr(e.message || "Failed to load events."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="text-center">
        <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
          <CalendarDays className="text-emerald-600" size={28} /> Events & Announcements
        </h1>
        <p className="mt-2 text-sm text-slate-500">News and happenings from POWASSCO Multipurpose Cooperative.</p>
      </div>
      {loading ? (
        <div className="py-20 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /> Loading…</div>
      ) : err ? (
        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">{err}</div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">No events yet — check back soon.</div>
      ) : (
        <div className="mt-6 space-y-5">
          {items.map((p) => <EventCard key={p._id} p={p} />)}
        </div>
      )}
    </>
  );
}

function EventCard({ p }) {
  const total = REACTIONS.reduce((s, r) => s + (p.reactions?.[r.key] || 0), 0);
  return (
    <Link to={`/events/${p._id}`} className="block overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {p.imageCount > 0 && <ImageCollage id={p._id} count={p.imageCount} compact ver={Date.parse(p.updatedAt) || 0} />}
      <div className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{fmtDate(p.createdAt)}</div>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{p.title}</h2>
        {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span>{topReactionEmojis(p.reactions)} {total > 0 ? total : ""}</span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald-700">Read more →</span>
        </div>
      </div>
    </Link>
  );
}

function topReactionEmojis(reactions) {
  return REACTIONS.filter((r) => (reactions?.[r.key] || 0) > 0)
    .sort((a, b) => (reactions[b.key] || 0) - (reactions[a.key] || 0))
    .slice(0, 3).map((r) => r.emoji).join("");
}

function EventDetail({ id }) {
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(-1);
  const [myReact, setMyReact] = useState(() => { try { return localStorage.getItem(`pow_evt_react_${id}`) || ""; } catch { return ""; } });
  const [reactions, setReactions] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch(`/public/events/${id}`)
      .then((p) => { if (!alive) return; setPost(p); setReactions(p.reactions); })
      .catch((e) => { if (alive) setErr(e.message || "Event not found."); });
    // Count a view once per browser.
    try {
      const seen = localStorage.getItem(`pow_evt_view_${id}`);
      if (!seen) { apiFetch(`/public/events/${id}/view`, { method: "POST" }).catch(() => {}); localStorage.setItem(`pow_evt_view_${id}`, "1"); }
    } catch { /* ignore */ }
    return () => { alive = false; };
  }, [id]);

  async function react(key) {
    const prev = myReact;
    const next = prev === key ? "" : key; // toggle off if same
    // optimistic
    setReactions((r) => {
      const c = { ...r };
      if (prev) c[prev] = Math.max(0, (c[prev] || 0) - 1);
      if (next) c[next] = (c[next] || 0) + 1;
      return c;
    });
    setMyReact(next);
    try { localStorage.setItem(`pow_evt_react_${id}`, next); } catch { /* ignore */ }
    try {
      // reaction="" + prev set → server only decrements prev (a clear/toggle-off).
      const r = await apiFetch(`/public/events/${id}/react`, { method: "POST", body: { reaction: next, prev } });
      if (r?.reactions) setReactions(r.reactions);
    } catch { /* keep optimistic */ }
  }

  async function share() {
    const url = `${window.location.origin}/events/${id}`;
    try {
      if (navigator.share) { await navigator.share({ title: post?.title, text: post?.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* user cancelled */ }
  }

  if (err) return (
    <div className="mt-10 text-center">
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      <Link to="/events" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ArrowLeft size={15} /> All events</Link>
    </div>
  );
  if (!post) return <div className="py-20 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /> Loading…</div>;

  const total = REACTIONS.reduce((s, r) => s + (reactions?.[r.key] || 0), 0);

  return (
    <article>
      <button onClick={() => navigate("/events")} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={15} /> All events</button>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {post.imageCount > 0 && <ImageCollage id={id} count={post.imageCount} onOpen={setLightbox} ver={Date.parse(post.updatedAt) || 0} />}
        <div className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{fmtDate(post.createdAt)}{post.createdBy ? ` · ${post.createdBy}` : ""}</div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{post.title}</h1>
          {post.description && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{post.description}</p>}

          {/* Reaction bar */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {REACTIONS.map((r) => {
              const active = myReact === r.key;
              return (
                <button key={r.key} onClick={() => react(r.key)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <span className="text-base leading-none">{r.emoji}</span>
                  <span>{r.label}</span>
                  {(reactions?.[r.key] || 0) > 0 && <span className={`text-xs ${active ? "text-white/90" : "text-slate-400"}`}>{reactions[r.key]}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{total} reaction{total === 1 ? "" : "s"}</span>
            <button onClick={share} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900">
              {copied ? <><Check size={13} /> Link copied!</> : <><Share2 size={13} /> Share</>}
            </button>
          </div>
        </div>
      </div>

      {lightbox >= 0 && (
        <Lightbox id={id} count={post.imageCount} index={lightbox} ver={Date.parse(post.updatedAt) || 0} onClose={() => setLightbox(-1)} onIndex={setLightbox} />
      )}
    </article>
  );
}

// Adaptive image collage (1–5). compact = list-card height; otherwise taller.
function ImageCollage({ id, count, onOpen, compact, ver = 0 }) {
  const n = Math.min(count, 5);
  const idxs = Array.from({ length: n }, (_, i) => i);
  // cell() returns JSX (not a component) so we don't define a component
  // during render.
  const cell = (i, className) => (
    <button key={i} type="button" onClick={(e) => { if (onOpen) { e.preventDefault(); onOpen(i); } }} className={`relative block overflow-hidden bg-slate-100 ${onOpen ? "cursor-zoom-in" : ""} ${className}`}>
      <img src={imgUrl(id, i, ver)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
    </button>
  );
  const h = compact ? "h-44 sm:h-52" : "h-56 sm:h-72";
  if (n === 1) return <div className={h}>{cell(0, "h-full w-full")}</div>;
  if (n === 2) return <div className={`grid grid-cols-2 gap-0.5 ${h}`}>{idxs.map((i) => cell(i, "h-full w-full"))}</div>;
  if (n === 3) return (
    <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 ${h}`}>
      {cell(0, "row-span-2 h-full w-full")}
      {cell(1, "h-full w-full")}
      {cell(2, "h-full w-full")}
    </div>
  );
  // 4 or 5
  return (
    <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 ${compact ? "h-48 sm:h-56" : "h-64 sm:h-80"}`}>
      {idxs.slice(0, 4).map((i, k) => (
        <div key={i} className="relative h-full w-full">
          {cell(i, "h-full w-full")}
          {k === 3 && n > 4 && (
            <button type="button" onClick={(e) => { if (onOpen) { e.preventDefault(); onOpen(3); } }} className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-bold text-white">+{n - 4}</button>
          )}
        </div>
      ))}
    </div>
  );
}

function Lightbox({ id, count, index, onClose, onIndex, ver = 0 }) {
  const n = Math.min(count, 5);
  const go = (d) => onIndex((index + d + n) % n);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={onClose}><X size={22} /></button>
      {n > 1 && <button className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft size={24} /></button>}
      <img src={imgUrl(id, index, ver)} alt="" className="max-h-[90vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      {n > 1 && <button className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight size={24} /></button>}
      <div className="absolute bottom-4 text-sm text-white/70">{index + 1} / {n}</div>
    </div>
  );
}
