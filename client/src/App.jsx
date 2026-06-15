import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/public/HomePage";
import TwoFactorSetup from "./pages/TwoFactorSetup";
import { AuthProvider, useAuth } from "./context/AuthContext";
import InstallPrompt from "./components/InstallPrompt";
import Toaster from "./components/Toast";
import OnlineStatus from "./components/OnlineStatus";
import AdminAuthzGate from "./components/AdminAuthzGate";
import StagingBanner from "./components/StagingBanner";
import NativeBoot from "./components/NativeBoot";

// Role dashboards + public sub-pages are lazy-loaded so each user only
// downloads the code they need (much faster startup, esp. on phones).
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const WaterBillingDashboard = lazy(() => import("./pages/water/WaterBillingDashboard"));
const LoanDashboard = lazy(() => import("./pages/loan/LoanDashboard"));
const MeterReadingDashboard = lazy(() => import("./pages/meter/MeterReadingDashboard"));
const PlumberDashboard = lazy(() => import("./pages/plumber/PlumberDashboard"));
const CashierDashboard = lazy(() => import("./pages/cashier/CashierDashboard"));
const ManagerDashboard = lazy(() => import("./pages/manager/ManagerDashboard"));
const AuditDashboard = lazy(() => import("./pages/audit/AuditDashboard"));
const BookkeeperDashboard = lazy(() => import("./pages/bookkeeper/BookkeeperDashboard"));
const MemberInquiryPage = lazy(() => import("./pages/public/MemberInquiryPage"));
const MemberAppPage = lazy(() => import("./pages/public/MemberAppPage"));
const TariffCalculatorPage = lazy(() => import("./pages/public/TariffCalculatorPage"));
const CheckBalancePage = lazy(() => import("./pages/public/CheckBalancePage"));
const AboutPage = lazy(() => import("./pages/public/AboutPage"));
const ContactPage = lazy(() => import("./pages/public/ContactPage"));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Loading…
    </div>
  );
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/employee-login" replace />;

  // Single source of truth — the same map Protected uses, so a new
  // role only needs one entry (the old per-role if-chain silently
  // dropped "manager" logins back to the login page).
  const home = ROLE_HOME[user.role];
  return <Navigate to={home || "/employee-login"} replace />;
}

// Maps a role to its canonical dashboard path. Used by Protected when a
// signed-in user lands on a route their role can't access — they're sent
// to their own dashboard instead of the public homepage.
const ROLE_HOME = {
  admin: "/admin",
  manager: "/manager",
  audit_committee: "/audit",
  water_bill_officer: "/water",
  loan_officer: "/loan",
  meter_reader: "/meter",
  plumber: "/plumber",
  cashier: "/cashier",
  bookkeeper: "/bookkeeper",
};

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/employee-login" replace />;
  if (roles && !roles.includes(user.role)) {
    const home = ROLE_HOME[user.role] || "/";
    return <Navigate to={home} replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <NativeBoot />
      <StagingBanner />
      <InstallPrompt />
      <OnlineStatus />
      <Toaster />
      <AdminAuthzGate />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* PUBLIC PAGES */}
        <Route path="/" element={<HomePage />} />
        <Route path="/employee-login" element={<LoginPage />} />
        <Route path="/app" element={<MemberAppPage />} />
        <Route path="/inquiry" element={<MemberInquiryPage />} />
        <Route path="/calculator" element={<TariffCalculatorPage />} />
        <Route path="/check-balance" element={<CheckBalancePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Role-based home redirect for authenticated users */}
        <Route path="/dashboard" element={<RoleHome />} />

        {/* 2FA enrollment (any logged-in role) */}
        <Route
          path="/setup-2fa"
          element={
            <Protected>
              <TwoFactorSetup />
            </Protected>
          }
        />

        <Route
          path="/admin"
          element={
            <Protected roles={["admin"]}>
              <AdminDashboard />
            </Protected>
          }
        />

        <Route
          path="/manager"
          element={
            <Protected roles={["admin", "manager"]}>
              <ManagerDashboard />
            </Protected>
          }
        />

        <Route
          path="/audit"
          element={
            <Protected roles={["admin", "audit_committee"]}>
              <AuditDashboard />
            </Protected>
          }
        />

        <Route
          path="/water"
          element={
            <Protected roles={["admin", "water_bill_officer"]}>
              <WaterBillingDashboard />
            </Protected>
          }
        />

        <Route
          path="/loan"
          element={
            <Protected roles={["admin", "loan_officer"]}>
              <LoanDashboard />
            </Protected>
          }
        />

        <Route
          path="/meter"
          element={
            <Protected roles={["admin", "meter_reader"]}>
              <MeterReadingDashboard />
            </Protected>
          }
        />

        <Route
          path="/plumber"
          element={
            <Protected roles={["plumber"]}>
              <PlumberDashboard />
            </Protected>
          }
        />

        <Route
          path="/cashier"
          element={
            <Protected roles={["admin", "cashier"]}>
              <CashierDashboard />
            </Protected>
          }
        />

        <Route
          path="/bookkeeper"
          element={
            <Protected roles={["admin", "bookkeeper"]}>
              <BookkeeperDashboard />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}