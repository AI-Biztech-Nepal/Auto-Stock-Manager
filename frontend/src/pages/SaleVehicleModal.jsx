/**
 * SaleVehicleModal.jsx — the Sale Vehicle form (opened from the Sales page, or from a booking).
 *
 * Built like Purchase Vehicle: one scrolling page of sections (Sale, Buyer, Payment, Exchange, Extra expenses, Notes),
 * chips for phones to jump between them, and a footer that keeps the grand total, what has been paid and what is still
 * due in view. It owns its own state and posts the sale itself; onSaved lets the Sales page reload.
 */
import { useEffect, useState } from "react";
import { UserPlus, X, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, withSanakhatExpenses } from "../utils/helpers";
import VehicleComboBox from "../components/VehicleComboBox";
import BSDatePicker from "../components/BSDatePicker";
import SourceField, { ReferredByField } from "../components/SourceField";
import SoldBySelect from "../components/SoldBySelect";
import { LBL, BOX, OK, BAD, SECTION, H2, DATE_BOX, GRID, Money, digits } from "../components/formKit";
import { EMPTY_REFERRER, EMPTY_SOURCE, isSourceComplete, sourcePayload } from "../utils/crm";

const PRESET_EXPENSES = [
  { name: "Registration Transfer Fee", amount: 2000 },
  { name: "Insurance Transfer Fee", amount: 1500 },
  { name: "Road Tax Clearance", amount: 1000 },
  { name: "Bluebook Copy Fee", amount: 500 },
  { name: "Notary / Document Fee", amount: 800 },
  { name: "Delivery / Transport", amount: 1200 },
];

const EMPTY_FORM = {
  vehicle_id: "", customer_id: "", sale_price: "",
  payment_method: "Cash", paid_cash: "", paid_bank: "", advance_payment: "",
  due_amount: "", due_date: "", sale_date: "", ownership_transfer_date: "", notes: "",
  sold_by_id: "",
  sanakhat_cost: "", resanakhat_cost: "",
  exchange_valuation: "", exchange_brand: "", exchange_model: "", exchange_reg_no: "", exchange_year: "",
  witness_name: "", witness_address: "", witness_phone: "", witness_id_number: "",
};

const EMPTY_BUYER = { name: "", contact_number: "", address: "", id_number: "" };

// One row of the Buyer | Witness split. Rendering each row as its own 2-col grid keeps the two halves the exact same
// height, so the panels line up no matter what. bid / wid: the ids of the two boxes.
const DEED_ROWS = [
  { label: "Name", ph: "Full name", bkey: "name", wkey: "witness_name", bid: "sv-buyer-name", wid: "sv-witness-name" },
  { label: "Address", ph: "Address", bkey: "address", wkey: "witness_address", bid: "sv-buyer-address", wid: "sv-witness-address" },
  { label: "Phone No.", ph: "Phone number", bkey: "contact_number", wkey: "witness_phone", bid: "sv-buyer-phone", wid: "sv-witness-phone" },
  { label: "Licence / Citizenship No.", ph: "Licence / citizenship no.", bkey: "id_number", wkey: "witness_id_number", bid: "sv-buyer-id", wid: "sv-witness-id" },
];

// The vehicle search box, sized like the other boxes (room on the left for its search icon and on the right for the arrow).
const COMBO = "w-full h-11 pl-9 pr-8 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer";
const PLATE = "w-full h-12 px-3.5 border rounded-[10px] bg-white text-slate-900 font-mono text-lg font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500";

function getErrMsg(err, fallback) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return fallback || `Server error (${err.response.status})`;
}

// A booking being converted pre-fills the vehicle, the buyer, the agreed price and the deposit (as the advance payment).
const initialForm = (booking) => booking ? {
  ...EMPTY_FORM,
  vehicle_id: booking.vehicle_id,
  customer_id: booking.customer_id || "",
  sale_price: String(booking.agreed_price ?? booking.vehicle_selling_price ?? ""),
  advance_payment: String(booking.booking_amount ?? ""),
} : EMPTY_FORM;

const focusField = (id) => document.getElementById(id)?.focus();

// booking: the open booking this sale completes, if any. onClose: leave the form. onSaved: the sale was recorded.
export default function SaleVehicleModal({ booking = null, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialForm(booking));
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [active, setActive] = useState("sale");
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  // Buyer + Witness panel — hidden until the person button beside the customer box is pressed. Used for a fresh buyer
  // (spins up a customer record) plus the sale-deed witness block, which is required whenever the panel is open.
  const [showAddCust, setShowAddCust] = useState(false);
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [leadSource, setLeadSource] = useState(EMPTY_SOURCE); // how the buyer found the shop; kept on the sale, and tags a NEW buyer
  const [referrer, setReferrer] = useState(EMPTY_REFERRER); // who referred the buyer; kept on the sale, and tags a NEW buyer
  const [addingCust, setAddingCust] = useState(false);

  // Extra expenses
  const [expenseItems, setExpenseItems] = useState([]); // [{name, amount}] - added one by one
  const [presetToAdd, setPresetToAdd] = useState("");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [v, c] = await Promise.all([booking ? api.get(`/vehicles/${booking.vehicle_id}`).then(r => ({ data: [r.data] })) : api.get("/vehicles?status=available"), api.get("/customers")]);
        if (alive) { setVehicles(v.data); setCustomers(c.data); }
      } catch { if (alive) toast.error("Failed to load vehicles/customers"); }
    })();
    return () => { alive = false; };
  }, [booking]);

  const selectedCustomer = customers.find(c => c.id === form.customer_id) || null;
  const buyerComplete = buyer.name.trim() && buyer.address.trim() && buyer.contact_number.trim();

  // The CRM keeps one source per customer, so a new buyer is tagged as referred when a referrer is named, else with the lead.
  const referrerNamed = !!referrer.referred_by_id || !!referrer.source_note.trim();
  const buyerSource = referrerNamed ? { source: "referral", ...referrer } : leadSource;

  const saveNewCustomer = async () => {
    if (!buyerComplete) { toast.error("Fill in the buyer's name, address, and phone number"); return; }
    if (!isSourceComplete(buyerSource)) { toast.error("Pick a Lead, or say who referred the buyer"); return; }
    setAddingCust(true);
    try {
      const r = await api.post("/customers", {
        name: buyer.name.trim(),
        contact_number: buyer.contact_number.trim(),
        address: buyer.address.trim() || null,
        id_number: buyer.id_number.trim() || null,
        ...sourcePayload(buyerSource),
      });
      setCustomers(prev => [r.data, ...prev]);
      set({ customer_id: r.data.id });
      toast.success("Customer added — now fill the witness details");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to add customer"); }
    finally { setAddingCust(false); }
  };

  // Extra expenses total — sanakhat / re-sanakhat are extra expenses too, entered in their own fields and saved as named
  // lines alongside the others.
  const extraExpenses = withSanakhatExpenses(expenseItems, form.sanakhat_cost, form.resanakhat_cost);
  const expensesTotal = extraExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const grandTotal = (Number(form.sale_price) || 0) + expensesTotal;
  const exchangeValuation = Number(form.exchange_valuation) || 0; // old vehicle taken in part payment
  const amountPaid = (Number(form.paid_cash) || 0) + (Number(form.paid_bank) || 0) + (Number(form.advance_payment) || 0) + exchangeValuation;
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

  // What Save needs, as [field id, name] in page order; shown on the fields after a first try. The Buyer + Witness panel
  // only counts while it is open: then both blocks are mandatory (sale deed), and a typed-but-not-yet-saved buyer is
  // created on the way through. An existing customer picked from the list covers the buyer half itself. Lead and
  // Referred by are optional, except that a new buyer must be tagged with one or the other.
  const enteringNewBuyer = showAddCust && !form.customer_id;
  const missing = [
    !form.vehicle_id && ["sv-vehicle", "vehicle"],
    !form.sale_price && ["sv-sale_price", "sale price"],
    enteringNewBuyer && !isSourceComplete(buyerSource) && ["sv-lead", "lead, or who referred the buyer"],
    enteringNewBuyer && !buyer.name.trim() && ["sv-buyer-name", "buyer's name"],
    enteringNewBuyer && !buyer.address.trim() && ["sv-buyer-address", "buyer's address"],
    enteringNewBuyer && !buyer.contact_number.trim() && ["sv-buyer-phone", "buyer's phone"],
    showAddCust && !form.witness_name.trim() && ["sv-witness-name", "witness's name"],
    showAddCust && !form.witness_address.trim() && ["sv-witness-address", "witness's address"],
    showAddCust && !form.witness_phone.trim() && ["sv-witness-phone", "witness's phone"],
  ].filter(Boolean);
  const bad = (id) => attempted && missing.some(m => m[0] === id);

  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) {
      setAttempted(true);
      focusField(missing[0][0]);
      return;
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
          ...sourcePayload(buyerSource),
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
        ...(booking ? { booking_id: booking.id } : {}),
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
        sold_by_id: form.sold_by_id || null,
        ...(leadSource.source ? { lead_source: leadSource.source, lead_note: leadSource.source_note.trim() || null } : {}),
        ...(referrerNamed ? { referred_by_id: referrer.referred_by_id || null, referred_by_name: referrer.source_note.trim() || null } : {}),
        notes: form.notes,
        exchange_valuation: exchangeValuation,
        exchange_brand: form.exchange_brand.trim() || undefined,
        exchange_model: form.exchange_model.trim() || undefined,
        exchange_reg_no: form.exchange_reg_no.trim() || undefined,
        exchange_year: form.exchange_year.trim() || undefined,
        ...(showAddCust ? {
          witness_name: form.witness_name.trim(),
          witness_address: form.witness_address.trim(),
          witness_phone: form.witness_phone.trim(),
          witness_id_number: form.witness_id_number.trim(),
        } : {}),
      };

      await api.post("/sales", payload);
      toast.success(booking ? "Booking converted to a sale!" : "Sale recorded successfully!");
      onSaved();
      onClose();
    } catch (err) { toast.error(getErrMsg(err, "Failed to save sale")); }
    finally { setSaving(false); }
  };

  const sections = [
    { id: "sale", label: "Sale", done: !!(form.vehicle_id && form.sale_price) },
    { id: "buyer", label: "Buyer", done: !!form.customer_id },
    { id: "payment", label: "Payment", done: amountPaid > 0 },
    { id: "exchange", label: "Exchange", done: exchangeValuation > 0 },
    { id: "extras", label: "Extra expenses", done: extraExpenses.length > 0 },
    { id: "notes", label: "Notes", done: !!form.notes },
  ];
  const go = (id) => document.getElementById(`sv-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const onScroll = (e) => {
    const top = e.currentTarget.getBoundingClientRect().top;
    let cur = sections[0].id;
    for (const s of sections) {
      const el = document.getElementById(`sv-section-${s.id}`);
      if (el && el.getBoundingClientRect().top - top <= 80) cur = s.id;
    }
    if (cur !== active) setActive(cur);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl lg:max-w-6xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 pl-4 sm:pl-7 pr-2 sm:pr-4 py-3 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{booking ? "Sale Vehicle from Booking" : "Sale Vehicle"}</h2>
            <p className="hidden sm:block text-[13px] text-slate-500">Sell a vehicle from your stock <span className="text-slate-400">· <span className="text-red-600">*</span> needed to save</span></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-[10px] text-slate-600 hover:bg-slate-100 shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col flex-1 min-h-0">

          {/* Section chips (phones and tablets) */}
          <nav aria-label="Form sections" className="lg:hidden flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-slate-200 bg-slate-50 shrink-0">
            {sections.map(s => (
              <button
                key={s.id} type="button" onClick={() => go(s.id)}
                className={`shrink-0 flex items-center gap-1.5 h-11 px-4 rounded-full text-[13px] font-semibold ${active === s.id ? "bg-blue-600 text-white" : s.done ? "bg-emerald-100 text-emerald-800" : "bg-white border border-slate-300 text-slate-700"}`}
              >
                {s.done && active !== s.id && <Check size={13} strokeWidth={3} />}{s.label}
              </button>
            ))}
          </nav>

          <div onScroll={onScroll} className="flex-1 min-h-0 min-w-0 overflow-y-auto">

            {booking && (
              <div className="mx-4 sm:mx-7 mt-5 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-[13px] leading-relaxed text-yellow-900" data-testid="booking-banner">
                Booking deposit of <strong>{formatNPR(booking.booking_amount)}</strong> is filled in as the advance payment. Enter what the customer pays now as cash / bank below.
              </div>
            )}

            {attempted && missing.length > 0 && (
              <div role="alert" className="mx-4 sm:mx-7 mt-5 flex gap-2.5 items-start rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-800" data-testid="sale-missing">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div><strong>{missing.length} {missing.length === 1 ? "thing needs" : "things need"} filling in</strong> before this can be saved: {missing.map(m => m[1]).join(", ")}.</div>
              </div>
            )}

            {/* 1 Sale */}
            <section id="sv-section-sale" className={SECTION}>
              <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Sale</h3>
              <div className={GRID}>
                <div className="sm:col-span-2">
                  <label htmlFor="sv-vehicle" className={LBL}>Vehicle <span className="text-red-600">*</span></label>
                  {booking ? (
                    <div className="h-11 px-3 flex items-center text-sm bg-slate-50 border border-slate-300 rounded-[10px] text-slate-700">{booking.vehicle_info}</div>
                  ) : (
                    <VehicleComboBox
                      vehicles={vehicles}
                      value={form.vehicle_id}
                      onChange={id => set({ vehicle_id: id })}
                      placeholder="Search or select available vehicle..."
                      testId="sale-vehicle"
                      showPrice
                      inputId="sv-vehicle"
                      inputClassName={`${COMBO} ${bad("sv-vehicle") ? BAD : OK}`}
                    />
                  )}
                  {bad("sv-vehicle") && <p className="mt-1.5 text-xs font-semibold text-red-700">Pick the vehicle being sold</p>}
                </div>
                <div>
                  <label htmlFor="sv-sale_price" className={LBL}>Sale price <span className="text-red-600">*</span></label>
                  <Money id="sv-sale_price" testid="sale-price-input" value={form.sale_price} onChange={v => set({ sale_price: v })} error={bad("sv-sale_price")} />
                  {bad("sv-sale_price") && <p className="mt-1 text-xs font-semibold text-red-700">Enter the price it is sold for</p>}
                </div>
                <div>
                  <span className={LBL}>Sale date (BS)</span>
                  <BSDatePicker value={form.sale_date} onChange={val => set({ sale_date: val })} data-testid="sale-date-input" triggerClassName={`${DATE_BOX} ${OK}`} placeholder="Today" />
                </div>
                <div>
                  <span className={LBL}>Vehicle pass date (BS)</span>
                  <BSDatePicker value={form.ownership_transfer_date} onChange={val => set({ ownership_transfer_date: val })} data-testid="vehicle-pass-date-input" triggerClassName={`${DATE_BOX} ${OK}`} />
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <span className={LBL}>Sold by</span>
                  <SoldBySelect value={form.sold_by_id} onChange={v => set({ sold_by_id: v })} className={`${BOX} ${OK}`} testid="sale-sold-by-select" />
                </div>
              </div>
            </section>

            {/* 2 Buyer */}
            <section id="sv-section-buyer" className={SECTION}>
              <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Buyer</h3>
              <div className={GRID}>
                <div className="sm:col-span-2">
                  <label htmlFor="sv-customer" className={LBL}>Customer</label>
                  <div className="flex gap-2">
                    <select id="sv-customer" value={form.customer_id} onChange={e => set({ customer_id: e.target.value })} className={`${BOX} ${OK}`} data-testid="sale-customer-select">
                      <option value="">Walk-in / No customer record</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} — {c.contact_number}</option>
                      ))}
                    </select>
                    <button
                      type="button" onClick={() => setShowAddCust(s => !s)} aria-pressed={showAddCust} aria-label="Add buyer and witness details" title="Add buyer + witness details" data-testid="add-customer-inline-btn"
                      className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-[10px] border transition-colors ${showAddCust ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}
                    >
                      <UserPlus size={16} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Pick a customer, or press the person button to enter a new buyer and the sale-deed witness</p>
                </div>
                <div className="hidden lg:block lg:col-span-2" />

                <div id="sv-lead" tabIndex={-1} className="sm:col-span-2 outline-none" data-testid="sale-lead">
                  <SourceField value={leadSource} onChange={setLeadSource} customers={customers} label="Lead" hideReferral size="lg" />
                  {bad("sv-lead") && <p className="mt-1.5 text-xs font-semibold text-red-700">Pick a lead, or say who referred the buyer</p>}
                </div>
                <div className="sm:col-span-2">
                  <ReferredByField value={referrer} onChange={setReferrer} customers={customers} size="lg" />
                </div>

                {showAddCust && (
                  <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-4" data-testid="add-customer-form">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                      <div className="min-w-0 space-y-3">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide" data-testid="buyer-details-panel">Buyer's details</p>
                        {DEED_ROWS.map(({ label, ph, bkey, bid }) => selectedCustomer ? (
                          <div key={bkey} className="min-w-0">
                            <span className={LBL}>{label}</span>
                            <div className="h-11 px-3 flex items-center text-sm text-slate-700 bg-white border border-slate-300 rounded-[10px] truncate">{selectedCustomer[bkey] || "—"}</div>
                          </div>
                        ) : (
                          <div key={bkey} className="min-w-0">
                            <label htmlFor={bid} className={LBL}>{label}{bkey !== "id_number" && <span className="text-red-600"> *</span>}</label>
                            <input id={bid} aria-label={`Buyer ${label}`} value={buyer[bkey]} onChange={e => setBuyer({ ...buyer, [bkey]: e.target.value })} placeholder={ph} className={`${BOX} ${bad(bid) ? BAD : OK}`} data-testid={`buyer-${bkey.replace(/_/g, "-")}`} />
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0 space-y-3">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide" data-testid="witness-details-panel">Witness details <span className="normal-case font-medium text-blue-600/80">· for the sale deed</span></p>
                        {DEED_ROWS.map(({ label, ph, wkey, wid }) => (
                          <div key={wkey} className="min-w-0">
                            <label htmlFor={wid} className={LBL}>{label}{wkey !== "witness_id_number" && <span className="text-red-600"> *</span>}</label>
                            <input id={wid} aria-label={`Witness ${label}`} value={form[wkey]} onChange={e => set({ [wkey]: e.target.value })} placeholder={ph} className={`${BOX} ${bad(wid) ? BAD : OK}`} data-testid={wkey.replace(/_/g, "-")} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedCustomer ? (
                      <button type="button" onClick={() => set({ customer_id: "" })} className="text-xs font-semibold text-blue-600 hover:underline">
                        Enter a different buyer
                      </button>
                    ) : (
                      <div className="flex justify-end">
                        <button type="button" onClick={saveNewCustomer} disabled={addingCust} data-testid="save-new-cust-btn" className="px-4 h-10 text-[13px] bg-blue-600 text-white rounded-[10px] hover:bg-blue-700 disabled:opacity-60 font-semibold">{addingCust ? "Saving..." : "Create & Select"}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* 3 Payment */}
            <section id="sv-section-payment" className={SECTION}>
              <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Payment</h3>
              <div className={GRID}>
                <div>
                  <label htmlFor="sv-advance" className={LBL}>Advance payment</label>
                  <Money id="sv-advance" testid="advance-payment-input" value={form.advance_payment} onChange={v => set({ advance_payment: v })} />
                </div>
                <div>
                  <label htmlFor="sv-cash" className={LBL}>Paid by cash</label>
                  <Money id="sv-cash" testid="paid-cash-input" value={form.paid_cash} onChange={v => set({ paid_cash: v })} />
                </div>
                <div>
                  <label htmlFor="sv-bank" className={LBL}>Paid by bank transfer</label>
                  <Money id="sv-bank" testid="paid-bank-input" value={form.paid_bank} onChange={v => set({ paid_bank: v })} />
                </div>
                <div>
                  <label htmlFor="sv-due" className={LBL}>Due amount</label>
                  <Money id="sv-due" testid="due-amount-input" value={form.due_amount === "" ? autoDue : form.due_amount} onChange={v => set({ due_amount: v })} />
                  <p className="mt-1 text-xs text-slate-500">Auto: grand total − paid. Type to override.</p>
                </div>
              </div>
            </section>

            {/* 4 Exchange: the customer's old vehicle; its valuation is deducted from what they owe */}
            <section id="sv-section-exchange" className={SECTION} data-testid="exchange-section">
              <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Exchange <span className="ml-1 text-xs font-medium text-slate-500" style={{ fontFamily: "Inter, sans-serif" }}>optional · the old vehicle is added to Inventory when you save, at its valuation, unlisted until you set a selling price</span></h3>
              <div className={GRID}>
                <div>
                  <label htmlFor="sv-ex-valuation" className={LBL}>Valuation</label>
                  <Money id="sv-ex-valuation" testid="exchange-valuation-input" value={form.exchange_valuation} onChange={v => set({ exchange_valuation: v })} />
                </div>
                <div>
                  <label htmlFor="sv-ex-brand" className={LBL}>Brand</label>
                  <input id="sv-ex-brand" value={form.exchange_brand} onChange={e => set({ exchange_brand: e.target.value })} className={`${BOX} ${OK}`} data-testid="exchange-brand-input" />
                </div>
                <div>
                  <label htmlFor="sv-ex-model" className={LBL}>Model</label>
                  <input id="sv-ex-model" value={form.exchange_model} onChange={e => set({ exchange_model: e.target.value })} className={`${BOX} ${OK}`} data-testid="exchange-model-input" />
                </div>
                <div>
                  <label htmlFor="sv-ex-year" className={LBL}>Year</label>
                  <input id="sv-ex-year" value={form.exchange_year} onChange={e => set({ exchange_year: e.target.value })} inputMode="numeric" className={`${BOX} ${OK}`} data-testid="exchange-year-input" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="sv-ex-reg" className={LBL}>Registration number</label>
                  <input id="sv-ex-reg" value={form.exchange_reg_no} onChange={e => set({ exchange_reg_no: e.target.value })} placeholder="e.g. 052/0164" className={`${PLATE} border-slate-400`} data-testid="exchange-reg-input" />
                </div>
              </div>
            </section>

            {/* 5 Extra expenses */}
            <section id="sv-section-extras" className={SECTION}>
              <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>
                Extra expenses
                {extraExpenses.length > 0 && <span className="ml-2 align-middle text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold" style={{ fontFamily: "Inter, sans-serif" }}>{extraExpenses.length} added · {formatNPR(expensesTotal)}</span>}
              </h3>
              <div className={GRID}>
                {/* Sanakhat / re-sanakhat — always-there fields rather than presets, since nearly every sale has them
                    and the amount varies */}
                <div>
                  <label htmlFor="sv-sanakhat" className={LBL}>Sanakhat cost</label>
                  <Money id="sv-sanakhat" testid="sale-sanakhat-cost-input" value={form.sanakhat_cost} onChange={v => set({ sanakhat_cost: v })} />
                </div>
                <div>
                  <label htmlFor="sv-resanakhat" className={LBL}>Re-Sanakhat cost</label>
                  <Money id="sv-resanakhat" testid="sale-resanakhat-cost-input" value={form.resanakhat_cost} onChange={v => set({ resanakhat_cost: v })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="sv-preset" className={LBL}>Add a preset fee</label>
                  <select id="sv-preset" value={presetToAdd} onChange={e => addPresetExpense(e.target.value)} className={`${BOX} ${OK}`} disabled={availablePresets.length === 0} data-testid="preset-expense-select">
                    <option value="">{availablePresets.length === 0 ? "All preset fees added" : "Select a fee to add..."}</option>
                    {availablePresets.map(e => (
                      <option key={e.name} value={e.name}>{e.name} — {formatNPR(e.amount)}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="sv-custom-name" className={LBL}>Custom expense</label>
                  <input
                    id="sv-custom-name" value={newExpName} onChange={e => setNewExpName(e.target.value)} placeholder="Expense name"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomExpense(); } }}
                    className={`${BOX} ${OK}`} data-testid="custom-exp-name"
                  />
                </div>
                <div>
                  <label htmlFor="sv-custom-amount" className={LBL}>Amount</label>
                  <Money id="sv-custom-amount" testid="custom-exp-amount" value={newExpAmt} onChange={setNewExpAmt} />
                </div>
                <div>
                  <span className={`${LBL} hidden lg:block`} aria-hidden="true">&nbsp;</span>
                  <button type="button" onClick={addCustomExpense} className="w-full h-11 border border-dashed border-slate-400 rounded-[10px] bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50" data-testid="add-custom-exp-btn">Add expense</button>
                </div>

                {expenseItems.length > 0 && (
                  <div className="sm:col-span-2 lg:col-span-4 rounded-[10px] border border-slate-200 divide-y divide-slate-100" data-testid="added-expenses">
                    {expenseItems.map((ex, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm text-slate-700 min-w-0 truncate">{ex.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-semibold text-slate-500">Rs.</span>
                          <input
                            type="text" inputMode="numeric" value={ex.amount} aria-label={`${ex.name} amount`}
                            onChange={ev => updateExpenseAmount(i, ev.target.value)}
                            className="w-28 h-9 px-2 text-sm text-right border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button type="button" onClick={() => removeExpenseItem(i)} aria-label={`Remove ${ex.name}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 6 Notes */}
            <section id="sv-section-notes" className={SECTION}>
              <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Notes</h3>
              <label htmlFor="sv-notes" className="sr-only">Notes</label>
              <textarea
                id="sv-notes" value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="Anything worth remembering about this sale" rows={3}
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-300 rounded-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </section>
          </div>

          {/* Footer: what this sale adds up to, and the actions */}
          <div className="shrink-0 flex flex-wrap items-center gap-x-7 gap-y-3 px-4 sm:px-7 py-3 border-t border-slate-200 bg-slate-50" data-testid="grand-total-section">
            <div className="hidden sm:block">
              <div className="text-[11px] font-semibold text-slate-500">Sale price</div>
              <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{digits(form.sale_price) ? formatNPR(digits(form.sale_price)) : "Not set"}</div>
            </div>
            {expensesTotal > 0 && (
              <div className="hidden sm:block">
                <div className="text-[11px] font-semibold text-slate-500">Extra expenses</div>
                <div className="text-lg font-extrabold text-orange-700" style={{ fontFamily: "Manrope, sans-serif" }}>{formatNPR(expensesTotal)}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold text-slate-500">Grand total</div>
              <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="grand-total-value">{formatNPR(grandTotal)}</div>
            </div>
            <div title="Cash + bank + advance + exchange valuation">
              <div className="text-[11px] font-semibold text-slate-500">Paid</div>
              <div className={`text-lg font-extrabold ${amountPaid > 0 ? "text-emerald-700" : "text-slate-400"}`} style={{ fontFamily: "Manrope, sans-serif" }} data-testid="paid-total-value">{formatNPR(amountPaid)}</div>
            </div>
            {amountDue > 0 ? (
              <span className="text-xs font-semibold text-red-700 bg-red-100 rounded-full px-3 py-1.5" data-testid="due-amount-bubble">Due: {formatNPR(amountDue)}</span>
            ) : grandTotal > 0 && (
              <span className="hidden md:inline-block text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-full px-3 py-1.5" data-testid="paid-in-full-bubble">Paid in full</span>
            )}
            <div className="flex-1" />
            <div className="flex gap-3 w-full sm:w-auto">
              <button type="button" onClick={onClose} className="flex-1 sm:flex-none h-12 px-6 border border-slate-300 rounded-[10px] bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                type="submit" disabled={saving} data-testid="save-sale-btn"
                className="flex-1 sm:flex-none h-12 px-7 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Sale Vehicle"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
