import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { canAccessPath, ROLE_DEFAULT_PATH } from "./utils/permissions";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import VehicleDetail from "./pages/VehicleDetail";
import JobCards from "./pages/JobCards";
import Customers from "./pages/Customers";
import Team from "./pages/Team";
import Reports from "./pages/Reports";
import Partners from "./pages/Partners";
import AIAssistant from "./pages/AIAssistant";
import Settings from "./pages/Settings";
import Vendors from "./pages/Vendors";
import Finance from "./pages/Finance";
import Marketing from "./pages/Marketing";
import EMI from "./pages/EMI";
import SpareParts from "./pages/SpareParts";
import Sales from "./pages/Sales";
import SaleDetail from "./pages/SaleDetail";
import SoldStock from "./pages/SoldStock";
import ImportStock from "./pages/ImportStock";
import Leads from "./pages/Leads";

const ProtectedRoute = ({ children }) => {
  const { user, token } = useAuth();
  return (user && token) ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, token } = useAuth();
  return !(user && token) ? children : <Navigate to="/" replace />;
};

// Blocks direct URL navigation into a tab the user's role doesn't grant
// (nav already hides the link, but that's not a security boundary on its own).
const RoleRoute = ({ path, children }) => {
  const { user } = useAuth();
  if (!canAccessPath(user?.role, path)) {
    return <Navigate to={ROLE_DEFAULT_PATH[user?.role] || "/"} replace />;
  }
  return children;
};

const HomeRoute = () => {
  const { user } = useAuth();
  if (user?.role && user.role !== "admin") {
    return <Navigate to={ROLE_DEFAULT_PATH[user.role] || "/settings"} replace />;
  }
  return <Dashboard />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<HomeRoute />} />
        <Route path="inventory" element={<RoleRoute path="/inventory"><Inventory /></RoleRoute>} />
        <Route path="inventory/:id" element={<RoleRoute path="/inventory/detail"><VehicleDetail /></RoleRoute>} />
        <Route path="import-stock" element={<RoleRoute path="/import-stock"><ImportStock /></RoleRoute>} />
        <Route path="jobs" element={<RoleRoute path="/jobs"><JobCards /></RoleRoute>} />
        <Route path="customers" element={<RoleRoute path="/customers"><Customers /></RoleRoute>} />
        <Route path="team" element={<RoleRoute path="/team"><Team /></RoleRoute>} />
        <Route path="reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
        <Route path="partners" element={<RoleRoute path="/partners"><Partners /></RoleRoute>} />
        <Route path="vendors" element={<RoleRoute path="/vendors"><Vendors /></RoleRoute>} />
        <Route path="leads" element={<RoleRoute path="/leads"><Leads /></RoleRoute>} />
        <Route path="finance" element={<RoleRoute path="/finance"><Finance /></RoleRoute>} />
        <Route path="marketing" element={<RoleRoute path="/marketing"><Marketing /></RoleRoute>} />
        <Route path="emi" element={<RoleRoute path="/emi"><EMI /></RoleRoute>} />
        <Route path="spare-parts" element={<RoleRoute path="/spare-parts"><SpareParts /></RoleRoute>} />
        <Route path="sales" element={<RoleRoute path="/sales"><Sales /></RoleRoute>} />
        <Route path="sales/:id" element={<RoleRoute path="/sales/detail"><SaleDetail /></RoleRoute>} />
        <Route path="sold-stock" element={<RoleRoute path="/sold-stock"><SoldStock /></RoleRoute>} />
        <Route path="ai" element={<RoleRoute path="/ai"><AIAssistant /></RoleRoute>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
