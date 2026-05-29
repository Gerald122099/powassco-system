import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { fileToResizedDataUrl } from "../../lib/imageResize";
import { Megaphone, Plus, Trash2, RefreshCw, Eye, EyeOff, ImagePlus } from "lucide-react";

const inputCls = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export default function AnnouncementsPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setItems(await apiFetch("/announcements", { token }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImage(await fileToResizedDataUrl(file));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function post(e) {
    e.preventDefault();
    if (!title.trim()) return setErr("Title is required.");
    setErr("");
    setSaving(true);
    try {
      await apiFetch("/announcements", { method: "POST", token, body: { title, body, image, published: true } });
      setTitle(""); setBody(""); setImage("");
      flash("Announcement posted.");
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }
  async function togglePublish(a) {
    try {
      await apiFetch(`/announcements/${a._id}`, { method: "PUT", token, body: { published: !a.published } });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function remove(a) {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    try {
      await apiFetch(`/announcements/${a._id}`, { method: "DELETE", token });
      flash("Deleted.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"><Megaphone size={20} className="text-emerald-600" /> Announcements</div>
          <div className="mt-0.5 text-sm text-slate-500">Posted to the public homepage and the navbar bell.</div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <form onSubmit={post} className="mt-5 space-y-3 rounded-2xl border border-slate-200 p-4">
        <div>
          <label className="text-xs font-semibold text-slate-600">Title</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled water interruption" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Description</label>
          <textarea rows={3} className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details of the announcement…" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <ImagePlus size={16} /> {image ? "Change image" : "Add image"}
            <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          </label>
          {image && <img src={image} alt="preview" className="h-16 w-24 rounded-lg border border-slate-200 object-cover" />}
          {image && <button type="button" onClick={() => setImage("")} className="text-xs font-semibold text-red-600">Remove</button>}
        </div>
        <div className="flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Plus size={16} /> {saving ? "Posting…" : "Post Announcement"}</button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No announcements yet.</div>
        ) : (
          items.map((a) => (
            <div key={a._id} className="flex gap-3 rounded-2xl border border-slate-200 p-3">
              {a.image && <img src={a.image} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{a.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.published ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{a.published ? "Published" : "Hidden"}</span>
                </div>
                {a.body && <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</div>}
                <div className="mt-0.5 text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button onClick={() => togglePublish(a)} className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title={a.published ? "Hide" : "Publish"}>{a.published ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button onClick={() => remove(a)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
