import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle, TrendingUp, Package, Users, Wrench, DollarSign, Clock, ShoppingCart, CalendarDays, TrendingDown, Banknote, Sparkles } from "lucide-react";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import HoverADDate from "../components/HoverADDate";
import {
  getCurrentBSDate, getCurrentBSMonthRange, getCurrentBSYearRange,
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
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
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

const AccountingKPI = ({ label, value, color, icon: Icon, sub }) => (
  <div className={`rounded-xl p-4 ${color} flex items-center gap-4`}>
    <div className="w-10 h-10 rounded-lg bg-white/30 flex items-center justify-center">
      <Icon size={18} className="text-white" />
    </div>
    <div>
      <p className="text-xs font-semibold opacity-80 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Accounting Summary Block ───────────────────────────────────────────
const PERIODS = [
  { key: "daily", label: "Today" },
  { key: "monthly", label: "This Month (BS)" },
  { key: "yearly", label: "This Year (BS)" },
];

function AccountingSummary() {
  const [activePeriod, setActivePeriod] = useState("daily");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recentSales, setRecentSales] = useState([]);

  // Independent of the period tabs above — always a rolling last-24-hours window,
  // same pattern as the "Recently Added" stock ribbon on the Inventory page.
  useEffect(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    api.get("/sales")
      .then(r => {
        const recent = r.data
          .filter(s => s.created_at && new Date(s.created_at).getTime() >= oneDayAgo)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setRecentSales(recent);
      })
      .catch(() => {});
  }, []);

  const fetchSummary = useCallback(async (period) => {
    setLoading(true); setData(null);
    try {
      let start, end, label;
      const today = getTodayAD();
      if (period === "daily") {
        start = today; end = today;
        const bs = getCurrentBSDate();
        label = bs ? `${BS_MONTHS[bs.month - 1]} ${bs.day}, ${bs.year} BS` : today;
      } else if (period === "monthly") {
        const range = getCurrentBSMonthRange();
        start = range.start; end = range.end;
        label = `${BS_MONTHS[range.bsMonth - 1]} ${range.bsYear} BS`;
      } else {
        const range = getCurrentBSYearRange();
        start = range.start; end = range.end;
        label = `${range.bsYear} BS`;
      }
      const res = await api.get(`/reports/accounting-summary?start_date=${start}&end_date=${end}`);
      setData({ ...res.data, periodLabel: label });
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSummary(activePeriod); }, [activePeriod, fetchSummary]);

  const isProfitPositive = data && data.net_profit >= 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="accounting-summary">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
            Accounting Summary
          </h2>
          {data && <p className="text-xs text-slate-500 mt-0.5">{data.periodLabel}</p>}
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              data-testid={`period-tab-${p.key}`}
              onClick={() => setActivePeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activePeriod === p.key
                  ? "bg-white shadow text-blue-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
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
          />
          <AccountingKPI
            label="Total Sales"
            value={formatNPR(data.total_sales)}
            sub={`${data.sold_count} vehicle${data.sold_count !== 1 ? "s" : ""} sold`}
            color="bg-green-500"
            icon={Banknote}
          />
          <AccountingKPI
            label="Net Profit"
            value={formatNPR(data.net_profit)}
            sub={isProfitPositive ? "Profitable period" : "Loss period"}
            color={isProfitPositive ? "bg-emerald-600" : "bg-red-500"}
            icon={isProfitPositive ? TrendingUp : TrendingDown}
          />
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6">Could not load data</p>
      )}

      {/* Recent Sales Highlight */}
      {recentSales.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4 mt-4" data-testid="recent-sales-section">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-green-600" />
            <h2 className="text-sm font-bold text-green-900">Recent Sales</h2>
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              {recentSales.length} in the last 24 hours
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentSales.map(s => (
              <div
                key={s.id}
                data-testid="recent-sale-card"
                className="shrink-0 w-56 bg-white rounded-lg border border-green-100 shadow-sm p-3"
              >
                <div className="font-bold text-slate-900 text-sm truncate mb-1" style={{ fontFamily: "Manrope" }}>
                  {s.vehicle_info || "Vehicle"}
                </div>
                <div className="text-xs text-slate-500 mb-1 truncate">{s.customer_name}</div>
                <div className="text-sm font-semibold text-green-700 mb-1">{formatNPR(s.sale_price)}</div>
                <div className="text-xs text-slate-500">Sold: <HoverADDate date={s.sale_date} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Overview of Hamro G n G Auto operations</p>
        </div>
        {bsDateStr && (
          <div className="hidden sm:flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg" data-testid="bs-today-display">
            <CalendarDays size={14} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">{bsDateStr}</span>
          </div>
        )}
      </div>

      {/* Accounting Summary (BS-based) */}
      <AccountingSummary />

      {/* Financial Overview (moved from Finance tab) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Revenue" value={formatNPR(stats.total_revenue)} icon={TrendingUp} color="bg-blue-500" testid="kpi-total-revenue" onClick={() => navigate("/finance")} />
        <KPICard title="Inventory Value" value={formatNPR(stats.inventory_value)} icon={Package} color="bg-indigo-500" testid="kpi-inventory-value" subtitle={`${stats.available} vehicles`} onClick={() => navigate("/inventory")} />
        <KPICard title="Vehicles Sold" value={stats.sold} icon={ShoppingCart} color="bg-green-500" testid="kpi-sold" onClick={() => navigate("/sold-stock")} />
        <KPICard title="Cost of Goods" value={formatNPR(stats.total_cogs)} icon={AlertTriangle} color="bg-orange-500" testid="kpi-cogs" onClick={() => navigate("/finance")} />
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard title="Available Vehicles" value={stats.available} icon={Package} color="bg-blue-500" testid="kpi-available" onClick={() => navigate("/inventory")} />
        <KPICard title="Locked Capital" value={formatNPR(stats.locked_capital)} icon={DollarSign} color="bg-indigo-500" testid="kpi-capital" subtitle="In available stock" onClick={() => navigate("/inventory")} />
        <KPICard title="Realized Profit" value={formatNPR(stats.total_realized_profit)} icon={TrendingUp} color="bg-emerald-500" testid="kpi-profit" subtitle="From sold vehicles" onClick={() => navigate("/finance")} />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        <KPICard title="Customers" value={stats.total_customers} icon={Users} color="bg-purple-500" testid="kpi-customers" onClick={() => navigate("/customers")} />
        <KPICard title="Pending Jobs" value={stats.pending_jobs} icon={Wrench} color="bg-orange-500" testid="kpi-pending-jobs" onClick={() => navigate("/jobs")} />
        <KPICard title="Total Vehicles" value={stats.total_vehicles} icon={Package} color="bg-slate-500" testid="kpi-total" subtitle="All time" onClick={() => navigate("/inventory")} />
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
