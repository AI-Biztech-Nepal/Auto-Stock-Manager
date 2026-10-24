import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Percent, Tags } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import Feed from "./Feed";
import { Card, Field, Modal, DateField, AccountSelect, PartyPicker, TwoTapDelete, inputCls, btnPrimary, btnGhost } from "./ui";
import { todayStr, billTotals, nextBillNo, npr, COLORS } from "./money";

let seq = 0;
const newLine = () => ({ key: ++seq, description: "", qty: "1", rate: "" });
const newExpenseRow = () => ({ key: ++seq, payee: "", category_id: "", amount: "", note: "" });

// ── Sale / Purchase: an itemised bill against a SAVED party ───────────────
function ItemisedBill({ type }) {
  const { books, post } = useBooks();
  const sale = type === "sale";
  const color = sale ? COLORS.sale : COLORS.purchase;
  const [date, setDate] = useState(todayStr());
  const [party, setParty] = useState({ id: null, name: "" });
  const [billNo, setBillNo] = useState("");
  const [touched, setTouched] = useState(false);
  const [pan, setPan] = useState("");
  const [address, setAddress] = useState("");
  const [lines, setLines] = useState([newLine()]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discount, setDiscount] = useState("");
  const [showVat, setShowVat] = useState(false);
  const [vatPercent, setVatPercent] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const suggested = useMemo(() => nextBillNo(books.transactions, type), [books.transactions, type]);
  useEffect(() => { if (!touched) setBillNo(suggested); }, [suggested, touched]);

  const t = billTotals(lines, discount, showVat ? vatPercent : 0);
  const discountPct = t.subtotal > 0 && t.discount > 0 ? ((t.discount / t.subtotal) * 100).toFixed(1) : null;
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickParty = (p) => {
    setParty({ id: p.id, name: p.name });
    if (p.party && !address) setAddress(p.party.address || "");
  };

  const onItemName = (key, value) => {
    const known = books.items.find((i) => i.name === value);
    setLine(key, known && known.rate != null ? { description: value, rate: String(known.rate) } : { description: value });
  };

  const toggleVat = () => {
    // VAT defaults to 0, not 13: a default of 13 silently baked VAT into every bill whose VAT row
    // was never opened. 13% fills in only when the user turns VAT on.
    if (!showVat) setVatPercent("13");
    else setVatPercent("0");
    setShowVat(!showVat);
  };

  const save = async () => {
    if (!party.id) return toast.error(`Every ${type} books against a real ${sale ? "customer" : "vendor"}'s ledger. Tap the ${sale ? "Customer" : "Vendor"} field and choose or add one.`);
    const good = lines.filter((l) => l.description.trim() && Number(l.qty) > 0 && Number(l.rate) >= 0 && l.rate !== "");
    if (!good.length) return toast.error("Add at least one item with a name, quantity and rate");
    if (!(t.total > 0)) return toast.error("The bill total must be above 0");
    setBusy(true);
    // Remember typed names for next time; a failure here must not lose the bill.
    let notRemembered = false;
    for (const l of good) {
      const exists = books.items.some((i) => i.name === l.description.trim() && Number(i.rate) === Number(l.rate));
      if (!exists && !(await post("/fin/items", { name: l.description.trim(), rate: Number(l.rate) }))) notRemembered = true;
    }
    const ok = await post("/fin/transactions", {
      type, amount: t.total, note, party_name: party.name, customer_id: party.id, bill_no: billNo, bill_date: date,
      party_address: address, vat_pan_no: pan, discount_amount: t.discount, vat_amount: t.vat,
      items: good.map((l) => ({ description: l.description.trim(), qty: Number(l.qty), rate: Number(l.rate), amount: Number(l.qty) * Number(l.rate) })),
      payment_mode: "cash", bank_account_id: null,
    });
    setBusy(false);
    if (!ok) return;
    toast.success(`${sale ? "Sale" : "Purchase"} saved${notRemembered ? ". Some item names were not remembered for next time." : ""}`);
    setParty({ id: null, name: "" }); setPan(""); setAddress(""); setLines([newLine()]); setDiscount(""); setShowDiscount(false);
    setShowVat(false); setVatPercent("0"); setNote(""); setTouched(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold" style={{ color }}>{sale ? "New sale bill" : "New purchase bill"}</h3>
        <p className="text-xs text-slate-500">{sale ? "A sale is a debt: it raises “to receive”, not your balance. The cash comes later as a Received entry." : "A purchase is a debt: it raises “to give”, not your balance. The cash goes out later as a Payment Out."}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <PartyPicker label={sale ? "Customer" : "Vendor"} parties={books.parties} id={party.id} name={party.name}
            onChange={pickParty} onCreate={(name) => post("/fin/parties", { name })} />
        </div>
        <DateField value={date} onChange={setDate} />
        <Field label="Bill No."><input value={billNo} onChange={(e) => { setBillNo(e.target.value); setTouched(true); }} className={inputCls} /></Field>
        <Field label="PAN / VAT no."><input value={pan} onChange={(e) => setPan(e.target.value)} className={inputCls} /></Field>
        <Field label="Address" className="lg:col-span-3"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
      </div>

      <div>
        <div className="hidden sm:grid grid-cols-[1fr_6rem_8rem_8rem_2.5rem] gap-2 text-xs font-semibold text-slate-500 px-1 mb-1"><span>Item</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span /></div>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-2 sm:grid-cols-[1fr_6rem_8rem_8rem_2.5rem] gap-2 items-center">
              <input list="fin-item-names" placeholder="Item name" value={l.description} onChange={(e) => onItemName(l.key, e.target.value)} className={`${inputCls} col-span-2 sm:col-span-1`} />
              <input type="number" min="0" placeholder="Qty" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={inputCls} />
              <input type="number" min="0" placeholder="Rate" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} className={inputCls} />
              <div className="text-right text-sm font-medium text-slate-700 px-1">{npr((Number(l.qty) || 0) * (Number(l.rate) || 0))}</div>
              <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1}
                className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center" aria-label="Remove item"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <datalist id="fin-item-names">{books.items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className={`${btnGhost} mt-3`}><Plus size={16} /> Add item</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} /></Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowDiscount(!showDiscount)} className={btnGhost}><Tags size={15} /> {showDiscount ? "Remove discount" : "Add discount"}</button>
            <button type="button" onClick={toggleVat} className={btnGhost}><Percent size={15} /> {showVat ? "Remove VAT" : "Add VAT"}</button>
          </div>
          {showDiscount && <Field label="Discount (NPR)" hint={discountPct ? `${discountPct}% of the subtotal` : undefined}><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} /></Field>}
          {showVat && <Field label="VAT %"><input type="number" min="0" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} className={inputCls} /></Field>}
        </div>
        <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 text-sm self-start">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{npr(t.subtotal)}</span></div>
          {t.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>− {npr(t.discount)}</span></div>}
          {showVat && <div className="flex justify-between"><span className="text-slate-500">VAT ({vatPercent || 0}%)</span><span>+ {npr(t.vat)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold" style={{ color }}><span>Total</span><span>{npr(t.total)}</span></div>
          <button onClick={save} disabled={busy} className={`${btnPrimary} w-full mt-3`}>{busy ? "Saving…" : `Save ${type}`}</button>
        </div>
      </div>
    </Card>
  );
}

// ── Expense categories, managed inline: create, rename, delete ────────────
function CategoryManager({ onClose }) {
  const { books, post, put, del } = useBooks();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState({});
  return (
    <Modal title="Expense categories" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className={inputCls} />
          <button className={btnPrimary} disabled={!name.trim()} onClick={async () => { if (await post("/fin/categories", { name })) setName(""); }}>Add</button>
        </div>
        {books.categories.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
        {books.categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input value={renaming[c.id] ?? c.name} onChange={(e) => setRenaming({ ...renaming, [c.id]: e.target.value })} className={inputCls} />
            {renaming[c.id] !== undefined && renaming[c.id] !== c.name && (
              <button className={btnGhost} onClick={async () => { if (await put(`/fin/categories/${c.id}`, { name: renaming[c.id] }, "Renamed")) setRenaming({ ...renaming, [c.id]: undefined }); }}>Save</button>
            )}
            <TwoTapDelete label="Delete" onConfirm={() => del(`/fin/categories/${c.id}`, "Deleted")} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Expense: paid on the spot. Several payees at once on a wide screen ────
function ExpenseForm() {
  const { books, post } = useBooks();
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState(null);
  const [rows, setRows] = useState([newExpenseRow()]);
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const save = async () => {
    const todo = rows.filter((r) => r.payee.trim() || r.amount);
    if (!todo.length) return toast.error("Add a payee and an amount");
    if (todo.some((r) => !r.payee.trim() || !(Number(r.amount) > 0))) return toast.error("Every row needs a payee and an amount above 0");
    setBusy(true);
    let saved = 0;
    for (const r of todo) {
      const ok = await post("/fin/transactions", {
        type: "expense", amount: Number(r.amount), note: r.note, party_name: r.payee.trim(), bill_date: date,
        expense_category_id: r.category_id || null, bank_account_id: method, payment_mode: method ? "bank" : "cash",
      });
      if (!ok) break;
      saved += 1;
      setRows((rs) => rs.filter((x) => x.key !== r.key)); // a saved row leaves the table so a retry can't double-record
    }
    setBusy(false);
    if (saved === todo.length) { toast.success(saved === 1 ? "Expense saved" : `${saved} expenses saved`); setRows([newExpenseRow()]); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold" style={{ color: COLORS.out }}>New expense</h3>
        <p className="text-xs text-slate-500">An expense is paid on the spot, so it reduces your balance right away.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <DateField value={date} onChange={setDate} />
        <AccountSelect value={method} onChange={setMethod} accounts={books.accounts} />
      </div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="grid sm:grid-cols-[1fr_12rem_9rem_1fr_auto] gap-3 items-end">
            <Field label={i === 0 ? "Paid to" : ""}><input value={r.payee} onChange={(e) => setRow(r.key, { payee: e.target.value })} className={inputCls} placeholder="Payee name" /></Field>
            <Field label={i === 0 ? "Category" : ""}>
              <select value={r.category_id} onChange={(e) => setRow(r.key, { category_id: e.target.value })} className={inputCls}>
                <option value="">No category</option>
                {books.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={i === 0 ? "Amount (NPR)" : ""}><input type="number" min="0" value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} className={inputCls} /></Field>
            <Field label={i === 0 ? "Note" : ""}><input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} className={inputCls} /></Field>
            <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))} disabled={rows.length === 1}
              className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center" aria-label="Remove row"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setRows((rs) => [...rs, newExpenseRow()])} className={btnGhost}><Plus size={16} /> Add another</button>
          <button type="button" onClick={() => setManage(true)} className={btnGhost}><Tags size={15} /> Categories</button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">Total <b style={{ color: COLORS.out }}>{npr(total)}</b></span>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      {manage && <CategoryManager onClose={() => setManage(false)} />}
    </Card>
  );
}

export default function Bills({ type }) {
  return (
    <div className="space-y-5">
      {type === "expense" ? <ExpenseForm /> : <ItemisedBill type={type} />}
      <Feed defaultFilter={type} title={type === "sale" ? "Sales and related entries" : type === "purchase" ? "Purchases and related entries" : "Expenses and related entries"} />
    </div>
  );
}
