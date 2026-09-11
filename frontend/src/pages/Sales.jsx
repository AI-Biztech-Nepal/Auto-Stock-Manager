import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2, Eye, TrendingUp, DollarSign, Calendar, ShoppingBag, X, ChevronDown, ChevronUp, UserPlus, AlertTriangle, UploadCloud, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { getCurrentBSMonthRange, getCurrentWeekRange, getTodayAD } from "../utils/nepali-date";
import { useAuth } from "../context/AuthContext";
import VehicleComboBox from "../components/VehicleComboBox";
import BSDatePicker from "../components/BSDatePicker";
import PeriodToggle, { PERIOD_OPTIONS } from "../components/PeriodToggle";

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
const miniInp = "w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white";

// One labelled row inside the Buyer / Witness panels. The label is pinned to a single
// line (truncate) so it never wraps — the two panels then line up row-for-row.
const MiniField = ({ label, required, children }) => (
  <div>
    <label className="block text-[11px] font-medium text-slate-500 mb-0.5 truncate">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

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
  payment_method: "Cash", paid_cash: "", paid_bank: "", advance_payment: "",
  due_amount: "", due_date: "", sale_date: "", ownership_transfer_date: "", notes: "",
  witness_name: "", witness_address: "", witness_phone: "", witness_id_number: "",
};

const EMPTY_BUYER = { name: "", contact_number: "", address: "", id_number: "" };

// One row of the Buyer | Witness split. Rendering each row as its own 2-col grid keeps
// the two halves the exact same height, so the panels line up no matter what.
const DEED_ROWS = [
  { label: "Name", ph: "Full name", bkey: "name", wkey: "witness_name" },
  { label: "Address", ph: "Address", bkey: "address", wkey: "witness_address" },
  { label: "Phone No.", ph: "Phone number", bkey: "contact_number", wkey: "witness_phone" },
  { label: "Licence / Citizenship No.", ph: "Licence / citizenship no.", bkey: "id_number", wkey: "witness_id_number" },
];

export default function Sales() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Set via the Today/This Week/This Month toggle in the header — "all" (default) shows
  // every sale; otherwise restricts the list below to sale_date falling in that range.
  const [periodFilter, setPeriodFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Spreadsheet import ("Sales Record 20XX" workbook)
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importBusy, setImportBusy] = useState(false);

  // Modal state
  const [form, setForm] = useState(EMPTY_FORM);
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Buyer + Witness panel — hidden until the "+" button beside the dropdown is clicked.
  // Used for a fresh buyer (spins up a customer record) plus the sale-deed witness block,
  // which is required whenever this panel is in use.
  const [showAddCust, setShowAddCust] = useState(false);
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [addingCust, setAddingCust] = useState(false);

  // Extra expenses state
  const [expenseItems, setExpenseItems] = useState([]);          // [{name, amount}] - added one by one
  const [presetToAdd, setPresetToAdd] = useState("");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");
  const [showPresets, setShowPresets] = useState(true);

  // Admin-only diagnostic: sales whose linked vehicle no longer has status "sold" —
  // the usual cause of this tab's total drifting from the Sold Stock count.
  const [mismatches, setMismatches] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [s, sm] = await Promise.all([api.get("/sales"), api.get("/sales/summary")]);
      setSales(s.data); setSummary(sm.data);
    } catch { toast.error("Failed to load sales"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/sales/reconcile").then(r => setMismatches(r.data.mismatches)).catch(() => {});
  }, [isAdmin, sales]);

  const openModal = async () => {
    setForm(EMPTY_FORM);
    setExpenseItems([]);
    setPresetToAdd("");
    setNewExpName(""); setNewExpAmt("");
    setBuyer(EMPTY_BUYER);
    setShowAddCust(false);
    setShowModal(true);
    try {
      const [v, c] = await Promise.all([api.get("/vehicles?status=available"), api.get("/customers")]);
      setVehicles(v.data); setCustomers(c.data);
    } catch { toast.error("Failed to load vehicles/customers"); }
  };

  const selectedCustomer = customers.find(c => c.id === form.customer_id) || null;

  const buyerComplete = buyer.name.trim() && buyer.address.trim() && buyer.contact_number.trim();
  const witnessComplete = form.witness_name.trim() && form.witness_address.trim() && form.witness_phone.trim() && form.witness_id_number.trim();

  const saveNewCustomer = async () => {
    if (!buyerComplete) { toast.error("Fill in the buyer's name, address, and phone number"); return; }
    setAddingCust(true);
    try {
      const r = await api.post("/customers", {
        name: buyer.name.trim(),
        contact_number: buyer.contact_number.trim(),
        address: buyer.address.trim() || null,
        id_number: buyer.id_number.trim() || null,
      });
      setCustomers(prev => [r.data, ...prev]);
      setForm(f => ({ ...f, customer_id: r.data.id }));
      toast.success("Customer added — now fill the witness details");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to add customer"); }
    finally { setAddingCust(false); }
  };

  // Compute total extra expenses
  const extraExpenses = expenseItems;
  const expensesTotal = extraExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const grandTotal = (Number(form.sale_price) || 0) + expensesTotal;
  const amountPaid = (Number(form.paid_cash) || 0) + (Number(form.paid_bank) || 0) + (Number(form.advance_payment) || 0);
  const autoDue = Math.max(Number((grandTotal - amountPaid).toFixed(2)), 0);
  // Due Amount field: shows the auto figure until the user types over it (blank ⇒ auto).
  const amountDue = form.due_amount === "" ? autoDue : Math.max(Number(form.due_amount) || 0, 0);

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
    // The Buyer + Witness panel is only in play when it's open. When it is, both blocks
    // are mandatory (sale deed); a typed-but-not-yet-saved buyer gets created on the way
    // through. An existing customer picked from the dropdown covers the buyer half itself.
    const enteringNewBuyer = showAddCust && !form.customer_id;
    if (showAddCust) {
      if (enteringNewBuyer && !buyerComplete) {
        toast.error("Fill in the buyer's name, address, and phone number"); return;
      }
      if (!witnessComplete) {
        toast.error("Fill in all four witness details"); return;
      }
    }
    setSaving(true);
    try {
      let customerId = form.customer_id || null;
      if (enteringNewBuyer) {
        const r = await api.post("/customers", {
          name: buyer.name.trim(),
          contact_number: buyer.contact_number.trim(),
          address: buyer.address.trim() || null,
          id_number: buyer.id_number.trim() || null,
        });
        setCustomers(prev => [r.data, ...prev]);
        customerId = r.data.id;
      }
      const payMethodParts = [];
      if (Number(form.paid_cash) > 0) payMethodParts.push("Cash");
      if (Number(form.paid_bank) > 0) payMethodParts.push("Bank Transfer");
      if (Number(form.advance_payment) > 0) payMethodParts.push("Advance");
      const payload = {
        vehicle_id: form.vehicle_id,
        customer_id: customerId,
        sale_price: Number(form.sale_price),
        extra_expenses: extraExpenses.map(e => ({ name: e.name, amount: Number(e.amount) || 0 })),
        payment_method: payMethodParts.length ? payMethodParts.join(" + ") : "Due",
        paid_cash: Number(form.paid_cash) || 0,
        paid_bank: Number(form.paid_bank) || 0,
        advance_payment: Number(form.advance_payment) || 0,
        due_amount: form.due_amount === "" ? undefined : (Number(form.due_amount) || 0),
        due_date: form.due_date || undefined,
        sale_date: form.sale_date || undefined,
        ownership_transfer_date: form.ownership_transfer_date || undefined,
        notes: form.notes,
        ...(showAddCust ? {
          witness_name: form.witness_name.trim(),
          witness_address: form.witness_address.trim(),
          witness_phone: form.witness_phone.trim(),
          witness_id_number: form.witness_id_number.trim(),
        } : {}),
      };

      await api.post("/sales", payload);
      toast.success("Sale recorded successfully!");

      setShowModal(false);
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Failed to save sale")); }
    finally { setSaving(false); }
  };

  const runImport = async (confirm) => {
    if (!importFile) { toast.error("Choose the spreadsheet first"); return; }
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const r = await api.post(`/sales/import?confirm=${confirm}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(r.data);
      if (r.data.committed) { toast.success(r.data.message); fetchAll(); }
    } catch (err) { toast.error(err.response?.data?.detail || "Import failed"); }
    finally { setImportBusy(false); }
  };

  const closeImport = () => { setShowImport(false); setImportFile(null); setImportResult(null); };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this sale? The vehicle will be restored to available.")) return;
    try {
      await api.delete(`/sales/${id}`);
      toast.success("Sale deleted, vehicle restored");
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Failed to delete")); }
  };

  // The backend's this_month_sales counts by Gregorian month (sale_date.startswith AD
  // year-month), but BS months don't line up with AD month boundaries — most of a BS
  // month's sales fall in the *previous* AD month, so that count reads as far lower
  // than what the business considers "this month". Recomputed here against the actual
  // BS month's AD range instead, and generalized to the other two period tabs too.
  const periodRange = periodFilter === "daily" ? { start: getTodayAD(), end: getTodayAD() }
    : periodFilter === "weekly" ? getCurrentWeekRange()
    : periodFilter === "monthly" ? getCurrentBSMonthRange()
    : null;
  const bsMonthRange = getCurrentBSMonthRange();
  const thisMonthSalesCount = bsMonthRange
    ? sales.filter(s => s.sale_date >= bsMonthRange.start && s.sale_date <= bsMonthRange.end).length
    : summary?.this_month_sales;
  const periodSalesCount = periodRange
    ? sales.filter(s => s.sale_date >= periodRange.start && s.sale_date <= periodRange.end).length
    : thisMonthSalesCount;

  const filtered = sales.filter(s => {
    if (periodRange && !(s.sale_date >= periodRange.start && s.sale_date <= periodRange.end)) return false;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
          <p className="text-sm text-slate-500">{periodFilter !== "all" ? `${filtered.length} sales ${PERIOD_OPTIONS.find(p => p.key === periodFilter)?.label.toLowerCase()}` : `${sales.length} sales recorded`}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodToggle period={periodFilter} onChange={setPeriodFilter} testid="sales-period-toggle" allowOff />
          {isAdmin && (
            <button onClick={() => setShowImport(true)} data-testid="import-sales-btn" className="flex items-center gap-2 border border-slate-200 text-slate-700 text-sm font-medium px-4 py-3 rounded-lg hover:bg-slate-50 transition-all active:scale-95">
              <UploadCloud size={16} /> Import Sheet
            </button>
          )}
          <button onClick={openModal} data-testid="new-sale-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
            <Plus size={16} /> Record Sale
          </button>
        </div>
      </div>

      {/* Summary Cards — the 3rd card follows the period toggle above (defaults to "This
          Month" when nothing's selected, same figure it always showed). */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Sales", value: summary.total_sales, icon: ShoppingBag, color: "bg-blue-500" },
            { label: "Total Revenue", value: formatNPR(summary.total_revenue), icon: TrendingUp, color: "bg-green-500" },
            { label: periodFilter === "all" ? "This Month" : PERIOD_OPTIONS.find(p => p.key === periodFilter)?.label, value: periodSalesCount + " sales", icon: Calendar, color: "bg-indigo-500" },
            { label: "Avg Sale Price", value: formatNPR(summary.avg_sale_price), icon: DollarSign, color: "bg-purple-500" },
          ].map(c => (
            <div
              key={c.label}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 text-left"
            >
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center shrink-0`}>
                <c.icon size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500 font-medium">{c.label}</div>
                <div className="text-lg font-bold text-slate-900 truncate" style={{ fontFamily: "Manrope" }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sales.filter(s => s.needs_review).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800" data-testid="review-alert-banner">
          <AlertTriangle size={15} className="shrink-0" />
          <span><strong>{sales.filter(s => s.needs_review).length}</strong> imported sale{sales.filter(s => s.needs_review).length !== 1 ? "s" : ""} might need attention — look for the amber “Review” tag below, check each, then mark it reviewed.</span>
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
                <div key={s.id} onClick={() => navigate(`/sold-stock/${s.vehicle_id}`)} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg cursor-pointer transition-colors ${isOverdue ? "bg-red-100 hover:bg-red-200" : "bg-white hover:bg-red-50"}`}>
                  <div className="text-slate-700">{s.customer_name} — {s.vehicle_info}</div>
                  <div className={`font-semibold ${isOverdue ? "text-red-700" : "text-orange-600"}`}>{formatNPR(s.due_amount)}{s.due_date ? ` due ${s.due_date}` : ""}{isOverdue ? " (OVERDUE)" : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isAdmin && mismatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="mismatch-alert-banner">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-2">
            <AlertTriangle size={16} />
            Out of Sync with Sold Stock ({mismatches.length})
          </div>
          <p className="text-xs text-amber-700 mb-2">
            Either a sale's vehicle no longer has status "Sold" (edited or deleted directly from Inventory), or a vehicle is marked "Sold" with no sale record behind it — either way it counts on one tab but not the other. Open each and reconcile: restore the vehicle's status, delete the stray sale, or record the missing sale.
          </p>
          <div className="space-y-1.5">
            {mismatches.map(m => (
              <div key={m.sale_id || m.vehicle_id} onClick={() => navigate(m.sale_id ? `/sales/${m.sale_id}` : `/inventory/${m.vehicle_id}`)} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white hover:bg-amber-100 cursor-pointer transition-colors">
                <div className="text-slate-700">
                  {m.issue === "orphan_sold_vehicle"
                    ? `${m.vehicle_info || "Vehicle"} — marked Sold on ${m.sale_date}, no sale record`
                    : `${m.vehicle_info || "Vehicle deleted"} — ${formatNPR(m.total_amount)} on ${m.sale_date}`}
                </div>
                <div className="font-semibold text-amber-700">
                  {m.issue === "vehicle_deleted" ? "Vehicle deleted"
                    : m.issue === "orphan_sold_vehicle" ? "Missing sale record"
                    : `Vehicle is now "${m.vehicle_status}"`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search — sticky so it stays reachable while scrolling a long list */}
      <div className="sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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
            <p className="font-medium">{periodFilter !== "all" || search ? "No sales match this filter" : "No sales recorded yet"}</p>
            <p className="text-xs mt-1 text-slate-400">{periodFilter !== "all" || search ? "Try clearing the search or period filter" : 'Click "Record Sale" to add one'}</p>
          </div>
        ) : (
          <>
            {/* Card list — phones only, avoids squeezing an 8-column table into a narrow viewport */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.map(s => (
                <div
                  key={s.id}
                  data-testid="sale-row-mobile"
                  onClick={() => navigate(`/sales/${s.id}`)}
                  className="p-4 active:bg-slate-50 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate">{s.vehicle_info || "—"}
                        {s.needs_review && <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><AlertTriangle size={9} /> Review</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{s.customer_name}{s.customer_contact ? ` · ${s.customer_contact}` : ""}</div>
                    </div>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} className="w-11 h-11 -mr-2.5 -mt-2.5 shrink-0 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-sale-btn-mobile">
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-green-700">{formatNPR(s.total_amount)}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.payment_method}</span>
                  </div>
                  {((s.expenses_total || 0) + (s.job_card_cost || 0)) > 0 && (
                    <div className="mt-1 text-xs text-orange-600 font-medium">+{formatNPR((s.expenses_total || 0) + (s.job_card_cost || 0))} extra expenses{s.extra_expenses?.length > 0 ? ` (${s.extra_expenses.length})` : ""}</div>
                  )}
                  {s.due_amount > 0 ? (
                    <div className="mt-1 text-xs font-semibold text-red-600" data-testid="due-badge">Due: {formatNPR(s.due_amount)}{s.due_date ? ` (by ${s.due_date})` : ""}</div>
                  ) : (
                    <div className="mt-1 text-xs text-green-600">Fully Paid</div>
                  )}
                  <div className="mt-1.5 text-xs text-slate-400">{s.sale_date}</div>
                </div>
              ))}
            </div>

            {/* Table — sm and up */}
            <div className="hidden sm:block overflow-x-auto">
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
                        <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          {s.vehicle_info || "—"}
                          {s.needs_review && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full" title={s.review_note || "Imported — might need attention"}><AlertTriangle size={9} /> Review</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-700">{s.customer_name}</div>
                        {s.customer_contact && <div className="text-xs text-slate-400">{s.customer_contact}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{formatNPR(s.sale_price)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {((s.expenses_total || 0) + (s.job_card_cost || 0)) > 0 ? (
                          <span className="text-orange-600 font-medium">
                            {formatNPR((s.expenses_total || 0) + (s.job_card_cost || 0))}
                            {s.extra_expenses?.length > 0 ? ` (${s.extra_expenses.length} items)` : ""}
                          </span>
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
          </>
        )}
      </div>

      {/* Record Sale Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-xl sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">Record Sale</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-4">

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

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sale Date">
                  <BSDatePicker value={form.sale_date} onChange={val => setForm({...form, sale_date: val})} data-testid="sale-date-input" />
                </Field>
                <Field label="Vehicle Pass Date">
                  <BSDatePicker value={form.ownership_transfer_date} onChange={val => setForm({...form, ownership_transfer_date: val})} data-testid="vehicle-pass-date-input" />
                </Field>
              </div>

              {/* Customer */}
              <Field label="Customer">
                <div className="flex gap-2">
                  <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className={sel} data-testid="sale-customer-select">
                    <option value="">Walk-in / No customer record</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {c.contact_number}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowAddCust(!showAddCust)} title="Add buyer + witness details" data-testid="add-customer-inline-btn" className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border transition-colors ${showAddCust ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    <UserPlus size={15} />
                  </button>
                </div>

                {showAddCust && (
                  <>
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2" data-testid="add-customer-form">
                      <div className="grid grid-cols-2 gap-x-3">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide" data-testid="buyer-details-panel">Buyer's Details</p>
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide" data-testid="witness-details-panel">Witness Details</p>
                      </div>

                      {DEED_ROWS.map(({ label, ph, bkey, wkey }) => (
                        <div key={bkey} className="grid grid-cols-2 gap-x-3">
                          {selectedCustomer ? (
                            <div className="text-sm text-slate-700 self-center min-w-0 truncate">
                              <span className="text-slate-400">{label}: </span>{selectedCustomer[bkey] || "—"}
                            </div>
                          ) : (
                            <MiniField label={label} required={bkey !== "id_number"}>
                              <input value={buyer[bkey]} onChange={e => setBuyer({ ...buyer, [bkey]: e.target.value })} placeholder={ph} className={miniInp} data-testid={`buyer-${bkey.replace(/_/g, "-")}`} />
                            </MiniField>
                          )}
                          <MiniField label={label} required>
                            <input value={form[wkey]} onChange={e => setForm({ ...form, [wkey]: e.target.value })} placeholder={ph} className={miniInp} data-testid={wkey.replace(/_/g, "-")} />
                          </MiniField>
                        </div>
                      ))}

                      {selectedCustomer && (
                        <button type="button" onClick={() => setForm({ ...form, customer_id: "" })} className="text-xs text-blue-600 hover:underline">
                          Enter a different buyer
                        </button>
                      )}
                    </div>

                    {!selectedCustomer && (
                      <div className="mt-2 flex justify-end">
                        <button type="button" onClick={saveNewCustomer} disabled={addingCust} data-testid="save-new-cust-btn" className="px-3 h-8 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">{addingCust ? "Saving..." : "Create & Select"}</button>
                      </div>
                    )}
                  </>
                )}
              </Field>

              {/* Sale Price + Payment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sale Price (NPR)" required>
                  <input type="text" inputMode="numeric" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})} placeholder="e.g. 185000" className={inp} data-testid="sale-price-input" />
                </Field>
                <Field label="Advance Payment (NPR)">
                  <input type="text" inputMode="numeric" value={form.advance_payment} onChange={e => setForm({...form, advance_payment: e.target.value})} placeholder="0" className={inp} data-testid="advance-payment-input" />
                </Field>
                <Field label="Paid by Cash (NPR)">
                  <input type="text" inputMode="numeric" value={form.paid_cash} onChange={e => setForm({...form, paid_cash: e.target.value})} placeholder="0" className={inp} data-testid="paid-cash-input" />
                </Field>
                <Field label="Paid by Bank Transfer (NPR)">
                  <input type="text" inputMode="numeric" value={form.paid_bank} onChange={e => setForm({...form, paid_bank: e.target.value})} placeholder="0" className={inp} data-testid="paid-bank-input" />
                </Field>
                <Field label="Due Amount (NPR)">
                  <input type="text" inputMode="numeric" value={form.due_amount === "" ? autoDue : form.due_amount} onChange={e => setForm({...form, due_amount: e.target.value})} className={inp} data-testid="due-amount-input" />
                  <p className="text-[11px] text-slate-400 mt-1">Auto: Grand Total − paid. Type to override.</p>
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
                  <div>Advance Payment: <span className="font-medium text-green-700">{formatNPR(Number(form.advance_payment) || 0)}</span></div>
                  {expensesTotal > 0 && <div>Extra Expenses: <span className="font-medium text-orange-700">{formatNPR(expensesTotal)}</span></div>}
                  {(Number(form.paid_cash) || 0) + (Number(form.paid_bank) || 0) > 0 && (
                    <div>Paid (cash + bank): <span className="font-medium text-green-700">{formatNPR((Number(form.paid_cash) || 0) + (Number(form.paid_bank) || 0))}</span></div>
                  )}
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

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 sm:pt-1 sticky bottom-0 sm:static -mx-4 sm:mx-0 px-4 sm:px-0 pb-4 sm:pb-0 bg-white border-t sm:border-t-0 border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-14 sm:h-11 border border-slate-200 text-slate-700 rounded-lg text-base sm:text-sm font-semibold hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} data-testid="save-sale-btn" className="flex-1 h-14 sm:h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base sm:text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">
                  {saving ? "Saving..." : "Record Sale"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Sheet modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeImport}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="import-sales-modal">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Import Sales Sheet</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your "Sales Record" workbook — .xlsx or .csv</p>
              </div>
              <button onClick={closeImport} className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl h-32 cursor-pointer transition-colors">
                {importFile ? (
                  <>
                    <FileSpreadsheet size={24} className="text-blue-600" />
                    <span className="text-sm font-medium text-slate-800">{importFile.name}</span>
                    <span className="text-xs text-slate-400">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={24} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">Choose the spreadsheet</span>
                  </>
                )}
                <input type="file" accept=".xlsx,.csv" className="hidden" data-testid="import-sales-file"
                  onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); }} />
              </label>

              <p className="text-xs text-slate-400">
                Each row is matched to a vehicle already in Inventory by registration number. Rows with no match, or whose vehicle already has a sale, are skipped — so you can re-upload the same file any time.
              </p>

              {importResult && (
                <div className="space-y-3" data-testid="import-sales-result">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Will import", value: importResult.to_import, cls: "bg-green-50 text-green-700 border-green-100" },
                      { label: "Need attention", value: importResult.flagged_for_review || 0, cls: (importResult.flagged_for_review || 0) > 0 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-slate-50 text-slate-600 border-slate-100" },
                      { label: "Not in Inventory", value: importResult.skipped_not_in_inventory, cls: "bg-slate-50 text-slate-600 border-slate-100" },
                      { label: "Already recorded", value: importResult.skipped_already_recorded, cls: "bg-slate-50 text-slate-600 border-slate-100" },
                      { label: "Unreadable", value: importResult.errors, cls: importResult.errors > 0 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-slate-50 text-slate-600 border-slate-100" },
                    ].map(s => (
                      <div key={s.label} className={`border rounded-lg p-2.5 text-center ${s.cls}`}>
                        <div className="text-xl font-bold" style={{ fontFamily: "Manrope" }}>{s.value}</div>
                        <div className="text-[10px] mt-0.5 leading-tight">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {importResult.committed ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <CheckCircle2 size={15} /> {importResult.message}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">{importResult.message}</p>
                  )}

                  {importResult.row_errors?.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Unreadable rows — skipped</p>
                      {importResult.row_errors.map((e, i) => (
                        <div key={i} className="text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1 text-amber-700">
                          <span className="font-semibold">{e.sheet} row {e.row}</span> ({e.sale}): {e.reason}
                        </div>
                      ))}
                    </div>
                  )}

                  {!importResult.committed && importResult.sample_import?.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Preview ({importResult.sample_import.length} of {importResult.to_import})</p>
                      {importResult.sample_import.map((r, i) => (
                        <div key={i} className={`text-xs border rounded px-2 py-1 flex justify-between gap-2 ${r.review_note ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
                          <span className="truncate">{r.sale} · {r.customer}{r.returned ? " · returned" : ""}{r.review_note ? ` · ⚠ ${r.review_note}` : ""}</span>
                          <span className="text-slate-500 shrink-0">{formatNPR(r.price)}{r.due > 0 ? ` (due ${formatNPR(r.due)})` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 sm:p-5 border-t border-slate-100 shrink-0">
              <button onClick={closeImport} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50">Close</button>
              {importResult && !importResult.committed && importResult.to_import > 0 ? (
                <button onClick={() => runImport(true)} disabled={importBusy} data-testid="import-sales-confirm" className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {importBusy ? "Importing..." : `Confirm Import (${importResult.to_import})`}
                </button>
              ) : (
                <button onClick={() => runImport(false)} disabled={!importFile || importBusy} data-testid="import-sales-check" className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {importBusy ? "Checking..." : "Check File"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
