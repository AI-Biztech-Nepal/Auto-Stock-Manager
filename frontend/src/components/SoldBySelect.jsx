import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import useSellers, { resetSellers } from "../hooks/useSellers";

// "Sold by" -- which Team member sold the vehicle. `fallbackName` keeps a seller who has since left the
// list (or hasn't loaded yet) visible, so editing a sale never silently drops them. The button opens an
// inline name field that adds a new sales-staff member on the spot.
export default function SoldBySelect({ value, onChange, className, testid, fallbackName }) {
  const sellers = useSellers();
  const [added, setAdded] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const all = [...sellers, ...added.filter(a => !sellers.some(s => s.id === a.id))];
  const known = all.some(s => s.id === value);

  const closeAdd = () => { setAdding(false); setName(""); };
  const addSeller = async () => {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true);
    try {
      const m = (await api.post("/team", { name: n, role: "sales" })).data;
      resetSellers();
      setAdded(a => [...a, { id: m.id, name: m.name }]);
      onChange(m.id);
      closeAdd();
    } catch { toast.error("Couldn't add salesperson"); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex gap-2">
        <select value={value || ""} onChange={e => onChange(e.target.value)} className={className} data-testid={testid}>
          <option value="">Not set</option>
          {value && !known && <option value={value}>{fallbackName || "Previous seller"}</option>}
          {all.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={() => setAdding(a => !a)} title="Add a new salesperson" aria-label="Add a new salesperson" data-testid="add-seller-btn"
          className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border transition-colors ${adding ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <UserPlus size={15} />
        </button>
      </div>
      {adding && (
        <div className="mt-2 flex gap-2" data-testid="add-seller-form">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="New salesperson's name"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSeller(); } else if (e.key === "Escape") closeAdd(); }}
            className="flex-1 min-w-0 h-11 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="add-seller-name" />
          <button type="button" onClick={addSeller} disabled={!name.trim() || saving} className="px-4 h-11 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? "Adding..." : "Add"}</button>
          <button type="button" onClick={closeAdd} className="px-3 h-11 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      )}
    </div>
  );
}
