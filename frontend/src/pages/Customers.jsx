import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Phone, MapPin, Star, Trash2, Edit, ChevronDown, Undo2, Users, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { getTodayAD } from "../utils/nepali-date";
import HoverADDate from "../components/HoverADDate";
import { LedgerToolbar, groupByLetter, LetterSection, DueTag, InfoPill, LedgerSkeleton, LedgerEmpty } from "../components/LedgerParts";

// What a customer bought, inline under their entry.
function CustomerPurchases({ customer, onOpenSale }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api.get(`/customers/${customer.id}`)
      .then(r => setDetail(r.data))
      .catch(() => toast.error("Couldn't load this customer's purchases"));
  }, [customer.id]);

  if (!detail) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1].map(i => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
      </div>
    );
  }

  const sales = detail.sales || [];
  const today = getTodayAD();
  const live = sales.filter(s => !s.returned);
  const billed = live.reduce((n, s) => n + (s.total_amount || 0), 0);
  const due = live.reduce((n, s) => n + (s.due_amount || 0), 0);
  const paid = billed - due;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transactions</p>
      {sales.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing bought yet. Pick {customer.name} as the buyer when you record a sale and it's listed here.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3" data-testid="customer-ledger-summary">
            {[["Billed", billed, "text-slate-900"], ["Paid", paid, "text-green-700"], ["Outstanding", due, due > 0 ? "text-red-700" : "text-slate-400"]].map(([label, amt, cls]) => (
              <div key={label} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="text-[11px] text-slate-400">{label}</div>
                <div className={`text-sm font-semibold tabular-nums ${cls}`}>{formatNPR(amt)}</div>
              </div>
            ))}
          </div>
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
            {sales.map(s => {
              const overdue = !s.returned && s.due_amount > 0 && s.due_date && s.due_date < today;
              const lines = [
                ["Sale price", s.sale_price],
                ["Extra expenses", s.expenses_total],
                ["Cash paid", s.paid_cash],
                ["Bank paid", s.paid_bank],
                ["Advance", s.advance_payment],
              ].filter(([, amt]) => amt > 0);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenSale(s)}
                    data-testid="customer-purchase-row"
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900">
                          {s.vehicle_info}
                          {s.returned && <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 align-middle"><Undo2 size={9} /> Returned</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Bought <HoverADDate date={s.sale_date} />
                          {s.returned
                            ? <> · Refunded {formatNPR(s.refund_amount || 0)}</>
                            : <> · {s.payment_method}</>}
                        </div>
                      </div>
                      <div className="text-sm text-slate-700 tabular-nums shrink-0">{formatNPR(s.total_amount)}</div>
                    </div>
                    {!s.returned && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {lines.map(([label, amt]) => <span key={label}>{label} <span className="tabular-nums text-slate-700">{formatNPR(amt)}</span></span>)}
                        {s.due_amount > 0
                          ? <><DueTag amount={s.due_amount} overdue={overdue} />{s.due_date && <span>due <HoverADDate date={s.due_date} /></span>}</>
                          : <span className="text-green-700 font-medium">Paid in full</span>}
                      </div>
                    )}
                    {s.notes && <div className="mt-1 text-xs text-slate-400 italic">{s.notes}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", contact_number: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try { const r = await api.get("/customers"); setCustomers(r.data); }
    catch { toast.error("Failed to load customers"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const openAdd = () => { setEditItem(null); setForm({ name: "", contact_number: "", address: "", notes: "" }); setShowModal(true); };
  const openEdit = (c) => { setEditItem(c); setForm({ name: c.name, contact_number: c.contact_number, address: c.address || "", notes: c.notes || "" }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.contact_number) { toast.error("Name and contact number are required"); return; }
    setSaving(true);
    try {
      if (editItem) { await api.put(`/customers/${editItem.id}`, form); toast.success("Customer updated"); }
      else { await api.post("/customers", form); toast.success("Customer added"); }
      setShowModal(false); fetchCustomers();
    } catch { toast.error("Couldn't save the customer — try again"); } finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete ${c.name}? Their sales stay recorded, just without a customer attached.`)) return;
    try { await api.delete(`/customers/${c.id}`); toast.success("Customer deleted"); setOpenId(null); fetchCustomers(); }
    catch { toast.error("Couldn't delete the customer"); }
  };

  // Active sales open on their sold-vehicle record; a returned one only exists as a sale.
  const openSale = (s) => navigate(!s.returned && s.vehicle_id ? `/sales/vehicle/${s.vehicle_id}` : `/sales/${s.id}`);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = customers.filter(c => !q || c.name?.toLowerCase().includes(q) || c.contact_number?.includes(q) || c.address?.toLowerCase().includes(q));
    return groupByLetter(found, c => c.name || "");
  }, [customers, search]);
  const shownCount = sections.reduce((n, s) => n + s.items.length, 0);

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      <LedgerToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search customers by name, phone or address…"
        testid="customer-search"
        count={`${shownCount} of ${customers.length}`}
        action={
          <button onClick={openAdd} data-testid="add-customer-button" className="flex items-center gap-2 h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 rounded-lg transition-all active:scale-95 shadow-sm shrink-0">
            <Plus size={16} /> <span className="hidden sm:inline">Add Customer</span><span className="sm:hidden">Add</span>
          </button>
        }
      />

      {loading ? (
        <LedgerSkeleton />
      ) : customers.length === 0 ? (
        <LedgerEmpty
          icon={Users}
          title="No customers yet"
          body="Customers are added when you record a sale with a buyer, or here directly."
          action={<button onClick={openAdd} className="text-sm font-semibold text-blue-600 hover:text-blue-700">Add a customer</button>}
        />
      ) : shownCount === 0 ? (
        <LedgerEmpty title="No customers match" body={`Nothing matches “${search}”. Try a name, phone number or area.`} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {sections.map(({ letter, items }) => (
            <LetterSection key={letter} letter={letter}>
              {items.map(c => {
                const isOpen = openId === c.id;
                return (
                  <div key={c.id} className={isOpen ? "bg-slate-50/70" : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      data-testid="customer-row"
                      className="w-full text-left flex items-center gap-4 px-4 py-4 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">{c.name[0]?.toUpperCase()}</div>
                      <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-900 text-sm truncate">{c.name}</span>
                            {c.is_repeat_customer && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full shrink-0"><Star size={9} /> Repeat</span>
                            )}
                          </div>
                          {c.address && <div className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1"><MapPin size={11} className="shrink-0" />{c.address}</div>}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 tabular-nums mt-1 sm:mt-0"><Phone size={13} className="text-slate-400 shrink-0" />{c.contact_number}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:mt-0 sm:justify-end" data-testid="customer-pills">
                          <InfoPill tone="blue">{c.purchase_count} purchase{c.purchase_count !== 1 ? "s" : ""}</InfoPill>
                          {c.total_due > 0
                            ? <DueTag amount={c.total_due} overdue={c.has_overdue} />
                            : c.purchase_count > 0 && <InfoPill tone="green">Settled</InfoPill>}
                        </div>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 sm:pl-[4.25rem] space-y-4" data-testid="customer-details">
                        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-slate-400">Phone</dt>
                            <dd><a href={`tel:${c.contact_number}`} className="inline-flex items-center gap-1.5 text-slate-800 hover:text-blue-600"><Phone size={13} className="text-slate-400" />{c.contact_number}</a></dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Address</dt>
                            <dd className="inline-flex items-center gap-1.5 text-slate-800"><MapPin size={13} className="text-slate-400" />{c.address || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Customer since</dt>
                            <dd className="inline-flex items-center gap-1.5 text-slate-800"><CalendarDays size={13} className="text-slate-400" /><HoverADDate date={c.created_at?.slice(0, 10)} /></dd>
                          </div>
                        </dl>
                        {c.notes && <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">{c.notes}</p>}

                        <CustomerPurchases customer={c} onOpenSale={openSale} />

                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openEdit(c)} className="flex items-center gap-1.5 h-9 px-3 border border-slate-200 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors" data-testid="edit-customer-btn">
                            <Edit size={13} /> Edit details
                          </button>
                          <button onClick={() => handleDelete(c)} className="flex items-center gap-1.5 h-9 px-3 border border-red-200 bg-white text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors" data-testid="delete-customer-btn">
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </LetterSection>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editItem ? "Edit Customer" : "Add Customer"}</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {[["Full Name","name","text","e.g. Ram Sharma",true],["Contact Number","contact_number","tel","e.g. 9841234567",true],["Address","address","text","City/Area",false]].map(([label, key, type, ph, req]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}{req && <span className="text-red-500 ml-0.5">*</span>}</label>
                  <input type={type} value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})} placeholder={ph} className={inp} data-testid={`customer-${key}-input`} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Any notes about this customer..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="save-customer-btn">
                  {saving ? "Saving..." : editItem ? "Update" : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
