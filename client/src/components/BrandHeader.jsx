import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";

export default function BrandHeader({ title, subtitle }) {
  const { user, logout } = useAuth();

  return (
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white px-6 py-5 shadow-sm border border-slate-200">
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-green-600" />

      <div className="flex items-start gap-4">
        <img
          src={logo}
          alt="POWASSCO Logo"
          className="h-12 w-12 rounded-xl object-contain"
        />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
            POWASSCO Multipurpose Cooperative
          </p>

          <h1 className="relative inline-block mt-1 text-2xl font-bold text-slate-900">
            <span className="relative z-10">{title}</span>
            <span className="absolute left-0 bottom-1 -z-0 h-3 w-full rounded bg-green-100"></span>
          </h1>

          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 max-w-xl">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 sm:text-right">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold uppercase">
          {user?.fullName?.charAt(0) || "U"}
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-800">{user?.fullName}</div>
          <div className="text-xs text-slate-500">{user?.employeeId} • {user?.role}</div>

          <button
            onClick={logout}
            className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
