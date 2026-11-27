import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { accessLevel, canAccessPath } from "../utils/permissions";
import FeatureOff from "../components/FeatureOff";

// Inventory is two pages under one side-panel item: Product (the vehicles, this page's default) and Spare Parts
// (?tab=spare-parts). Lazy, so opening one doesn't load the other.
const Inventory = lazy(() => import("./Inventory"));
const SpareParts = lazy(() => import("./SpareParts"));

export default function InventoryHub() {
  const { user, features } = useAuth();
  const [params] = useSearchParams();
  // Someone with Spare Parts but no Inventory access (Staff & Access) always gets the Spare Parts page here.
  const spareOnly = accessLevel(user?.role, "inventory") === "none" && accessLevel(user?.role, "spare_parts") !== "none";
  const spareParts = spareOnly || (params.get("tab") === "spare-parts" && canAccessPath(user?.role, "/spare-parts"));
  if (spareParts && !canAccessPath(user?.role, "/spare-parts", features)) return <FeatureOff />;
  return (
    <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
      {spareParts ? <SpareParts /> : <Inventory />}
    </Suspense>
  );
}
