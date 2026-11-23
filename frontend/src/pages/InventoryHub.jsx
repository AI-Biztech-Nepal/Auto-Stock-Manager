import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccessPath } from "../utils/permissions";
import FeatureOff from "../components/FeatureOff";

// Inventory is two pages under one side-panel item: Product (the vehicles, this page's default) and Spare Parts
// (?tab=spare-parts). Lazy, so opening one doesn't load the other.
const Inventory = lazy(() => import("./Inventory"));
const SpareParts = lazy(() => import("./SpareParts"));

export default function InventoryHub() {
  const { user, features } = useAuth();
  const [params] = useSearchParams();
  const spareParts = params.get("tab") === "spare-parts" && canAccessPath(user?.role, "/spare-parts");
  if (spareParts && !canAccessPath(user?.role, "/spare-parts", features)) return <FeatureOff />;
  return (
    <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
      {spareParts ? <SpareParts /> : <Inventory />}
    </Suspense>
  );
}
