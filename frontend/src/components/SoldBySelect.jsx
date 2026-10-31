import useSellers from "../hooks/useSellers";

// "Sold by" -- which Team member sold the vehicle. `fallbackName` keeps a seller who has since left the
// list (or hasn't loaded yet) visible, so editing a sale never silently drops them.
export default function SoldBySelect({ value, onChange, className, testid, fallbackName }) {
  const sellers = useSellers();
  const known = sellers.some(s => s.id === value);
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)} className={className} data-testid={testid}>
      <option value="">Not set</option>
      {value && !known && <option value={value}>{fallbackName || "Previous seller"}</option>}
      {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
