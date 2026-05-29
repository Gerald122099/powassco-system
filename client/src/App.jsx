import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/public/HomePage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import WaterBillingDashboard from "./pages/water/WaterBillingDashboard";
import LoanDashboard from "./pages/loan/LoanDashboard";
import MeterReadingDashboard from "./pages/meter/MeterReadingDashboard";
import MemberInquiryPage from "./pages/public/MemberInquiryPage";
import TariffCalculatorPage from "./pages/public/TariffCalculatorPage";
import AboutPage from "./pages/public/AboutPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import InstallPrompt from "./components/InstallPrompt";

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "water_bill_officer") return <Navigate to="/water" replace />;
  if (user.role === "loan_officer") return <Navigate to="/loan" replace />;
  if (user.role === "meter_reader") return <Navigate to="/meter" replace />;

  return <Navigate to="/login" replace />;
}

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <InstallPrompt />
      <Routes>
        {/* PUBLIC PAGES */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/inquiry" element={<MemberInquiryPage />} />
        <Route path="/calculator" element={<TariffCalculatorPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* Role-based home redirect for authenticated users */}
        <Route path="/dashboard" element={<RoleHome />} />

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}