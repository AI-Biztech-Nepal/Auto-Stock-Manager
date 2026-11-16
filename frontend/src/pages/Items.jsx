import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Search, X, ImagePlus, Trash2, ShoppingCart } from "lucide-react";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { useAuth } from "../context/AuthContext";
import { BOX, LBL } from "../components/formKit";

// Generic stock for shops that sell things rather than vehicles: name, SKU, category, cost, price, how many, photos.
// One page for list, add/edit (with photos) and selling; a sale is recorded in the same Sales list as everything else.
const STATUS_STYLE = {
  available: ["Available", "bg-green-100 text-green-800"],
  sold: ["Out of stock", "bg-slate-200 text-slate-600"],
  unlisted: ["Unlisted", "bg-amber-100 text-amber-800"],
};
const EMPTY = { name: "", sku: "", category: "", serial_number: "", cost: "", price: "", quantity: "1", notes: "", unlisted: false };
const errText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className={LBL}>{label}</label>{children}</div>;
}

function ItemForm({ item, isAdmin, terms, onSaved, onClose }) {
  const [f, setF] = useState(() => item ? {
    name: item.name || "", sku: item.sku || "", category: item.category || "", serial_number: item.serial_number || "",
    cost: item.cost ?? "", price: item.price ?? "", quantity: String(item.quantity ?? 1), notes: item.notes || "", unlisted: item.status === "unlisted",
  } : EMPTY);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(item || null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const loadPhotos = useCallback((id) => api.get(`/items/${id}/photos`).then((r) => setPhotos(r.data)).catch(() => {}), []);
  useEffect(() => { if (saved?.id) loadPhotos(saved.id); }, [saved?.id, loadPhotos]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, cost: Number(f.cost) || 0, price: Number(f.price) || 0, quantity: Number(f.quantity) || 0 };
    if (!isAdmin && item) body.cost = item.cost ?? 0;
    try {
      const r = saved?.id ? await api.put(`/items/${saved.id}`, body) : await api.post("/items", body);
      setSaved(r.data);
      toast.success(saved?.id ? "Saved" : `${terms.item} added. You can add photos now.`);
      onSaved();
      if (saved?.id) onClose();
    } catch (err) {
      toast.error(errText(err, "Could not save"));
    } finally { setBusy(false); }
  };

  const addPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !saved?.id) return;
    const fd = new FormData(); fd.append("file", file);
    try { await api.post(`/items/${saved.id}/photos`, fd); await loadPhotos(saved.id); onSaved(); }
    catch (err) { toast.error(errText(err, "Could not upload the photo")); }
  };
  const removePhoto = async (pid) => {
    try { await api.delete(`/items/${saved.id}/photos/${pid}`); await loadPhotos(saved.id); onSaved(); }
    catch (err) { toast.error(errText(err, "Could not delete the photo")); }
  };

  return (
    <Modal title={saved?.id ? `Edit ${terms.item.toLowerCase()}` : terms.add} onClose={onClose}>
      <form onSubmit={save} className="space-y-4" data-testid="item-form">
        <Field label="Name *"><input required className={BOX} value={f.name} onChange={set("name")} data-testid="item-name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU"><input className={BOX} value={f.sku} onChange={set("sku")} /></Field>
          <Field label="Category"><input className={BOX} value={f.category} onChange={set("category")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {isAdmin && <Field label="Cost (what you paid)"><input type="number" min="0" step="any" className={BOX} value={f.cost} onChange={set("cost")} /></Field>}
          <Field label="Price (selling)"><input type="number" min="0" step="any" className={BOX} value={f.price} onChange={set("price")} data-testid="item-price" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How many"><input type="number" min="0" className={BOX} value={f.serial_number.trim() ? 1 : f.quantity} disabled={!!f.serial_number.trim()} onChange={set("quantity")} data-testid="item-qty" /></Field>
          <Field label="Serial number (optional)"><input className={BOX} value={f.serial_number} onChange={set("serial_number")} /></Field>
        </div>
        <Field label="Notes"><textarea rows={2} className={`${BOX} h-auto py-2`} value={f.notes} onChange={set("notes")} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.unlisted} onChange={set("unlisted")} /> Unlisted (kept in the books, not for sale yet)</label>
        <button disabled={busy} className="w-full h-11 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60" data-testid="item-save">{busy ? "Saving…" : saved?.id ? "Save" : terms.add}</button>
      </form>
      {saved?.id && (
        <div className="mt-6 pt-5 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Photos</h3>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 cursor-pointer"><ImagePlus size={15} /> Add photo<input type="file" accept="image/*" className="hidden" onChange={addPhoto} data-testid="item-photo-input" /></label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                <img src={`${process.env.REACT_APP_BACKEND_URL || ""}${p.thumb}`} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removePhoto(p.id)} aria-label="Delete photo" className="absolute top-1 right-1 p-1 rounded bg-white/90 text-red-600"><Trash2 size={12} /></button>
              </div>
            ))}
            {photos.length === 0 && <p className="col-span-4 text-xs text-slate-400">No photos yet.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SellForm({ item, terms, customers, onDone, onClose }) {
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(String(item.price ?? ""));
  const [paid, setPaid] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const total = (Number(price) || 0) * (Number(qty) || 0);
  const sell = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/items/${item.id}/sell`, { unit_price: Number(price) || 0, quantity: Number(qty) || 1, paid_cash: paid === "" ? total : Number(paid) || 0, customer_id: customer || null });
      toast.success("Sale recorded");
      onDone();
    } catch (err) { toast.error(errText(err, "Could not record the sale")); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`${terms.sell}: ${item.name}`} onClose={onClose}>
      <form onSubmit={sell} className="space-y-4" data-testid="sell-form">
        <p className="text-xs text-slate-500">{item.quantity} in stock</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How many"><input type="number" min="1" max={item.quantity} className={BOX} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="sell-qty" /></Field>
          <Field label="Price each"><input type="number" min="0" step="any" className={BOX} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        </div>
        <Field label="Customer (optional)">
          <select className={BOX} value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">Walk-in customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.contact_number ? ` · ${c.contact_number}` : ""}</option>)}
          </select>
        </Field>
        <Field label={`Paid now (leave empty = paid in full, ${formatNPR(total)})`}><input type="number" min="0" step="any" className={BOX} value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
        <button disabled={busy} className="w-full h-11 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60" data-testid="sell-save">{busy ? "Saving…" : `Record sale · ${formatNPR(total)}`}</button>
      </form>
    </Modal>
  );
}

export default function Items() {
  const { user, terms } = useAuth();
  const isAdmin = !user?.role || user.role === "admin";
  const canCreate = isAdmin || user?.role === "social_media";
  const [items, setItems] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null); // {} = new
  const [selling, setSelling] = useState(null);

  const load = useCallback(() => api.get("/items").then((r) => setItems(r.data)).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAdmin) api.get("/customers").then((r) => setCustomers(r.data)).catch(() => {}); }, [isAdmin]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || []).filter((i) => (status === "all" || i.status === status)
      && (!needle || [i.name, i.sku, i.category, i.serial_number].some((v) => (v || "").toLowerCase().includes(needle))));
  }, [items, q, status]);

  const remove = async (i) => {
    if (!window.confirm(`Delete ${i.name}?`)) return;
    try { await api.delete(`/items/${i.id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(errText(err, "Could not delete")); }
  };

  return (
    <div className="space-y-4" data-testid="items-page">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, category…" className={`${BOX} pl-9`} data-testid="items-search" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${BOX} !w-auto`}>
          <option value="all">All</option><option value="available">Available</option><option value="sold">Out of stock</option><option value="unlisted">Unlisted</option>
        </select>
        {canCreate && <button onClick={() => setEditing({})} className="ml-auto inline-flex items-center gap-1.5 h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700" data-testid="items-add"><Plus size={16} /> {terms.add}</button>}
      </div>

      {items === null ? (
        <div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
      ) : shown.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 text-slate-500">
          <Package className="mx-auto mb-3 text-slate-300" size={36} />
          {items.length === 0 ? `No ${terms.items.toLowerCase()} yet.` : "Nothing matches."}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100" data-testid="items-list">
          {shown.map((i) => {
            const [label, cls] = STATUS_STYLE[i.status] || STATUS_STYLE.available;
            const thumb = i.thumb_photos?.[0];
            return (
              <div key={i.id} className="flex items-center gap-3 p-3 sm:p-4" data-testid="item-row">
                <div className="size-14 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                  {thumb ? <img src={`${process.env.REACT_APP_BACKEND_URL || ""}${thumb.thumb}`} alt="" className="w-full h-full object-cover" /> : <Package size={20} className="text-slate-300" />}
                </div>
                <button className="flex-1 min-w-0 text-left" onClick={() => (isAdmin || canCreate) && setEditing(i)}>
                  <div className="font-semibold text-slate-900 truncate">{i.name}</div>
                  <div className="text-xs text-slate-500 truncate">{[i.sku, i.category, i.serial_number && `SN ${i.serial_number}`].filter(Boolean).join(" · ") || "—"}</div>
                </button>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-900">{formatNPR(i.price)}</div>
                  <div className="text-xs text-slate-500">{i.quantity} in stock</div>
                </div>
                <span className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>
                {isAdmin && i.status === "available" && <button onClick={() => setSelling(i)} aria-label={`Sell ${i.name}`} className="p-2 rounded-lg text-green-700 hover:bg-green-50" data-testid="item-sell"><ShoppingCart size={17} /></button>}
                {isAdmin && <button onClick={() => remove(i)} aria-label={`Delete ${i.name}`} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {editing && <ItemForm item={editing.id ? editing : null} isAdmin={isAdmin} terms={terms} onSaved={load} onClose={() => { setEditing(null); load(); }} />}
      {selling && <SellForm item={selling} terms={terms} customers={customers} onDone={() => { setSelling(null); load(); }} onClose={() => setSelling(null)} />}
    </div>
  );
}
