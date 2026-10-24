import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import Feed from "./Feed";
import { Card, Field, DateField, AccountSelect, PartyPicker, inputCls, btnPrimary, btnGhost } from "./ui";
import { todayStr, nextReceiptNo, COLORS } from "./money";

let rowSeq = 0;
const newRow = () => ({ key: ++rowSeq, party: { id: null, name: "" }, amount: "", note: "" });

// One form, two directions -- and the direction decides the table, which is the bug this design
// exists to prevent:  Received -> customer ledger credit;  Payment Out -> VENDOR ledger credit.
// (Booking a payment out as a customer debit would inflate "to receive" for someone you only ever
// bought from.) One date, one number and one payment method, several people and amounts at once.
export default function Payment({ direction }) {
  const received = direction === "received";
  const { books, post } = useBooks();
  const side = received ? "customer" : "vendor";
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState(null);
  const [rows, setRows] = useState([newRow()]);
  const [number, setNumber] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Numbers continue from the highest one already used IN THIS DIRECTION; stop auto-filling the
  // moment the user types in the field.
  const used = useMemo(
    () => (received ? books.customer_ledger : books.vendor_ledger).filter((e) => e.entry_type === "credit" && e.source === "manual"),
    [books, received],
  );
  const suggested = useMemo(() => nextReceiptNo(used), [used]);
  useEffect(() => { if (!touched) setNumber(suggested); }, [suggested, touched]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const resolveParty = async (p) => {
    if (p.id) return p.id;
    const name = p.name.trim();
    const existing = books.parties.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    // Typing a name that isn't saved creates the party on save: a payment must link to a real id.
    const created = await post("/fin/parties", { name });
    return created?.id || null;
  };

  const save = async () => {
    const todo = rows.filter((r) => r.party.name.trim() || r.amount);
    if (!todo.length) return toast.error("Add a person and an amount");
    if (todo.some((r) => !r.party.name.trim() || !(Number(r.amount) > 0))) return toast.error("Every row needs a name and an amount above 0");
    setBusy(true);
    let saved = 0;
    for (const r of todo) {
      const partyId = await resolveParty(r.party);
      if (!partyId) break;
      const ok = await post(`/fin/ledger/${side}`, {
        party_id: partyId, entry_type: "credit", amount: Number(r.amount), note: r.note,
        bank_account_id: method, entry_date: date, receipt_no: number,
      });
      if (!ok) break;
      saved += 1;
      setRows((rs) => rs.filter((x) => x.key !== r.key)); // a saved row leaves the table, so a retry can't double-record
    }
    setBusy(false);
    if (saved === todo.length) {
      toast.success(saved === 1 ? "Saved" : `${saved} entries saved`);
      setRows([newRow()]); setTouched(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-base font-bold" style={{ color: received ? COLORS.in : COLORS.out }}>{received ? "Received (money in)" : "Payment Out (money out to a vendor)"}</h3>
          <p className="text-xs text-slate-500">{received ? "Someone paid you. It reduces what they owe you." : "You paid someone you buy from. It reduces what you owe them."}</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <DateField value={date} onChange={setDate} />
          <Field label={received ? "Receipt No." : "Payment No."}><input value={number} onChange={(e) => { setNumber(e.target.value); setTouched(true); }} className={inputCls} /></Field>
          <AccountSelect value={method} onChange={setMethod} accounts={books.accounts} />
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.key} className="grid sm:grid-cols-[1fr_9rem_1fr_auto] gap-3 items-end">
              <PartyPicker label={i === 0 ? (received ? "Received from" : "Paid to") : ""} parties={books.parties} id={r.party.id} name={r.party.name}
                onChange={(p) => setRow(r.key, { party: { id: p.id, name: p.name } })} />
              <Field label={i === 0 ? "Amount (NPR)" : ""}><input type="number" min="0" value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} className={inputCls} /></Field>
              <Field label={i === 0 ? "Note" : ""}><input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} className={inputCls} /></Field>
              <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))} disabled={rows.length === 1}
                className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center" aria-label="Remove row"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className={btnGhost}><Plus size={16} /> Add another person</button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">Total <b style={{ color: received ? COLORS.in : COLORS.out }}>NPR {Math.round(total).toLocaleString("en-IN")}</b></span>
            <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </Card>
      <Feed defaultFilter={received ? "received" : "paid"} title={received ? "Money received" : "Payments out"} />
    </div>
  );
}
