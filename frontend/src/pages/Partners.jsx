import { useEffect, useState, useCallback } from "react";
import { Plus, Edit, Trash2, Handshake, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [financial, setFinancial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", capital_contribution: "", stake_percentage: "", contact: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [pr, fr] = await Promise.all([api.get("/partners"), api.get("/reports/financial")]);
      setPartners(pr.data);
      setFinancial(fr.data);
    } catch { toast.error("Failed to load partner data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setEditItem(null); setForm({ name: "", capital_contribution: "", stake_percentage: "", contact: "" }); setShowModal(true); };
  const openEdit = (p) => { setEditItem(p); setForm({ name: p.name, capital_contribution: p.capital_contribution, stake_percentage: p.stake_percentage, contact: p.contact || "" }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.capital_contribution || !form.stake_percentage) { toast.error("Fill required fields"); return; }
    setSaving(true);
    try {
      const payload = { ...form, capital_contribution: Number(form.capital_contribution), stake_percentage: Number(form.stake_percentage) };
      if (editItem) { await api.put(`/partners/${editItem.id}`, payload); toast.success("Partner updated"); }
      else { await api.post("/partners", payload); toast.success("Partner added!"); }
      setShowModal(false); fetchData();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this partner?")) return;
    try { await api.delete(`/partners/${id}`); toast.success("Removed"); fetchData(); }
    catch { toast.error("Failed"); }
  };

  const totalCapital = partners.reduce((sum, p) => sum + p.capital_contribution, 0);
  const totalProfit = financial?.total_profit || 0;
  const totalStake = partners.reduce((sum, p) => sum + p.stake_percentage, 0);

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Partner Dashboard</h1>
          <p className="text-sm text-slate-500">Financial visibility & profit sharing</p>
        </div>
        <button onClick={openAdd} data-testid="add-partner-button" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> Add Partner
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center" data-testid="total-capital-card">
          <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-2">Total Capital Invested</div>
          <div className="text-3xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{formatNPR(totalCapital)}</div>
          <div className="text-xs text-slate-400 mt-1">{partners.length} partners</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center" data-testid="total-profit-card">
          <div className="text-xs text-emerald-600 uppercase font-semibold tracking-wider mb-2">Total Realized Profit</div>
          <div className="text-3xl font-bold text-emerald-700" style={{ fontFamily: "Manrope" }}>{formatNPR(totalProfit)}</div>
          <div className="text-xs text-emerald-500 mt-1">From sold vehicles</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
          <div className="text-xs text-blue-600 uppercase font-semibold tracking-wider mb-2">ROI</div>
          <div className="text-3xl font-bold text-blue-700" style={{ fontFamily: "Manrope" }}>
            {totalCapital > 0 ? `${((totalProfit / totalCapital) * 100).toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-blue-500 mt-1">Return on investment</div>
        </div>
      </div>

      {/* Stake Check */}
      {Math.abs(totalStake - 100) > 0.5 && partners.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-yellow-700 font-medium text-sm">Total stake is {totalStake.toFixed(2)}% — should equal 100%</span>
        </div>
      )}

      {/* Partner Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {partners.map(p => {
            const profitShare = totalProfit * p.stake_percentage / 100;
            const roi = p.capital_contribution > 0 ? ((profitShare / p.capital_contribution) * 100).toFixed(1) : 0;
            return (
              <div key={p.id} data-testid="partner-card" className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{p.name}</div>
                      <div className="text-xs text-slate-500">{p.contact || "No contact"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(p)} className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors"><Edit size={14} className="text-slate-400" /></button>
                    <button onClick={() => handleDelete(p.id)} className="w-11 h-11 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Stake</span>
                    <span className="font-bold text-blue-600 text-lg">{p.stake_percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(p.stake_percentage, 100)}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-slate-500 mb-1">Capital</div>
                      <div className="font-bold text-slate-900 text-sm">{formatNPR(p.capital_contribution)}</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-emerald-600 mb-1">Profit Share</div>
                      <div className="font-bold text-emerald-700 text-sm">{formatNPR(profitShare)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <TrendingUp size={12} className="text-green-500" />
                    <span>ROI: <strong className={roi > 0 ? "text-green-600" : "text-slate-700"}>{roi}%</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && partners.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <Handshake size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No partners configured</p>
          <p className="text-sm mt-1">Add partners to track profit sharing and capital</p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editItem ? "Edit Partner" : "Add Partner"}</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Partner Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Rajesh Sharma" className={inp} data-testid="partner-name-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Capital Contribution (NPR) <span className="text-red-500">*</span></label>
                <input type="number" value={form.capital_contribution} onChange={e => setForm({...form, capital_contribution: e.target.value})} placeholder="e.g. 500000" className={inp} data-testid="partner-capital-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Stake Percentage (%) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" value={form.stake_percentage} onChange={e => setForm({...form, stake_percentage: e.target.value})} placeholder="e.g. 33.33" className={inp} data-testid="partner-stake-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contact</label>
                <input value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} placeholder="Phone number" className={inp} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="save-partner-btn">
                  {saving ? "Saving..." : editItem ? "Update" : "Add Partner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
