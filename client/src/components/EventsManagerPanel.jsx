// Admin/Manager events manager: create/edit/delete posts (title, description,
// up to 5 images) and see how many people viewed + reacted to each.
import { useEffect, useState } from "react";
import Card from "./Card";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../lib/realtime";
import { toast } from "./Toast";
import { CalendarDays, Plus, Edit3, Trash2, Eye, Image as ImageIcon, X, RefreshCw, Save, Link as LinkIcon } from "lucide-react";

const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" }, { key: "love", emoji: "❤️", label: "Love" }, { key: "celebrate", emoji: "🎉", label: "Celebrate" },
  { key: "support", emoji: "🙏", label: "Support" }, { key: "wow", emoji: "😮", label: "Wow" }, { key: "sad", emoji: "😢", label: "Sad" },
];
const when = (d) => (d ? new Date(d).toLocaleString() : "—");

// File → small JPEG data URL (≤~900px) so event photos stay reasonable.
function readImageAsThumb(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) { height = Math.round((height * maxSize) / width); width = maxSize; }
          else { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EventsManagerPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null); // { _id?, title, description, images[], published }

  async function load() {
    setLoading(true);
    try { const r = await apiFetch("/events", { token }); setItems(r.items || []); }
    catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useRealtime(["events"], load);

  function openNew() { setEditor({ title: "", description: "", images: [], published: true }); }
  async function openEdit(p) {
    try { const full = await apiFetch(`/events/${p._id}`, { token }); setEditor({ ...full }); }
    catch (e) { toast.error(e.message); }
  }
  async function remove(p) {
    if (!window.confirm(`Delete event "${p.title}"? This can't be undone.`)) return;
    try { await apiFetch(`/events/${p._id}`, { method: "DELETE", token }); toast.success("Deleted."); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <CalendarDays size={20} className="text-emerald-600" /> Events & Announcements
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Post news with photos. See how many viewed and reacted. Shown on the public Events page.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"><Plus size={16} /> New event</button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No events yet. Click “New event”.</div>
        ) : items.map((p) => (
          <div key={p._id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{p.title}</span>
                  {!p.published && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">Draft</span>}
                  {p.imageCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"><ImageIcon size={10} /> {p.imageCount}</span>}
                </div>
                {p.description && <div className="mt-1 line-clamp-1 text-sm text-slate-500">{p.description}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Eye size={13} /> {p.views} seen</span>
                  <span className="inline-flex cursor-help items-center gap-1.5" title={REACTIONS.map((r) => `${r.label}: ${p.reactions?.[r.key] || 0}`).join("   ·   ")}>
                    {REACTIONS.map((r) => (p.reactions?.[r.key] || 0) > 0 ? <span key={r.key} className="tabular-nums">{r.emoji}{p.reactions[r.key]}</span> : null)}
                    {p.totalReactions === 0 ? <span className="text-slate-400">no reactions yet</span> : <span className="text-slate-400">· {p.totalReactions} total</span>}
                  </span>
                  <span className="text-slate-400">{when(p.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <a href={`/events/${p._id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Open public post"><LinkIcon size={13} /></a>
                <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 size={13} /> Edit</button>
                <button onClick={() => remove(p)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editor && <EventEditor token={token} initial={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
    </Card>
  );
}

function EventEditor({ token, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const editing = !!initial._id;

  async function addImages(files) {
    const room = 5 - form.images.length;
    if (room <= 0) return toast.error("Up to 5 images.");
    const picked = Array.from(files).slice(0, room);
    try {
      const b64s = await Promise.all(picked.map((f) => readImageAsThumb(f)));
      setForm((s) => ({ ...s, images: [...s.images, ...b64s] }));
    } catch { toast.error("Couldn't read an image."); }
  }
  const removeImage = (i) => setForm((s) => ({ ...s, images: s.images.filter((_, k) => k !== i) }));
  const move = (i, d) => setForm((s) => {
    const arr = [...s.images]; const j = i + d;
    if (j < 0 || j >= arr.length) return s;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...s, images: arr };
  });

  async function save() {
    if (!form.title.trim()) return toast.error("Title is required.");
    setBusy(true);
    try {
      const body = { title: form.title.trim(), description: form.description, images: form.images, published: form.published };
      if (editing) await apiFetch(`/events/${initial._id}`, { method: "PUT", token, body });
      else await apiFetch("/events", { method: "POST", token, body });
      toast.success(editing ? "Event updated." : "Event posted.");
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open title={editing ? "Edit event" : "New event"} onClose={onClose} size="lg">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-700">Title *</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="e.g. General Assembly 2026" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Description</label>
          <textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Details of the event / announcement…" />
        </div>

        {/* Images */}
        <div>
          <label className="text-xs font-semibold text-slate-700">Photos ({form.images.length}/5)</label>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {form.images.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button onClick={() => removeImage(i)} className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100" title="Remove"><X size={12} /></button>
                <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded bg-black/55 px-1.5 text-xs text-white disabled:opacity-30">←</button>
                  <button onClick={() => move(i, 1)} disabled={i === form.images.length - 1} className="rounded bg-black/55 px-1.5 text-xs text-white disabled:opacity-30">→</button>
                </div>
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1.5 text-[9px] font-bold text-white">Cover</span>}
              </div>
            ))}
            {form.images.length < 5 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 hover:bg-slate-50">
                <Plus size={20} /><span className="text-[10px] font-semibold">Add</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">First image is the cover. Drag order with ← →. Auto-resized for the web.</div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          <span className="font-semibold text-slate-700">Published</span> <span className="text-xs text-slate-400">(uncheck to save as a draft)</span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Save size={15} /> {busy ? "Saving…" : editing ? "Save changes" : "Post event"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
