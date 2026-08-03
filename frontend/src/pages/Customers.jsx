import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Phone, MapPin, ShoppingBag, Star, Trash2, Edit, Eye, Undo2 } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", contact_number: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // View customer detail
  const [viewCustomer, setViewCustomer] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [purchaseFilter, setPurchaseFilter] = useState("all"); // "all" | "sales"

  const fetchCustomers = useCallback(async () => {
    try { const r = await api.get("/customers"); setCustomers(r.data); }
    catch { toast.error("Failed to load customers"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    if (!search) { setFiltered(customers); return; }
    const q = search.toLowerCase();
    setFiltered(customers.filter(c => c.name?.toLowerCase().includes(q) || c.contact_number?.includes(q) || c.address?.toLowerCase().includes(q)));
  }, [customers, search]);

  const openAdd = () => { setEditItem(null); setForm({ name: "", contact_number: "", address: "", notes: "" }); setShowModal(true); };
  const openEdit = (c) => { setEditItem(c); setForm({ name: c.name, contact_number: c.contact_number, address: c.address || "", notes: c.notes || "" }); setShowModal(true); };

  const openView = async (c) => {
    setViewCustomer(c);
    setViewLoading(true);
    setPurchaseFilter("all");
    try {
      const r = await api.get(`/customers/${c.id}`);
      setViewCustomer(r.data);
    } catch { toast.error("Failed to load customer details"); }
    finally { setViewLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.contact_number) { toast.error("Name and contact are required"); return; }
    setSaving(true);
    try {
      if (editItem) { await api.put(`/customers/${editItem.id}`, form); toast.success("Customer updated"); }
      else { await api.post("/customers", form); toast.success("Customer added!"); }
      setShowModal(false); fetchCustomers();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this customer?")) return;
    try { await api.delete(`/customers/${id}`); toast.success("Deleted"); fetchCustomers(); }
    catch { toast.error("Failed to delete"); }
  };

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">{filtered.length} customers</p>
        </div>
        <button onClick={openAdd} data-testid="add-customer-button" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> Add Customer
        </button>
      </div>

      {/* Search — sticky so it stays reachable while scrolling a long list */}
      <div className="sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, address..." className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="customer-search" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{customers.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Customers</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700" style={{ fontFamily: "Manrope" }}>{customers.filter(c => c.is_repeat_customer).length}</div>
          <div className="text-xs text-green-600 mt-0.5">Repeat Customers</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-700" style={{ fontFamily: "Manrope" }}>{customers.filter(c => !c.is_repeat_customer).length}</div>
          <div className="text-xs text-blue-600 mt-0.5">New Customers</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p className="font-medium">No customers yet</p>
            <p className="text-sm mt-1">Add your first customer to track sales</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Customer", "Contact", "Address", "Purchases", "Type", "Due", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => openView(c)} data-testid="customer-row" className="table-row-hover cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">{c.name[0]?.toUpperCase()}</div>
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">{c.name}</div>
                          <div className="text-xs text-slate-400">Since {c.created_at?.slice(0, 10)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-slate-700"><Phone size={13} className="text-slate-400" />{c.contact_number}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin size={13} className="text-slate-400" />{c.address || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-slate-700"><ShoppingBag size={13} className="text-slate-400" />{c.purchase_count} purchase{c.purchase_count !== 1 ? "s" : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      {c.is_repeat_customer ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold"><Star size={10} />Repeat</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">New</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.total_due > 0 ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.has_overdue ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`} data-testid="customer-due-badge">{formatNPR(c.total_due)}{c.has_overdue ? " (Overdue)" : ""}</span>
                      ) : (
                        <span className="text-xs text-green-600">Paid Up</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(c)} className="w-11 h-11 flex items-center justify-center hover:bg-blue-50 rounded-lg transition-colors" data-testid="view-customer-btn"><Eye size={14} className="text-blue-500" /></button>
                        <button onClick={() => openEdit(c)} className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors" data-testid="edit-customer-btn"><Edit size={14} className="text-slate-500" /></button>
                        <button onClick={() => handleDelete(c.id)} className="w-11 h-11 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-customer-btn"><Trash2 size={14} className="text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editItem ? "Edit Customer" : "Add Customer"}</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
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

      {viewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto" data-testid="customer-view-modal">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{viewCustomer.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{viewCustomer.contact_number}{viewCustomer.address ? ` · ${viewCustomer.address}` : ""}</p>
              </div>
              <button onClick={() => setViewCustomer(null)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {viewCustomer.notes && (
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{viewCustomer.notes}</div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Purchases</h3>
                  {viewCustomer.sales && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPurchaseFilter("sales")}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${purchaseFilter === "sales" ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                        data-testid="customer-sales-tag"
                      >
                        Sales: {viewCustomer.sales.filter(s => !s.returned).length}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurchaseFilter("all")}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${purchaseFilter === "all" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                        data-testid="customer-purchases-tag"
                      >
                        Purchases: {viewCustomer.sales.length}
                      </button>
                    </>
                  )}
                </div>
                {viewLoading ? (
                  <div className="flex items-center justify-center h-24"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
                ) : !viewCustomer.sales || viewCustomer.sales.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">No purchases yet</div>
                ) : (() => {
                  const displayedSales = purchaseFilter === "sales" ? viewCustomer.sales.filter(s => !s.returned) : viewCustomer.sales;
                  return displayedSales.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">No active sales — this customer's purchases were returned</div>
                  ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            {["Vehicle", "Date", "Sale Price", "Extra", "Total", "Payment", "Status"].map(h => (
                              <th key={h} className="text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {displayedSales.map(s => (
                            <tr
                              key={s.id}
                              onClick={() => navigate(`/sales/${s.id}`)}
                              className="cursor-pointer hover:bg-slate-50 transition-colors"
                              data-testid="customer-purchase-row"
                            >
                              <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">
                                {s.vehicle_info}
                                {s.returned && <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700"><Undo2 size={9} /> Returned</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{s.sale_date}</td>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{formatNPR(s.sale_price)}</td>
                              <td className="px-3 py-2 text-orange-600 whitespace-nowrap">{s.expenses_total > 0 ? formatNPR(s.expenses_total) : "—"}</td>
                              <td className="px-3 py-2 font-bold text-green-700 whitespace-nowrap">{formatNPR(s.total_amount)}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {s.returned ? (
                                  <span className="text-amber-700">Refunded {formatNPR(s.refund_amount || 0)} · Kept {formatNPR(s.retained_amount || 0)}</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.payment_method}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {s.returned ? (
                                  <span className="text-slate-400">—</span>
                                ) : s.due_amount > 0 ? (
                                  <span className="text-xs font-semibold text-red-600">Due: {formatNPR(s.due_amount)}</span>
                                ) : (
                                  <span className="text-xs text-green-600">Fully Paid</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
