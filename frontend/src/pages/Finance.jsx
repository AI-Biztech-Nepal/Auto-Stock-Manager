import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { DollarSign, AlertTriangle, CreditCard, Users, ShoppingCart, Wallet, UserPlus, ArrowDownCircle, ArrowUpCircle, PlusSquare, FileText } from "lucide-react";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

const KCard = ({ title, value, sub, color, icon: Icon }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</p>
        <p className="text-xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
    </div>
  </div>
);

export default function Finance() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    Promise.all([
      api.get("/finance/summary"),
      api.get("/reports/financial"),
      api.get("/partners"),
    ]).then(([s, f, p]) => {
      setSummary(s.data); setFinancial(f.data); setPartners(p.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const monthlyData = useMemo(() => {
    if (!financial) return [];
    return Object.entries(financial.monthly_breakdown)
      .filter(([k]) => k !== "unknown")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, ...d }));
  }, [financial]);

  const totalCapital = useMemo(() => partners.reduce((s, p) => s + p.capital_contribution, 0), [partners]);
  const totalProfit = useMemo(() => financial?.total_profit || 0, [financial]);

  const pieData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Revenue", value: summary.total_revenue, fill: "#2563EB" },
      { name: "Cost of Goods", value: summary.total_cogs, fill: "#94A3B8" },
    ].filter(d => d.value > 0);
  }, [summary]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Finance & Accounting</h1>
        <p className="text-sm text-slate-500">Complete financial overview · Hamro G&G Auto Enterprises</p>
      </div>

      <div className="flex border-b border-slate-200 gap-1">
        {["overview", "monthly", "partners"].map(t => (
          <button key={t} onClick={() => setTab(t)} data-testid={`finance-tab-${t}`}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && summary && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KCard title="Gross Profit" value={formatNPR(summary.gross_profit)} sub={`${summary.profit_margin_pct}% margin`} icon={DollarSign} color="bg-emerald-500" />
            <KCard title="Vendor Payables" value={formatNPR(summary.vendor_payables)} icon={CreditCard} color="bg-red-500" />
            <KCard title="Partner Capital" value={formatNPR(summary.total_partner_capital)} icon={Wallet} color="bg-purple-500" />
            <KCard title="EMI Receivables" value={formatNPR(summary.emi_receivables)} icon={Users} color="bg-teal-500" />
          </div>

          {/* Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.vendor_payables > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1"><AlertTriangle size={15} className="text-red-600" /><span className="font-semibold text-red-800 text-sm">Vendor Due Alert</span></div>
                <p className="text-sm text-red-700">You owe <strong>{formatNPR(summary.vendor_payables)}</strong> to vendors. Clear dues to maintain supplier relationships.</p>
              </div>
            )}
            {summary.profit_margin_pct < 8 && summary.total_revenue > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1"><AlertTriangle size={15} className="text-orange-600" /><span className="font-semibold text-orange-800 text-sm">Low Margin Alert</span></div>
                <p className="text-sm text-orange-700">Overall profit margin is <strong>{summary.profit_margin_pct}%</strong>. Target is at least 8-10%.</p>
              </div>
            )}
            {summary.inventory_value > summary.total_revenue && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1"><AlertTriangle size={15} className="text-yellow-600" /><span className="font-semibold text-yellow-800 text-sm">High Capital Lock</span></div>
                <p className="text-sm text-yellow-700">More capital locked in inventory than revenue generated. Focus on clearing stock.</p>
              </div>
            )}
          </div>

          {pieData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-slate-900 mb-4">Revenue vs Cost Breakdown</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={12}>
                    {pieData.map((e) => <Cell key={e.name} fill={e.fill} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>Quick Actions</h2>
                <p className="text-sm text-slate-500">Jump to common sales, purchase, payment and party actions.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button onClick={() => navigate("/customers")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white mb-3"><UserPlus size={18} /></div>
                <p className="font-semibold text-slate-900">Add Party</p>
                <p className="text-xs text-slate-500 mt-1">Customer list</p>
              </button>
              <button onClick={() => navigate("/sales")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-600 text-white mb-3"><ShoppingCart size={18} /></div>
                <p className="font-semibold text-slate-900">Sales Invoice</p>
                <p className="text-xs text-slate-500 mt-1">Create or view invoices</p>
              </button>
              <button onClick={() => navigate("/vendors")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-600 text-white mb-3"><ArrowDownCircle size={18} /></div>
                <p className="font-semibold text-slate-900">Payment In</p>
                <p className="text-xs text-slate-500 mt-1">Vendor payments</p>
              </button>
              <button onClick={() => navigate("/vendors")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-600 text-white mb-3"><ArrowUpCircle size={18} /></div>
                <p className="font-semibold text-slate-900">Payment Out</p>
                <p className="text-xs text-slate-500 mt-1">Vendor dues</p>
              </button>
              <button onClick={() => navigate("/inventory")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-600 text-white mb-3"><PlusSquare size={18} /></div>
                <p className="font-semibold text-slate-900">Purchase</p>
                <p className="text-xs text-slate-500 mt-1">Add vehicle purchase</p>
              </button>
              <button onClick={() => navigate("/inventory")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-600 text-white mb-3"><PlusSquare size={18} /></div>
                <p className="font-semibold text-slate-900">Add Item</p>
                <p className="text-xs text-slate-500 mt-1">New inventory item</p>
              </button>
              <button onClick={() => navigate("/customers")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500 text-white mb-3"><FileText size={18} /></div>
                <p className="font-semibold text-slate-900">Add Note</p>
                <p className="text-xs text-slate-500 mt-1">Customer notes</p>
              </button>
              <button onClick={() => navigate("/inventory")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-600 text-white mb-3"><FileText size={18} /></div>
                <p className="font-semibold text-slate-900">Expense</p>
                <p className="text-xs text-slate-500 mt-1">Record costs</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "monthly" && (
        <div className="space-y-5">
          {monthlyData.length > 0 ? (
            <>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-base font-bold text-slate-900 mb-4">Monthly P&L Report</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={v => formatNPR(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[4,4,0,0]} />
                    <Bar dataKey="investment" name="Investment" fill="#94A3B8" radius={[4,4,0,0]} />
                    <Bar dataKey="profit" name="Profit" fill="#22c55e" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100"><h2 className="font-bold text-slate-900">Monthly Breakdown</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100">{["Month","Vehicles Sold","Revenue","Investment","Profit","Margin"].map(h => <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthlyData.sort((a,b) => b.month.localeCompare(a.month)).map(m => (
                        <tr key={m.month} className="table-row-hover">
                          <td className="px-4 py-3 font-medium text-slate-900">{m.month}</td>
                          <td className="px-4 py-3 text-slate-600">{m.count}</td>
                          <td className="px-4 py-3 text-blue-700 font-medium">{formatNPR(m.revenue)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatNPR(m.investment)}</td>
                          <td className={`px-4 py-3 font-semibold ${m.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatNPR(m.profit)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.revenue > 0 && ((m.profit/m.revenue)*100) >= 8 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                              {m.revenue > 0 ? `${((m.profit/m.revenue)*100).toFixed(1)}%` : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              <p>No sales data yet. Mark vehicles as sold to see monthly reports.</p>
            </div>
          )}
        </div>
      )}

      {tab === "partners" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-center shadow-sm">
              <div className="text-2xl font-bold text-slate-900">{formatNPR(totalCapital)}</div>
              <div className="text-xs text-slate-500 mt-1">Total Capital</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-emerald-700">{formatNPR(totalProfit)}</div>
              <div className="text-xs text-emerald-600 mt-1">Total Profit to Share</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-blue-700">{totalCapital > 0 ? `${((totalProfit/totalCapital)*100).toFixed(1)}%` : "0%"}</div>
              <div className="text-xs text-blue-600 mt-1">Overall ROI</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {partners.map(p => {
              const share = totalProfit * p.stake_percentage / 100;
              const roi = p.capital_contribution > 0 ? ((share/p.capital_contribution)*100).toFixed(1) : 0;
              return (
                <div key={p.id} data-testid="finance-partner-card" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{p.name[0]?.toUpperCase()}</div>
                    <div>
                      <div className="font-bold text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.stake_percentage}% stake</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Capital</span><span className="font-semibold text-slate-900">{formatNPR(p.capital_contribution)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Profit Share</span><span className="font-semibold text-emerald-600">{formatNPR(share)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">ROI</span><span className={`font-semibold ${roi > 0 ? "text-blue-600" : "text-slate-500"}`}>{roi}%</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
