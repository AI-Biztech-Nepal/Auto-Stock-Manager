import "@/App.css";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { canAccessPath, ROLE_DEFAULT_PATH } from "./utils/permissions";
import { startUpdateChecker } from "./utils/updateChecker";
import Layout from "./components/Layout";

// Route-level code splitting: previously every page was imported eagerly here,
// so the browser downloaded and parsed the whole app's JS before the first
// screen (even the login page) could render. Lazy-loading means only the
// current route's chunk is fetched.
const Login = lazy(() => import("./pages/Login"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const JobCards = lazy(() => import("./pages/JobCards"));
const Warranty = lazy(() => import("./pages/Warranty"));
const Reports = lazy(() => import("./pages/Reports"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Settings = lazy(() => import("./pages/Settings"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Finance = lazy(() => import("./pages/Finance"));
const SpareParts = lazy(() => import("./pages/SpareParts"));
const Sales = lazy(() => import("./pages/Sales"));
const SaleDetail = lazy(() => import("./pages/SaleDetail"));
const SoldStockDetail = lazy(() => import("./pages/SoldStockDetail"));
const Share = lazy(() => import("./pages/Share"));
const ImportStock = lazy(() => import("./pages/ImportStock"));
const Platform = lazy(() => import("./pages/Platform"));

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

// Old Sold Stock detail links (bookmarks, other tabs) -> the vehicle view under Sales.
const SoldStockRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/sales/vehicle/${id}`} replace />;
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
        <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
        <Route path="/verify-email" element={<PublicRoute><VerifyEmail /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<HomeRoute />} />
          <Route path="inventory" element={<RoleRoute path="/inventory"><Inventory /></RoleRoute>} />
          <Route path="inventory/:id" element={<RoleRoute path="/inventory/detail"><VehicleDetail /></RoleRoute>} />
          <Route path="import-stock" element={<RoleRoute path="/import-stock"><ImportStock /></RoleRoute>} />
          <Route path="jobs" element={<RoleRoute path="/jobs"><JobCards /></RoleRoute>} />
          <Route path="warranty" element={<RoleRoute path="/warranty"><Warranty /></RoleRoute>} />
          <Route path="ledger" element={<RoleRoute path="/ledger"><Ledger /></RoleRoute>} />
          {/* Customers, Vendors and Team were folded into the Ledger tab. */}
          <Route path="customers" element={<Navigate to="/ledger?tab=customers" replace />} />
          <Route path="vendors" element={<Navigate to="/ledger?tab=vendors" replace />} />
          <Route path="team" element={<Navigate to="/ledger?tab=staff" replace />} />
          <Route path="reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
          <Route path="finance" element={<RoleRoute path="/finance"><Finance /></RoleRoute>} />
          <Route path="spare-parts" element={<RoleRoute path="/spare-parts"><SpareParts /></RoleRoute>} />
          <Route path="sales" element={<RoleRoute path="/sales"><Sales /></RoleRoute>} />
          <Route path="sales/:id" element={<RoleRoute path="/sales/detail"><SaleDetail /></RoleRoute>} />
          <Route path="sales/vehicle/:id" element={<RoleRoute path="/sales/vehicle"><SoldStockDetail /></RoleRoute>} />
          {/* Sold Stock was merged into Sales. */}
          <Route path="sold-stock" element={<Navigate to="/sales" replace />} />
          <Route path="sold-stock/:id" element={<SoldStockRedirect />} />
          <Route path="share" element={<RoleRoute path="/share"><Share /></RoleRoute>} />
          <Route path="ai" element={<RoleRoute path="/ai"><AIAssistant /></RoleRoute>} />
          <Route path="settings" element={<Settings />} />
          <Route path="platform" element={<RoleRoute path="/platform"><Platform /></RoleRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  // Poll for a newer deployed build every 5 min and reload onto it — keeps long-open
  // tabs and the Android WebView wrapper from getting stuck on a stale bundle.
  useEffect(() => {
    const id = startUpdateChecker();
    return () => clearInterval(id);
  }, []);

  return (
    <AuthProvider>
      {/* basename: empty/"/" for the normal root-hosted deployments (Vercel, the sslip.io
          subdomain) -- CRA only sets PUBLIC_URL when a build is explicitly given one (e.g.
          the raw-IP /auto-stock/ path build), so this is a no-op everywhere else. */}
      <BrowserRouter basename={process.env.PUBLIC_URL}>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
