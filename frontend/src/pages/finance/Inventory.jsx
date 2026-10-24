import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBooks } from "./BooksContext";
import { Card, Empty, Notice, ExportBar, exportXlsx, inputCls } from "./ui";
import { npr } from "./money";

// Items remembered from bills, cross-referenced with how many units moved through sale and purchase
// bills. Matched by item name (lowercased and trimmed) because bill lines carry typed names, not
// ids, so this is a guide to movement and not a promise of exact stock.
export default function Inventory() {
  const { books } = useBooks();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const m = new Map();
    const get = (name, rate) => {
      const key = name.trim().toLowerCase();
      if (!m.has(key)) m.set(key, { name: name.trim(), rate: rate ?? null, sold: 0, bought: 0 });
      return m.get(key);
    };
    for (const i of books.items) get(i.name, i.rate);
    for (const t of books.transactions) {
      if (t.type === "expense") continue;
      for (const l of t.items || []) {
        if (!l.description?.trim()) continue;
        const r = get(l.description);
        if (t.type === "sale") r.sold += Number(l.qty) || 0; else r.bought += Number(l.qty) || 0;
      }
    }
    return [...m.values()].map((r) => ({ ...r, net: r.bought - r.sold })).sort((a, b) => a.name.localeCompare(b.name));
  }, [books]);

  const shown = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cols = [{ header: "Item", value: (r) => r.name }, { header: "Rate", value: (r) => r.rate ?? "" }, { header: "Bought", value: (r) => r.bought }, { header: "Sold", value: (r) => r.sold }, { header: "Bought − sold", value: (r) => r.net }];

  return (
    <div className="space-y-4">
      <Notice tone="blue">Built from the items typed on your sale and purchase bills. “Bought − sold” is a guide to movement, not an exact stock count.</Notice>
      <div className="fin-no-print flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className={`${inputCls} pl-9`} /></div>
        <ExportBar onXlsx={() => exportXlsx("inventory", cols, shown)} />
      </div>
      <Card className="overflow-x-auto">
        {shown.length === 0 ? <Empty>{rows.length ? "No match." : "No items yet. They appear once you add items to a sale or purchase bill."}</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-xs text-slate-500 text-left"><th className="px-4 py-2 font-semibold">Item</th><th className="px-3 py-2 font-semibold text-right">Last rate</th><th className="px-3 py-2 font-semibold text-right">Bought</th><th className="px-3 py-2 font-semibold text-right">Sold</th><th className="px-4 py-2 font-semibold text-right">Bought − sold</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.name.toLowerCase()} className="border-t border-slate-100">
                <td className="px-4 py-2.5 text-slate-800">{r.name}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">{r.rate != null ? npr(r.rate) : "—"}</td>
                <td className="px-3 py-2.5 text-right">{r.bought || "—"}</td>
                <td className="px-3 py-2.5 text-right">{r.sold || "—"}</td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: r.net < 0 ? "#B91C1C" : "#0f172a" }}>{r.net}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
