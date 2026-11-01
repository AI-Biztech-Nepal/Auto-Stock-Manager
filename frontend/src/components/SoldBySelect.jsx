import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import useSellers, { resetSellers } from "../hooks/useSellers";

// "Sold by" -- which Team member sold the vehicle. `fallbackName` keeps a seller who has since left the
// list (or hasn't loaded yet) visible, so editing a sale never silently drops them. The button adds a
// new sales-staff member on the spot.
export default function SoldBySelect({ value, onChange, className, testid, fallbackName }) {
  const sellers = useSellers();
  const [added, setAdded] = useState([]);
  const all = [...sellers, ...added.filter(a => !sellers.some(s => s.id === a.id))];
  const known = all.some(s => s.id === value);

  const addSeller = async () => {
    const name = window.prompt("New salesperson's name?")?.trim();
    if (!name) return;
    try {
      const m = (await api.post("/team", { name, role: "sales" })).data;
      resetSellers();
      setAdded(a => [...a, { id: m.id, name: m.name }]);
      onChange(m.id);
    } catch { toast.error("Couldn't add salesperson"); }
  };

  return (
    <div className="flex gap-2">
      <select value={value || ""} onChange={e => onChange(e.target.value)} className={className} data-testid={testid}>
        <option value="">Not set</option>
        {value && !known && <option value={value}>{fallbackName || "Previous seller"}</option>}
        {all.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button type="button" onClick={addSeller} title="Add a new salesperson" data-testid="add-seller-btn" className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
        <UserPlus size={15} />
      </button>
    </div>
  );
}
