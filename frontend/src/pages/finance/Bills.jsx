import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Percent, Tags, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import Feed from "./Feed";
import { Card, Field, Modal, DateField, AccountSelect, PartyPicker, TwoTapDelete, useConfirmSave, useAskNewParty, inputCls, btnPrimary, btnGhost, btnSave } from "./ui";
import { todayStr, billDate, partyName, billTotals, serviceLines, nextBillNo, balances, accountName, npr, COLORS } from "./money";

let seq = 0;
const newLine = () => ({ key: ++seq, description: "", qty: "1", rate: "" });
const newService = () => ({ key: ++seq, name: "", amount: "" });
const newExpenseRow = () => ({ key: ++seq, payee: "", category_id: "", amount: "", note: "" });

// The form's fields for a bill that is already saved, to change it (Edit on a Day Book entry). The VAT percentage is worked
// back from the VAT amount (billTotals takes it from the subtotal less the discount), so the bill totals the same again. A
// bill saved with no item lines (an older or imported one) gets one line holding its amount, so the total survives.
function fieldsOfBill(d, books, sale) {
  const discount = Number(d.discount_amount) || 0;
  const vat = Number(d.vat_amount) || 0;
  const services = (d.service_charges || []).map((s) => ({ key: ++seq, name: s.name || "", amount: String(s.amount ?? "") }));
  let lines = (d.items || []).map((i) => ({ key: ++seq, description: i.description || "", qty: String(i.qty ?? 1), rate: String(i.rate ?? "") }));
  if (!lines.length) {
    const subtotal = Number(d.amount) + discount - vat; // items + services, before the discount and VAT
    const itemsTotal = subtotal - services.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    lines = itemsTotal > 0 ? [{ key: ++seq, description: d.note || (sale ? "Sale" : "Purchase"), qty: "1", rate: String(itemsTotal) }] : [newLine()];
  }
  const base = Number(d.amount) - vat; // subtotal less discount: what VAT was charged on
  return {
    date: billDate(d), party: { id: d.customer_id || null, name: d.party_name || partyName(books, d.customer_id) },
    billNo: d.bill_no || "", pan: d.vat_pan_no || "", address: d.party_address || "", lines, services,
    showDiscount: discount > 0, discount: discount > 0 ? String(discount) : "",
    showVat: vat > 0, vatPercent: vat > 0 && base > 0 ? String(Math.round((vat / base) * 10000) / 100) : "0", note: d.note || "",
  };
}

// ── Sale / Purchase: an itemised bill against a SAVED party ───────────────
// `edit`: a saved bill to change instead of making a new one (the form opens filled in, saves over it and calls onDone).
function ItemisedBill({ type, edit = null, onDone }) {
  const { books, post, put } = useBooks();
  const sale = type === "sale";
  const color = sale ? COLORS.sale : COLORS.purchase;
  const [init] = useState(() => (edit ? fieldsOfBill(edit, books, sale) : null));
  const [date, setDate] = useState(init?.date ?? todayStr());
  const [party, setParty] = useState(init?.party ?? { id: null, name: "" });
  const [billNo, setBillNo] = useState(init?.billNo ?? "");
  const [touched, setTouched] = useState(!!edit); // an edited bill keeps its number: the next-number suggestion never replaces it
  const [pan, setPan] = useState(init?.pan ?? "");
  const [address, setAddress] = useState(init?.address ?? "");
  const [lines, setLines] = useState(init?.lines ?? [newLine()]);
  const [services, setServices] = useState(init?.services ?? []);
  const [showDiscount, setShowDiscount] = useState(init?.showDiscount ?? false);
  const [discount, setDiscount] = useState(init?.discount ?? "");
  const [showVat, setShowVat] = useState(init?.showVat ?? false);
  const [vatPercent, setVatPercent] = useState(init?.vatPercent ?? "0");
  const [note, setNote] = useState(init?.note ?? "");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmSave();
  const { askNewParty, dialog: newPartyDialog } = useAskNewParty(books.types_ready ? books.party_types : []);

  // A new customer / vendor is asked for their details and ledger type first, as Finance Nepal does.
  const createParty = async (name) => {
    const asked = await askNewParty({ name, kind: sale ? "customer" : "vendor" });
    if (!asked) return null;
    if (asked.phone && asked.phone.length !== 10) { toast.error("Phone must be 10 digits"); return null; }
    return post("/fin/parties", { name: asked.name, phone: asked.phone, ...(books.types_ready ? { party_type_id: asked.party_type_id } : {}) });
  };

  const suggested = useMemo(() => nextBillNo(books.transactions, type), [books.transactions, type]);
  useEffect(() => { if (!touched) setBillNo(suggested); }, [suggested, touched]);

  const t = billTotals(lines, discount, showVat ? vatPercent : 0, services);
  const discountPct = t.subtotal > 0 && t.discount > 0 ? ((t.discount / t.subtotal) * 100).toFixed(1) : null;
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setService = (key, patch) => setServices((ss) => ss.map((x) => (x.key === key ? { ...x, ...patch } : x)));

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
    const confirmed = await confirm({
      title: edit ? `Save the changes to this ${sale ? "sale" : "purchase"}?` : `Save this ${sale ? "sale" : "purchase"}?`,
      rows: [
        { label: sale ? "Customer" : "Vendor", value: party.name },
        ...(billNo.trim() ? [{ label: "Bill no.", value: billNo.trim() }] : []),
        { label: "Items", value: good.map((l) => l.description.trim()).join(", ") },
        ...(t.services > 0 ? [{ label: "Services (VAT and discount apply)", value: npr(t.services) }] : []),
        ...(t.discount > 0 ? [{ label: "Discount", value: `− ${npr(t.discount)}` }] : []),
        ...(t.vat > 0 ? [{ label: "VAT", value: `+ ${npr(t.vat)}` }] : []),
      ],
      total: { label: "Grand total", value: npr(t.total), color },
    });
    if (!confirmed) return;
    setBusy(true);
    // Remember typed names for next time; a failure here must not lose the bill.
    let notRemembered = false;
    for (const l of edit ? [] : good) { // an edited bill's lines are not added to the item suggestions again
      const exists = books.items.some((i) => i.name === l.description.trim() && Number(i.rate) === Number(l.rate));
      if (!exists && !(await post("/fin/items", { name: l.description.trim(), rate: Number(l.rate) }))) notRemembered = true;
    }
    const body = {
      type, amount: t.total, note, party_name: party.name, customer_id: party.id, bill_no: billNo, bill_date: date,
      party_address: address, vat_pan_no: pan, discount_amount: t.discount, vat_amount: t.vat,
      items: good.map((l) => ({ description: l.description.trim(), qty: Number(l.qty), rate: Number(l.rate), amount: Number(l.qty) * Number(l.rate) })),
      payment_mode: "cash", bank_account_id: null,
      service_charges: serviceLines(services).map((x) => ({ name: x.name.trim(), amount: Number(x.amount) })),
    };
    // Changing a bill keeps how it was settled (a vehicle sale's bill is a credit one); a new bill is entered as cash.
    const ok = edit
      ? await put(`/fin/transactions/${edit.id}`, { ...body, payment_mode: edit.payment_mode || "cash", bank_account_id: edit.bank_account_id || null }, "Saved")
      : await post("/fin/transactions", body);
    setBusy(false);
    if (!ok) return;
    if (edit) { onDone?.(); return; }
    toast.success(`${sale ? "Sale" : "Purchase"} saved${notRemembered ? ". Some item names were not remembered for next time." : ""}`);
    setParty({ id: null, name: "" }); setPan(""); setAddress(""); setLines([newLine()]); setServices([]); setDiscount(""); setShowDiscount(false);
    setShowVat(false); setVatPercent("0"); setNote(""); setTouched(false);
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold" style={{ color }} data-testid="bill-form-title">{edit ? (sale ? "Edit sale bill" : "Edit purchase bill") : sale ? "New sale bill" : "New purchase bill"}</h3>
        <p className="text-xs text-slate-500">{edit ? `Changing this bill also changes the debt it books on the ${sale ? "customer" : "vendor"}'s ledger.` : sale ? "A sale is a debt: it raises “to receive”, not your balance. The cash comes later as a Received entry." : "A purchase is a debt: it raises “to give”, not your balance. The cash goes out later as a Payment Out."}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <PartyPicker label={sale ? "Customer" : "Vendor"} parties={books.parties} id={party.id} name={party.name}
            onChange={pickParty} onCreate={createParty} />
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
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className={btnGhost}><Plus size={16} /> Add item</button>
          {books.services_ready && <button type="button" onClick={() => setServices((ss) => [...ss, newService()])} className={btnGhost} data-testid="add-service"><Wrench size={15} /> Add service</button>}
        </div>
        {services.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-500">{sale ? "Services (installation, repair, labour …)" : "Services bought in (outsourced work …)"}</div>
            {services.map((x) => (
              <div key={x.key} className="grid grid-cols-[1fr_8rem_2.5rem] gap-2 items-center">
                <input placeholder="Service name" value={x.name} onChange={(e) => setService(x.key, { name: e.target.value })} className={inputCls} />
                <input type="number" min="0" placeholder="Amount" value={x.amount} onChange={(e) => setService(x.key, { amount: e.target.value })} className={inputCls} />
                <button type="button" onClick={() => setServices((ss) => ss.filter((y) => y.key !== x.key))}
                  className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center" aria-label="Remove service"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
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
          {t.services > 0 && <div className="flex justify-between"><span className="text-slate-500">Items</span><span>{npr(t.items)}</span></div>}
          {t.services > 0 && <div className="flex justify-between"><span className="text-slate-500">Services</span><span>+ {npr(t.services)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{npr(t.subtotal)}</span></div>
          {t.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>− {npr(t.discount)}</span></div>}
          {showVat && <div className="flex justify-between"><span className="text-slate-500">VAT ({vatPercent || 0}%)</span><span>+ {npr(t.vat)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold" style={{ color }}><span>Total</span><span>{npr(t.total)}</span></div>
          <button onClick={save} disabled={busy} className={`${btnSave} w-full mt-3`} data-testid="bill-form-save">{busy ? "Saving…" : edit ? "Save changes" : `Save ${type}`}</button>
          {edit && <button type="button" onClick={onDone} className={`${btnGhost} w-full mt-2`} data-testid="bill-form-cancel">Cancel</button>}
        </div>
      </div>
      {confirmDialog}
      {newPartyDialog}
    </Card>
  );
}

// ── Expense categories, managed inline: create, rename, delete, Direct / Indirect ─
const GROUP_LABEL = { direct: "Direct", indirect: "Indirect" };

function CategoryManager({ onClose }) {
  const { books, post, put, del } = useBooks();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("direct");
  const [renaming, setRenaming] = useState({});
  // Shown only once the database has the expense_group column (books.groups_ready).
  const groupSelect = (value, onChange) => books.groups_ready && (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-32 shrink-0`} aria-label="Expense group">
      {Object.entries(GROUP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  return (
    <Modal title="Expense categories" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className={inputCls} />
          {groupSelect(group, setGroup)}
          <button className={btnPrimary} disabled={!name.trim()} onClick={async () => { if (await post("/fin/categories", { name, expense_group: group })) { setName(""); setGroup("direct"); } }}>Add</button>
        </div>
        {books.groups_ready && <p className="text-xs text-slate-500">Direct expenses are a cost of the goods or jobs (freight, labour, repair) and come off before gross profit. Indirect expenses (rent, salary, electricity) come off after it, to the net profit.</p>}
        {books.categories.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
        {books.categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input value={renaming[c.id] ?? c.name} onChange={(e) => setRenaming({ ...renaming, [c.id]: e.target.value })} className={inputCls} />
            {renaming[c.id] !== undefined && renaming[c.id] !== c.name && (
              <button className={btnGhost} onClick={async () => { if (await put(`/fin/categories/${c.id}`, { name: renaming[c.id] }, "Renamed")) setRenaming({ ...renaming, [c.id]: undefined }); }}>Save</button>
            )}
            {groupSelect(c.expense_group === "indirect" ? "indirect" : "direct", (g) => put(`/fin/categories/${c.id}`, { name: c.name, expense_group: g }, `${c.name} is now ${GROUP_LABEL[g].toLowerCase()}`))}
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
  const { confirm, dialog: confirmDialog } = useConfirmSave();
  const available = useMemo(() => balances(books).buckets, [books]);
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const save = async () => {
    const todo = rows.filter((r) => r.payee.trim() || r.amount);
    if (!todo.length) return toast.error("Add a payee and an amount");
    if (todo.some((r) => !r.payee.trim() || !(Number(r.amount) > 0))) return toast.error("Every row needs a payee and an amount above 0");
    const sum = todo.reduce((s, r) => s + Number(r.amount), 0);
    const catName = (id) => books.categories.find((c) => c.id === id)?.name;
    const ok = await confirm({
      title: todo.length === 1 ? "Save this expense?" : `Save these ${todo.length} expenses?`,
      rows: [
        ...todo.map((r) => ({ label: [r.payee.trim(), catName(r.category_id)].filter(Boolean).join(" · "), value: npr(Number(r.amount)) })),
        { label: "Paid via", value: accountName(books, method) },
      ],
      total: { label: "Total", value: npr(sum), color: COLORS.out },
    });
    if (!ok) return;
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
        <AccountSelect value={method} onChange={setMethod} accounts={books.accounts} available={available} />
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
          <button onClick={save} disabled={busy} className={btnSave}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
      {manage && <CategoryManager onClose={() => setManage(false)} />}
      {confirmDialog}
    </Card>
  );
}

// editId: a saved sale / purchase bill to change (the Day Book's Edit): the form opens filled in with it, and Save changes /
// Cancel go back through onDone. Without one (or when that bill is gone) it is the usual New bill form.
export default function Bills({ type, editId, onDone }) {
  const { books } = useBooks();
  const edit = editId && type !== "expense" ? books.transactions.find((t) => t.id === editId && t.type === type) || null : null;
  return (
    <div className="space-y-5">
      {type === "expense" ? <ExpenseForm /> : <ItemisedBill key={edit?.id || "new"} type={type} edit={edit} onDone={onDone} />}
      {!edit && <Feed defaultFilter={type} title={type === "sale" ? "Sales and related entries" : type === "purchase" ? "Purchases and related entries" : "Expenses and related entries"} />}
    </div>
  );
}
