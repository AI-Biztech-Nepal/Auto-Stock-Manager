import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, formatDateDual } from "../utils/helpers";

export default function EMI() {
  const [emis, setEmis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedEmi, setSelectedEmi] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customer_id: "", vehicle_id: "", loan_amount: "", down_payment: "", interest_rate: "12", tenure_months: "12", start_date: "", financer_name: "", notes: "" });
  const [payForm, setPayForm] = useState({ emi_id: "", amount: "", payment_date: "", notes: "" });

  const fetchEMI = useCallback(async () => {
    try { const r = await api.get("/emi"); setEmis(r.data); }
    catch { toast.error("Failed to load EMI"); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchEMI();
    api.get("/customers").then(r => setCustomers(r.data)).catch(() => {});
    api.get("/vehicles?status=sold").then(r => setVehicles(r.data)).catch(() => {});
  }, [fetchEMI]);

  // Calculate preview EMI
  const calcEMI = () => {
    const p = Number(form.loan_amount);
    const r = Number(form.interest_rate) / 100 / 12;
    const n = Number(form.tenure_months);
    if (!p || !n) return 0;
    if (r === 0) return Math.round(p / n);
    return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.vehicle_id || !form.loan_amount || !form.start_date) { toast.error("Fill required fields"); return; }
    setSaving(true);
    try {
      await api.post("/emi", { ...form, loan_amount: Number(form.loan_amount), down_payment: Number(form.down_payment || 0), interest_rate: Number(form.interest_rate), tenure_months: Number(form.tenure_months) });
      toast.success("EMI plan created!"); setShowModal(false); fetchEMI();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); } finally { setSaving(false); }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!payForm.amount) { toast.error("Enter amount"); return; }
    setSaving(true);
    try {
      await api.post("/emi-payments", { ...payForm, amount: Number(payForm.amount) });
      toast.success("Payment recorded!"); setShowPayModal(false); fetchEMI();
    } catch { toast.error("Failed"); } finally { setSaving(false); }
  };

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
  const sel = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  const activeEMIs = emis.filter(e => e.is_active);
  const totalReceivable = emis.reduce((s, e) => s + (e.remaining_balance || 0), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">EMI & Financing</h1>
          <p className="text-sm text-slate-500">{activeEMIs.length} active plans · Receivable: <span className="font-semibold text-blue-600">{formatNPR(totalReceivable)}</span></p>
        </div>
        <button onClick={() => setShowModal(true)} data-testid="create-emi-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> New EMI Plan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{emis.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Plans</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{activeEMIs.length}</div>
          <div className="text-xs text-blue-600 mt-0.5">Active Plans</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <div className="text-lg font-bold text-green-700">{formatNPR(totalReceivable)}</div>
          <div className="text-xs text-green-600 mt-0.5">Total Receivable</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : emis.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <p className="font-medium">No EMI plans yet</p>
          <p className="text-sm mt-1">Create plans for financed vehicle purchases</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {emis.map(e => {
            const pct = e.loan_amount > 0 ? Math.round((e.total_paid / e.loan_amount) * 100) : 0;
            return (
              <div key={e.id} data-testid="emi-card" className={`bg-white rounded-xl border shadow-sm p-5 ${e.is_active ? "border-slate-200" : "border-green-200 bg-green-50/30"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{e.customer_name || "Customer"}</div>
                    <div className="text-xs text-slate-500">{e.vehicle_name} · {e.financer_name || "Self Finance"}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${e.is_active ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {e.is_active ? "Active" : "Closed"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div className="text-center bg-slate-50 rounded-lg p-2"><div className="font-bold text-slate-900">{formatNPR(e.loan_amount)}</div><div className="text-slate-500">Loan</div></div>
                  <div className="text-center bg-blue-50 rounded-lg p-2"><div className="font-bold text-blue-700">{formatNPR(e.monthly_installment)}</div><div className="text-blue-600">Monthly</div></div>
                  <div className="text-center bg-red-50 rounded-lg p-2"><div className="font-bold text-red-700">{formatNPR(e.remaining_balance)}</div><div className="text-red-600">Remaining</div></div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{e.payments_made}/{e.tenure_months} payments</span>
                    <span>{pct}% paid</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
                <div className="text-xs text-slate-400 mb-3">Started: {formatDateDual(e.start_date)} · {e.interest_rate}% p.a.</div>
                {e.is_active && (
                  <button onClick={() => { setSelectedEmi(e); setPayForm({ emi_id: e.id, amount: String(e.monthly_installment), payment_date: "", notes: "" }); setShowPayModal(true); }}
                    className="w-full py-2 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-200 transition-colors" data-testid="record-emi-payment-btn">
                    Record Payment
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create EMI Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Create EMI Plan</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Customer <span className="text-red-500">*</span></label>
                <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className={sel}>
                  <option value="">Select Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.contact_number}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Vehicle <span className="text-red-500">*</span></label>
                <select value={form.vehicle_id} onChange={e => setForm({...form, vehicle_id: e.target.value})} className={sel}>
                  <option value="">Select Vehicle</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Loan Amount (NPR) <span className="text-red-500">*</span></label><input type="number" value={form.loan_amount} onChange={e => setForm({...form, loan_amount: e.target.value})} className={inp} placeholder="e.g. 100000" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Down Payment</label><input type="number" value={form.down_payment} onChange={e => setForm({...form, down_payment: e.target.value})} className={inp} placeholder="e.g. 20000" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Interest Rate (% p.a.)</label><input type="number" step="0.1" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})} className={inp} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Tenure (months)</label><input type="number" value={form.tenure_months} onChange={e => setForm({...form, tenure_months: e.target.value})} className={inp} /></div>
              </div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Start Date <span className="text-red-500">*</span></label><input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className={inp} /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Financer Name</label><input value={form.financer_name} onChange={e => setForm({...form, financer_name: e.target.value})} placeholder="e.g. NIC Asia Bank" className={inp} /></div>

              {/* EMI Preview */}
              {form.loan_amount && form.tenure_months && (
                <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-800 flex justify-between">
                  <span>Estimated Monthly Payment:</span>
                  <span className="font-bold">{formatNPR(calcEMI())}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">{saving ? "Creating..." : "Create EMI Plan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayModal && selectedEmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div><h2 className="text-lg font-bold text-slate-900">Record EMI Payment</h2><p className="text-xs text-slate-500 mt-0.5">{selectedEmi.customer_name} · Monthly: {formatNPR(selectedEmi.monthly_installment)}</p></div>
              <button onClick={() => setShowPayModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
            </div>
            <form onSubmit={handlePayment} className="p-5 space-y-4">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Amount (NPR)</label><input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} className={inp} /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Payment Date</label><input type="date" value={payForm.payment_date} onChange={e => setPayForm({...payForm, payment_date: e.target.value})} className={inp} /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Notes</label><input value={payForm.notes} onChange={e => setPayForm({...payForm, notes: e.target.value})} placeholder="Optional notes" className={inp} /></div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPayModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">{saving ? "Recording..." : "Record Payment"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
