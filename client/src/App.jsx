import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/public/HomePage";
import TwoFactorSetup from "./pages/TwoFactorSetup";
import { AuthProvider, useAuth } from "./context/AuthContext";
import InstallPrompt from "./components/InstallPrompt";
import Toaster from "./components/Toast";

// Role dashboards + public sub-pages are lazy-loaded so each user only
// downloads the code they need (much faster startup, esp. on phones).
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const WaterBillingDashboard = lazy(() => import("./pages/water/WaterBillingDashboard"));
const LoanDashboard = lazy(() => import("./pages/loan/LoanDashboard"));
const MeterReadingDashboard = lazy(() => import("./pages/meter/MeterReadingDashboard"));
const PlumberDashboard = lazy(() => import("./pages/plumber/PlumberDashboard"));
const CashierDashboard = lazy(() => import("./pages/cashier/CashierDashboard"));
const MemberInquiryPage = lazy(() => import("./pages/public/MemberInquiryPage"));
const TariffCalculatorPage = lazy(() => import("./pages/public/TariffCalculatorPage"));
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

  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "water_bill_officer") return <Navigate to="/water" replace />;
  if (user.role === "loan_officer") return <Navigate to="/loan" replace />;
  if (user.role === "meter_reader") return <Navigate to="/meter" replace />;
  if (user.role === "plumber") return <Navigate to="/plumber" replace />;
  if (user.role === "cashier") return <Navigate to="/cashier" replace />;

  return <Navigate to="/employee-login" replace />;
}

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/employee-login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <InstallPrompt />
      <Toaster />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* PUBLIC PAGES */}
        <Route path="/" element={<HomePage />} />
        <Route path="/employee-login" element={<LoginPage />} />
        <Route path="/inquiry" element={<MemberInquiryPage />} />
        <Route path="/calculator" element={<TariffCalculatorPage />} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}