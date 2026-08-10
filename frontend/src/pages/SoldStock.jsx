import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ChevronRight, Archive, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, formatOwnership, getStatusStyle } from "../utils/helpers";
import HoverADDate from "../components/HoverADDate";
import BSDatePicker from "../components/BSDatePicker";
import { useAuth } from "../context/AuthContext";
import { adToBsDate, BS_MONTHS, formatBSDate } from "../utils/nepali-date";

const monthLabelAD = (ym) => {
  if (!ym || ym === "unknown") return "Unknown Date";
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

// Groups by the BS (Nepali) month a vehicle sold/returned in, keyed the same "YYYY-MM" shape as
// the AD grouping so the existing string-sort-descending logic works unchanged for either mode.
const bsMonthKey = (adDateStr) => {
  const bs = adToBsDate(adDateStr);
  if (!bs) return "unknown";
  return `${bs.year}-${String(bs.month).padStart(2, "0")}`;
};
const monthLabelBS = (ym) => {
  if (!ym || ym === "unknown") return "Unknown Date";
  const [y, m] = ym.split("-").map(Number);
  return `${BS_MONTHS[m - 1]} ${y} BS`;
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

  const [view, setView] = useState("sold"); // "sold" | "returned"
  const [vehicles, setVehicles] = useState([]);
  const [returnedSales, setReturnedSales] = useState([]);
  const [loadingSold, setLoadingSold] = useState(true);
  const [loadingReturned, setLoadingReturned] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dateMode, setDateMode] = useState("bs"); // "bs" | "ad" — which calendar groups the list into months
  const [dateFilter, setDateFilter] = useState(""); // AD "YYYY-MM-DD" — exact sold/returned date to filter to

  const fetchSold = useCallback(async () => {
    try {
      const r = await api.get("/vehicles?status=sold");
      setVehicles(r.data);
    } catch { toast.error("Failed to load sold stock"); }
    finally { setLoadingSold(false); }
  }, []);

  const fetchReturned = useCallback(async () => {
    try {
      const r = await api.get("/sales?returned=true");
      setReturnedSales(r.data);
    } catch { toast.error("Failed to load returned stock"); }
    finally { setLoadingReturned(false); }
  }, []);

  useEffect(() => { fetchSold(); fetchReturned(); }, [fetchSold, fetchReturned]);

  const filtered = useMemo(() => {
    let result = vehicles;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(v =>
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().includes(q) || v.purchase_source?.toLowerCase().includes(q)
      );
    }
    if (dateFilter) result = result.filter(v => v.sold_date?.slice(0, 10) === dateFilter);
    return result;
  }, [vehicles, search, dateFilter]);

  const filteredReturned = useMemo(() => {
    let result = returnedSales;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.vehicle_brand?.toLowerCase().includes(q) || s.vehicle_model?.toLowerCase().includes(q) ||
        s.registration_number?.toLowerCase().includes(q) || s.customer_name?.toLowerCase().includes(q)
      );
    }
    if (dateFilter) result = result.filter(s => s.returned_at?.slice(0, 10) === dateFilter);
    return result;
  }, [returnedSales, search, dateFilter]);

  const groups = useMemo(() => {
    const byMonth = {};
    for (const v of filtered) {
      const key = dateMode === "bs" ? bsMonthKey(v.sold_date) : (v.sold_date || "").slice(0, 7) || "unknown";
      (byMonth[key] ??= []).push(v);
    }
    const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    for (const m of months) byMonth[m].sort((a, b) => (b.sold_date || "").localeCompare(a.sold_date || ""));
    const monthLabel = dateMode === "bs" ? monthLabelBS : monthLabelAD;
    return months.map(m => ({
      key: m,
      label: monthLabel(m),
      vehicles: byMonth[m],
      revenue: byMonth[m].reduce((sum, v) => sum + (v.selling_price || 0), 0),
    }));
  }, [filtered, dateMode]);

  const returnGroups = useMemo(() => {
    const byMonth = {};
    for (const s of filteredReturned) {
      const key = dateMode === "bs" ? bsMonthKey(s.returned_at) : (s.returned_at || "").slice(0, 7) || "unknown";
      (byMonth[key] ??= []).push(s);
    }
    const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    for (const m of months) byMonth[m].sort((a, b) => (b.returned_at || "").localeCompare(a.returned_at || ""));
    const monthLabel = dateMode === "bs" ? monthLabelBS : monthLabelAD;
    return months.map(m => ({
      key: m,
      label: monthLabel(m),
      sales: byMonth[m],
      refundTotal: byMonth[m].reduce((sum, s) => sum + (s.refund_amount || 0), 0),
      profitTotal: byMonth[m].reduce((sum, s) => sum + (s.retained_amount || 0), 0),
    }));
  }, [filteredReturned, dateMode]);

  // Collapse state is shared across both tabs, keyed by view so a month collapsed under
  // "Sold" doesn't also collapse the same-named month's group under "Returned".
  const collapseKey = (key) => `${view}:${key}`;
  const toggleMonth = (key) => {
    const ck = collapseKey(key);
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(ck) ? next.delete(ck) : next.add(ck);
      return next;
    });
  };

  const loading = view === "sold" ? loadingSold : loadingReturned;
  const count = view === "sold" ? filtered.length : filteredReturned.length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Archive size={22} className="text-slate-400" /> Sold Stock
          </h1>
          <p className="text-sm text-slate-500">
            {view === "sold"
              ? `${count} vehicles sold · archived out of active inventory`
              : `${count} vehicles returned · re-entered the pipeline`}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1" data-testid="sold-stock-date-mode-toggle">
            {[["bs", "Nepali"], ["ad", "English"]].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setDateMode(mode)}
                data-testid={`date-mode-${mode}`}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  dateMode === mode ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-44" data-testid="sold-stock-date-filter-input">
            <BSDatePicker value={dateFilter} onChange={setDateFilter} mode={dateMode} />
          </div>
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              data-testid="clear-sold-stock-date-filter"
              className="flex items-center gap-1 h-9 px-2.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Clear date filter"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={() => navigate("/inventory")}
            className="text-sm text-blue-600 hover:underline"
          >
            Back to Inventory
          </button>
        </div>
      </div>

      {/* Sold / Returned sub-tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200" data-testid="sold-stock-view-tabs">
        {[["sold", "Sold", Archive], ["returned", "Returned", RotateCcw]].map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            data-testid={`sold-stock-view-${key}`}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon size={14} /> {label}
            {key === "returned" && returnedSales.length > 0 && (
              <span className="ml-1 text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{returnedSales.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search — sticky so it stays reachable while scrolling a long list */}
      <div className="sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brand, model, reg#, customer..."
            className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : view === "sold" ? (
        groups.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center h-48 text-slate-500">
            <p className="font-medium">No sold vehicles found</p>
            <p className="text-sm mt-1">
              {dateFilter
                ? (dateMode === "bs"
                    ? `No vehicles sold on ${formatBSDate(dateFilter)} BS`
                    : `No vehicles sold on ${new Date(`${dateFilter}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`)
                : search
                ? "Try adjusting your search"
                : "Vehicles marked sold will appear here, grouped by month."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(g => {
              const isCollapsed = collapsed.has(collapseKey(g.key));
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
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 text-sm truncate">{v.brand} {v.model}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {v.year} · {formatOwnership(v.ownership_number)}
                                {v.registration_number && <span className="font-mono"> · {v.registration_number}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap sm:shrink-0">
                              <div className="text-xs text-slate-500 sm:text-right shrink-0">
                                <div>Sold: <HoverADDate date={v.sold_date} /></div>
                                {dts !== null && <div className="mt-0.5">{dts}d in stock</div>}
                              </div>
                              {!isPartsOnly && (
                                <div className="text-right shrink-0 sm:w-28">
                                  <div className="text-xs text-slate-400">Selling</div>
                                  <div className="text-sm font-semibold text-slate-800">{v.selling_price ? formatNPR(v.selling_price) : "—"}</div>
                                </div>
                              )}
                              {!hideFinancials && (
                                <div className="text-right shrink-0 sm:w-28">
                                  <div className="text-xs text-slate-400">Margin</div>
                                  <div className={`text-sm font-semibold ${v.low_margin ? "text-red-600" : "text-green-600"}`}>
                                    {v.expected_profit !== null && v.expected_profit !== undefined ? formatNPR(v.expected_profit) : "—"}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : returnGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center h-48 text-slate-500">
          <p className="font-medium">No returned vehicles found</p>
          <p className="text-sm mt-1">
            {dateFilter
              ? (dateMode === "bs"
                  ? `No vehicles returned on ${formatBSDate(dateFilter)} BS`
                  : `No vehicles returned on ${new Date(`${dateFilter}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`)
              : search
              ? "Try adjusting your search"
              : "Sold vehicles that get returned back into the pipeline will appear here, grouped by month."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {returnGroups.map(g => {
            const isCollapsed = collapsed.has(collapseKey(g.key));
            return (
              <div key={g.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleMonth(g.key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    <span className="font-semibold text-slate-900 text-sm" style={{ fontFamily: "Manrope" }}>{g.label}</span>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{g.sales.length} returned</span>
                  </div>
                  {!hideFinancials && (
                    <span className="text-sm font-semibold text-orange-700">{formatNPR(g.profitTotal)} profit</span>
                  )}
                </button>

                {!isCollapsed && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {g.sales.map(s => {
                      const rs = getStatusStyle(s.returned_status);
                      return (
                        <div
                          key={s.id}
                          data-testid="returned-vehicle-row"
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 text-sm truncate">{s.vehicle_brand} {s.vehicle_model}</span>
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${rs.bg} ${rs.text}`}>Back to {rs.label}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {s.vehicle_year}
                              {s.registration_number && <span className="font-mono"> · {s.registration_number}</span>}
                              {s.customer_name && ` · ${s.customer_name}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap sm:shrink-0">
                            <div className="text-xs text-slate-500 sm:text-right shrink-0">
                              <div>Returned: <HoverADDate date={s.returned_at?.slice(0, 10)} /></div>
                            </div>
                            {!isPartsOnly && (
                              <div className="text-right shrink-0 sm:w-28">
                                <div className="text-xs text-slate-400">Refunded</div>
                                <div className="text-sm font-semibold text-slate-800">{s.refund_amount != null ? formatNPR(s.refund_amount) : "—"}</div>
                              </div>
                            )}
                            {!hideFinancials && (
                              <div className="text-right shrink-0 sm:w-28">
                                <div className="text-xs text-slate-400">Profit</div>
                                <div className="text-sm font-semibold text-green-700">{s.retained_amount != null ? formatNPR(s.retained_amount) : "—"}</div>
                              </div>
                            )}
                          </div>
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
