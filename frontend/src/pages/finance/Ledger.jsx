import { useMemo, useState } from "react";
import { Search, Plus, ArrowLeft, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Field, Modal, Empty, TwoTapDelete, Notice, ExportBar, exportXlsx, inputCls, btnPrimary, btnGhost } from "./ui";
import { partyBalances, ledgerRows, entryDate, journalOf, npr, num, COLORS } from "./money";
import { getCurrentBSMonthRange, getCurrentBSYearRange, formatBSDate } from "../../utils/nepali-date";

const PhoneHint = "10-digit phone";


// ── ledger types: pick one, or add / rename / delete them ─────────────────
function TypeManager({ onClose }) {
  const { books, post, put, del } = useBooks();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState({});
  return (
    <Modal title="Ledger types" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">A ledger type only files the party (Customer, Vendor, Employee ...). It moves nothing between ledgers. Deleting a type leaves its parties untyped.</p>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New ledger type" className={inputCls} />
          <button className={btnPrimary} disabled={!name.trim()} onClick={async () => { if (await post("/fin/party-types", { name }, "Ledger type added")) setName(""); }}>Add</button>
        </div>
        {books.party_types.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <input value={renaming[t.id] ?? t.name} onChange={(e) => setRenaming({ ...renaming, [t.id]: e.target.value })} className={inputCls} />
            {renaming[t.id] !== undefined && renaming[t.id] !== t.name && (
              <button className={btnGhost} onClick={async () => { if (await put(`/fin/party-types/${t.id}`, { name: renaming[t.id] }, "Renamed")) setRenaming({ ...renaming, [t.id]: undefined }); }}>Save</button>
            )}
            <TwoTapDelete label="Delete" onConfirm={() => del(`/fin/party-types/${t.id}`, "Deleted")} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

function TypeSelect({ value, onChange, allowNone = true }) {
  const { books } = useBooks();
  const [managing, setManaging] = useState(false);
  return (
    <div className="flex gap-2">
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>
        {allowNone && <option value="">No ledger type</option>}
        {books.party_types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button type="button" className={`${btnGhost} shrink-0`} onClick={() => setManaging(true)}>Edit types</button>
      {managing && <TypeManager onClose={() => setManaging(false)} />}
    </div>
  );
}

function PartyForm({ party, onClose, onOpenExisting }) {
  const { books, post, put } = useBooks();
  const [name, setName] = useState(party?.name || "");
  const [phone, setPhone] = useState(party?.phone || "");
  const [address, setAddress] = useState(party?.address || "");
  const [typeId, setTypeId] = useState(party ? party.party_type_id || null : books.party_types.find((t) => t.name === "Customer")?.id || null);
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
    const body = { name, phone: digits, address, ...(books.types_ready ? { party_type_id: typeId } : {}) };
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
        {books.types_ready && <Field label="Ledger type"><TypeSelect value={typeId} onChange={setTypeId} /></Field>}
        <div className="flex justify-end gap-2"><button onClick={() => onClose(null)} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy || !!clash} className={btnPrimary}>Save</button></div>
      </div>
    </Modal>
  );
}

function PartyDetail({ party, onBack, openReport }) {
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
              <div className="text-sm text-slate-800">{journalOf(e.note) ? "Journal voucher" : debt ? (table === "cl" ? (e.source_type === "rental_rent" ? "Daily rent" : "Sale (debt)") : "Purchase (debt)") : (table === "cl" ? "Payment received" : "Payment out")}{e.receipt_no ? <span className="text-slate-400"> · #{e.receipt_no}</span> : null}</div>
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
            {openReport && [["sales", "Sales"], ["purchase", "Purchases"], ["expense", "Expenses"]].map(([k, l]) => (
              <button key={k} onClick={() => openReport(k, party.id)} className={btnGhost} data-testid={`party-report-${k}`}>{l} report</button>
            ))}
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

// The table's colours, as in Finance Nepal: money going out red, coming in green.
const TONE = { payable: { text: "#B91C1C", base: "#FEE2E2" }, receivable: { text: "#047857", base: "#D1FAE5" }, settled: { text: "#1E3A8A", base: "#DBEAFE" } };
const PERIODS = [["all", "All time"], ["month", "This month"], ["year", "This year"]];
const NO_TYPE = "__none";

function SummaryCard({ label, value, tone, active, onClick }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
      style={{ borderColor: active ? tone.text : "#E2E8F0", borderLeft: `4px solid ${tone.text}`, boxShadow: active ? `0 0 0 3px ${tone.base}` : undefined }}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="text-lg font-bold mt-1" style={{ color: tone.text, fontFamily: "Manrope" }}>{value}</div>
    </button>
  );
}

const fig = (n, color) => (n ? <span className="font-bold" style={{ color }}>{num(n)}</span> : <span className="text-slate-300">—</span>);

export default function Ledger({ partyId, setPartyId, openReport, goTab }) {
  const { books, post } = useBooks();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("all");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkType, setBulkType] = useState(null);
  const [adding, setAdding] = useState(false);
  const party = partyId ? books.parties.find((p) => p.id === partyId) : null;

  const range = period === "month" ? getCurrentBSMonthRange() : period === "year" ? getCurrentBSYearRange() : null;
  const analysed = useMemo(() => ledgerRows(books, range?.start, range?.end), [books, range?.start, range?.end]);
  const cards = useMemo(() => analysed.reduce((c, r) => {
    c.paid += r.paid; c.received += r.received;
    if (r.balance > 0) c.receivable += r.balance; else c.payable -= r.balance;
    return c;
  }, { paid: 0, received: 0, receivable: 0, payable: 0 }), [analysed]);

  const typeChoices = useMemo(() => {
    const count = new Map();
    for (const r of analysed) { const k = r.party.party_type_id && r.typeName ? r.party.party_type_id : NO_TYPE; count.set(k, (count.get(k) || 0) + 1); }
    return [
      { id: "", label: "All types", count: analysed.length },
      ...books.party_types.map((t) => ({ id: t.id, label: t.name, count: count.get(t.id) || 0 })),
      ...(count.get(NO_TYPE) ? [{ id: NO_TYPE, label: "No ledger type", count: count.get(NO_TYPE) }] : []),
    ];
  }, [analysed, books.party_types]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return analysed
      .filter((r) => !s || r.party.name.toLowerCase().includes(s) || (r.party.phone || "").includes(s))
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => !typeFilter || (typeFilter === NO_TYPE ? !r.typeName : r.party.party_type_id === typeFilter))
      .sort((a, b) => ((b.last || "") > (a.last || "") ? 1 : (b.last || "") < (a.last || "") ? -1 : a.party.name.localeCompare(b.party.name)));
  }, [analysed, q, filter, typeFilter]);

  if (party) return <PartyDetail party={party} onBack={() => setPartyId(null)} openReport={openReport} />;

  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allOn = filtered.length > 0 && filtered.every((r) => selected.has(r.party.id));
  const setType = async () => {
    if (await post("/fin/party-types/assign", { party_ids: [...selected], party_type_id: bulkType }, `Ledger type set on ${selected.size} ${selected.size === 1 ? "party" : "parties"}`)) setSelected(new Set());
  };

  const cols = [
    { header: "SN", value: (r) => filtered.indexOf(r) + 1 },
    { header: "Party", value: (r) => r.party.name },
    { header: "Phone", value: (r) => r.party.phone || "" },
    { header: "Ledger type", value: (r) => r.shownType },
    { header: "Last transaction", value: (r) => r.last || "" },
    { header: "Transaction", value: (r) => r.billed },
    { header: "Total paid", value: (r) => r.paid },
    { header: "Total received", value: (r) => r.received },
    { header: "Balance (NPR)", value: (r) => r.balance },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Total paid" value={npr(cards.paid)} tone={TONE.payable} onClick={() => goTab?.("totals")} />
        <SummaryCard label="Total received" value={npr(cards.received)} tone={TONE.receivable} onClick={() => goTab?.("totals")} />
        <SummaryCard label="Payable" value={npr(cards.payable)} tone={TONE.payable} active={filter === "payable"} onClick={() => setFilter(filter === "payable" ? "all" : "payable")} />
        <SummaryCard label="Receivable" value={npr(cards.receivable)} tone={TONE.receivable} active={filter === "receivable"} onClick={() => setFilter(filter === "receivable" ? "all" : "receivable")} />
        <SummaryCard label="Total ledgers" value={String(analysed.length)} tone={TONE.settled} active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      <div className="fin-no-print flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`h-8 px-3 rounded-md text-sm font-semibold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ledger name or phone" className={`${inputCls} pl-9`} /></div>
        {books.types_ready && (
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${inputCls} w-auto`} aria-label="Ledger type">
            {typeChoices.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.count})</option>)}
          </select>
        )}
        {(q.trim() || typeFilter) && <span className="text-xs font-semibold text-blue-900">{filtered.length} {filtered.length === 1 ? "match" : "matches"}</span>}
        <ExportBar onXlsx={() => exportXlsx("ledger", cols, filtered)} />
        <button onClick={() => setAdding(true)} className={btnPrimary}><Plus size={16} /> New party</button>
      </div>
      {range && <p className="text-xs text-slate-500">Total paid and received count {formatBSDate(range.start)} to {formatBSDate(range.end)} BS; balances are what is owed at its end.</p>}

      {selected.size > 0 && books.types_ready && (
        <div className="fin-no-print flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-blue-900">{selected.size} selected</span>
          <div className="w-56"><TypeSelect value={bulkType} onChange={setBulkType} /></div>
          <button className={btnPrimary} onClick={setType}>Set ledger type</button>
          <button className={btnGhost} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? <Empty>{books.parties.length ? "No parties match what is on screen." : "No parties yet. Add your first customer or vendor."}</Empty> : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                {books.types_ready && <th className="fin-no-print w-8 px-3 py-2.5"><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(filtered.map((r) => r.party.id)))} aria-label="Select all" /></th>}
                <th className="px-3 py-2.5 w-12">SN</th>
                <th className="px-3 py-2.5">Party</th>
                <th className="px-3 py-2.5 hidden md:table-cell">Ledger type</th>
                <th className="px-3 py-2.5 hidden lg:table-cell">Last transaction</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Transaction</th>
                <th className="px-3 py-2.5 text-right">Total paid</th>
                <th className="px-3 py-2.5 text-right">Total received</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.party.id} onClick={() => setPartyId(r.party.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  {books.types_ready && <td className="fin-no-print px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.party.id)} onChange={() => toggle(r.party.id)} aria-label={`Select ${r.party.name}`} /></td>}
                  <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5"><div className="font-semibold text-slate-900">{r.party.name}</div>{r.party.phone && <div className="text-xs text-slate-400">{r.party.phone}</div>}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell font-semibold text-slate-700">{r.typeName || <span className="text-slate-400 font-normal">{r.shownType}</span>}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-slate-600">{r.last ? `${formatBSDate(r.last)}` : "—"}</td>
                  <td className="px-3 py-2.5 text-right hidden md:table-cell">{fig(r.billed, "#0F172A")}</td>
                  <td className="px-3 py-2.5 text-right">{fig(r.paid, TONE.payable.text)}</td>
                  <td className="px-3 py-2.5 text-right">{fig(r.received, TONE.receivable.text)}</td>
                  <td className="px-3 py-2.5 text-right">{r.status === "settled" ? <span className="text-slate-300">—</span> : (
                    <span className="font-bold" style={{ color: r.status === "payable" ? TONE.payable.text : TONE.receivable.text }} title={r.status === "payable" ? "To pay" : "To receive"}>{num(Math.abs(r.balance))}</span>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {adding && <PartyForm onClose={(created) => { setAdding(false); if (created?.id) setPartyId(created.id); }} onOpenExisting={setPartyId} />}
    </div>
  );
}
