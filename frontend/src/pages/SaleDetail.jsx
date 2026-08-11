import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, X, ChevronDown, ChevronUp, UserPlus, Lock, Undo2 } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import HoverADDate from "../components/HoverADDate";
import BSDatePicker from "../components/BSDatePicker";
import VehicleComboBox from "../components/VehicleComboBox";
import { useAuth } from "../context/AuthContext";

const PRESET_EXPENSES = [
  { name: "Registration Transfer Fee", amount: 2000 },
  { name: "Insurance Transfer Fee", amount: 1500 },
  { name: "Road Tax Clearance", amount: 1000 },
  { name: "Bluebook Copy Fee", amount: 500 },
  { name: "Notary / Document Fee", amount: 800 },
  { name: "Delivery / Transport", amount: 1200 },
];

const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel = `${inp} bg-white`;

function getErrMsg(err, fallback) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return fallback || `Server error (${err.response.status})`;
}

const paymentStatusStyle = (status) => {
  if (status === "Paid") return { bg: "bg-green-100", text: "text-green-800" };
  if (status === "Partial") return { bg: "bg-yellow-100", text: "text-yellow-800" };
  return { bg: "bg-red-100", text: "text-red-800" };
};

const Row = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 py-2 border-b border-slate-50 last:border-0">
    <span className="text-sm text-slate-500 shrink-0">{label}</span>
    {children}
  </div>
);

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

export default function SaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({});
  const [expenseItems, setExpenseItems] = useState([]);
  const [presetToAdd, setPresetToAdd] = useState("");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");
  const [showPresets, setShowPresets] = useState(true);

  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showAddCust, setShowAddCust] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", contact_number: "", address: "" });
  const [addingCust, setAddingCust] = useState(false);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnForm, setReturnForm] = useState({ refund_amount: "", new_status: "available", notes: "" });
  const [returning, setReturning] = useState(false);

  const fetchSale = useCallback(async () => {
    try {
      const r = await api.get(`/sales/${id}`);
      setSale(r.data);
    } catch { toast.error("Sale not found"); navigate("/sales"); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchSale(); }, [fetchSale]);

  const startEdit = async () => {
    setEditForm({
      vehicle_id: sale.vehicle_id,
      customer_id: sale.customer_id || "",
      sale_price: sale.sale_price,
      paid_cash: sale.paid_cash || "",
      paid_bank: sale.paid_bank || "",
      due_date: sale.due_date || "",
      sale_date: sale.sale_date || "",
      notes: sale.notes || "",
    });
    setExpenseItems(sale.extra_expenses?.length > 0 ? sale.extra_expenses : []);
    setPresetToAdd(""); setNewExpName(""); setNewExpAmt("");
    setShowAddCust(false);
    setNewCust({ name: "", contact_number: "", address: "" });
    setIsEditing(true);
    try {
      const [v, c] = await Promise.all([api.get("/vehicles"), api.get("/customers")]);
      setVehicles(v.data); setCustomers(c.data);
    } catch { toast.error("Failed to load vehicles/customers"); }
  };

  const cancelEdit = () => setIsEditing(false);

  const saveNewCustomer = async () => {
    if (!newCust.name || !newCust.contact_number) { toast.error("Name and phone are required"); return; }
    setAddingCust(true);
    try {
      const r = await api.post("/customers", newCust);
      setCustomers(prev => [r.data, ...prev]);
      setEditForm(f => ({ ...f, customer_id: r.data.id }));
      setShowAddCust(false);
      setNewCust({ name: "", contact_number: "", address: "" });
      toast.success("Customer added!");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to add customer"); }
    finally { setAddingCust(false); }
  };

  const expensesTotal = expenseItems.reduce((s, e) => s + Number(e.amount || 0), 0);
  const grandTotal = (Number(editForm.sale_price) || 0) + expensesTotal;
  const amountPaid = (Number(editForm.paid_cash) || 0) + (Number(editForm.paid_bank) || 0);
  const amountDue = Math.max(Number((grandTotal - amountPaid).toFixed(2)), 0);
  const availablePresets = PRESET_EXPENSES.filter(p => !expenseItems.some(e => e.name === p.name));

  const addPresetExpense = (name) => {
    const preset = PRESET_EXPENSES.find(p => p.name === name);
    if (!preset) return;
    setExpenseItems(prev => [...prev, { name: preset.name, amount: preset.amount }]);
    setPresetToAdd("");
  };

  const addCustomExpense = () => {
    if (!newExpName || !newExpAmt) { toast.error("Enter name and amount"); return; }
    setExpenseItems(prev => [...prev, { name: newExpName, amount: Number(newExpAmt) }]);
    setNewExpName(""); setNewExpAmt("");
  };

  const updateExpenseAmount = (idx, amount) => setExpenseItems(prev => prev.map((e, i) => i === idx ? { ...e, amount } : e));
  const removeExpenseItem = (idx) => setExpenseItems(prev => prev.filter((_, i) => i !== idx));

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.vehicle_id || !editForm.sale_price) { toast.error("Vehicle and Sale Price are required"); return; }
    setSaving(true);
    try {
      const payload = {
        vehicle_id: editForm.vehicle_id,
        customer_id: editForm.customer_id || null,
        sale_price: Number(editForm.sale_price),
        extra_expenses: expenseItems.map(e => ({ name: e.name, amount: Number(e.amount) || 0 })),
        payment_method: (Number(editForm.paid_bank) > 0 && Number(editForm.paid_cash) > 0) ? "Cash + Bank Transfer" : (Number(editForm.paid_bank) > 0 ? "Bank Transfer" : (Number(editForm.paid_cash) > 0 ? "Cash" : "Due")),
        paid_cash: Number(editForm.paid_cash) || 0,
        paid_bank: Number(editForm.paid_bank) || 0,
        due_date: editForm.due_date || undefined,
        sale_date: editForm.sale_date || undefined,
        notes: editForm.notes,
      };
      await api.put(`/sales/${id}`, payload);
      toast.success("Sale updated successfully!");
      setIsEditing(false);
      fetchSale();
    } catch (err) { toast.error(getErrMsg(err, "Failed to save sale")); }
    finally { setSaving(false); }
  };

  const deleteSale = async () => {
    if (!window.confirm("Delete this sale? The vehicle will be restored to available.")) return;
    try {
      await api.delete(`/sales/${id}`);
      toast.success("Sale deleted, vehicle restored");
      navigate("/sales");
    } catch (err) { toast.error(getErrMsg(err, "Failed to delete")); }
  };

  const openReturnModal = () => {
    setReturnForm({ refund_amount: "", new_status: "available", notes: "" });
    setShowReturnModal(true);
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    const amt = Number(returnForm.refund_amount);
    if (returnForm.refund_amount === "" || Number.isNaN(amt) || amt < 0 || amt > sale.total_amount) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setReturning(true);
    try {
      await api.post(`/vehicles/${sale.vehicle_id}/return`, {
        refund_amount: amt,
        new_status: returnForm.new_status,
        notes: returnForm.notes || null,
      });
      toast.success("Return recorded — vehicle back in stock");
      setShowReturnModal(false);
      fetchSale();
    } catch (err) { toast.error(getErrMsg(err, "Failed to record return")); }
    finally { setReturning(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!sale) return null;

  const ps = paymentStatusStyle(sale.payment_status);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sales")} className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors text-slate-500"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{sale.vehicle_info || `${sale.vehicle_brand || ""} ${sale.vehicle_model || ""}`}</h1>
            <p className="text-sm text-slate-500">{sale.registration_number || "No registration on file"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${ps.bg} ${ps.text}`} data-testid="payment-status-badge">{sale.returned ? "Returned" : sale.payment_status}</span>
          {isAdmin && !isEditing && (
            <>
              <button onClick={startEdit} data-testid="edit-sale-btn" className="flex items-center gap-1.5 px-3 py-3 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"><Pencil size={14} /> Edit</button>
              {!sale.returned && sale.vehicle_status === "sold" && (
                <button onClick={openReturnModal} data-testid="record-return-btn" className="flex items-center gap-1.5 px-3 py-3 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors"><Undo2 size={14} /> Record Return</button>
              )}
              <button onClick={deleteSale} data-testid="delete-sale-btn" className="flex items-center gap-1.5 px-3 py-3 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"><Trash2 size={14} /> Delete</button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <Field label="Vehicle" required>
              <VehicleComboBox
                vehicles={vehicles}
                value={editForm.vehicle_id}
                onChange={vid => setEditForm({ ...editForm, vehicle_id: vid })}
                placeholder="Search or select a vehicle..."
                testId="edit-sale-vehicle"
                showPrice
              />
            </Field>

            <Field label="Sale Date">
              <BSDatePicker value={editForm.sale_date} onChange={val => setEditForm({ ...editForm, sale_date: val })} data-testid="edit-sale-date-input" />
            </Field>

            <Field label="Customer">
              <div className="flex gap-2">
                <select value={editForm.customer_id} onChange={e => setEditForm({ ...editForm, customer_id: e.target.value })} className={sel} data-testid="edit-sale-customer-select">
                  <option value="">Walk-in / No customer record</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.contact_number}</option>)}
                </select>
                <button type="button" onClick={() => setShowAddCust(!showAddCust)} title="Add new customer" className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border transition-colors ${showAddCust ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  <UserPlus size={15} />
                </button>
              </div>
              {showAddCust && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-blue-700">New Customer</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} placeholder="Full Name *" className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                    <input value={newCust.contact_number} onChange={e => setNewCust({ ...newCust, contact_number: e.target.value })} placeholder="Phone *" className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                  </div>
                  <input value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })} placeholder="Address (optional)" className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowAddCust(false)} className="px-3 h-7 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                    <button type="button" onClick={saveNewCustomer} disabled={addingCust} className="px-3 h-7 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">{addingCust ? "Saving..." : "Create & Select"}</button>
                  </div>
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Sale Price (NPR)" required>
                <input type="text" inputMode="numeric" value={editForm.sale_price} onChange={e => setEditForm({ ...editForm, sale_price: e.target.value })} className={inp} data-testid="edit-sale-price-input" />
              </Field>
              <Field label="Paid by Cash (NPR)">
                <input type="text" inputMode="numeric" value={editForm.paid_cash} onChange={e => setEditForm({ ...editForm, paid_cash: e.target.value })} className={inp} />
              </Field>
              <Field label="Paid by Bank Transfer (NPR)">
                <input type="text" inputMode="numeric" value={editForm.paid_bank} onChange={e => setEditForm({ ...editForm, paid_bank: e.target.value })} className={inp} />
              </Field>
              <Field label="Due Date">
                <BSDatePicker value={editForm.due_date} onChange={val => setEditForm({ ...editForm, due_date: val })} />
              </Field>
            </div>

            {/* Extra Expenses */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setShowPresets(!showPresets)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                <span>Extra Expenses</span>
                <div className="flex items-center gap-2">
                  {expenseItems.length > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{expenseItems.length} added · {formatNPR(expensesTotal)}</span>}
                  {showPresets ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </div>
              </button>
              {showPresets && (
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-2">Add Preset Fee</p>
                    <select value={presetToAdd} onChange={e => addPresetExpense(e.target.value)} className={sel} disabled={availablePresets.length === 0}>
                      <option value="">{availablePresets.length === 0 ? "All preset fees added" : "Select a fee to add..."}</option>
                      {availablePresets.map(e => <option key={e.name} value={e.name}>{e.name} — {formatNPR(e.amount)}</option>)}
                    </select>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500 font-medium mb-2">Custom Expense</p>
                    <div className="flex gap-2 items-center">
                      <input value={newExpName} onChange={e => setNewExpName(e.target.value)} placeholder="Expense name" className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="text" inputMode="numeric" value={newExpAmt} onChange={e => setNewExpAmt(e.target.value)} placeholder="Amount" className="w-24 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button type="button" onClick={addCustomExpense} className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shrink-0">Add</button>
                    </div>
                  </div>
                  {expenseItems.length > 0 && (
                    <div className="border-t border-slate-100 pt-3 space-y-1">
                      <p className="text-xs text-slate-500 font-medium mb-1">Added Expenses</p>
                      {expenseItems.map((ex, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100">
                          <span className="text-slate-700">{ex.name}</span>
                          <div className="flex items-center gap-2">
                            <input type="text" inputMode="numeric" value={ex.amount} onChange={ev => updateExpenseAmount(i, ev.target.value)} className="w-20 h-6 px-1.5 text-xs text-right border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button type="button" onClick={() => removeExpenseItem(i)} className="text-red-400 hover:text-red-600"><X size={11} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Grand Total */}
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                <div>Sale Price: <span className="font-medium text-slate-800">{formatNPR(Number(editForm.sale_price) || 0)}</span></div>
                {expensesTotal > 0 && <div>Extra Expenses: <span className="font-medium text-orange-700">{formatNPR(expensesTotal)}</span></div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Grand Total</div>
                <div className="text-xl font-bold text-green-700" style={{ fontFamily: "Manrope" }}>{formatNPR(grandTotal)}</div>
                {amountDue > 0 && <span className="inline-block mt-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Due: {formatNPR(amountDue)}</span>}
              </div>
            </div>

            <Field label="Notes">
              <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Any notes about this sale..." className={inp} />
            </Field>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={cancelEdit} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} data-testid="save-sale-edit-btn" className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">{saving ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      ) : (
        <>
          {/* Amount Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            {[
              { label: "Sale Price", value: formatNPR(sale.sale_price) },
              {
                label: "Extra Expenses",
                value: formatNPR((sale.expenses_total || 0) + (sale.job_card_cost || 0)),
                // Job card cost is shown here for visibility only — it's a shop cost
                // (reduces margin via Total Investment below), not billed to the
                // customer, so it's deliberately left out of Grand Total/Amount Due.
                sub: sale.job_card_cost > 0 ? `incl. ${formatNPR(sale.job_card_cost)} job card (not billed)` : null,
              },
              { label: "Grand Total", value: formatNPR(sale.total_amount), bold: true },
              { label: "Amount Due", value: formatNPR(sale.due_amount || 0), highlight: sale.due_amount > 0 },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-w-0">
                <div className="text-xs text-slate-500 mb-1 truncate">{c.label}</div>
                <div className={`text-lg font-bold truncate ${c.highlight ? "text-red-600" : "text-slate-900"}`} style={{ fontFamily: "Manrope" }}>{c.value}</div>
                {c.sub && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Super Admin only: margin / profit */}
          {isAdmin && sale.profit_margin !== undefined && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">
                <Lock size={12} /> Super Admin Only
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Total Investment</div>
                  <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{formatNPR(sale.total_investment)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Profit</div>
                  <div className={`text-lg font-bold ${sale.profit < 0 ? "text-red-600" : "text-green-600"}`} style={{ fontFamily: "Manrope" }}>{formatNPR(sale.profit)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Profit Margin</div>
                  <div className={`text-lg font-bold ${sale.profit < 0 ? "text-red-600" : "text-green-600"}`} style={{ fontFamily: "Manrope" }}>{sale.profit_margin != null ? `${sale.profit_margin}%` : "—"}</div>
                </div>
              </div>
            </div>
          )}

          {sale.returned && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-amber-800 mb-1 flex items-center gap-1.5"><Undo2 size={15} /> Return Details</h3>
              <Row label="Refunded to Customer"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(sale.refund_amount || 0)}</span></Row>
              <Row label="Retained (kept)"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(sale.retained_amount || 0)}</span></Row>
              <Row label="Vehicle Restocked As"><span className="text-sm font-medium text-slate-900 sm:text-right capitalize">{sale.returned_status}</span></Row>
              {sale.return_notes && <Row label="Condition Notes"><span className="text-sm font-medium text-slate-900 sm:text-right">{sale.return_notes}</span></Row>}
            </div>
          )}

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Customer</h3>
              <Row label="Name"><span className="text-sm font-medium text-slate-900 sm:text-right">{sale.customer_name}</span></Row>
              <Row label="Contact"><span className="text-sm font-medium text-slate-900 sm:text-right">{sale.customer_contact || "—"}</span></Row>
              <Row label="Address"><span className="text-sm font-medium text-slate-900 sm:text-right">{sale.customer_address || "—"}</span></Row>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Payment</h3>
              <Row label="Sale Date"><span className="text-sm font-medium text-slate-900 sm:text-right"><HoverADDate date={sale.sale_date} /></span></Row>
              <Row label="Payment Method"><span className="text-sm font-medium text-slate-900 sm:text-right">{sale.payment_method}</span></Row>
              <Row label="Paid by Cash"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(sale.paid_cash || 0)}</span></Row>
              <Row label="Paid by Bank"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(sale.paid_bank || 0)}</span></Row>
              {sale.due_amount > 0 && (
                <Row label="Due Date"><span className="text-sm font-medium text-red-600 sm:text-right">{sale.due_date ? <HoverADDate date={sale.due_date} /> : "Not set"}</span></Row>
              )}
            </div>
          </div>

          {sale.extra_expenses?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Extra Expenses</h3>
              <div className="space-y-1">
                {sale.extra_expenses.map((ex, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <span className="text-slate-600">{ex.name}</span>
                    <span className="font-medium text-slate-800">{formatNPR(ex.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sale.notes && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Notes</h3>
              <p className="text-sm text-slate-600">{sale.notes}</p>
            </div>
          )}
        </>
      )}

      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Record Return</h2>
              <button onClick={() => setShowReturnModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={submitReturn} className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Assess the vehicle's condition and set how much of the sale amount ({formatNPR(sale.total_amount)}) gets refunded to the customer. The rest is kept by the shop, and the sale is marked returned rather than deleted.</p>
              <Field label="Refund Amount (NPR)" required>
                <input
                  type="number" min="0" max={sale.total_amount} step="0.01"
                  value={returnForm.refund_amount}
                  onChange={e => setReturnForm({ ...returnForm, refund_amount: e.target.value })}
                  placeholder="e.g. 96000"
                  className={inp}
                  data-testid="return-refund-amount-input"
                />
              </Field>
              {returnForm.refund_amount !== "" && !Number.isNaN(Number(returnForm.refund_amount)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-slate-700 space-y-0.5">
                  <div>Refund to customer: <span className="font-semibold">{formatNPR(Number(returnForm.refund_amount))}</span></div>
                  <div>Retained by shop: <span className="font-semibold">{formatNPR(sale.total_amount - Number(returnForm.refund_amount))}</span></div>
                </div>
              )}
              <Field label="Vehicle Re-enters Stock As" required>
                <select value={returnForm.new_status} onChange={e => setReturnForm({ ...returnForm, new_status: e.target.value })} className={sel} data-testid="return-new-status-select">
                  <option value="available">Available</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="reserved">Reserved</option>
                  <option value="in_repair">In Repair</option>
                  <option value="scrap">Scrap</option>
                </select>
              </Field>
              <Field label="Condition Notes">
                <input value={returnForm.notes} onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })} placeholder="Assessment details..." className={inp} />
              </Field>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowReturnModal(false)} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={returning} data-testid="submit-return-btn" className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {returning ? "Recording..." : "Record Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
