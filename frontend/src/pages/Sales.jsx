import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2, Eye, TrendingUp, DollarSign, Calendar, ShoppingBag, X, ChevronDown, ChevronUp, UserPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { useAuth } from "../context/AuthContext";
import VehicleComboBox from "../components/VehicleComboBox";
import BSDatePicker from "../components/BSDatePicker";

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

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const EMPTY_FORM = {
  vehicle_id: "", customer_id: "", sale_price: "",
  payment_method: "Cash", paid_cash: "", paid_bank: "", due_date: "", sale_date: "", notes: "",
};

export default function Sales() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [form, setForm] = useState(EMPTY_FORM);
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Inline add-customer form
  const [showAddCust, setShowAddCust] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", contact_number: "", address: "" });
  const [addingCust, setAddingCust] = useState(false);

  // Extra expenses state
  const [expenseItems, setExpenseItems] = useState([]);          // [{name, amount}] - added one by one
  const [presetToAdd, setPresetToAdd] = useState("");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");
  const [showPresets, setShowPresets] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [s, sm] = await Promise.all([api.get("/sales"), api.get("/sales/summary")]);
      setSales(s.data); setSummary(sm.data);
    } catch { toast.error("Failed to load sales"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openModal = async () => {
    setForm(EMPTY_FORM);
    setExpenseItems([]);
    setPresetToAdd("");
    setNewExpName(""); setNewExpAmt("");
    setShowAddCust(false);
    setNewCust({ name: "", contact_number: "", address: "" });
    setShowModal(true);
    try {
      const [v, c] = await Promise.all([api.get("/vehicles?status=available"), api.get("/customers")]);
      setVehicles(v.data); setCustomers(c.data);
    } catch { toast.error("Failed to load vehicles/customers"); }
  };

  const saveNewCustomer = async () => {
    if (!newCust.name || !newCust.contact_number) { toast.error("Name and phone are required"); return; }
    setAddingCust(true);
    try {
      const r = await api.post("/customers", newCust);
      setCustomers(prev => [r.data, ...prev]);
      setForm(f => ({ ...f, customer_id: r.data.id }));
      setShowAddCust(false);
      setNewCust({ name: "", contact_number: "", address: "" });
      toast.success("Customer added!");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to add customer"); }
    finally { setAddingCust(false); }
  };

  // Compute total extra expenses
  const extraExpenses = expenseItems;
  const expensesTotal = extraExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const grandTotal = (Number(form.sale_price) || 0) + expensesTotal;
  const amountPaid = (Number(form.paid_cash) || 0) + (Number(form.paid_bank) || 0);
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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id || !form.sale_price) { toast.error("Vehicle and Sale Price are required"); return; }
    setSaving(true);
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        customer_id: form.customer_id || null,
        sale_price: Number(form.sale_price),
        extra_expenses: extraExpenses.map(e => ({ name: e.name, amount: Number(e.amount) || 0 })),
        payment_method: (Number(form.paid_bank) > 0 && Number(form.paid_cash) > 0) ? "Cash + Bank Transfer" : (Number(form.paid_bank) > 0 ? "Bank Transfer" : (Number(form.paid_cash) > 0 ? "Cash" : "Due")),
        paid_cash: Number(form.paid_cash) || 0,
        paid_bank: Number(form.paid_bank) || 0,
        due_date: form.due_date || undefined,
        sale_date: form.sale_date || undefined,
        notes: form.notes,
      };

      await api.post("/sales", payload);
      toast.success("Sale recorded successfully!");

      setShowModal(false);
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Failed to save sale")); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this sale? The vehicle will be restored to available.")) return;
    try {
      await api.delete(`/sales/${id}`);
      toast.success("Sale deleted, vehicle restored");
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Failed to delete")); }
  };

  const filtered = sales.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.vehicle_info || "").toLowerCase().includes(q) ||
      (s.customer_name || "").toLowerCase().includes(q) ||
      (s.payment_method || "").toLowerCase().includes(q);
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
          <p className="text-sm text-slate-500">{sales.length} sales recorded</p>
        </div>
        <button onClick={openModal} data-testid="new-sale-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> Record Sale
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Sales", value: summary.total_sales, icon: ShoppingBag, color: "bg-blue-500" },
            { label: "Total Revenue", value: formatNPR(summary.total_revenue), icon: TrendingUp, color: "bg-green-500" },
            { label: "This Month", value: summary.this_month_sales + " sales", icon: Calendar, color: "bg-indigo-500" },
            { label: "Avg Sale Price", value: formatNPR(summary.avg_sale_price), icon: DollarSign, color: "bg-purple-500" },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center shrink-0`}>
                <c.icon size={16} className="text-white" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">{c.label}</div>
                <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sales.filter(s => s.due_amount > 0).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4" data-testid="due-alert-banner">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
            <AlertTriangle size={16} />
            Due Payments ({sales.filter(s => s.due_amount > 0).length})
          </div>
          <div className="space-y-1.5">
            {sales.filter(s => s.due_amount > 0).map(s => {
              const isOverdue = s.due_date && s.due_date < new Date().toISOString().slice(0, 10);
              return (
                <div key={s.id} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${isOverdue ? "bg-red-100" : "bg-white"}`}>
                  <div className="text-slate-700">{s.customer_name} — {s.vehicle_info}</div>
                  <div className={`font-semibold ${isOverdue ? "text-red-700" : "text-orange-600"}`}>{formatNPR(s.due_amount)}{s.due_date ? ` due ${s.due_date}` : ""}{isOverdue ? " (OVERDUE)" : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle, customer..." className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="sales-search" />
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <ShoppingBag size={32} className="mb-2 opacity-30" />
            <p className="font-medium">No sales recorded yet</p>
            <p className="text-xs mt-1 text-slate-400">Click "Record Sale" to add one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Vehicle", "Customer", "Sale Price", "Extra Expenses", "Total", "Payment", "Date", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    data-testid="sale-row"
                    onClick={() => navigate(`/sales/${s.id}`)}
                    className="table-row-hover cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 text-sm">{s.vehicle_info || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-700">{s.customer_name}</div>
                      {s.customer_contact && <div className="text-xs text-slate-400">{s.customer_contact}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{formatNPR(s.sale_price)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {s.extra_expenses?.length > 0 ? (
                        <span className="text-orange-600 font-medium">{formatNPR(s.expenses_total)} ({s.extra_expenses.length} items)</span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-green-700 whitespace-nowrap">{formatNPR(s.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.payment_method}</span>
                  {s.due_amount > 0 ? (
                    <div className="mt-1 text-xs font-semibold text-red-600" data-testid="due-badge">Due: {formatNPR(s.due_amount)}{s.due_date ? ` (by ${s.due_date})` : ""}</div>
                  ) : (
                    <div className="mt-1 text-xs text-green-600">Fully Paid</div>
                  )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{s.sale_date}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); navigate(`/sales/${s.id}`); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" data-testid="view-sale-btn">
                          <Eye size={14} className="text-slate-500" />
                        </button>
                        {isAdmin && (
                          <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-sale-btn">
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Sale Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Record Sale</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">

              {/* Vehicle */}
              <Field label="Vehicle" required>
                <VehicleComboBox
                  vehicles={vehicles}
                  value={form.vehicle_id}
                  onChange={id => setForm({...form, vehicle_id: id})}
                  placeholder="Search or select available vehicle..."
                  testId="sale-vehicle"
                  showPrice
                />
              </Field>

              {/* Sale Date */}
              <Field label="Sale Date">
                <BSDatePicker value={form.sale_date} onChange={val => setForm({...form, sale_date: val})} data-testid="sale-date-input" />
              </Field>

              {/* Customer */}
              <Field label="Customer">
                <div className="flex gap-2">
                  <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className={sel} data-testid="sale-customer-select">
                    <option value="">Walk-in / No customer record</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {c.contact_number}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowAddCust(!showAddCust)} title="Add new customer" data-testid="add-customer-inline-btn" className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${showAddCust ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    <UserPlus size={15} />
                  </button>
                </div>
                {showAddCust && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2" data-testid="add-customer-form">
                    <p className="text-xs font-semibold text-blue-700">New Customer</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newCust.name} onChange={e => setNewCust({...newCust, name: e.target.value})} placeholder="Full Name *" className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" data-testid="new-cust-name" />
                      <input value={newCust.contact_number} onChange={e => setNewCust({...newCust, contact_number: e.target.value})} placeholder="Phone *" className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" data-testid="new-cust-phone" />
                    </div>
                    <input value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} placeholder="Address (optional)" className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowAddCust(false)} className="px-3 h-7 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                      <button type="button" onClick={saveNewCustomer} disabled={addingCust} data-testid="save-new-cust-btn" className="px-3 h-7 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">{addingCust ? "Saving..." : "Create & Select"}</button>
                    </div>
                  </div>
                )}
              </Field>

              {/* Sale Price + Payment */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sale Price (NPR)" required>
                  <input type="text" inputMode="numeric" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})} placeholder="e.g. 185000" className={inp} data-testid="sale-price-input" />
                </Field>
                <Field label="Paid by Cash (NPR)">
                  <input type="text" inputMode="numeric" value={form.paid_cash} onChange={e => setForm({...form, paid_cash: e.target.value})} placeholder="0" className={inp} data-testid="paid-cash-input" />
                </Field>
                <Field label="Paid by Bank Transfer (NPR)">
                  <input type="text" inputMode="numeric" value={form.paid_bank} onChange={e => setForm({...form, paid_bank: e.target.value})} placeholder="0" className={inp} data-testid="paid-bank-input" />
                </Field>
              </div>

              {/* Extra Expenses */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setShowPresets(!showPresets)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                  <span>Extra Expenses</span>
                  <div className="flex items-center gap-2">
                    {extraExpenses.length > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{extraExpenses.length} added · {formatNPR(expensesTotal)}</span>}
                    {showPresets ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {showPresets && (
                  <div className="p-4 space-y-3">
                    {/* Preset dropdown - select to add one by one */}
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-2">Add Preset Fee</p>
                      <select
                        value={presetToAdd}
                        onChange={e => addPresetExpense(e.target.value)}
                        className={sel}
                        disabled={availablePresets.length === 0}
                        data-testid="preset-expense-select"
                      >
                        <option value="">{availablePresets.length === 0 ? "All preset fees added" : "Select a fee to add..."}</option>
                        {availablePresets.map(e => (
                          <option key={e.name} value={e.name}>{e.name} — {formatNPR(e.amount)}</option>
                        ))}
                      </select>
                    </div>

                    {/* Custom expenses */}
                    <div className="border-t border-slate-100 pt-3">
                      <p className="text-xs text-slate-500 font-medium mb-2">Custom Expense</p>
                      <div className="flex gap-2 items-center">
                        <input value={newExpName} onChange={e => setNewExpName(e.target.value)} placeholder="Expense name" className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" data-testid="custom-exp-name" />
                        <input type="text" inputMode="numeric" value={newExpAmt} onChange={e => setNewExpAmt(e.target.value)} placeholder="Amount" className="w-24 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" data-testid="custom-exp-amount" />
                        <button type="button" onClick={addCustomExpense} className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shrink-0" data-testid="add-custom-exp-btn">Add</button>
                      </div>
                    </div>

                    {/* Added expenses list */}
                    {expenseItems.length > 0 && (
                      <div className="border-t border-slate-100 pt-3 space-y-1">
                        <p className="text-xs text-slate-500 font-medium mb-1">Added Expenses</p>
                        {expenseItems.map((ex, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100">
                            <span className="text-slate-700">{ex.name}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="text" inputMode="numeric"
                                value={ex.amount}
                                onChange={ev => updateExpenseAmount(i, ev.target.value)}
                                className="w-20 h-6 px-1.5 text-xs text-right border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
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
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between" data-testid="grand-total-section">
                <div className="text-sm text-slate-600">
                  <div>Sale Price: <span className="font-medium text-slate-800">{formatNPR(Number(form.sale_price) || 0)}</span></div>
                  {expensesTotal > 0 && <div>Extra Expenses: <span className="font-medium text-orange-700">{formatNPR(expensesTotal)}</span></div>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Grand Total</div>
                  <div className="text-xl font-bold text-green-700" style={{ fontFamily: "Manrope" }} data-testid="grand-total-value">{formatNPR(grandTotal)}</div>
                  {amountDue > 0 && (
                    <span className="inline-block mt-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full" data-testid="due-amount-bubble">
                      Due: {formatNPR(amountDue)}
                    </span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <Field label="Notes">
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any notes about this sale..." className={inp} />
              </Field>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} data-testid="save-sale-btn" className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">
                  {saving ? "Saving..." : "Record Sale"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
