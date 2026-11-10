import { useCallback, useState } from "react";
import { toast } from "sonner";
import api from "../utils/api";
import { splitSanakhatExpenses, withSanakhatExpenses } from "../utils/helpers";
import { EMPTY_REFERRER, EMPTY_SOURCE, isSourceComplete, sourcePayload } from "../utils/crm";

export const PRESET_EXPENSES = [
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

// A new sale starts empty, or pre-filled from the booking it completes: the vehicle, the buyer, the agreed price and the
// deposit (as the advance payment).
const stateForNew = (booking) => ({
  form: booking ? {
    ...EMPTY_FORM,
    vehicle_id: booking.vehicle_id,
    customer_id: booking.customer_id || "",
    sale_price: String(booking.agreed_price ?? booking.vehicle_selling_price ?? ""),
    advance_payment: String(booking.booking_amount ?? ""),
  } : EMPTY_FORM,
  expenseItems: [],
  leadSource: EMPTY_SOURCE,
  referrer: EMPTY_REFERRER,
});

// What the form holds for a sale that is already recorded (the sale as GET /sales/:id returns it), the exchange and the
// witness included: all of it can be edited.
const stateFromSale = (sale) => {
  const { sanakhat, resanakhat, others } = splitSanakhatExpenses(sale.extra_expenses || []);
  const text = (n) => (n ? String(n) : "");
  return {
    form: {
      ...EMPTY_FORM,
      vehicle_id: sale.vehicle_id,
      customer_id: sale.customer_id || "",
      sale_price: String(sale.sale_price ?? ""),
      advance_payment: text(sale.advance_payment),
      paid_cash: text(sale.paid_cash),
      paid_bank: text(sale.paid_bank),
      due_amount: sale.due_amount != null ? String(sale.due_amount) : "",
      due_date: sale.due_date || "",
      sale_date: sale.sale_date || "",
      ownership_transfer_date: sale.ownership_transfer_date || "",
      sold_by_id: sale.sold_by_id || "",
      notes: sale.notes || "",
      sanakhat_cost: text(sanakhat),
      resanakhat_cost: text(resanakhat),
      exchange_valuation: text(sale.exchange_valuation),
      exchange_brand: sale.exchange_brand || "",
      exchange_model: sale.exchange_model || "",
      exchange_reg_no: sale.exchange_reg_no || "",
      exchange_year: sale.exchange_year || "",
      witness_name: sale.witness_name || "",
      witness_address: sale.witness_address || "",
      witness_phone: sale.witness_phone || "",
      witness_id_number: sale.witness_id_number || "",
    },
    expenseItems: others,
    leadSource: { ...EMPTY_SOURCE, source: sale.lead_source === "referral" ? "" : sale.lead_source || "", source_note: sale.lead_note || "" },
    referrer: { referred_by_id: sale.referred_by_id || "", source_note: sale.referred_by_id ? "" : sale.referred_by_name || "" },
  };
};

// Everything the sale form needs, for both ways of using it: recording a new sale (optionally from a booking) and looking
// at / editing a sale that is already recorded (`sale`). The screens around it (SaleVehicleModal, SaleDetailModal) add
// their own header, footer and saving; SaleFormBody draws the fields from what this returns.
export default function useSaleForm({ booking = null, sale = null } = {}) {
  const existing = !!sale;
  const [initial] = useState(() => (sale ? stateFromSale(sale) : stateForNew(booking)));
  const [form, setForm] = useState(initial.form);
  const [expenseItems, setExpenseItems] = useState(initial.expenseItems); // [{name, amount}] - added one by one
  const [leadSource, setLeadSource] = useState(initial.leadSource); // how the buyer found the shop; kept on the sale, and tags a NEW buyer
  const [referrer, setReferrer] = useState(initial.referrer); // who referred the buyer; kept on the sale, and tags a NEW buyer
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [listsLoaded, setListsLoaded] = useState(false);
  // Buyer + Witness panel: for a fresh buyer (spins up a customer record) plus, on a new sale, the sale-deed witness block.
  const [showAddCust, setShowAddCust] = useState(false);
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [addingCust, setAddingCust] = useState(false);
  const [buyerEdits, setBuyerEdits] = useState({}); // recorded sale only: changes to the buyer's own details, by customer id
  const [presetToAdd, setPresetToAdd] = useState("");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  // Back to a sale as it was saved (Cancel).
  const reset = (fromSale) => {
    const s = stateFromSale(fromSale);
    setForm(s.form); setExpenseItems(s.expenseItems); setLeadSource(s.leadSource); setReferrer(s.referrer);
    setShowAddCust(false); setBuyer(EMPTY_BUYER); setBuyerEdits({}); setPresetToAdd(""); setNewExpName(""); setNewExpAmt("");
  };

  // The vehicles to pick from (the available ones for a new sale, only the booked one from a booking, any for a recorded
  // sale) and the customers.
  const loadLists = useCallback(async () => {
    try {
      const [v, c] = await Promise.all([
        booking ? api.get(`/vehicles/${booking.vehicle_id}`).then(r => ({ data: [r.data] })) : api.get(sale ? "/vehicles" : "/vehicles?status=available"),
        api.get("/customers"),
      ]);
      setVehicles(v.data); setCustomers(c.data); setListsLoaded(true);
      // A referrer who has since been deleted stays on the sale by name only.
      if (sale?.referred_by_id && !c.data.some(x => x.id === sale.referred_by_id)) setReferrer({ referred_by_id: "", source_note: sale.referred_by_name || "" });
    } catch { toast.error("Failed to load vehicles/customers"); }
  }, [booking, sale]);

  const selectedCustomer = customers.find(c => c.id === form.customer_id) || null;
  const buyerComplete = buyer.name.trim() && buyer.address.trim() && buyer.contact_number.trim();

  // The buyer's own details (name, phone, address, licence no.) of the customer picked. A new sale shows them as they are.
  // A recorded sale lets them be edited: the changes go to the customer's record on Save (saveBuyerEdits). Until the
  // customer list has loaded, the sale's own copy stands in.
  const buyerKeys = ["name", "contact_number", "address", "id_number"];
  const known = selectedCustomer || (existing && form.customer_id && form.customer_id === sale.customer_id
    ? { name: sale.customer_name, contact_number: sale.customer_contact, address: sale.customer_address, id_number: sale.customer_id_number }
    : null);
  const baseBuyer = known && Object.fromEntries(buyerKeys.map(k => [k, known[k] || ""]));
  const buyerInfo = baseBuyer && { ...baseBuyer, ...(existing ? buyerEdits[form.customer_id] : null) };
  const setBuyerField = (key, value) => setBuyerEdits(e => ({ ...e, [form.customer_id]: { ...e[form.customer_id], [key]: value } }));
  const buyerChanged = existing && !!baseBuyer && buyerKeys.some(k => buyerInfo[k].trim() !== baseBuyer[k].trim());

  // The CRM keeps one source per customer, so a new buyer is tagged as referred when a referrer is named, else with the lead.
  const referrerNamed = !!referrer.referred_by_id || !!referrer.source_note.trim();
  const buyerSource = referrerNamed ? { source: "referral", ...referrer } : leadSource;

  const createCustomer = async () => {
    const r = await api.post("/customers", {
      name: buyer.name.trim(),
      contact_number: buyer.contact_number.trim(),
      address: buyer.address.trim() || null,
      id_number: buyer.id_number.trim() || null,
      ...sourcePayload(buyerSource),
    });
    setCustomers(prev => [r.data, ...prev]);
    return r.data;
  };

  const saveNewCustomer = async () => {
    if (!buyerComplete) { toast.error("Fill in the buyer's name, address, and phone number"); return; }
    if (!isSourceComplete(buyerSource)) { toast.error("Pick a Lead, or say who referred the buyer"); return; }
    setAddingCust(true);
    try {
      const c = await createCustomer();
      set({ customer_id: c.id });
      toast.success(existing ? "Customer added" : "Customer added — now fill the witness details");
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

  // What Save needs, as [field id, name] in page order (the first one gets the focus); shown on the fields after a first
  // try. The panel only counts while it is open: then a typed-but-not-yet-saved buyer is created on the way through (an
  // existing customer picked from the list covers the buyer half itself), and on a new sale the witness is mandatory
  // too (sale deed). Lead and Referred by are optional, except that a new buyer must be tagged with one or the other.
  const enteringNewBuyer = showAddCust && !form.customer_id;
  const missing = [
    !form.vehicle_id && ["sv-vehicle", "vehicle"],
    enteringNewBuyer && !buyer.name.trim() && ["sv-buyer-name", "buyer's name"],
    enteringNewBuyer && !buyer.address.trim() && ["sv-buyer-address", "buyer's address"],
    enteringNewBuyer && !buyer.contact_number.trim() && ["sv-buyer-phone", "buyer's phone"],
    buyerChanged && !buyerInfo.name.trim() && ["sv-buyer-name", "buyer's name"],
    buyerChanged && !buyerInfo.contact_number.trim() && ["sv-buyer-phone", "buyer's phone"],
    !existing && showAddCust && !form.witness_name.trim() && ["sv-witness-name", "witness's name"],
    !existing && showAddCust && !form.witness_address.trim() && ["sv-witness-address", "witness's address"],
    !existing && showAddCust && !form.witness_phone.trim() && ["sv-witness-phone", "witness's phone"],
    !form.sale_price && ["sv-sale_price", "sale price"],
    enteringNewBuyer && !isSourceComplete(buyerSource) && ["sv-lead", "lead, or who referred the buyer"],
  ].filter(Boolean);

  // The buyer's customer id: the one picked, or a new customer created from the panel.
  const ensureCustomer = async () => (enteringNewBuyer ? (await createCustomer()).id : form.customer_id || null);

  // Saves the changes made to the buyer's own details: a recorded sale's customer record is updated (a no-op when nothing
  // changed). Call it after the sale itself is saved.
  const saveBuyerEdits = async () => {
    if (!buyerChanged) return;
    await api.put(`/customers/${form.customer_id}`, {
      name: buyerInfo.name.trim(),
      contact_number: buyerInfo.contact_number.trim(),
      address: buyerInfo.address.trim() || null,
      id_number: buyerInfo.id_number.trim() || null,
    });
  };

  // The body for POST /sales (a new sale) or PUT /sales/:id (a recorded one: it always sends the lead, referrer, witness and
  // exchange, so clearing them sticks, and has no booking).
  const payload = (customerId) => {
    const payMethodParts = [];
    if (Number(form.paid_cash) > 0) payMethodParts.push("Cash");
    if (Number(form.paid_bank) > 0) payMethodParts.push("Bank Transfer");
    if (Number(form.advance_payment) > 0) payMethodParts.push("Advance");
    const base = {
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
      sold_by_id: form.sold_by_id || null,
      notes: form.notes,
    };
    if (existing) {
      return {
        ...base,
        lead_source: leadSource.source || null,
        lead_note: leadSource.source_note.trim() || null,
        referred_by_id: referrer.referred_by_id || null,
        referred_by_name: referrer.source_note.trim() || null,
        witness_name: form.witness_name.trim(),
        witness_address: form.witness_address.trim(),
        witness_phone: form.witness_phone.trim(),
        witness_id_number: form.witness_id_number.trim(),
        exchange_valuation: exchangeValuation,
        exchange_brand: form.exchange_brand.trim() || null,
        exchange_model: form.exchange_model.trim() || null,
        exchange_reg_no: form.exchange_reg_no.trim() || null,
        exchange_year: form.exchange_year.trim() || null,
      };
    }
    return {
      ...base,
      ...(booking ? { booking_id: booking.id } : {}),
      ...(leadSource.source ? { lead_source: leadSource.source, lead_note: leadSource.source_note.trim() || null } : {}),
      ...(referrerNamed ? { referred_by_id: referrer.referred_by_id || null, referred_by_name: referrer.source_note.trim() || null } : {}),
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
  };

  return {
    existing, form, set, reset,
    vehicles, customers, listsLoaded, loadLists, selectedCustomer,
    showAddCust, setShowAddCust, buyer, setBuyer, addingCust, saveNewCustomer, enteringNewBuyer,
    buyerInfo, setBuyerField, buyerChanged, saveBuyerEdits,
    leadSource, setLeadSource, referrer, setReferrer,
    expenseItems, extraExpenses, expensesTotal, availablePresets, presetToAdd, setPresetToAdd,
    newExpName, setNewExpName, newExpAmt, setNewExpAmt,
    addPresetExpense, addCustomExpense, updateExpenseAmount, removeExpenseItem,
    grandTotal, exchangeValuation, amountPaid, autoDue, amountDue,
    missing, ensureCustomer, payload,
  };
}
