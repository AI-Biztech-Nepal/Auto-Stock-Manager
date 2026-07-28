import { useEffect, useState, useCallback } from "react";
import { Plus, Phone, MapPin, AlertTriangle, Edit, Trash2, CreditCard, ChevronDown, ChevronUp, Search } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, formatDateDual } from "../utils/helpers";

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showLedger, setShowLedger] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "", vendor_type: "both" });
  const [payForm, setPayForm] = useState({ vendor_id: "", amount: "", payment_date: "", notes: "" });
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchVendors = useCallback(async () => {
    try { const r = await api.get("/vendors"); setVendors(r.data); }
    catch { toast.error("Failed to load vendors"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const openAdd = () => { setEditItem(null); setForm({ name: "", phone: "", address: "", notes: "", vendor_type: "both" }); setShowModal(true); };
  const openEdit = (v) => { setEditItem(v); setForm({ name: v.name, phone: v.phone, address: v.address || "", notes: v.notes || "", vendor_type: v.vendor_type || "both" }); setShowModal(true); };
  const openPayment = (v) => { setSelectedVendor(v); setPayForm({ vendor_id: v.id, amount: "", payment_date: "", notes: "" }); setShowPayModal(true); };

  const fetchLedger = async (vendorId) => {
    if (showLedger === vendorId) { setShowLedger(null); return; }
    try {
      const r = await api.get(`/vendors/${vendorId}/payments`);
      setLedgerData(r.data); setShowLedger(vendorId);
    } catch { toast.error("Failed to load ledger"); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) { toast.error("Name and phone are required"); return; }
    setSaving(true);
    try {
      if (editItem) { await api.put(`/vendors/${editItem.id}`, form); toast.success("Vendor updated"); }
      else { await api.post("/vendors", form); toast.success("Vendor added!"); }
      setShowModal(false); fetchVendors();
    } catch { toast.error("Failed"); } finally { setSaving(false); }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error("Enter valid amount"); return; }
    setSaving(true);
    try {
      await api.post("/vendor-payments", { ...payForm, amount: Number(payForm.amount) });
      toast.success("Payment recorded!"); setShowPayModal(false); fetchVendors();
      if (showLedger === payForm.vendor_id) fetchLedger(payForm.vendor_id);
    } catch { toast.error("Failed"); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this vendor?")) return;
    try { await api.delete(`/vendors/${id}`); toast.success("Deleted"); fetchVendors(); }
    catch { toast.error("Failed"); }
  };

  const totalDue = vendors.reduce((s, v) => s + (v.remaining_due || 0), 0);
  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
  const q = search.trim().toLowerCase();
  const filteredVendors = q
    ? vendors.filter(v =>
        v.name?.toLowerCase().includes(q) ||
        v.phone?.toLowerCase().includes(q) ||
        v.address?.toLowerCase().includes(q)
      )
    : vendors;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendor Management</h1>
          <p className="text-sm text-slate-500">{vendors.length} vendors · Total Due: <span className="font-semibold text-red-600">{formatNPR(totalDue)}</span></p>
        </div>
        <button onClick={openAdd} data-testid="add-vendor-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> Add Vendor
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{vendors.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Vendors</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-700" style={{ fontFamily: "Manrope" }}>{vendors.filter(v => v.remaining_due > 0).length}</div>
          <div className="text-xs text-red-600 mt-0.5">With Pending Dues</div>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
          <div className="text-lg font-bold text-orange-700" style={{ fontFamily: "Manrope" }}>{formatNPR(totalDue)}</div>
          <div className="text-xs text-orange-600 mt-0.5">Total Payable</div>
        </div>
      </div>

      {/* Search */}
      {!loading && vendors.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors by name, phone, or address..."
            className="w-full h-10 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            data-testid="vendor-search-input"
          />
        </div>
      )}

      {/* Vendor List */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : vendors.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <p className="font-medium">No vendors yet</p>
          <p className="text-sm mt-1">Add vendors to track purchases and payments</p>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <p className="font-medium">No vendors match "{search}"</p>
          <p className="text-sm mt-1">Try a different name, phone, or address</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVendors.map(v => (
            <div key={v.id} data-testid="vendor-card" className={`bg-white rounded-xl border shadow-sm overflow-hidden ${v.remaining_due > 0 ? "border-red-200" : "border-slate-200"}`}>
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm">{v.name[0]?.toUpperCase()}</div>
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">{v.name}<span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{v.vendor_type || "both"}</span></div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1"><Phone size={11} />{v.phone}</span>
                        {v.address && <span className="flex items-center gap-1"><MapPin size={11} />{v.address}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {v.remaining_due > 0 && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                        <AlertTriangle size={11} />Due: {formatNPR(v.remaining_due)}
                      </span>
                    )}
                    <button onClick={() => openPayment(v)} className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-200 transition-colors" data-testid="record-payment-btn">
                      <CreditCard size={12} className="inline mr-1" />Pay
                    </button>
                    <button onClick={() => openEdit(v)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Edit size={14} className="text-slate-400" /></button>
                    <button onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{v.vehicle_count}</div>
                    <div className="text-xs text-slate-500">Vehicles Bought</div>
</div>
<div className="bg-purple-50 rounded-lg p-3 text-center">
<div className="text-lg font-bold text-purple-700" style={{ fontFamily: "Manrope" }}>{v.parts_count || 0}</div>
<div className="text-xs text-purple-600">Parts Bills</div>
</div>
<div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-sm font-bold text-blue-700">{formatNPR(v.total_purchased)}</div>
                    <div className="text-xs text-blue-600">Total Purchased</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-sm font-bold text-green-700">{formatNPR(v.total_paid)}</div>
                    <div className="text-xs text-green-600">Total Paid</div>
                  </div>
                </div>

                {/* Ledger Toggle */}
                <button onClick={() => fetchLedger(v.id)} className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors" data-testid="view-ledger-btn">
                  {showLedger === v.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showLedger === v.id ? "Hide" : "View"} Payment Ledger
                </button>

                {/* Ledger */}
                {showLedger === v.id && ledgerData && (
                  <div className="mt-3 border-t border-slate-100 pt-4 space-y-5">
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
                      <LedgerTable
                        title="Spare Parts Bills"
                        countLabel={`${ledgerData.parts_bills.length} bill${ledgerData.parts_bills.length !== 1 ? "s" : ""}`}
                        headers={["Bill No.", "Date", "Items", "Total"]}
                        rows={ledgerData.parts_bills.map(b => [
                          b.bill_no,
                          b.entry_date || "—",
                          <ul className="space-y-0.5">
                            {b.items?.map((it, j) => (
                              <li key={j} className="flex justify-between gap-3 text-slate-600">
                                <span>{it.name}{it.part_number ? ` (${it.part_number})` : ""} × {it.quantity}</span>
                                <span className="text-slate-500 whitespace-nowrap">{formatNPR(it.quantity * it.unit_cost)}</span>
                              </li>
                            ))}
                          </ul>,
                          formatNPR(b.total),
                        ])}
                        totalLabel="Total Parts Purchased"
                        totalValue={formatNPR(ledgerData.parts_bills.reduce((s, b) => s + (b.total || 0), 0))}
                      />
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
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Vendor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editItem ? "Edit Vendor" : "Add Vendor"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
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
                <p className="text-xs text-slate-500 mt-0.5">To: {selectedVendor.name} · Due: {formatNPR(selectedVendor.remaining_due)}</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handlePayment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Amount (NPR) <span className="text-red-500">*</span></label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} placeholder={`Max: ${selectedVendor.remaining_due}`} className={inp} data-testid="payment-amount-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date</label>
                <input type="date" value={payForm.payment_date} onChange={e => setPayForm({...payForm, payment_date: e.target.value})} className={inp} />
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

function LedgerTable({ title, countLabel, headers, rows, totalLabel, totalValue, empty, accent = "slate" }) {
  const headBg = accent === "green" ? "bg-green-50/60" : "bg-slate-50";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        <span className="text-[11px] text-slate-400">{countLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">{empty || "No records"}</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className={headBg}>
                {headers.map((h, i) => (
                  <th key={i} className={`text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 ${i === headers.length - 1 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((cells, ri) => (
                <tr key={ri}>
                  {cells.map((cell, ci) => (
                    <td key={ci} className={`px-3 py-2 align-top text-slate-700 ${ci === cells.length - 1 ? "text-right font-semibold whitespace-nowrap" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totalValue != null && (
              <tfoot>
                <tr className={headBg}>
                  <td colSpan={headers.length - 1} className="px-3 py-2 text-right font-semibold text-slate-600">{totalLabel}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">{totalValue}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
