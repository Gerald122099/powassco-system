import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import logo from "../assets/logo.png";
import { Menu, X, LogOut } from "lucide-react";

const links = [
  { to: "/", label: "Home" },
  { to: "/inquiry", label: "Bill Inquiry" },
  { to: "/calculator", label: "Tariff Calculator" },
  { to: "/contact", label: "Contact Us" },
  { to: "/about", label: "About" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // close the mobile menu when the route changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [location]);

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="POWASSCO" className="h-9 w-9 rounded-lg object-contain" />
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">POWASSCO</div>
            <div className="text-[11px] text-slate-500">Multipurpose Cooperative</div>
          </div>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(l.to)
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {user && (
            <button
              onClick={logout}
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <LogOut size={15} /> Logout
            </button>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-slate-200 bg-white px-5 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive(l.to) ? "bg-emerald-50 text-emerald-700" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {user && (
              <button
                onClick={logout}
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                <LogOut size={15} /> Logout
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
