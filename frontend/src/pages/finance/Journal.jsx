import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import { Card, Field, DateField, inputCls, btnPrimary, btnGhost, btnSave } from "./ui";
import { todayStr, npr, COLORS } from "./money";

let seq = 0;
const newLine = (side) => ({ key: ++seq, side, acct: { kind: null, id: null, name: "" }, amount: "" });

// One search over both: people (either side) and expense heads (debit only). A name nobody has can be added
// right here, as a new person or (debit only) as a new expense head, which the server makes on posting.
function AccountPicker({ side, acct, onChange }) {
  const { books, post } = useBooks();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(acct.name);
  const box = useRef(null);
  useEffect(() => { setText(acct.name); }, [acct.name, acct.id, acct.kind]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q = text.trim().toLowerCase();
  const match = (name) => !q || name.toLowerCase().includes(q);
  const options = useMemo(() => {
    const heads = side === "debit" ? books.categories.filter((c) => match(c.name)).map((c) => ({ key: `h${c.id}`, label: c.name, hint: "Expense head", acct: { kind: "head", id: null, name: c.name } })) : [];
    const people = books.parties.filter((p) => match(p.name)).map((p) => ({ key: `p${p.id}`, label: p.name, hint: p.phone || "Person", acct: { kind: "party", id: p.id, name: p.name } }));
    return [...heads, ...people].slice(0, 14);
  }, [books.categories, books.parties, side, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = text.trim();
  const exact = [...books.parties, ...(side === "debit" ? books.categories : [])].some((x) => x.name.toLowerCase() === typed.toLowerCase());

  const choose = (a) => { onChange(a); setText(a.name); setOpen(false); };
  const addPerson = async () => {
    const created = await post("/fin/parties", { name: typed });
    if (created) choose({ kind: "party", id: created.id, name: created.name });
  };

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <input value={text} placeholder={side === "debit" ? "Person or expense head" : "Person"} className={`${inputCls} pr-24`}
          onFocus={() => setOpen(true)}
          // typing again drops the earlier pick, so a stale person is never posted under a new name
          onChange={(e) => { setText(e.target.value); setOpen(true); onChange({ kind: null, id: null, name: e.target.value }); }} />
        {acct.kind && <span className="absolute right-3 top-3 text-[10.5px] font-bold" style={{ color: acct.kind === "party" ? "#1D4ED8" : "#B45309" }}>{acct.kind === "party" ? "PERSON" : "EXPENSE"}</span>}
      </div>
      {open && (options.length > 0 || (typed && !exact)) && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {options.map((o) => (
            <button key={o.key} type="button" onClick={() => choose(o.acct)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between gap-2">
              <span className="truncate">{o.label}</span><span className="text-xs text-slate-400 shrink-0">{o.hint}</span>
            </button>
          ))}
          {typed && !exact && side === "debit" && (
            <button type="button" onClick={() => choose({ kind: "head", id: null, name: typed })} className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2 border-t border-slate-100">
              <Plus size={14} /> Add “{typed}” as a new expense head
            </button>
          )}
          {typed && !exact && (
            <button type="button" onClick={addPerson} className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2 border-t border-slate-100">
              <Plus size={14} /> Add “{typed}” as a new person
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The Journal voucher: any number of Debit lines and Credit lines that add up to the same total. A line is a
// person's ledger (either side) or an expense head (debit only: Salary Expenses debited, Roshan and Manish
// credited). No cash or bank account is touched; every line carries the voucher's code in its remark.
export default function Journal({ onDone }) {
  const { post } = useBooks();
  const [lines, setLines] = useState(() => [newLine("debit"), newLine("credit")]);
  const [date, setDate] = useState(todayStr());
  const [narration, setNarration] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = (key, values) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...values } : l)));
  const total = (side) => lines.filter((l) => l.side === side).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const debit = total("debit"), credit = total("credit");
  const balanced = debit > 0 && Math.abs(debit - credit) < 0.005;

  const save = async () => {
    if (!date) return toast.error("Choose the date of this voucher");
    for (const l of lines) {
      const where = `${l.side === "debit" ? "Debit" : "Credit"} line ${lines.filter((x) => x.side === l.side).indexOf(l) + 1}`;
      if (!l.acct.name.trim() || !l.acct.kind) return toast.error(`${where}: search and pick ${l.side === "debit" ? "a person or an expense head" : "the person"}, or add the name`);
      if (l.side === "credit" && l.acct.kind !== "party") return toast.error(`${where}: choose a person. An expense head can only be debited`);
      if (!(Number(l.amount) > 0)) return toast.error(`${where}: add an amount above 0`);
    }
    if (!balanced) return toast.error(`Debit ${npr(debit)} and Credit ${npr(credit)} must be equal. The difference is ${npr(Math.abs(debit - credit))}`);
    setBusy(true);
    const ok = await post("/fin/journal", {
      entry_date: date, narration,
      lines: lines.map((l) => ({ side: l.side, amount: Number(l.amount), party_id: l.acct.kind === "party" ? l.acct.id : null, head: l.acct.kind === "head" ? l.acct.name.trim() : null })),
    }, "Voucher posted");
    setBusy(false);
    if (ok) { setLines([newLine("debit"), newLine("credit")]); setNarration(""); onDone?.(); }
  };

  const sideBlock = (side) => {
    const mine = lines.filter((l) => l.side === side);
    const color = side === "debit" ? COLORS.out : COLORS.in;
    return (
      <div key={side} className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold" style={{ color }}>{side === "debit" ? "DEBIT" : "CREDIT"}</span>
          <span className="flex-1 text-xs text-slate-500">{npr(total(side))}</span>
          <button type="button" onClick={() => setLines((ls) => [...ls, newLine(side)])} className={`${btnGhost} !h-8 !px-2.5 text-xs`}><Plus size={14} /> Add {side}</button>
        </div>
        {mine.map((l, n) => (
          <div key={l.key} className="grid grid-cols-[2.5rem_1fr_8rem_2rem] sm:grid-cols-[3rem_1fr_9rem_2rem] gap-2 items-center">
            <span className="text-xs font-bold text-slate-500">{side === "debit" ? "Dr" : "Cr"} {n + 1}</span>
            <AccountPicker side={side} acct={l.acct} onChange={(acct) => patch(l.key, { acct })} />
            <input type="number" min="0" placeholder="Amount" value={l.amount} onChange={(e) => patch(l.key, { amount: e.target.value })} className={inputCls} />
            <button type="button" onClick={() => setLines((ls) => (ls.filter((x) => x.side === side).length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
              disabled={mine.length < 2} className="h-9 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center" aria-label="Remove this line"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="p-5 space-y-5 max-w-3xl">
      <div>
        <h3 className="text-base font-bold" style={{ color: COLORS.journal }}>Journal voucher</h3>
        <p className="text-xs text-slate-500">Moves an amount from one person's ledger to another's, or charges an expense head. Add as many Debit and Credit lines as you need; they must add up to the same total. No cash or bank account is touched.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3"><DateField value={date} onChange={setDate} /></div>
      {["debit", "credit"].map(sideBlock)}
      <div className="rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-4 text-sm" style={{ background: balanced ? "#ECFDF5" : "#FEF2F2" }}>
        <span className="flex-1 font-semibold text-slate-800">Debit {npr(debit)} · Credit {npr(credit)}</span>
        <span className="font-bold" style={{ color: balanced ? COLORS.in : COLORS.out }}>{balanced ? "Balanced" : `Difference ${npr(Math.abs(debit - credit))}`}</span>
      </div>
      <Field label="Remarks"><input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional" className={inputCls} /></Field>
      <div className="flex justify-end gap-2">
        <button onClick={() => onDone?.()} className={btnGhost}>Cancel</button>
        <button onClick={save} disabled={busy} className={btnSave} data-testid="post-voucher">{busy ? "Posting…" : "Post voucher"}</button>
      </div>
    </Card>
  );
}
