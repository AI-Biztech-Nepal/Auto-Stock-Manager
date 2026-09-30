import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Phone, MapPin, Edit, Trash2, CreditCard, ChevronDown, Store, Tag } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import VendorStatement from "../components/VendorStatement";
import BSDatePicker from "../components/BSDatePicker";
import { LedgerToolbar, groupByLetter, LetterSection, DueTag, InfoPill, LedgerSkeleton, LedgerEmpty } from "../components/LedgerParts";

const VENDOR_TYPE_LABEL = { parts: "Parts supplier", vehicles: "Vehicle supplier", both: "Vehicles + parts" };

export default function Vendors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "", vendor_type: "both" });
  const [payForm, setPayForm] = useState({ vendor_id: "", amount: "", payment_date: "", notes: "" });
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  // Bumped after a payment so the open statement refetches its payment history.
  const [statementKey, setStatementKey] = useState(0);

  const fetchVendors = useCallback(async () => {
    try { const r = await api.get("/vendors"); setVendors(r.data); }
    catch { toast.error("Failed to load vendors"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const refresh = fetchVendors;

  const openAdd = () => { setEditItem(null); setForm({ name: "", phone: "", address: "", notes: "", vendor_type: "both" }); setShowModal(true); };
  const openEdit = (v) => { setEditItem(v); setForm({ name: v.name, phone: v.phone, address: v.address || "", notes: v.notes || "", vendor_type: v.vendor_type || "both" }); setShowModal(true); };
  const openPayment = (v) => { setSelectedVendor(v); setPayForm({ vendor_id: v.id, amount: "", payment_date: "", notes: "" }); setShowPayModal(true); };

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      openAdd();
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete("action");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ?vendor=<id> deep-links straight into that vendor's statement (old Finance → Vendor Ledger links).
  useEffect(() => {
    const vid = searchParams.get("vendor");
    if (!vid || vendors.length === 0) return;
    if (vendors.some(x => String(x.id) === vid)) setOpenId(vid);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("vendor");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, vendors]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) { toast.error("Name and phone are required"); return; }
    setSaving(true);
    try {
      if (editItem) { await api.put(`/vendors/${editItem.id}`, form); toast.success("Vendor updated"); }
      else { await api.post("/vendors", form); toast.success("Vendor added"); }
      setShowModal(false); refresh();
    } catch { toast.error("Couldn't save the vendor — try again"); } finally { setSaving(false); }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error("Enter an amount above zero"); return; }
    setSaving(true);
    try {
      await api.post("/vendor-payments", { ...payForm, amount: Number(payForm.amount) });
      toast.success(`Payment to ${selectedVendor.name} recorded`);
      setShowPayModal(false); setStatementKey(k => k + 1); refresh();
    } catch { toast.error("Couldn't record the payment — try again"); } finally { setSaving(false); }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete ${v.name}? Their purchase and payment history stays on the vehicles and bills.`)) return;
    try { await api.delete(`/vendors/${v.id}`); toast.success("Vendor deleted"); setOpenId(null); refresh(); }
    catch { toast.error("Couldn't delete the vendor"); }
  };

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = vendors.filter(v => !q || v.name?.toLowerCase().includes(q) || v.phone?.toLowerCase().includes(q) || v.address?.toLowerCase().includes(q));
    return groupByLetter(found, v => v.name || "");
  }, [vendors, search]);
  const shownCount = sections.reduce((n, s) => n + s.items.length, 0);

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      <LedgerToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search vendors by name, phone or address…"
        testid="vendor-search-input"
        count={`${shownCount} of ${vendors.length}`}
        action={
          <button onClick={openAdd} data-testid="add-vendor-btn" className="flex items-center gap-2 h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 rounded-lg transition-all active:scale-95 shadow-sm shrink-0">
            <Plus size={16} /> <span className="hidden sm:inline">Add Vendor</span><span className="sm:hidden">Add</span>
          </button>
        }
      />

      {loading ? (
        <LedgerSkeleton />
      ) : vendors.length === 0 ? (
        <LedgerEmpty
          icon={Store}
          title="No vendors yet"
          body="Add the dealers and parts suppliers you buy from. Every vehicle and parts bill you link to them builds up what you owe, and each payment brings it down."
          action={<button onClick={openAdd} className="text-sm font-semibold text-blue-600 hover:text-blue-700">Add your first vendor</button>}
        />
      ) : shownCount === 0 ? (
        <LedgerEmpty title="No vendors match" body={`Nothing matches “${search}”. Try a name, phone number or area.`} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {sections.map(({ letter, items }) => (
            <LetterSection key={letter} letter={letter}>
              {items.map(v => {
                const isOpen = String(openId) === String(v.id);
                return (
                  <div key={v.id} data-testid="vendor-card" className={isOpen ? "bg-slate-50/70" : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : v.id)}
                      aria-expanded={isOpen}
                      className="w-full text-left flex items-center gap-4 px-4 py-4 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">{v.name[0]?.toUpperCase()}</div>
                      <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm truncate">{v.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5 truncate">
                            {VENDOR_TYPE_LABEL[v.vendor_type] || VENDOR_TYPE_LABEL.both}{v.address ? ` · ${v.address}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 tabular-nums mt-1 sm:mt-0"><Phone size={13} className="text-slate-400 shrink-0" />{v.phone || "—"}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:mt-0 sm:justify-end" data-testid="vendor-pills">
                          <InfoPill tone="blue">{v.vehicle_count} vehicle{v.vehicle_count === 1 ? "" : "s"}</InfoPill>
                          <InfoPill>{v.parts_count || 0} bill{v.parts_count === 1 ? "" : "s"}</InfoPill>
                          {v.remaining_due > 0
                            ? <DueTag amount={v.remaining_due} label="You owe" />
                            : (v.vehicle_count > 0 || v.parts_count > 0) && <InfoPill tone="green">Settled</InfoPill>}
                        </div>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 sm:pl-[4.25rem] space-y-4" data-testid="vendor-details">
                        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-slate-400">Phone</dt>
                            <dd>{v.phone ? <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1.5 text-slate-800 hover:text-blue-600"><Phone size={13} className="text-slate-400" />{v.phone}</a> : "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Address</dt>
                            <dd className="inline-flex items-center gap-1.5 text-slate-800"><MapPin size={13} className="text-slate-400" />{v.address || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Supplies</dt>
                            <dd className="inline-flex items-center gap-1.5 text-slate-800"><Tag size={13} className="text-slate-400" />{VENDOR_TYPE_LABEL[v.vendor_type] || VENDOR_TYPE_LABEL.both}</dd>
                          </div>
                        </dl>
                        {v.notes && <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">{v.notes}</p>}
                        <p className="text-xs text-slate-500">
                          Bought {formatNPR(v.total_purchased)} in total · Paid {formatNPR(v.total_paid)}
                          {v.remaining_due > 0 && <> · <span className="text-orange-700 font-semibold">You owe {formatNPR(v.remaining_due)}</span></>}
                        </p>

                        <VendorStatement vendor={v} reloadKey={statementKey} />

                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openEdit(v)} className="flex items-center gap-1.5 h-9 px-3 border border-slate-200 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors">
                            <Edit size={13} /> Edit details
                          </button>
                          <button onClick={() => openPayment(v)} className="flex items-center gap-1.5 h-9 px-3 border border-slate-200 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors" data-testid="record-payment-btn">
                            <CreditCard size={13} /> Record payment
                          </button>
                          <button onClick={() => handleDelete(v)} className="flex items-center gap-1.5 h-9 px-3 border border-red-200 bg-white text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
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

      {/* Add/Edit Vendor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editItem ? "Edit Vendor" : "Add Vendor"}</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {[["Full Name","name","text","e.g. Ram Bahadur Shrestha",true],["Phone Number","phone","tel","e.g. 9841234567",true],["Address","address","text","City/Area",false]].map(([label, key, type, ph, req]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}{req && <span className="text-red-500 ml-0.5">*</span>}</label>
                  <input type={type} value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})} placeholder={ph} className={inp} data-testid={`vendor-${key}-input`} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Vendor Type</label>
                <select value={form.vendor_type || "both"} onChange={e => setForm({...form, vendor_type: e.target.value})} className={inp} data-testid="vendor-type-select">
                  <option value="parts">Parts Supplier</option>
                  <option value="vehicles">Vehicle Supplier</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="save-vendor-btn">
                  {saving ? "Saving..." : editItem ? "Update" : "Add Vendor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayModal && selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Record Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5">To {selectedVendor.name} · You owe {formatNPR(selectedVendor.remaining_due)}</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">✕</button>
            </div>
            <form onSubmit={handlePayment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Amount (NPR) <span className="text-red-500">*</span></label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} placeholder={`Up to ${selectedVendor.remaining_due}`} className={inp} data-testid="payment-amount-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date</label>
                <BSDatePicker value={payForm.payment_date} onChange={val => setPayForm({...payForm, payment_date: val})} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <input value={payForm.notes} onChange={e => setPayForm({...payForm, notes: e.target.value})} placeholder="Payment method, cheque number, etc." className={inp} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPayModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="confirm-payment-btn">
                  {saving ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
