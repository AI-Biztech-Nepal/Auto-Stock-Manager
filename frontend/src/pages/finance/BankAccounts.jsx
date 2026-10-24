import { useMemo, useState } from "react";
import { Plus, Landmark, Banknote, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Field, Modal, DateField, Empty, TwoTapDelete, inputCls, btnPrimary, btnGhost } from "./ui";
import { balances, transferDate, todayStr, npr, CASH, COLORS } from "./money";

// The lines behind one account's balance, so a wrong total can be traced.
export function AccountLines({ title, bucket, onClose }) {
  const lines = [...(bucket?.lines || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="flex justify-between text-sm mb-3"><span className="text-slate-500">{lines.length} entries</span><span className="font-bold" style={{ color: (bucket?.total || 0) < 0 ? COLORS.out : COLORS.balance }}>{npr(bucket?.total || 0)}</span></div>
      {lines.length === 0 ? <Empty>Nothing has moved through here yet.</Empty> : (
        <div className="divide-y divide-slate-100">
          {lines.map((l, i) => (
            <div key={i} className="py-2 flex items-center gap-3 text-sm">
              <span className="text-xs text-slate-400 w-24 shrink-0">{l.date}</span>
              <span className="flex-1 min-w-0 truncate text-slate-700">{l.label}</span>
              <span className="font-semibold shrink-0" style={{ color: l.amount >= 0 ? COLORS.in : COLORS.out }}>{l.amount >= 0 ? "+" : "−"}{npr(Math.abs(l.amount)).replace("NPR ", "")}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AccountForm({ account, onClose }) {
  const { post, put } = useBooks();
  const [f, setF] = useState({ name: account?.name || "", bank_name: account?.bank_name || "", account_number: account?.account_number || "", account_holder_name: account?.account_holder_name || "", address: account?.address || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return toast.error("Account name is required");
    setBusy(true);
    const ok = account ? await put(`/fin/accounts/${account.id}`, f, "Saved") : await post("/fin/accounts", f, "Account added");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal title={account ? "Edit account" : "Add bank account"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name *" hint="Shown in dropdowns, for example “Nabil”"><input value={f.name} onChange={set("name")} className={inputCls} autoFocus /></Field>
        <Field label="Bank name"><input value={f.bank_name} onChange={set("bank_name")} className={inputCls} /></Field>
        <Field label="Account number"><input value={f.account_number} onChange={set("account_number")} className={inputCls} /></Field>
        <Field label="Account holder"><input value={f.account_holder_name} onChange={set("account_holder_name")} className={inputCls} /></Field>
        <Field label="Branch / address"><input value={f.address} onChange={set("address")} className={inputCls} /></Field>
        <div className="flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy} className={btnPrimary}>Save</button></div>
      </div>
    </Modal>
  );
}

function TransferForm({ onDone }) {
  const { books, post } = useBooks();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(books.accounts[0]?.id || null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const options = [{ id: "", name: "Cash" }, ...books.accounts];
  const save = async () => {
    if ((from || null) === (to || null)) return toast.error("Choose two different accounts");
    if (!(Number(amount) > 0)) return toast.error("Amount must be above 0");
    setBusy(true);
    const ok = await post("/fin/transfers", { from_account_id: from, to_account_id: to, amount: Number(amount), note, transfer_date: date }, "Transfer saved");
    setBusy(false);
    if (ok) { setAmount(""); setNote(""); onDone?.(); }
  };
  const pick = (label, value, onChange) => (
    <Field label={label}><select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
  );
  return (
    <Card className="p-5 space-y-4">
      <div><h3 className="text-base font-bold" style={{ color: COLORS.transfer }}>Transfer between your accounts</h3><p className="text-xs text-slate-500">Moves your own money. One account goes down, the other goes up, and your total does not change.</p></div>
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        {pick("From", from, setFrom)}
        {pick("To", to, setTo)}
        <Field label="Amount (NPR)"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
        <DateField value={date} onChange={setDate} />
      </div>
      <div className="flex gap-3 items-end"><Field label="Note" className="flex-1"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field><button onClick={save} disabled={busy} className={btnPrimary}><ArrowRightLeft size={16} /> Transfer</button></div>
    </Card>
  );
}

export default function BankAccounts() {
  const { books, del } = useBooks();
  const [form, setForm] = useState(null);       // null | "new" | account
  const [lines, setLines] = useState(null);     // { title, bucket }
  const [editing, setEditing] = useState(null); // a transfer row
  const bal = useMemo(() => balances(books), [books]);
  const transfers = useMemo(() => [...books.transfers].sort((a, b) => (transferDate(a) < transferDate(b) ? 1 : -1)), [books.transfers]);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button onClick={() => setLines({ title: "Cash in hand", bucket: bal.buckets[CASH] })} className="text-left bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Banknote size={14} /> Cash in hand</div>
          <div className="text-xl font-bold mt-1" style={{ color: bal.cash < 0 ? COLORS.out : COLORS.balance, fontFamily: "Manrope" }}>{npr(bal.cash)}</div>
        </button>
        {books.accounts.map((a) => {
          const total = bal.buckets[a.id]?.total || 0;
          return (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <button onClick={() => setLines({ title: a.name, bucket: bal.buckets[a.id] })} className="text-left w-full">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Landmark size={14} /> {a.name}</div>
                <div className="text-xl font-bold mt-1" style={{ color: total < 0 ? COLORS.out : COLORS.balance, fontFamily: "Manrope" }}>{npr(total)}</div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">{[a.bank_name, a.account_number].filter(Boolean).join(" · ") || "No details yet"}</div>
              </button>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setForm(a)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                <TwoTapDelete label="Delete" onConfirm={() => del(`/fin/accounts/${a.id}`, "Account deleted")} />
              </div>
            </div>
          );
        })}
        <button onClick={() => setForm("new")} className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-4 text-slate-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 text-sm font-semibold"><Plus size={16} /> Add bank account</button>
      </div>
      <p className="text-xs text-slate-400">Total available: <b style={{ color: COLORS.balance }}>{npr(bal.total)}</b>. Deleting an account moves its entries back to cash in hand and removes transfers that used it.</p>

      <TransferForm />

      <Card>
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Transfers</div>
        {transfers.length === 0 ? <Empty>No transfers yet.</Empty> : transfers.map((t) => (
          <button key={t.id} onClick={() => setEditing({ table: "tr", data: t })} className="w-full text-left px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50 flex items-center gap-3">
            <span className="text-xs text-slate-400 w-24 shrink-0">{transferDate(t)}</span>
            <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{(books.accounts.find((a) => a.id === t.from_account_id)?.name || "Cash")} → {(books.accounts.find((a) => a.id === t.to_account_id)?.name || "Cash")}{t.note ? <span className="text-slate-400"> · {t.note}</span> : null}</span>
            <span className="text-sm font-semibold" style={{ color: COLORS.transfer }}>{npr(t.amount)}</span>
          </button>
        ))}
      </Card>

      {form && <AccountForm account={form === "new" ? null : form} onClose={() => setForm(null)} />}
      {lines && <AccountLines title={lines.title} bucket={lines.bucket} onClose={() => setLines(null)} />}
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
