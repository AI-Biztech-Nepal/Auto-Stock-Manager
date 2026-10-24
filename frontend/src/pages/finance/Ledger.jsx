import { useMemo, useState } from "react";
import { Search, Plus, ArrowLeft, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Field, Modal, Empty, TwoTapDelete, Notice, ExportBar, exportXlsx, inputCls, btnPrimary, btnGhost } from "./ui";
import { partyBalances, owedTotals, entryDate, npr, COLORS } from "./money";

const PhoneHint = "10-digit phone";

function BalanceLine({ b }) {
  const rec = b?.receivable || 0, pay = b?.payable || 0;
  if (rec <= 0 && pay <= 0) return <span className="text-slate-400 text-xs font-medium">Settled</span>;
  return (
    <div className="text-xs text-right leading-5">
      {rec > 0 && <div style={{ color: COLORS.in }} className="font-semibold">To receive {npr(rec)}</div>}
      {pay > 0 && <div style={{ color: COLORS.out }} className="font-semibold">To pay {npr(pay)}</div>}
    </div>
  );
}

function PartyForm({ party, onClose, onOpenExisting }) {
  const { books, post, put } = useBooks();
  const [name, setName] = useState(party?.name || "");
  const [phone, setPhone] = useState(party?.phone || "");
  const [address, setAddress] = useState(party?.address || "");
  const [busy, setBusy] = useState(false);
  // Look the phone up first so the user gets a way forward instead of a raw duplicate error.
  const clash = useMemo(() => {
    const digits = phone.replace(/\D/g, "");
    return digits ? books.parties.find((p) => p.phone === digits && p.id !== party?.id) : null;
  }, [books.parties, phone, party]);

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    const digits = phone.replace(/\D/g, "");
    if (digits && digits.length !== 10) return toast.error("Phone must be 10 digits");
    setBusy(true);
    const body = { name, phone: digits, address };
    const ok = party ? await put(`/fin/parties/${party.id}`, body, "Saved") : await post("/fin/parties", body, "Party added");
    setBusy(false);
    if (ok) onClose(ok);
  };

  return (
    <Modal title={party ? "Edit party" : "Add party"} onClose={() => onClose(null)}>
      <div className="space-y-4">
        <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus /></Field>
        <Field label="Phone" hint={PhoneHint}><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
        {clash && (
          <Notice>
            {clash.name} already has this number. <button className="underline font-semibold" onClick={() => { onClose(null); onOpenExisting(clash.id); }}>Open {clash.name} instead</button>
          </Notice>
        )}
        <Field label="Address"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
        <div className="flex justify-end gap-2"><button onClick={() => onClose(null)} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy || !!clash} className={btnPrimary}>Save</button></div>
      </div>
    </Modal>
  );
}

function PartyDetail({ party, onBack }) {
  const { books, del } = useBooks();
  const [editing, setEditing] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const b = partyBalances(books)[party.id] || { receivable: 0, payable: 0 };

  const custRows = useMemo(() => books.customer_ledger.filter((e) => e.customer_id === party.id).sort((a, c) => (entryDate(a) < entryDate(c) ? 1 : entryDate(a) > entryDate(c) ? -1 : (a.created_at < c.created_at ? 1 : -1))), [books, party.id]);
  const vendRows = useMemo(() => books.vendor_ledger.filter((e) => e.vendor_id === party.id).sort((a, c) => (entryDate(a) < entryDate(c) ? 1 : entryDate(a) > entryDate(c) ? -1 : (a.created_at < c.created_at ? 1 : -1))), [books, party.id]);

  const cols = [
    { header: "Ledger", value: (r) => r.ledger },
    { header: "Date", value: (r) => entryDate(r.e) },
    { header: "Type", value: (r) => (r.e.entry_type === "debit" ? "Debt" : "Payment") },
    { header: "Receipt/Payment no", value: (r) => r.e.receipt_no || "" },
    { header: "Note", value: (r) => r.e.note || "" },
    { header: "Amount", value: (r) => r.e.amount },
  ];
  const allRows = [...custRows.map((e) => ({ ledger: "Customer", e })), ...vendRows.map((e) => ({ ledger: "Vendor", e }))];

  const list = (rows, table, owedLabel) => (
    <Card>
      <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">{owedLabel}</div>
      {rows.length === 0 ? <Empty>No entries.</Empty> : rows.map((e) => {
        const debt = e.entry_type === "debit";
        const color = table === "cl" ? (debt ? COLORS.sale : COLORS.in) : (debt ? COLORS.purchase : COLORS.out);
        return (
          <button key={e.id} onClick={() => setOpenRow({ table, data: e })} className="w-full text-left px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-800">{debt ? (table === "cl" ? "Sale (debt)" : "Purchase (debt)") : (table === "cl" ? "Payment received" : "Payment out")}{e.receipt_no ? <span className="text-slate-400"> · #{e.receipt_no}</span> : null}</div>
              <div className="text-xs text-slate-400 truncate">{entryDate(e)}{e.note ? ` · ${e.note}` : ""}{e.source !== "manual" ? " · from a bill" : ""}</div>
            </div>
            <div className="text-sm font-semibold shrink-0" style={{ color }}>{npr(e.amount)}</div>
          </button>
        );
      })}
    </Card>
  );

  const headline = (amount, owedBy, owedTo, color) => (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{owedBy}</div>
      <div className="text-2xl font-bold mt-1" style={{ fontFamily: "Manrope", color }}>{npr(Math.abs(amount))}</div>
      {amount < 0 && <div className="text-xs text-slate-500 mt-0.5">{owedTo}</div>}
    </Card>
  );

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"><ArrowLeft size={14} /> All parties</button>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{party.name}</h2>
            <div className="text-sm text-slate-500 mt-1 space-y-0.5">
              {party.phone && <div className="flex items-center gap-1.5"><Phone size={13} />{party.phone}</div>}
              {party.address && <div className="flex items-center gap-1.5"><MapPin size={13} />{party.address}</div>}
            </div>
          </div>
          <div className="fin-no-print flex flex-wrap gap-2">
            <ExportBar onXlsx={() => exportXlsx(`ledger-${party.name}`, cols, allRows)} />
            <button onClick={() => setEditing(true)} className={btnGhost}>Edit details</button>
            <TwoTapDelete label="Delete party" onConfirm={async () => { if (await del(`/fin/parties/${party.id}`, "Party deleted")) onBack(); }} />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">Deleting a party also deletes their whole ledger. Bills keep the name that was typed on them.</p>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {headline(b.receivable, b.receivable >= 0 ? "Customer owes you" : "You owe this customer", "They paid in advance or for a bill that was removed", b.receivable > 0 ? COLORS.in : b.receivable < 0 ? COLORS.out : "#0f172a")}
        {(vendRows.length > 0 || b.payable !== 0) && headline(b.payable, b.payable >= 0 ? "You owe this vendor" : "Vendor owes you", "You paid more than was billed", b.payable > 0 ? COLORS.out : b.payable < 0 ? COLORS.in : "#0f172a")}
      </div>

      {list(custRows, "cl", "As a customer (what they owe you)")}
      {vendRows.length > 0 && list(vendRows, "vl", "As a vendor (what you owe them)")}

      {editing && <PartyForm party={party} onClose={() => setEditing(false)} onOpenExisting={() => {}} />}
      {openRow && <EntryEditor row={openRow} onClose={() => setOpenRow(null)} />}
    </div>
  );
}

export default function Ledger({ partyId, setPartyId }) {
  const { books } = useBooks();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const balances = useMemo(() => partyBalances(books), [books]);
  const totals = useMemo(() => owedTotals(books), [books]);
  const party = partyId ? books.parties.find((p) => p.id === partyId) : null;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return books.parties.filter((p) => !s || p.name.toLowerCase().includes(s) || (p.phone || "").includes(s));
  }, [books.parties, q]);

  if (party) return <PartyDetail party={party} onBack={() => setPartyId(null)} />;

  const cols = [
    { header: "Name", value: (p) => p.name },
    { header: "Phone", value: (p) => p.phone || "" },
    { header: "Address", value: (p) => p.address || "" },
    { header: "To receive", value: (p) => Math.max(0, balances[p.id]?.receivable || 0) },
    { header: "To pay", value: (p) => Math.max(0, balances[p.id]?.payable || 0) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><div className="text-xs font-semibold uppercase text-slate-500">To receive</div><div className="text-xl font-bold mt-1" style={{ color: COLORS.in, fontFamily: "Manrope" }}>{npr(totals.totalReceivable)}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase text-slate-500">To pay</div><div className="text-xl font-bold mt-1" style={{ color: COLORS.out, fontFamily: "Manrope" }}>{npr(totals.totalPayable)}</div></Card>
      </div>
      <div className="fin-no-print flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className={`${inputCls} pl-9`} /></div>
        <ExportBar onXlsx={() => exportXlsx("ledger", cols, rows)} />
        <button onClick={() => setAdding(true)} className={btnPrimary}><Plus size={16} /> Add party</button>
      </div>
      <Card>
        {rows.length === 0 ? <Empty>{books.parties.length ? "No match." : "No parties yet. Add your first customer or vendor."}</Empty> : rows.map((p) => (
          <button key={p.id} onClick={() => setPartyId(p.id)} className="w-full text-left px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center shrink-0">{p.name.slice(0, 1).toUpperCase()}</span>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-900 truncate">{p.name}</div><div className="text-xs text-slate-400 truncate">{[p.phone, p.address].filter(Boolean).join(" · ")}</div></div>
            <BalanceLine b={balances[p.id]} />
          </button>
        ))}
      </Card>
      {adding && <PartyForm onClose={(created) => { setAdding(false); if (created?.id) setPartyId(created.id); }} onOpenExisting={setPartyId} />}
    </div>
  );
}
