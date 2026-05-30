// Tiny dependency-free toast — replacement for SweetAlert at a fraction of
// the weight. One <Toaster/> mounted at the app root, then any component
// imports { toast } and calls toast.success("Saved") / toast.error(...) /
// toast.info(...). Single in-memory subscriber, fade-in + auto-dismiss.
import { useEffect, useState } from "react";
import { Check, X, AlertCircle } from "lucide-react";

let subscriber = null;
let counter = 0;

function emit(t) {
  if (subscriber) subscriber({ ...t, id: ++counter });
}

// HMR/fast-refresh-friendly: this module exports both a component and a
// helper. The helper is a stable singleton; consumers import {toast} and
// call .success/.error/.info. The directive below tells react-refresh to
// not treat the named export as a component boundary.
// eslint-disable-next-line react-refresh/only-export-components
export const toast = {
  success: (msg, opts = {}) => emit({ type: "success", msg, ...opts }),
  error: (msg, opts = {}) => emit({ type: "error", msg, ...opts }),
  info: (msg, opts = {}) => emit({ type: "info", msg, ...opts }),
};

const STYLES = {
  success: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    iconBg: "bg-emerald-500",
    Icon: Check,
  },
  error: {
    border: "border-red-200",
    bg: "bg-red-50",
    text: "text-red-800",
    iconBg: "bg-red-500",
    Icon: X,
  },
  info: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    iconBg: "bg-blue-500",
    Icon: AlertCircle,
  },
};

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    subscriber = (t) => {
      setItems((prev) => [...prev, t]);
      const ms = t.duration ?? 2200;
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), ms);
    };
    return () => { subscriber = null; };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        const Icon = s.Icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border ${s.border} ${s.bg} px-4 py-3 shadow-lg animate-[toast-in_180ms_ease-out]`}
            role="status"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.iconBg} text-white`}>
              <Icon size={18} strokeWidth={3} />
            </div>
            <div className={`flex-1 text-sm font-semibold ${s.text}`}>{t.msg}</div>
          </div>
        );
      })}
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(-8px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}
