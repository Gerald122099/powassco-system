import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Bell, X } from "lucide-react";

export default function AnnouncementsBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch("/public/announcements").then(setItems).catch(() => {});
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        aria-label="Announcements"
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-bold text-slate-900">Announcements</div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No announcements.</div>
              ) : (
                items.map((a) => (
                  <div key={a._id} className="border-b border-slate-50 px-4 py-3 last:border-0">
                    {a.image && <img src={a.image} alt="" className="mb-2 h-28 w-full rounded-lg object-cover" />}
                    <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                    {a.body && <div className="mt-0.5 text-sm text-slate-600">{a.body}</div>}
                    <div className="mt-1 text-xs text-slate-400">{new Date(a.createdAt).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
