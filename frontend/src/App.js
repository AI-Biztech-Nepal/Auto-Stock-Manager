import "@/App.css";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { canAccessPath, ROLE_DEFAULT_PATH } from "./utils/permissions";
import Layout from "./components/Layout";
import SuperAdminLayout from "./components/SuperAdminLayout";

// Route-level code splitting: previously every page was imported eagerly here,
// so the browser downloaded and parsed the whole app's JS before the first
// screen (even the login page) could render. Lazy-loading means only the
// current route's chunk is fetched.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const JobCards = lazy(() => import("./pages/JobCards"));
const Customers = lazy(() => import("./pages/Customers"));
const Team = lazy(() => import("./pages/Team"));
const Reports = lazy(() => import("./pages/Reports"));
const Partners = lazy(() => import("./pages/Partners"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Settings = lazy(() => import("./pages/Settings"));
const Vendors = lazy(() => import("./pages/Vendors"));
const Finance = lazy(() => import("./pages/Finance"));
const Marketing = lazy(() => import("./pages/Marketing"));
const EMI = lazy(() => import("./pages/EMI"));
const SpareParts = lazy(() => import("./pages/SpareParts"));
const Sales = lazy(() => import("./pages/Sales"));
const SaleDetail = lazy(() => import("./pages/SaleDetail"));
const SoldStock = lazy(() => import("./pages/SoldStock"));
const SoldStockDetail = lazy(() => import("./pages/SoldStockDetail"));
const ImportStock = lazy(() => import("./pages/ImportStock"));
const Leads = lazy(() => import("./pages/Leads"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));

const RouteFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
  </div>
);

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
    <Suspense fallback={<RouteFallback />}>
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
          <Route path="sold-stock/:id" element={<RoleRoute path="/sold-stock/detail"><SoldStockDetail /></RoleRoute>} />
          <Route path="ai" element={<RoleRoute path="/ai"><AIAssistant /></RoleRoute>} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute>
              <RoleRoute path="/super-admin">
                <SuperAdminLayout><SuperAdmin /></SuperAdminLayout>
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
