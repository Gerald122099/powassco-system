import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import logo from "../assets/logo.png";
import { LogOut, Eye, CalendarClock, X } from "lucide-react";

function MeetingBanner() {
  const { token } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    apiFetch("/meetings/upcoming", { token }).then(setMeetings).catch(() => {});
  }, [token]);

  if (hidden || meetings.length === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
          <CalendarClock size={16} /> Upcoming Schedule
        </div>
        <button onClick={() => setHidden(true)} className="rounded-lg p-1 text-blue-400 hover:bg-blue-100" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {meetings.map((m) => (
          <div key={m._id} className="text-sm text-slate-700">
            {m.type && m.type !== "meeting" && <span className="mr-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">{m.type}</span>}
            <span className="font-semibold">{new Date(m.datetime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
            {" — "}{m.title}
            {m.location ? <span className="text-slate-500"> @ {m.location}</span> : null}
            {m.notes ? <div className="text-xs text-slate-500">{m.notes}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const ACCENTS = {
  purple: { active: "bg-purple-600 text-white", avatar: "bg-purple-100 text-purple-700" },
  emerald: { active: "bg-emerald-600 text-white", avatar: "bg-emerald-100 text-emerald-700" },
  blue: { active: "bg-blue-600 text-white", avatar: "bg-blue-100 text-blue-700" },
  slate: { active: "bg-slate-800 text-white", avatar: "bg-slate-200 text-slate-700" },
};

const reveal =
  "overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100";

// Eye-comfort screen tints (applied as a full-screen overlay).
const TONE_OPTIONS = [
  { key: "normal", label: "Off" },
  { key: "warm", label: "Warm" },
  { key: "cool", label: "Cool" },
  { key: "dim", label: "Dim" },
  { key: "dark", label: "Dark" },
];
const TONE_STYLES = {
  warm: { backgroundColor: "#ff8a00", opacity: 0.12, mixBlendMode: "multiply" },
  cool: { backgroundColor: "#2563eb", opacity: 0.08, mixBlendMode: "multiply" },
  dim: { backgroundColor: "#000000", opacity: 0.3 },
};

export default function DashboardLayout({
  brand = "POWASSCO",
  title,
  accent = "purple",
  items = [],
  active,
  onSelect,
  children,
}) {
  const { user, logout } = useAuth();
  const tones = ACCENTS[accent] || ACCENTS.purple;
  const current = items.find((i) => i.key === active);

  const [tone, setTone] = useState(() => localStorage.getItem("pow_screen_tone") || "normal");
  useEffect(() => {
    localStorage.setItem("pow_screen_tone", tone);
    const root = document.documentElement;
    if (tone === "dark") root.classList.add("pow-dark");
    else root.classList.remove("pow-dark");
    return () => root.classList.remove("pow-dark");
  }, [tone]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar: collapsed rail that expands on hover */}
      <aside className="group fixed left-0 top-0 z-30 flex h-screen w-16 flex-col overflow-x-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out supports-[height:100dvh]:h-[100dvh] hover:w-64 hover:shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-4">
          <img src={logo} alt={brand} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <div className={`min-w-0 ${reveal}`}>
            <div className="truncate text-sm font-bold text-slate-900">{brand}</div>
            <div className="truncate text-[11px] text-slate-500">{title}</div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {items.map((it) => {
            const Icon = it.icon;
            const on = active === it.key;
            return (
              <button
                key={it.key}
                onClick={() => onSelect(it.key)}
                title={it.label}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  on ? `${tones.active} shadow-sm` : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                {Icon && <Icon size={18} strokeWidth={2.2} className="shrink-0" />}
                <span className={reveal}>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-2">
          <div className="mb-2 flex items-center gap-3 px-1">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold uppercase ${tones.avatar}`}>
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className={`min-w-0 ${reveal}`}>
              <div className="truncate text-sm font-semibold text-slate-800">{user?.fullName}</div>
              <div className="truncate text-[11px] text-slate-500">
                {user?.employeeId} • {user?.role}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <LogOut size={16} className="shrink-0" />
            <span className={reveal}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="ml-16 flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{current?.label || title}</h1>
              {current?.desc && <p className="mt-0.5 text-sm text-slate-500">{current.desc}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1" title="Eye comfort (screen tint)">
              <Eye size={15} className="ml-1 mr-0.5 text-slate-400" />
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTone(t.key)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    tone === t.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <MeetingBanner />
          {children}
        </main>
      </div>

      {/* Eye-comfort screen tint overlay (warm / cool / dim) */}
      {TONE_STYLES[tone] && (
        <div className="pointer-events-none fixed inset-0 z-[60]" style={TONE_STYLES[tone]} aria-hidden="true" />
      )}
    </div>
  );
}
