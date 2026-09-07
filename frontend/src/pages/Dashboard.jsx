import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle, TrendingUp, Package, Users, Wrench, DollarSign, Clock, ShoppingCart, CalendarDays, TrendingDown, Banknote, Sparkles } from "lucide-react";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import HoverADDate from "../components/HoverADDate";
import PeriodToggle, { PERIOD_OPTIONS } from "../components/PeriodToggle";
import { useAuth } from "../context/AuthContext";
import {
  getCurrentBSDate, getCurrentBSMonthRange, getCurrentWeekRange,
  getTodayAD, BS_MONTHS,
} from "../utils/nepali-date";

// ── Sub-components defined OUTSIDE to prevent remount ──────────────────
const AGING_COLORS = { fresh: "#22c55e", normal: "#eab308", slow: "#f97316", dead: "#ef4444" };

const KPICard = ({ title, value, subtitle, icon: Icon, color, testid, onClick }) => (
  <div
    data-testid={testid}
    onClick={onClick}
    className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow duration-200 animate-fade-in ${onClick ? "cursor-pointer" : ""}`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 truncate">{title}</p>
        <p className="text-2xl font-bold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1 truncate">{subtitle}</p>}
      </div>
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
  </div>
);

const AlertCard = ({ title, count, description, color, onClick }) => (
  <div onClick={onClick} className={`${color} rounded-lg p-4 cursor-pointer hover:opacity-90 transition-opacity`} data-testid="alert-card">
    <div className="flex items-center gap-2 mb-1">
      <AlertTriangle size={15} />
      <span className="font-semibold text-sm">{title}</span>
      <span className="ml-auto font-bold text-lg">{count}</span>
    </div>
    <p className="text-xs opacity-80">{description}</p>
  </div>
);

// Ticks every second and renders Nepal Standard Time (UTC+5:45). Uses the IANA
// "Asia/Kathmandu" zone via Intl rather than manually offsetting UTC, so the
// half-hour-plus-15-minutes quirk (and any DST-style edge case) is handled by
// the platform's timezone database instead of hand-rolled math.
const LiveClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kathmandu",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
  return (
    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg" data-testid="npt-clock">
      <Clock size={14} className="text-blue-600" />
      <span className="text-xs font-semibold text-blue-700 tabular-nums">{timeStr} NPT</span>
    </div>
  );
};

// Live count of devices from this company currently in the app (Layout.jsx sends a
// heartbeat from every session, tagged with a per-browser device id). This component
// registers its own device first, then polls the count every 15s — so whoever has the
// dashboard open always shows up, even if the Layout heartbeat hasn't landed yet. The
// backend returns only the number, no device or account details. Sits beside the date
// bubble in the header.
const OnlineUsers = () => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/presence/online")
      .then(r => { if (alive) setCount(r.data.count); })
      .catch(() => {});
    const tick = () => api.post("/presence/heartbeat").catch(() => {}).then(load);
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return (
    <div
      className="flex items-center gap-2 bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg"
      data-testid="online-users-display"
      title="Devices currently accessing the app"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <Users size={14} className="text-green-600" />
      <span className="text-xs font-semibold text-green-700 tabular-nums">
        {count} {count === 1 ? "device" : "devices"} online
      </span>
    </div>
  );
};

const AccountingKPI = ({ label, value, color, icon: Icon, sub, onClick, testid }) => (
  <div
    onClick={onClick}
    data-testid={testid}
    className={`rounded-xl p-4 ${color} flex items-center gap-4 ${onClick ? "cursor-pointer hover:brightness-105 active:scale-[0.98] transition-all" : ""}`}
  >
    <div className="w-10 h-10 rounded-lg bg-white/30 flex items-center justify-center shrink-0">
      <Icon size={18} className="text-white" />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold opacity-80 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5 truncate">{sub}</p>}
    </div>
  </div>
);

// ── Period toggle ─────────────────────────────────────────────────────
// The toggle itself now lives in components/PeriodToggle.jsx (shared across pages).
// "Today" is just records dated today, "This Week" the current calendar week
// (Sun–Sat), "This Month" the whole current BS month. Current-state cards (available
// stock, pending jobs, alerts) have no period meaning and deliberately ignore it.

// Short "1 Sep" style label for the weekly range — the week is a plain calendar
// week (Sun–Sat), not a BS-aligned period, so it doesn't get a BS_MONTHS label
// the way daily/monthly do.
const fmtShortAD = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short" });

// Per-period copy for the Sales Highlight strip below the KPIs.
const PERIOD_NOUN = { daily: "today", weekly: "this week", monthly: "this month" };
const PERIOD_SALE_TITLE = { daily: "Today's Sale", weekly: "This Week's Sale", monthly: "Sale this month" };
const PERIOD_EMPTY_TEXT = {
  daily: "No sales for today as of now!",
  weekly: "No sales this week as of now!",
  monthly: "No sales this month as of now!",
};

// ── Accounting Summary Block ───────────────────────────────────────────
// Follows the dashboard's global period (passed in as a prop) — the period toggle
// is a pure filter and never opens anything on its own. Each KPI tile below opens
// its own detail popup instead: Total Sales / Net Profit both open the sales list
// (salesModalView picks which summary to emphasize up top), Total Cost opens the
// separate purchases list.
function AccountingSummary({ period }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  // null | "sales" | "profit" — which tile opened the sales-list popup, and so which
  // summary (Total Sale only, or Total Sale + Total Profit) it shows top-right.
  const [salesModalView, setSalesModalView] = useState(null);
  const [showPurchasesModal, setShowPurchasesModal] = useState(false);

  useEffect(() => {
    const today = getTodayAD();
    let start, end;
    if (period === "daily") {
      start = today; end = today;
    } else if (period === "weekly") {
      const range = getCurrentWeekRange();
      start = range.start; end = range.end;
    } else {
      const range = getCurrentBSMonthRange();
      if (!range) return;
      start = range.start; end = range.end;
    }
    // Filtered server-side now (start_date/end_date) instead of fetching the
    // entire sales history and filtering client-side — that full-history fetch
    // plus its N+1 vehicle/customer lookups was why the ribbon felt slow. Purchases
    // fetched alongside — both popups' lists are ready before either tile is clicked.
    api.get(`/sales?start_date=${start}&end_date=${end}`)
      .then(r => {
        const sorted = [...r.data].sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
        setRecentSales(sorted);
      })
      .catch(() => {});
    api.get(`/reports/purchases?start_date=${start}&end_date=${end}`)
      .then(r => setPurchases(r.data))
      .catch(() => {});
  }, [period]);

  const fetchSummary = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      let start, end, label;
      const today = getTodayAD();
      if (period === "daily") {
        start = today; end = today;
        const bs = getCurrentBSDate();
        label = bs ? `${BS_MONTHS[bs.month - 1]} ${bs.day}, ${bs.year} BS` : today;
      } else if (period === "weekly") {
        const range = getCurrentWeekRange();
        start = range.start; end = range.end;
        label = `${fmtShortAD(range.start)} – ${fmtShortAD(range.end)}`;
      } else {
        const range = getCurrentBSMonthRange();
        start = range?.start ?? today; end = range?.end ?? today;
        label = range ? `${BS_MONTHS[range.bsMonth - 1]} ${range.bsYear} BS` : today;
      }
      const res = await api.get(`/reports/accounting-summary?start_date=${start}&end_date=${end}`);
      setData({ ...res.data, periodLabel: label });
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [period]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const isProfitPositive = data && data.net_profit >= 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="accounting-summary">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
            Accounting Summary
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data ? data.periodLabel : (PERIOD_OPTIONS.find(p => p.key === period)?.label || "Today")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-28">
          <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <AccountingKPI
            label="Total Cost"
            value={formatNPR(data.total_cost)}
            sub={`${data.purchase_count} vehicle${data.purchase_count !== 1 ? "s" : ""} purchased`}
            color="bg-blue-500"
            icon={ShoppingCart}
            testid="kpi-total-cost"
            onClick={() => setShowPurchasesModal(true)}
          />
          <AccountingKPI
            label="Total Sales"
            value={formatNPR(data.total_sales)}
            sub={`${data.sold_count} vehicle${data.sold_count !== 1 ? "s" : ""} sold`}
            color="bg-green-500"
            icon={Banknote}
            testid="kpi-total-sales"
            onClick={() => setSalesModalView("sales")}
          />
          <AccountingKPI
            label="Net Profit"
            value={formatNPR(data.net_profit)}
            sub={isProfitPositive ? "Profitable period" : "Loss period"}
            color={isProfitPositive ? "bg-emerald-600" : "bg-red-500"}
            icon={isProfitPositive ? TrendingUp : TrendingDown}
            testid="kpi-net-profit"
            onClick={() => setSalesModalView("profit")}
          />
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6">Could not load data</p>
      )}

      {/* Sales Highlight — follows the same period tabs as the KPIs above.
          Always rendered (even with zero sales) so the period doesn't look broken. */}
      <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4 mt-4" data-testid="recent-sales-section">
        <div
          onClick={() => navigate("/sales")}
          data-testid="recent-sales-header"
          className="flex items-center gap-2 mb-3 cursor-pointer group w-fit"
        >
          <Sparkles size={16} className="text-green-600" />
          <h2 className="text-sm font-bold text-green-900 group-hover:underline">
            {PERIOD_SALE_TITLE[period] || "Sales"}
          </h2>
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            {recentSales.length} {PERIOD_NOUN[period] || ""}
          </span>
        </div>
        {recentSales.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentSales.map(s => {
              const extraCosts = (s.expenses_total || 0) + (s.job_card_cost || 0);
              // profit is admin-only (see get_sales in server.py) — undefined for any other role,
              // so this card silently omits the row instead of showing "NPR NaN".
              const hasProfit = s.profit !== undefined && s.profit !== null;
              return (
                <div
                  key={s.id}
                  onClick={() => navigate(`/sold-stock/${s.vehicle_id}`)}
                  data-testid="recent-sale-card"
                  className="shrink-0 w-56 bg-white rounded-lg border border-green-100 shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-green-300 transition-all"
                >
                  <div className="font-bold text-slate-900 text-sm truncate mb-1" style={{ fontFamily: "Manrope" }}>
                    {s.vehicle_info || "Vehicle"}
                  </div>
                  <div className="text-xs text-slate-500 mb-1 truncate">{s.customer_name}</div>
                  <div className="text-sm font-semibold text-green-700 mb-1">{formatNPR(s.sale_price)}</div>
                  {extraCosts > 0 && (
                    <div className="text-xs text-orange-600 mb-1">+{formatNPR(extraCosts)} extra costs</div>
                  )}
                  {hasProfit && (
                    <div className={`text-xs font-medium mb-1 ${s.profit >= 0 ? "text-emerald-700" : "text-red-600"}`} data-testid="recent-sale-profit">
                      Profit: {formatNPR(s.profit)}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">Sold: <HoverADDate date={s.sale_date} /></div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-green-700/80 text-center py-3" data-testid="recent-sales-empty">
            {PERIOD_EMPTY_TEXT[period] || "No sales as of now!"}
          </p>
        )}
      </div>

      {/* Sales-list popup — opened by either the Total Sales or Net Profit tile
          (salesModalView says which). Same rows either way; only the top-right
          summary changes to match whichever tile was clicked. */}
      {salesModalView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSalesModalView(null)}
          data-testid="period-sales-modal-backdrop"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            data-testid="period-sales-modal"
          >
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">{PERIOD_SALE_TITLE[period] || "Sales"}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {recentSales.length} vehicle{recentSales.length !== 1 ? "s" : ""} sold{data?.periodLabel ? ` · ${data.periodLabel}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {/* Top-right summary — reads straight off the same `data` the tiles show,
                    so these totals always reconcile with the tile that opened this. */}
                <div className="text-right">
                  {salesModalView === "profit" && (
                    <div className={`text-sm font-bold ${data && data.net_profit >= 0 ? "text-emerald-700" : "text-red-600"}`} data-testid="sales-modal-total-profit">
                      Total Profit: {formatNPR(data?.net_profit)}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 font-medium" data-testid="sales-modal-total-sale">
                    Total Sale: {formatNPR(data?.total_sales)}
                  </div>
                </div>
                <button
                  onClick={() => setSalesModalView(null)}
                  className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
                  data-testid="close-period-sales-modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100">
              {recentSales.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">{PERIOD_EMPTY_TEXT[period] || "No sales as of now!"}</p>
              ) : (
                recentSales.map(s => {
                  const extraCosts = (s.expenses_total || 0) + (s.job_card_cost || 0);
                  const hasProfit = s.profit !== undefined && s.profit !== null;
                  return (
                    <div
                      key={s.id}
                      onClick={() => { setSalesModalView(null); navigate(`/sold-stock/${s.vehicle_id}`); }}
                      data-testid="period-sales-modal-row"
                      className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>
                          {s.vehicle_info || "Vehicle"}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {s.customer_name} · Sold: <HoverADDate date={s.sale_date} />
                        </div>
                        {extraCosts > 0 && (
                          <div className="text-xs text-orange-600 mt-0.5">+{formatNPR(extraCosts)} extra costs</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-green-700">{formatNPR(s.sale_price)}</div>
                        {hasProfit && (
                          <div className={`text-xs font-semibold mt-0.5 ${s.profit >= 0 ? "text-emerald-700" : "text-red-600"}`} data-testid="period-sales-modal-profit">
                            Profit: {formatNPR(s.profit)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Purchases popup — opened by the Total Cost tile. Separate from the sales popup
          above since these are vehicles bought in the period, not sold — a different
          list entirely, from /reports/purchases (mirrors this endpoint's own total_cost
          math so the header total always matches the tile). */}
      {showPurchasesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPurchasesModal(false)}
          data-testid="period-purchases-modal-backdrop"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            data-testid="period-purchases-modal"
          >
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">
                  {period === "daily" ? "Today's Purchases" : period === "weekly" ? "This Week's Purchases" : "Purchases this month"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {purchases.length} vehicle{purchases.length !== 1 ? "s" : ""} purchased{data?.periodLabel ? ` · ${data.periodLabel}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-bold text-blue-700" data-testid="purchases-modal-total-cost">
                    Total Cost: {formatNPR(data?.total_cost)}
                  </div>
                </div>
                <button
                  onClick={() => setShowPurchasesModal(false)}
                  className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
                  data-testid="close-period-purchases-modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100">
              {purchases.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">
                  {period === "daily" ? "No vehicles purchased today as of now!" : period === "weekly" ? "No vehicles purchased this week as of now!" : "No vehicles purchased this month as of now!"}
                </p>
              ) : (
                purchases.map(v => (
                  <div
                    key={v.id}
                    onClick={() => { setShowPurchasesModal(false); navigate(`/inventory/${v.id}`); }}
                    data-testid="period-purchases-modal-row"
                    className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>
                        {v.vehicle_info || "Vehicle"}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {v.registration_number || v.purchase_source || "—"} · Purchased: <HoverADDate date={v.purchase_date} />
                      </div>
                      {v.extra_costs > 0 && (
                        <div className="text-xs text-orange-600 mt-0.5">+{formatNPR(v.extra_costs)} extra costs</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-blue-700">{formatNPR(v.purchase_price)}</div>
                      <div className="text-xs font-semibold text-slate-500 mt-0.5">
                        Total: {formatNPR(v.total_investment)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────
const PERIOD_STORAGE_KEY = "dashboard_period";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // Global period for every period-scoped figure on the page. Persisted so the
  // choice survives navigation and reloads; defaults to "Today".
  const [period, setPeriod] = useState(() => {
    try { return localStorage.getItem(PERIOD_STORAGE_KEY) || "daily"; } catch { return "daily"; }
  });
  const navigate = useNavigate();

  // Pure filter — just scopes the KPIs/ribbon below to the chosen period. Opening a
  // detail popup is now each KPI tile's own job (see AccountingSummary), not the
  // toggle's.
  const changePeriod = (p) => {
    setPeriod(p);
    try { localStorage.setItem(PERIOD_STORAGE_KEY, p); } catch { /* private mode — fine */ }
  };

  useEffect(() => {
    api.get("/reports/dashboard")
      .then(r => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  if (!stats) return null;

  const agingData = [
    { name: "Fresh (0-30d)", count: stats.fresh_count || 0, color: AGING_COLORS.fresh },
    { name: "Normal (31-45d)", count: stats.normal_count || 0, color: AGING_COLORS.normal },
    { name: "Slow (46-60d)", count: stats.slow_moving_count || 0, color: AGING_COLORS.slow },
    { name: "Dead (60+d)", count: stats.dead_stock_count || 0, color: AGING_COLORS.dead },
  ];

  const bs = getCurrentBSDate();
  const bsDateStr = bs ? `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year} BS` : "";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Overview of {user?.company_name || "your"} operations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodToggle period={period} onChange={changePeriod} testid="dashboard-period-toggle" />
          {/* Status pills — one tidy row (was date+clock stacked over online-count, which
              read as misaligned once the toggle grew a third tab). Hidden below sm: purely
              informational, and the toggle above already stays reachable on phones. */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <OnlineUsers />
            {bsDateStr && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg" data-testid="bs-today-display">
                <CalendarDays size={14} className="text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">{bsDateStr}</span>
              </div>
            )}
            <LiveClock />
          </div>
        </div>
      </div>

      {/* Period-scoped: follows the toggle above. Lifetime totals now live on the Finance tab. */}
      <AccountingSummary period={period} />

      {/* Current stock & workload — a live "right now" snapshot, not affected by the period toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard title="Available Vehicles" value={stats.available} icon={Package} color="bg-blue-500" testid="kpi-available" onClick={() => navigate("/inventory")} />
        <KPICard title="Locked Capital" value={formatNPR(stats.locked_capital)} icon={DollarSign} color="bg-indigo-500" testid="kpi-capital" subtitle="In available stock" onClick={() => navigate("/inventory")} />
        <KPICard title="Pending Jobs" value={stats.pending_jobs} icon={Wrench} color="bg-orange-500" testid="kpi-pending-jobs" onClick={() => navigate("/jobs")} />
      </div>

      {/* Charts + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock Aging Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="aging-chart">
          <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Stock Aging Overview</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agingData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
              <Tooltip formatter={(val) => [`${val} vehicles`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {agingData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="alerts-panel">
          <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Stock Alerts</h2>
          <div className="space-y-3">
            <AlertCard title="Dead Stock" count={stats.dead_stock_count} description="60+ days. Immediate action needed." color="bg-red-100 text-red-800" onClick={() => navigate("/inventory?aging=dead")} />
            <AlertCard title="Slow Moving" count={stats.slow_moving_count} description="46–60 days. Consider price reduction." color="bg-orange-100 text-orange-800" onClick={() => navigate("/inventory?aging=slow")} />
            <AlertCard title="Pending Jobs" count={stats.pending_jobs} description="Job cards awaiting attention." color="bg-yellow-100 text-yellow-800" onClick={() => navigate("/jobs?status=pending")} />
            {stats.in_progress_jobs > 0 && (
              <AlertCard title="In Progress" count={stats.in_progress_jobs} description="Active repair/prep work." color="bg-blue-100 text-blue-800" onClick={() => navigate("/jobs?status=in_progress")} />
            )}
          </div>
        </div>
      </div>

      {/* Quick Action */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-blue-900 text-sm">Need AI-powered business advice?</p>
          <p className="text-blue-700 text-xs mt-0.5">Get inventory, finance, and festival strategy recommendations</p>
        </div>
        <button onClick={() => navigate("/ai")} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors active:scale-95" data-testid="go-to-ai-btn">
          Ask AI
        </button>
      </div>
    </div>
  );
}
