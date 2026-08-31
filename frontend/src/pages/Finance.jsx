import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, AlertTriangle, CreditCard, Users, ShoppingCart, Wallet, UserPlus, ArrowDownCircle, ArrowUpCircle, PlusSquare, FileText, BookOpen, Printer, Download, TrendingUp, Package } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import LedgerTable from "../components/LedgerTable";
import BillPrintModal from "../components/BillPrintModal";
import { adToBsDate, BS_MONTHS, getBSMonthRange } from "../utils/nepali-date";
import { useAuth } from "../context/AuthContext";

const KCard = ({ title, value, sub, color, icon: Icon }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 truncate">{title}</p>
        <p className="text-xl font-bold text-slate-900 truncate" style={{ fontFamily: "Manrope" }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
    </div>
  </div>
);

export default function Finance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [partners, setPartners] = useState([]);
  const [dash, setDash] = useState(null); // lifetime totals, moved here from the dashboard
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");

  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState(searchParams.get("vendor") || "");
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [printBill, setPrintBill] = useState(null);
  const [bsSales, setBsSales] = useState([]);
  const [downloadingMonth, setDownloadingMonth] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/finance/summary"),
      api.get("/reports/financial"),
      api.get("/partners"),
      api.get("/reports/monthly-breakdown-bs"),
      api.get("/reports/dashboard"),
    ]).then(([s, f, p, bs, d]) => {
      setSummary(s.data); setFinancial(f.data); setPartners(p.data); setBsSales(bs.data); setDash(d.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "ledger" && vendors.length === 0) {
      api.get("/vendors").then(r => setVendors(r.data)).catch(() => toast.error("Failed to load vendors"));
    }
  }, [tab, vendors.length]);

  useEffect(() => {
    if (!selectedVendorId) { setLedgerData(null); return; }
    setLedgerLoading(true);
    api.get(`/vendors/${selectedVendorId}/payments`)
      .then(r => setLedgerData(r.data))
      .catch(() => toast.error("Failed to load ledger"))
      .finally(() => setLedgerLoading(false));
  }, [selectedVendorId]);

  const switchTab = (t) => {
    setTab(t);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", t);
      return next;
    }, { replace: true });
  };

  const selectVendor = (id) => {
    setSelectedVendorId(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set("vendor", id); else next.delete("vendor");
      return next;
    }, { replace: true });
  };

  const selectedVendor = useMemo(() => vendors.find(v => String(v.id) === String(selectedVendorId)), [vendors, selectedVendorId]);

  // Grouped into real Bikram Sambat months (not Gregorian) — a calendar month here
  // straddles two BS months, so relabeling the old AD-keyed buckets wouldn't line up
  // with what a downloaded per-month report actually contains. Sourced from actual
  // sale records (see /reports/monthly-breakdown-bs) so each row's numbers match
  // exactly what its download button generates.
  const monthlyData = useMemo(() => {
    const buckets = {};
    for (const s of bsSales) {
      const bs = adToBsDate(s.sale_date);
      if (!bs) continue;
      const key = `${bs.year}-${String(bs.month).padStart(2, "0")}`;
      if (!buckets[key]) {
        buckets[key] = { key, bsYear: bs.year, bsMonth: bs.month, label: `${BS_MONTHS[bs.month - 1]} ${bs.year}`, count: 0, returnedCount: 0, revenue: 0, investment: 0, profit: 0 };
      }
      const b = buckets[key];
      const revenue = s.returned ? (s.retained_amount || 0) : s.sale_price;
      b.revenue += revenue;
      b.investment += s.investment;
      b.profit += revenue - s.investment;
      if (s.returned) b.returnedCount += 1; else b.count += 1;
    }
    return Object.values(buckets).sort((a, b) => b.key.localeCompare(a.key));
  }, [bsSales]);

  const downloadMonthlyReport = async (m) => {
    const range = getBSMonthRange(m.bsYear, m.bsMonth);
    if (!range) { toast.error("Could not compute date range for this month"); return; }
    setDownloadingMonth(m.key);
    try {
      const label = `${BS_MONTHS[m.bsMonth - 1]}, ${m.bsYear} BS`;
      const res = await api.get("/reports/monthly-closing-export", {
        params: { start_date: range.start, end_date: range.end, label },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `GG_Auto_Closing_Report_${BS_MONTHS[m.bsMonth - 1]}_${m.bsYear}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Failed to generate report"); }
    finally { setDownloadingMonth(null); }
  };

  const totalCapital = useMemo(() => partners.reduce((s, p) => s + p.capital_contribution, 0), [partners]);
  const totalProfit = useMemo(() => financial?.total_profit || 0, [financial]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Finance & Accounting</h1>
        <p className="text-sm text-slate-500">Complete financial overview{user?.company_name ? ` · ${user.company_name}` : ""}</p>
      </div>

      <div className="flex border-b border-slate-200 gap-1">
        {["overview", "monthly", "partners", "ledger"].map(t => (
          <button key={t} onClick={() => switchTab(t)} data-testid={`finance-tab-${t}`}
            className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
            {t === "ledger" ? "Vendor Ledger" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && summary && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <KCard title="Gross Profit" value={formatNPR(summary.gross_profit)} sub={`${summary.profit_margin_pct}% margin`} icon={DollarSign} color="bg-emerald-500" />
            <KCard title="Vendor Payables" value={formatNPR(summary.vendor_payables)} icon={CreditCard} color="bg-red-500" />
            <KCard title="Partner Capital" value={formatNPR(summary.total_partner_capital)} icon={Wallet} color="bg-purple-500" />
            <KCard title="EMI Receivables" value={formatNPR(summary.emi_receivables)} icon={Users} color="bg-teal-500" />
          </div>

          {/* Lifetime totals — moved off the dashboard, which is now period-scoped */}
          {dash && (
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>Lifetime Totals</h2>
              <div className="grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <KCard title="Total Revenue" value={formatNPR(dash.total_revenue)} icon={TrendingUp} color="bg-blue-500" />
                <KCard title="Cost of Goods" value={formatNPR(dash.total_cogs)} icon={AlertTriangle} color="bg-orange-500" />
                <KCard title="Realized Profit" value={formatNPR(dash.total_realized_profit)} sub="From sold vehicles" icon={DollarSign} color="bg-emerald-500" />
                <KCard title="Vehicles Sold" value={dash.sold} sub="All time" icon={ShoppingCart} color="bg-green-500" />
                <KCard title="Total Vehicles" value={dash.total_vehicles} sub="All time" icon={Package} color="bg-slate-500" />
                <KCard title="Customers" value={dash.total_customers} sub="All time" icon={Users} color="bg-teal-600" />
              </div>
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
              <button onClick={() => navigate("/vendors?action=add")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white mb-3"><UserPlus size={18} /></div>
                <p className="font-semibold text-slate-900">Add Vendor</p>
                <p className="text-xs text-slate-500 mt-1">Vendor list</p>
              </button>
              <button onClick={() => navigate("/sales")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-600 text-white mb-3"><ShoppingCart size={18} /></div>
                <p className="font-semibold text-slate-900">Sales Invoice</p>
                <p className="text-xs text-slate-500 mt-1">Create or view invoices</p>
              </button>
              <button onClick={() => navigate("/sales")} className="group bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-4 text-left transition-colors">
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
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
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
                    <thead><tr className="border-b border-slate-100">{["Month","Vehicles Sold","Revenue","Investment","Profit","Margin",""].map(h => <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthlyData.map(m => (
                        <tr key={m.key} className="table-row-hover">
                          <td className="px-4 py-3 font-medium text-slate-900">{m.label}</td>
                          <td className="px-4 py-3 text-slate-600">{m.count}{m.returnedCount > 0 && <span className="text-xs text-amber-600 ml-1">(+{m.returnedCount} returned)</span>}</td>
                          <td className="px-4 py-3 text-blue-700 font-medium">{formatNPR(m.revenue)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatNPR(m.investment)}</td>
                          <td className={`px-4 py-3 font-semibold ${m.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatNPR(m.profit)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.revenue > 0 && ((m.profit/m.revenue)*100) >= 8 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                              {m.revenue > 0 ? `${((m.profit/m.revenue)*100).toFixed(1)}%` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => downloadMonthlyReport(m)}
                              disabled={downloadingMonth === m.key}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-wait"
                              title="Download closing report for this month"
                              data-testid="download-monthly-report-btn"
                            >
                              {downloadingMonth === m.key ? (
                                <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
                              ) : (
                                <Download size={14} />
                              )}
                              Download
                            </button>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {tab === "ledger" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Select Vendor</label>
            <select
              value={selectedVendorId}
              onChange={e => selectVendor(e.target.value)}
              className="w-full sm:w-96 h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="ledger-vendor-select"
            >
              <option value="">Choose a vendor...</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.remaining_due > 0 ? ` (Due: ${formatNPR(v.remaining_due)})` : ""}</option>
              ))}
            </select>
          </div>

          {!selectedVendorId ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              <BookOpen size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="font-medium">Select a vendor to view their payment ledger</p>
            </div>
          ) : ledgerLoading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : ledgerData && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">{selectedVendor?.name}</h2>
                {selectedVendor?.remaining_due > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                    <AlertTriangle size={11} />Due: {formatNPR(selectedVendor.remaining_due)}
                  </span>
                )}
              </div>

              {ledgerData.vehicles?.length > 0 && (
                <LedgerTable
                  title="Vehicles Purchased"
                  countLabel={`${ledgerData.vehicles.length} vehicle${ledgerData.vehicles.length !== 1 ? "s" : ""}`}
                  headers={["Vehicle", "Reg. No.", "Purchase Date", "Price"]}
                  rows={ledgerData.vehicles
                    .slice()
                    .sort((a, b) => (b.purchase_date || "").localeCompare(a.purchase_date || ""))
                    .map(vh => [
                      `${vh.brand} ${vh.model} ${vh.year || ""}`.trim(),
                      vh.registration_number || "—",
                      vh.purchase_date || "—",
                      formatNPR(vh.purchase_price),
                    ])}
                  totalLabel="Total Purchased"
                  totalValue={formatNPR(ledgerData.vehicles.reduce((s, vh) => s + (vh.purchase_price || 0), 0))}
                />
              )}

              {ledgerData.parts_bills?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Spare Parts Bills</p>
                    <span className="text-[11px] text-slate-400">{ledgerData.parts_bills.length} bill{ledgerData.parts_bills.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="space-y-4">
                    {ledgerData.parts_bills
                      .slice()
                      .sort((a, b) => (b.entry_date || "").localeCompare(a.entry_date || ""))
                      .map((b, i) => (
                        <div
                          key={b.bill_no || i}
                          className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
                          data-testid="parts-bill-tile"
                        >
                          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                            <div className="flex items-baseline gap-2 min-w-0">
                              <span className="font-bold text-slate-900 text-sm truncate">{b.bill_no}</span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{b.entry_date || "—"}</span>
                            </div>
                            <button
                              onClick={() => setPrintBill(b)}
                              className="shrink-0 p-1 rounded hover:bg-blue-100 text-blue-600"
                              title="Print bill"
                              data-testid="print-bill-tile-btn"
                            >
                              <Printer size={13} />
                            </button>
                          </div>

                          <ul className="divide-y divide-slate-50">
                            {b.items?.map((it, j) => (
                              <li key={j} className="flex justify-between gap-3 px-4 py-2 text-xs">
                                <span className="text-slate-600">{it.name}{it.part_number ? ` (${it.part_number})` : ""} × {it.quantity}</span>
                                <span className="text-slate-500 whitespace-nowrap">{formatNPR(it.quantity * it.unit_cost)}</span>
                              </li>
                            ))}
                          </ul>

                          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100">
                            <span className="text-xs font-semibold text-slate-500">Bill Total</span>
                            <span className="text-sm font-bold text-slate-900">{formatNPR(b.total)}</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5 text-sm mt-3">
                    <span className="font-semibold text-slate-600">Total Parts Purchased</span>
                    <span className="font-bold text-slate-900">{formatNPR(ledgerData.parts_bills.reduce((s, b) => s + (b.total || 0), 0))}</span>
                  </div>
                </div>
              )}

              <LedgerTable
                title="Payment History"
                countLabel={`${ledgerData.payments?.length || 0} payment${(ledgerData.payments?.length || 0) !== 1 ? "s" : ""}`}
                headers={["Date", "Notes", "Amount"]}
                rows={(ledgerData.payments || []).map(p => [p.payment_date, p.notes || "—", formatNPR(p.amount)])}
                totalLabel="Total Paid"
                totalValue={formatNPR(ledgerData.total_paid || 0)}
                empty="No payments recorded yet"
                accent="green"
              />

              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5 text-sm">
                <span className="font-semibold text-slate-600">Remaining Due</span>
                <span className={`font-bold ${ledgerData.remaining_due > 0 ? "text-red-600" : "text-green-600"}`}>{formatNPR(ledgerData.remaining_due || 0)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {printBill && (
        <BillPrintModal bill={printBill} vendor={selectedVendor} onClose={() => setPrintBill(null)} />
      )}
    </div>
  );
}
