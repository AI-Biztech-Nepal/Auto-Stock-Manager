import { useMemo, useState } from "react";
import { Plus, Landmark, Banknote, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import AccountDetail from "./AccountDetail";
import { Card, Field, Modal, DateField, Empty, Stat, TwoTapDelete, inputCls, btnPrimary, btnGhost } from "./ui";
import { balances, transferDate, todayStr, npr, CASH, COLORS } from "./money";

function AccountForm({ account, onClose, isCash = false }) {
  const { books, post, put } = useBooks();
  const [f, setF] = useState({
    name: account?.name || "", bank_name: account?.bank_name || "", account_number: account?.account_number || "",
    account_holder_name: account?.account_holder_name || "", address: account?.address || "",
    opening_balance: account?.opening_balance ? String(account.opening_balance) : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  // The opening balance can be saved once the server has the column for it (/fin/books says so); until then the box is off.
  const canOpen = !!books.opening_ready;
  const save = async () => {
    if (!f.name.trim()) return toast.error("Account name is required");
    const opening = f.opening_balance.trim() === "" ? 0 : Number(f.opening_balance);
    if (canOpen && !Number.isFinite(opening)) return toast.error("Opening balance must be a number");
    const { opening_balance: _typed, ...details } = f;
    const body = canOpen ? { ...details, opening_balance: opening } : details;
    setBusy(true);
    // Cash is never a bank account row (cash is bank_account_id = null): its label and details are one row of their own.
    const ok = isCash ? await put("/fin/cash-account", body, "Saved")
      : account ? await put(`/fin/accounts/${account.id}`, body, "Saved") : await post("/fin/accounts", body, "Account added");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal title={isCash ? "Edit cash account" : account ? "Edit account" : "Add bank account"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name *" hint={isCash ? "How cash in hand is labelled here, for example “Cash”" : "Shown in dropdowns, for example “Nabil”"}><input value={f.name} onChange={set("name")} className={inputCls} autoFocus /></Field>
        <Field label="Opening balance (NPR)"
          hint={canOpen ? "What was already in this account before your first entry here. Every day's opening balance builds on it. Use a minus sign if it is overdrawn." : "Needs one more database update on the server, which is applied when it restarts."}>
          <input type="number" step="any" value={f.opening_balance} onChange={set("opening_balance")} disabled={!canOpen} placeholder="0" className={inputCls} data-testid="account-opening-balance" />
        </Field>
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

// accountId: the account whose own page is open (CASH or a bank account's id; from ?account=), or null for the list of accounts.
// setAccountId: opens / closes an account's page. openParty: opens a person's ledger (from an entry on an account's page).
export default function BankAccounts({ accountId, setAccountId, openParty }) {
  const { books, del } = useBooks();
  const [form, setForm] = useState(null);       // null | "new" | "cash" | account
  const [editing, setEditing] = useState(null); // a transfer row
  const bal = useMemo(() => balances(books), [books]);
  const cash = books.cash_account || {};
  const cashName = cash.name || "Cash in hand";
  const transfers = useMemo(() => [...books.transfers].sort((a, b) => (transferDate(a) < transferDate(b) ? 1 : -1)), [books.transfers]);

  const forms = (
    <>
      {form === "cash" && <AccountForm account={{ ...cash, name: cashName }} isCash onClose={() => setForm(null)} />}
      {form && form !== "cash" && <AccountForm account={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </>
  );

  // An account's own page: every entry that moved money through it
  const openAccount = accountId === CASH ? CASH : books.accounts.find((a) => a.id === accountId)?.id;
  if (openAccount) {
    return (
      <>
        <AccountDetail bucket={openAccount} onBack={() => setAccountId(null)} openParty={openParty}
          onEdit={() => setForm(openAccount === CASH ? "cash" : books.accounts.find((a) => a.id === openAccount))} />
        {forms}
      </>
    );
  }

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
          <button onClick={() => setAccountId(CASH)} className="text-left w-full" data-testid="account-card-cash">
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
              <button onClick={() => setAccountId(a.id)} className="text-left w-full" data-testid="account-card">
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

      {forms}
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
