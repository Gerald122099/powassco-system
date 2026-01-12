import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import WaterDashboard from "./pages/water/WaterDashboard";
import LoanDashboard from "./pages/loan/LoanDashboard";
import MeterDashboard from "./pages/meter/MeterDashboard";
import MemberInquiryPage from "./pages/public/MemberInquiryPage";
import { AuthProvider, useAuth } from "./context/AuthContext";

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
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* ✅ PUBLIC PAGE (no login required) */}
          <Route path="/inquiry" element={<MemberInquiryPage />} />


          <Route path="/" element={<RoleHome />} />

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
                <WaterDashboard />
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
                <MeterDashboard />
              </Protected>
            }
          />
        
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
