import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Percent, Tags } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import Feed from "./Feed";
import { Card, Field, Modal, DateField, AccountSelect, PartyPicker, TwoTapDelete, BsUnder, inputCls, btnPrimary, btnGhost } from "./ui";
import { todayStr, billTotals, nextBillNo, npr, COLORS } from "./money";

let seq = 0;
const newLine = () => ({ key: ++seq, description: "", qty: "1", rate: "" });
const newService = () => ({ key: ++seq, name: "", amount: "" });
const newExpenseRow = () => ({ key: ++seq, payee: "", category_id: "", amount: "", note: "" });
const GROUP_LABEL = { direct: "Direct", indirect: "Indirect" };

// ── Services on a bill: what was sold (labour, repair ...) or bought in (outsourced work) ──
// No item or stock behind them. Amount sits under the items' Amount column so the two tables line up.
function ServicesTable({ rows, onChange, bought, names }) {
  const set = (key, patch) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.name.trim() && Number(r.amount) > 0).length;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 px-1 mb-1">
        {bought ? "Services bought (outsourced work)" : "Services (labour, repair, installation)"}
        {filled > 0 ? ` · ${filled} ${filled === 1 ? "line" : "lines"}` : " (optional)"}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} data-row={r.key} className="grid grid-cols-2 sm:grid-cols-[1fr_6rem_8rem_8rem_2.5rem] gap-2 items-center">
            <input list="fin-service-names" data-enter="svc-name" placeholder={bought ? "Work done by outside staff" : "Service name"} value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-3`} />
            <input type="number" min="0" data-enter="svc-amount" placeholder="Amount" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} className={`${inputCls} text-right`} />
            <button type="button" onClick={() => onChange(rows.length > 1 ? rows.filter((x) => x.key !== r.key) : [newService()])}
              className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center" aria-label="Remove service"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <datalist id="fin-service-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <button type="button" onClick={() => onChange([...rows, newService()])} className={`${btnGhost} mt-3`}><Plus size={16} /> Add service</button>
    </div>
  );
}

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
  const [services, setServices] = useState([newService()]);
  const [discount, setDiscount] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [vatTyped, setVatTyped] = useState(false);   // the user set VAT by hand: stop filling it in
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const focusAfterAdd = useRef(null);                // the field to focus once a new row has rendered

  const suggested = useMemo(() => nextBillNo(books.transactions, type), [books.transactions, type]);
  useEffect(() => { if (!touched) setBillNo(suggested); }, [suggested, touched]);

  // Service names used on earlier bills of either kind, offered again.
  const serviceNames = useMemo(() => [...new Set(books.transactions.flatMap((x) => (x.service_charges || []).map((s) => s.name)).filter(Boolean))].sort(), [books.transactions]);

  const t = billTotals(lines, discount, vatPercent, services);
  const discountPct = t.subtotal > 0 && t.discount > 0 ? ((t.discount / t.subtotal) * 100).toFixed(1) : null;
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // VAT is never on by default (a silent 13% would bake VAT into every bill). It fills in at 13% when the
  // bill carries a PAN / VAT no. -- a VAT-registered party -- and clears when the PAN is removed, until
  // the user types a VAT % themselves.
  useEffect(() => { if (!vatTyped) setVatPercent(pan.trim() ? "13" : ""); }, [pan, vatTyped]);

  const pickParty = (p) => {
    setParty({ id: p.id, name: p.name });
    if (!p.id) return;
    // The party's details from their latest bill: its PAN (which turns VAT on) and address.
    const last = books.transactions.filter((x) => x.customer_id === p.id && x.type !== "expense")
      .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? 1 : -1))[0];
    if (!pan && last?.vat_pan_no) setPan(last.vat_pan_no);
    if (!address) setAddress(p.party?.address || last?.party_address || "");
  };

  const onItemName = (key, value) => {
    const known = books.items.find((i) => i.name === value);
    setLine(key, known && known.rate != null ? { description: value, rate: String(known.rate) } : { description: value });
  };

  // Enter walks the form: party, date, bill no., PAN, address, then item name / qty / rate. Enter on the
  // last rate of a filled row adds a new row; Enter on an empty item name goes to the services, and on an
  // empty service name to discount and VAT, then to Save (where Enter saves).
  useEffect(() => {
    if (!focusAfterAdd.current) return;
    const all = formRef.current?.querySelectorAll(`[data-enter="${focusAfterAdd.current}"]`);
    all?.[all.length - 1]?.focus();
    focusAfterAdd.current = null;
  }, [lines, services]);

  const onEnter = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = e.target;
    const role = el.dataset?.enter;
    if (!role || el.tagName === "BUTTON" || el.tagName === "TEXTAREA") return;
    e.preventDefault();
    const fields = [...formRef.current.querySelectorAll("[data-enter]")];
    const jump = (r) => fields.find((f) => f.dataset.enter === r)?.focus();
    const row = el.closest("[data-row]");
    const lastRow = row && !row.nextElementSibling;
    const rowKey = row && Number(row.dataset.row);
    if (role === "item-name" && !el.value.trim()) return jump("svc-name");
    if (role === "svc-name" && !el.value.trim()) return jump("discount");
    if (role === "item-rate" && lastRow) {
      const l = lines.find((x) => x.key === rowKey);
      if (l?.description.trim() && l.rate !== "") { focusAfterAdd.current = "item-name"; setLines((ls) => [...ls, newLine()]); return; }
    }
    if (role === "svc-amount" && lastRow) {
      const s = services.find((x) => x.key === rowKey);
      if (s?.name.trim() && Number(s.amount) > 0) { focusAfterAdd.current = "svc-name"; setServices((ss) => [...ss, newService()]); return; }
    }
    fields[fields.indexOf(el) + 1]?.focus();
  };

  const save = async () => {
    if (!party.id) return toast.error(`Every ${type} books against a real ${sale ? "customer" : "vendor"}'s ledger. Tap the ${sale ? "Customer" : "Vendor"} field and choose or add one.`);
    const good = lines.filter((l) => l.description.trim() && Number(l.qty) > 0 && Number(l.rate) >= 0 && l.rate !== "");
    const goodServices = services.filter((s) => s.name.trim() && Number(s.amount) > 0);
    if (services.some((s) => s.name.trim() && !(Number(s.amount) > 0))) return toast.error("Every service needs an amount above 0");
    if (!good.length && !goodServices.length) return toast.error("Add at least one item with a name, quantity and rate, or a service");
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
      service_charges: goodServices.map((s) => ({ name: s.name.trim(), amount: Number(s.amount) })),
      payment_mode: "cash", bank_account_id: null,
    });
    setBusy(false);
    if (!ok) return;
    toast.success(`${sale ? "Sale" : "Purchase"} saved${notRemembered ? ". Some item names were not remembered for next time." : ""}`);
    setParty({ id: null, name: "" }); setPan(""); setAddress(""); setLines([newLine()]); setServices([newService()]); setDiscount("");
    setVatPercent(""); setVatTyped(false); setNote(""); setTouched(false);
    formRef.current?.querySelector('[data-enter="party"]')?.focus();
  };

  return (
    <Card className="p-5">
      <div ref={formRef} onKeyDown={onEnter} className="space-y-4">
      <div>
        <h3 className="text-base font-bold" style={{ color }}>{sale ? "New sale bill" : "New purchase bill"}</h3>
        <p className="text-xs text-slate-500">{sale ? "A sale is a debt: it raises “to receive”, not your balance. The cash comes later as a Received entry." : "A purchase is a debt: it raises “to give”, not your balance. The cash goes out later as a Payment Out."}</p>
        <p className="fin-no-print text-xs text-slate-400 mt-1">Press Enter to move to the next box. Enter on an empty item name jumps to services; on an empty service name, to discount and VAT.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <PartyPicker label={sale ? "Customer" : "Vendor"} parties={books.parties} id={party.id} name={party.name} enterKey="party"
            onChange={pickParty} onCreate={(name) => post("/fin/parties", { name })} />
        </div>
        <Field label="Date">
          <input type="date" data-enter="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          <BsUnder date={date} />
        </Field>
        <Field label="Bill No."><input data-enter="bill-no" value={billNo} onChange={(e) => { setBillNo(e.target.value); setTouched(true); }} className={inputCls} /></Field>
        <Field label="PAN / VAT no." hint="Filling this in adds 13% VAT"><input data-enter="pan" value={pan} onChange={(e) => setPan(e.target.value)} className={inputCls} /></Field>
        <Field label="Address" className="lg:col-span-3"><input data-enter="address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
      </div>

      <div>
        <div className="hidden sm:grid grid-cols-[1fr_6rem_8rem_8rem_2.5rem] gap-2 text-xs font-semibold text-slate-500 px-1 mb-1"><span>Item</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span /></div>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.key} data-row={l.key} className="grid grid-cols-2 sm:grid-cols-[1fr_6rem_8rem_8rem_2.5rem] gap-2 items-center">
              <input list="fin-item-names" data-enter="item-name" placeholder="Item name" value={l.description} onChange={(e) => onItemName(l.key, e.target.value)} className={`${inputCls} col-span-2 sm:col-span-1`} />
              <input type="number" min="0" data-enter="item-qty" placeholder="Qty" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={inputCls} />
              <input type="number" min="0" data-enter="item-rate" placeholder="Rate" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} className={inputCls} />
              <div className="text-right text-sm font-medium text-slate-700 px-1">{npr((Number(l.qty) || 0) * (Number(l.rate) || 0))}</div>
              <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={lines.length === 1}
                className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center" aria-label="Remove item"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <datalist id="fin-item-names">{books.items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className={`${btnGhost} mt-3`}><Plus size={16} /> Add item</button>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <ServicesTable rows={services} onChange={setServices} bought={!sale} names={serviceNames} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (NPR)" hint={discountPct ? `${discountPct}% of the subtotal` : undefined}>
              <input type="number" min="0" data-enter="discount" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
            </Field>
            <Field label="VAT %" hint={vatTyped ? "Set by you" : pan.trim() ? "13% added for the PAN / VAT no." : "No PAN, so no VAT. Type 13 to add it."}>
              <div className="flex gap-2">
                <input type="number" min="0" data-enter="vat" placeholder="0" value={vatPercent} onChange={(e) => { setVatPercent(e.target.value); setVatTyped(true); }} className={inputCls} />
                <button type="button" onClick={() => { setVatPercent(Number(vatPercent) > 0 ? "" : "13"); setVatTyped(true); }} className={`${btnGhost} px-3 shrink-0`} title={Number(vatPercent) > 0 ? "Remove VAT" : "Add 13% VAT"}>
                  <Percent size={15} /> {Number(vatPercent) > 0 ? "Off" : "13"}
                </button>
              </div>
            </Field>
          </div>
          <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} /></Field>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 text-sm self-start">
          {t.services > 0 && (
            <>
              <div className="flex justify-between"><span className="text-slate-500">Items</span><span>{npr(t.items)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Services</span><span>+ {npr(t.services)}</span></div>
            </>
          )}
          <div className="flex justify-between"><span className="text-slate-500">{t.services > 0 ? "Subtotal (items + services)" : "Subtotal"}</span><span>{npr(t.subtotal)}</span></div>
          {t.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>− {npr(t.discount)}</span></div>}
          {Number(vatPercent) > 0 && <div className="flex justify-between"><span className="text-slate-500">VAT ({vatPercent}%)</span><span>+ {npr(t.vat)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold" style={{ color }}><span>Total</span><span>{npr(t.total)}</span></div>
          <button onClick={save} disabled={busy} data-enter="save" className={`${btnPrimary} w-full mt-3`}>{busy ? "Saving…" : `Save ${type}`}</button>
        </div>
      </div>
      </div>
    </Card>
  );
}

// ── Expense categories, managed inline: create, rename, delete ────────────
function CategoryManager({ onClose }) {
  const { books, post, put, del } = useBooks();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("direct");
  const [renaming, setRenaming] = useState({});
  const groupSelect = (value, onChange) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-32 shrink-0`} aria-label="Expense group">
      {Object.entries(GROUP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  return (
    <Modal title="Expense categories" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Direct expenses are a cost of the goods or jobs (freight, labour, repair) and come off before gross profit. Indirect expenses (rent, salary, electricity) come off after it, to the net profit.</p>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className={inputCls} />
          {groupSelect(group, setGroup)}
          <button className={btnPrimary} disabled={!name.trim()} onClick={async () => { if (await post("/fin/categories", { name, expense_group: group })) { setName(""); setGroup("direct"); } }}>Add</button>
        </div>
        {books.categories.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
        {books.categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input value={renaming[c.id] ?? c.name} onChange={(e) => setRenaming({ ...renaming, [c.id]: e.target.value })} className={inputCls} />
            {groupSelect(c.expense_group === "indirect" ? "indirect" : "direct", (g) => put(`/fin/categories/${c.id}`, { name: c.name, expense_group: g }, `${c.name} is now ${GROUP_LABEL[g].toLowerCase()}`))}
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
