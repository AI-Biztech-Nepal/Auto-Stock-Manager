import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ChevronRight, Archive } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, formatOwnership } from "../utils/helpers";
import HoverADDate from "../components/HoverADDate";
import { useAuth } from "../context/AuthContext";

const monthLabel = (ym) => {
  if (!ym || ym === "unknown") return "Unknown Date";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const daysToSell = (v) => {
  if (!v.purchase_date || !v.sold_date) return null;
  const diff = Math.round((new Date(v.sold_date) - new Date(v.purchase_date)) / 86400000);
  return diff >= 0 ? diff : null;
};

export default function SoldStock() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isFrontDesk = user?.role === "stock_supervisor";
  const isPartsOnly = user?.role === "parts_supervisor";
  const hideFinancials = isFrontDesk || isPartsOnly;

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());

  const fetchSold = useCallback(async () => {
    try {
      const r = await api.get("/vehicles?status=sold");
      setVehicles(r.data);
    } catch { toast.error("Failed to load sold stock"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSold(); }, [fetchSold]);

  const filtered = useMemo(() => {
    if (!search) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter(v =>
      v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
      v.registration_number?.toLowerCase().includes(q) || v.purchase_source?.toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  const groups = useMemo(() => {
    const byMonth = {};
    for (const v of filtered) {
      const key = (v.sold_date || "").slice(0, 7) || "unknown";
      (byMonth[key] ??= []).push(v);
    }
    const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    for (const m of months) byMonth[m].sort((a, b) => (b.sold_date || "").localeCompare(a.sold_date || ""));
    return months.map(m => ({
      key: m,
      label: monthLabel(m),
      vehicles: byMonth[m],
      revenue: byMonth[m].reduce((sum, v) => sum + (v.selling_price || 0), 0),
    }));
  }, [filtered]);

  const toggleMonth = (key) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Archive size={22} className="text-slate-400" /> Sold Stock
          </h1>
          <p className="text-sm text-slate-500">{filtered.length} vehicles sold · archived out of active inventory</p>
        </div>
        <button
          onClick={() => navigate("/inventory")}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Inventory
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brand, model, reg#..."
            className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center h-48 text-slate-500">
          <p className="font-medium">No sold vehicles found</p>
          <p className="text-sm mt-1">{search ? "Try adjusting your search" : "Vehicles marked sold will appear here, grouped by month."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <div key={g.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleMonth(g.key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    <span className="font-semibold text-slate-900 text-sm" style={{ fontFamily: "Manrope" }}>{g.label}</span>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{g.vehicles.length} sold</span>
                  </div>
                  {!hideFinancials && (
                    <span className="text-sm font-semibold text-green-700">{formatNPR(g.revenue)}</span>
                  )}
                </button>

                {!isCollapsed && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {g.vehicles.map(v => {
                      const dts = daysToSell(v);
                      return (
                        <div
                          key={v.id}
                          onClick={() => navigate(`/sold-stock/${v.id}`)}
                          data-testid="sold-vehicle-row"
                          className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 text-sm truncate">{v.brand} {v.model}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {v.year} · {formatOwnership(v.ownership_number)}
                              {v.registration_number && <span className="font-mono"> · {v.registration_number}</span>}
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 text-right shrink-0">
                            <div>Sold: <HoverADDate date={v.sold_date} /></div>
                            {dts !== null && <div className="mt-0.5">{dts}d in stock</div>}
                          </div>
                          {!isPartsOnly && (
                            <div className="text-right shrink-0 w-28">
                              <div className="text-xs text-slate-400">Selling</div>
                              <div className="text-sm font-semibold text-slate-800">{v.selling_price ? formatNPR(v.selling_price) : "—"}</div>
                            </div>
                          )}
                          {!hideFinancials && (
                            <div className="text-right shrink-0 w-20">
                              <div className="text-xs text-slate-400">Margin</div>
                              <div className={`text-sm font-semibold ${v.low_margin ? "text-red-600" : "text-green-600"}`}>
                                {v.profit_margin !== null && v.profit_margin !== undefined ? `${v.profit_margin}%` : "—"}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
