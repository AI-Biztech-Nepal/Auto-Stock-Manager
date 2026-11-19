import { useMemo, useState } from "react";
import { Plus, Landmark, Banknote, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Field, Modal, DateField, Empty, Stat, TwoTapDelete, inputCls, btnPrimary, btnGhost } from "./ui";
import { balances, accountDays, accountChoices, transferDate, todayStr, addDays, npr, num, CASH, COLORS } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

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

function AccountForm({ account, onClose, isCash = false }) {
  const { post, put } = useBooks();
  const [f, setF] = useState({ name: account?.name || "", bank_name: account?.bank_name || "", account_number: account?.account_number || "", account_holder_name: account?.account_holder_name || "", address: account?.address || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return toast.error("Account name is required");
    setBusy(true);
    // Cash is never a bank account row (cash is bank_account_id = null): its label and details are one row of their own.
    const ok = isCash ? await put("/fin/cash-account", f, "Saved")
      : account ? await put(`/fin/accounts/${account.id}`, f, "Saved") : await post("/fin/accounts", f, "Account added");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal title={isCash ? "Edit cash account" : account ? "Edit account" : "Add bank account"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name *" hint={isCash ? "How cash in hand is labelled here, for example “Cash”" : "Shown in dropdowns, for example “Nabil”"}><input value={f.name} onChange={set("name")} className={inputCls} autoFocus /></Field>
        <Field label="Bank name"><input value={f.bank_name} onChange={set("bank_name")} className={inputCls} /></Field>
        <Field label="Account number"><input value={f.account_number} onChange={set("account_number")} className={inputCls} /></Field>
        <Field label="Account holder"><input value={f.account_holder_name} onChange={set("account_holder_name")} className={inputCls} /></Field>
        <Field label="Branch / address"><input value={f.address} onChange={set("address")} className={inputCls} /></Field>
        <div className="flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy} className={btnPrimary}>Save</button></div>
      </div>
    </Modal>
  );
}

export function TransferForm({ onDone }) {
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

// One account, day by day: for every day that has entries, what the account held when the day began (its opening balance), the
// money in and out, and what it held at the end. Worked out from the entries, newest day first.
function DayByDay() {
  const { books } = useBooks();
  const choices = useMemo(() => accountChoices(books, "Cash in hand"), [books]);
  const [acct, setAcct] = useState(CASH);
  const [from, setFrom] = useState(() => addDays(todayStr(), -30));
  const [to, setTo] = useState(todayStr());
  const picked = choices.some((c) => c.id === acct) ? acct : CASH; // an account that was deleted falls back to cash
  const book = useMemo(() => accountDays(books, picked, from, to), [books, picked, from, to]);
  const days = [...book.days].reverse();
  const tone = (n) => (n < 0 ? COLORS.out : COLORS.balance);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <div>
          <div className="text-sm font-semibold text-slate-800">Day by day</div>
          <div className="text-xs text-slate-500">Each day's opening balance, money in and out, and closing balance.</div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Account">
            <select value={picked} onChange={(e) => setAcct(e.target.value)} className={`${inputCls} !w-auto min-w-[10rem]`} data-testid="dayby-account">
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </div>
      </div>
      {days.length === 0 ? <Empty>Nothing moved through this account in these days.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="dayby-table">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 text-right font-semibold">Opening balance</th>
                <th className="px-4 py-2 text-right font-semibold">Money in</th>
                <th className="px-4 py-2 text-right font-semibold">Money out</th>
                <th className="px-4 py-2 text-right font-semibold">Closing balance</th>
                <th className="px-4 py-2 text-right font-semibold">Entries</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-slate-100" data-testid="dayby-row">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatBSDate(d.date)}<div className="text-[11px] text-slate-400">{d.date}</div></td>
                  <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: tone(d.opening) }}>{num(d.opening)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color: COLORS.in }}>{d.in ? num(d.in) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color: COLORS.out }}>{d.out ? num(d.out) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: tone(d.closing) }}>{num(d.closing)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
        Opening on {from}: <b style={{ color: tone(book.opening) }}>{npr(book.opening)}</b> · closing on {to}: <b style={{ color: tone(book.closing) }}>{npr(book.closing)}</b>.
        A day with no entries is left out: it opens and closes on the day before's closing balance.
      </p>
    </Card>
  );
}

export default function BankAccounts() {
  const { books, del } = useBooks();
  const [form, setForm] = useState(null);       // null | "new" | "cash" | account
  const [lines, setLines] = useState(null);     // { title, bucket }
  const [editing, setEditing] = useState(null); // a transfer row
  const bal = useMemo(() => balances(books), [books]);
  const cash = books.cash_account || {};
  const cashName = cash.name || "Cash in hand";
  const transfers = useMemo(() => [...books.transfers].sort((a, b) => (transferDate(a) < transferDate(b) ? 1 : -1)), [books.transfers]);

  return (
    <div className="space-y-5">
      {/* Bank Balances, as Finance Nepal heads it: everything available, the banks together, and cash */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Available balance (Cash + Banks)" value={bal.total} color={bal.total < 0 ? COLORS.out : COLORS.balance} />
        <Stat label="Bank total" value={bal.total - bal.cash} color={bal.total - bal.cash < 0 ? COLORS.out : COLORS.balance} />
        <Stat label="Cash" value={bal.cash} color={bal.cash < 0 ? COLORS.out : COLORS.balance} />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <button onClick={() => setLines({ title: cashName, bucket: bal.buckets[CASH] })} className="text-left w-full">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Banknote size={14} /> {cashName}</div>
            <div className="text-xl font-bold mt-1" style={{ color: bal.cash < 0 ? COLORS.out : COLORS.balance, fontFamily: "Manrope" }}>{npr(bal.cash)}</div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">{[cash.bank_name, cash.account_number, cash.account_holder_name, cash.address].filter(Boolean).join(" · ") || "No details yet"}</div>
          </button>
          <div className="mt-3"><button onClick={() => setForm("cash")} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button></div>
        </div>
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

      <DayByDay />

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

      {form === "cash" && <AccountForm account={{ ...cash, name: cashName }} isCash onClose={() => setForm(null)} />}
      {form && form !== "cash" && <AccountForm account={form === "new" ? null : form} onClose={() => setForm(null)} />}
      {lines && <AccountLines title={lines.title} bucket={lines.bucket} onClose={() => setLines(null)} />}
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
