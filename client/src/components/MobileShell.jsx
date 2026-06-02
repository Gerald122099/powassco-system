// Native-app-style mobile shell. Used by the Plumber (field reader)
// dashboard since that role works exclusively on a phone.
//
// Layout:
//   • Slim top bar (logo, title, profile chip, logout) — no sidebar.
//   • Full-width content fills the screen between the top bar and the
//     bottom tab bar; min-height uses 100dvh so the keyboard doesn't
//     crop the scroll area on Android.
//   • Bottom tab bar fixed to the viewport with safe-area padding for
//     Android's gesture pill / iOS home indicator.
//
// Drop-in compatible with the same `items` / `active` / `onSelect` API
// as DashboardLayout so screens swap with one import change.
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import { LogOut } from "lucide-react";

export default function MobileShell({
  brand = "POWASSCO",
  title = "",
  items = [],
  active,
  onSelect,
  children,
}) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <img src={logo} alt={brand} className="h-9 w-9 rounded-lg object-contain shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-slate-900">{brand}</div>
            <div className="truncate text-[11px] text-slate-500">{title}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <div className="truncate text-xs font-semibold text-slate-800">{user?.fullName}</div>
              <div className="truncate text-[10px] text-slate-500">{user?.employeeId}</div>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 font-bold uppercase">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <button
              onClick={logout}
              aria-label="Logout"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 active:bg-slate-100"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content — bottom padding leaves room for the tab bar +
          safe area + a comfortable margin above the floating Scan FAB. */}
      <main
        className="flex-1 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]"
      >
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid auto-cols-fr grid-flow-col">
          {items.map((it) => {
            const Icon = it.icon;
            const on = active === it.key;
            return (
              <li key={it.key}>
                <button
                  onClick={() => onSelect?.(it.key)}
                  className={`flex w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold transition active:scale-95 ${
                    on ? "text-purple-700" : "text-slate-500"
                  }`}
                >
                  {/* Active indicator pill behind the icon */}
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                      on ? "bg-purple-100" : "bg-transparent"
                    }`}
                  >
                    {Icon && <Icon size={20} strokeWidth={2.2} />}
                  </span>
                  <span className="truncate max-w-full">{it.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
