import { useState } from "react";
import { useBooks } from "./BooksContext";
import { Modal, Field, DateField, AccountSelect, PartyPicker, TwoTapDelete, Notice, inputCls, btnPrimary, btnGhost } from "./ui";
import { entryDate, billDate, transferDate, partyName } from "./money";

const TITLES = { sale: "Sale bill", purchase: "Purchase bill", expense: "Expense" };

// Opens any entry in a sheet, with the same field layout as the payment forms. Which fields show
// depends on the row (bill / customer payment / vendor payment / transfer). Rows a bill posted
// (source != manual) open read-only with the reason, because the bill is what has to change.
export default function EntryEditor({ row, onClose }) {
  const { books, post, put, del } = useBooks();
  const d = row.data;
  const isTx = row.table === "tx";
  const isTransfer = row.table === "tr";
  const side = row.table === "cl" ? "customer" : "vendor";
  const readOnly = !isTx && !isTransfer && d.source !== "manual";

  const [date, setDate] = useState(isTx ? billDate(d) : isTransfer ? transferDate(d) : entryDate(d));
  const [amount, setAmount] = useState(String(d.amount ?? ""));
  const [note, setNote] = useState(d.note || "");
  const [number, setNumber] = useState((isTx ? d.bill_no : d.receipt_no) || "");
  const [account, setAccount] = useState(d.bank_account_id || null);
  const [discount, setDiscount] = useState(String(d.discount_amount || 0));
  const [party, setParty] = useState({ id: d.customer_id || null, name: d.party_name || partyName(books, d.customer_id) || "" });
  const [busy, setBusy] = useState(false);

  const title = isTx ? TITLES[d.type] : isTransfer ? "Transfer" : side === "customer" ? (d.entry_type === "credit" ? "Payment received" : "Refund paid") : "Payment out";
  const numberLabel = isTx ? "Bill No." : side === "customer" ? "Receipt No." : "Payment No.";

  const createParty = async (name) => post("/fin/parties", { name });

  const save = async () => {
    setBusy(true);
    let ok = null;
    if (isTx) {
      ok = await put(`/fin/transactions/${d.id}`, {
        type: d.type, amount: Number(amount), note, party_name: party.name || null, customer_id: party.id,
        bill_no: number, bill_date: date, party_address: d.party_address, vat_pan_no: d.vat_pan_no, items: d.items || [],
        discount_amount: Number(discount) || 0, vat_amount: d.vat_amount || 0, expense_category_id: d.expense_category_id,
        payment_mode: account ? "bank" : "cash", bank_account_id: account,
      }, "Saved");
    } else if (isTransfer) {
      ok = await put(`/fin/transfers/${d.id}`, {
        from_account_id: d.from_account_id, to_account_id: d.to_account_id, amount: Number(amount), note, transfer_date: date,
      }, "Saved");
    } else {
      ok = await put(`/fin/ledger/${side}/${d.id}`, {
        amount: Number(amount), note, entry_date: date, receipt_no: number,
        bank_account_id: account, clear_bank_account: !account,
      }, "Saved");
    }
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    const url = isTx ? `/fin/transactions/${d.id}` : isTransfer ? `/fin/transfers/${d.id}` : `/fin/ledger/${side}/${d.id}`;
    if (await del(url, "Deleted")) onClose();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {readOnly && <Notice>This was recorded by a bill when it was saved. Change it on the bill, and this entry follows.</Notice>}
        <DateField value={date} onChange={setDate} />
        {!isTransfer && <Field label={numberLabel}><input value={number} onChange={(e) => setNumber(e.target.value)} disabled={readOnly} className={inputCls} /></Field>}
        {!isTransfer && <AccountSelect value={account} onChange={setAccount} accounts={books.accounts} />}
        {isTx && (
          <PartyPicker label={d.type === "expense" ? "Paid to" : "Party"} parties={books.parties} id={party.id} name={party.name}
            onChange={(p) => setParty({ id: p.id, name: p.name })} onCreate={d.type === "expense" ? undefined : createParty} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (NPR)"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={readOnly} className={inputCls} /></Field>
          {isTx && d.type !== "expense" && <Field label="Discount (NPR)"><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} /></Field>}
        </div>
        <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly} rows={2} className={`${inputCls} h-auto py-2`} /></Field>
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <TwoTapDelete onConfirm={remove} />
            <div className="flex gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy || !(Number(amount) > 0)} className={btnPrimary}>Save</button></div>
          </div>
        )}
        {readOnly && <div className="flex justify-end"><button onClick={onClose} className={btnGhost}>Close</button></div>}
      </div>
    </Modal>
  );
}
