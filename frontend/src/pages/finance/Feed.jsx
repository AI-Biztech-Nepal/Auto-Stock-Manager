import { useMemo, useState } from "react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Empty } from "./ui";
import { feedRows, KIND_STYLE, npr } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

const FILTERS = [["all", "All"], ["sale", "Sales"], ["purchase", "Purchases"], ["expense", "Expenses"], ["received", "Received"], ["paid", "Paid out"], ["transfer", "Transfers"]];

// Bills, ledger payments and transfers interleaved, newest day first, filterable by type. Tap a row
// to open it for editing.
export default function Feed({ defaultFilter = "all", title = "Entries" }) {
  const { books } = useBooks();
  const [filter, setFilter] = useState(defaultFilter);
  const [show, setShow] = useState(60);
  const [editing, setEditing] = useState(null);

  const rows = useMemo(() => feedRows(books).filter((r) => filter === "all" || r.kind === filter), [books, filter]);
  const groups = useMemo(() => {
    const g = [];
    for (const r of rows.slice(0, show)) {
      if (!g.length || g[g.length - 1].date !== r.date) g.push({ date: r.date, rows: [] });
      g[g.length - 1].rows.push(r);
    }
    return g;
  }, [rows, show]);

  return (
    <Card>
      <div className="p-4 border-b border-slate-100 space-y-3">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => { setFilter(k); setShow(60); }}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors ${filter === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? <Empty>Nothing here yet.</Empty> : (
        <div>
          {groups.map((g) => (
            <div key={g.date}>
              <div className="px-4 py-1.5 bg-slate-50 text-xs font-semibold text-slate-500 flex justify-between"><span>{g.date}</span><span className="font-normal text-slate-400">{formatBSDate(g.date)} BS</span></div>
              {g.rows.map((r) => {
                const k = KIND_STYLE[r.kind];
                return (
                  <button key={r.key} onClick={() => setEditing(r)} className="w-full text-left px-4 py-3 flex items-center gap-3 border-t border-slate-100 hover:bg-slate-50">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: k.color, background: `${k.color}15` }}>{k.label}</span>
                    <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{r.label}{r.number ? <span className="text-slate-400"> · #{r.number}</span> : null}</span>
                    <span className="text-sm font-semibold shrink-0" style={{ color: k.color }}>{npr(r.amount)}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {rows.length > show && <div className="p-3 text-center border-t border-slate-100"><button onClick={() => setShow(show + 60)} className="text-sm font-medium text-blue-600 hover:underline">Show more ({rows.length - show} left)</button></div>}
        </div>
      )}
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
