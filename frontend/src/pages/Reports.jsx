import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

const AGING_COLORS = { fresh: "#22c55e", normal: "#eab308", slow: "#f97316", dead: "#ef4444" };
const MONTH_COLORS = ["#2563EB", "#7C3AED", "#059669", "#DC2626", "#D97706", "#0891B2"];

export default function Reports() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("summary");

  useEffect(() => {
    Promise.all([
      api.get("/reports/dashboard"),
      api.get("/reports/inventory"),
      api.get("/reports/financial"),
    ]).then(([d, i, f]) => {
      setDashboard(d.data);
      setInventory(i.data);
      setFinancial(f.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const agingData = dashboard ? [
    { name: "Fresh (0-30d)", count: dashboard.fresh_count || 0, color: AGING_COLORS.fresh },
    { name: "Normal (31-45d)", count: dashboard.normal_count || 0, color: AGING_COLORS.normal },
    { name: "Slow (46-60d)", count: dashboard.slow_moving_count || 0, color: AGING_COLORS.slow },
    { name: "Dead (60+d)", count: dashboard.dead_stock_count || 0, color: AGING_COLORS.dead },
  ] : [];

  const brandData = inventory ? Object.entries(inventory.by_brand).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count) : [];
  const sourceData = inventory ? Object.entries(inventory.by_source).map(([name, data]) => ({ name, count: data.count })) : [];

  const monthlyData = financial ? Object.entries(financial.monthly_breakdown)
    .filter(([k]) => k !== "unknown")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month: month.slice(0, 7), ...data })) : [];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
        <p className="text-sm text-slate-500">Business performance overview</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {["summary", "inventory", "financial"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} data-testid={`report-tab-${tab}`}
            className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === "summary" && dashboard && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Vehicles", val: dashboard.total_vehicles, color: "text-slate-900", aging: null },
              { label: "Available", val: dashboard.available, color: "text-blue-600", aging: null },
              { label: "Sold", val: dashboard.sold, color: "text-green-600", aging: null },
              { label: "Locked Capital", val: formatNPR(dashboard.locked_capital), color: "text-indigo-600", aging: null },
              { label: "Realized Profit", val: formatNPR(dashboard.total_realized_profit), color: "text-emerald-600", aging: null },
              { label: "Dead Stock", val: dashboard.dead_stock_count, color: "text-red-600", aging: "dead" },
              { label: "Slow Moving", val: dashboard.slow_moving_count, color: "text-orange-600", aging: "slow" },
              { label: "Customers", val: dashboard.total_customers, color: "text-purple-600", aging: null },
            ].map(({ label, val, color, aging }) => (
              <div
                key={label}
                className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${aging ? "cursor-pointer hover:shadow-md hover:border-blue-300 transition-all" : ""}`}
                data-testid="report-kpi-card"
                onClick={() => aging && navigate(`/inventory?aging=${aging}`)}
                title={aging ? `Click to view ${label} vehicles in Inventory` : undefined}
              >
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className={`text-xl font-bold ${color}`} style={{ fontFamily: "Manrope" }}>{val}</div>
                {aging && <div className="text-xs text-blue-500 mt-1">View in Inventory →</div>}
              </div>
            ))}
          </div>

          {/* Stock Aging Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>Stock Aging Distribution</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingData}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" radius={[4,4,0,0]}>{agingData.map((e) => <Cell key={e.name} fill={e.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === "inventory" && inventory && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>By Brand</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={brandData} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#2563EB" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>By Purchase Source</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sourceData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {sourceData.map((entry, i) => <Cell key={entry.name} fill={MONTH_COLORS[i % MONTH_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Slow / Dead Stock */}
          {(inventory.dead_stock?.length > 0 || inventory.slow_moving?.length > 0) ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>Action Required Stock</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Vehicle", "Days in Stock", "Category", "Purchase Price", "Selling Price"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...inventory.dead_stock, ...inventory.slow_moving].map((v) => (
                      <tr
                        key={v.id}
                        className="table-row-hover cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => navigate(`/inventory/${v.id}`)}
                        data-testid={`dead-stock-row-${v.id}`}
                        title="Click to view vehicle detail"
                      >
                        <td className="px-3 py-3 font-medium text-slate-900">{v.brand} {v.model} {v.year}</td>
                        <td className="px-3 py-3 text-slate-600">{v.days} days</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${v.days > 60 ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>
                            {v.days > 60 ? "Dead Stock" : "Slow Moving"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{formatNPR(v.purchase_price)}</td>
                        <td className="px-3 py-3 text-slate-700">{v.selling_price ? formatNPR(v.selling_price) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : inventory && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500" data-testid="no-dead-stock-msg">
              <p className="font-medium text-green-700">No dead or slow moving stock!</p>
              <p className="text-sm mt-1">All available vehicles are within healthy stock age.</p>
            </div>
          )}
        </div>
      )}

      {/* Financial Tab */}
      {activeTab === "financial" && financial && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center sm:col-span-1">
              <div className="text-xs text-emerald-600 font-semibold uppercase mb-1">Total Realized Profit</div>
              <div className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "Manrope" }}>{formatNPR(financial.total_profit)}</div>
            </div>
            {financial.partner_shares?.map(p => (
              <div key={p.name} className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center" data-testid="partner-profit-share">
                <div className="text-xs text-blue-600 font-semibold uppercase mb-1">{p.name} ({p.stake}%)</div>
                <div className="text-xl font-bold text-blue-700" style={{ fontFamily: "Manrope" }}>{formatNPR(p.profit_share)}</div>
                <div className="text-xs text-blue-500 mt-0.5">Capital: {formatNPR(p.capital)}</div>
              </div>
            ))}
          </div>

          {monthlyData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>Monthly P&L</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(val) => formatNPR(val)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[4,4,0,0]} />
                  <Bar dataKey="investment" name="Investment" fill="#94A3B8" radius={[4,4,0,0]} />
                  <Bar dataKey="profit" name="Profit" fill="#22c55e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {monthlyData.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              <p className="font-medium">No sales data yet</p>
              <p className="text-sm mt-1">Mark vehicles as sold to see financial reports</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
