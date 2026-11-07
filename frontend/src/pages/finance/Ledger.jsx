import { useMemo, useState } from "react";
import { Search, Plus, ArrowLeft, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Field, Modal, Empty, TwoTapDelete, Notice, ExportBar, exportXlsx, inputCls, btnPrimary, btnGhost } from "./ui";
import { ledgerRows, partyStatement, npr, num } from "./money";
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
  const st = useMemo(() => partyStatement(books, party.id), [books, party.id]);
  const typeName = books.party_types.find((t) => t.id === party.party_type_id)?.name;

  const sideWord = (b) => (b > 0 ? " Dr" : b < 0 ? " Cr" : "");
  const balanceText = (b) => `${num(Math.abs(b))}${sideWord(b)}`;
  const balanceColor = (b) => (b > 0 ? TONE.receivable.text : b < 0 ? TONE.payable.text : "#64748B");

  const cols = [
    { header: "SN", value: (l) => st.lines.indexOf(l) + 1 },
    { header: "Date", value: (l) => l.date },
    { header: "Details", value: (l) => [l.label, l.sub].filter(Boolean).join(" · ") },
    { header: "Transaction", value: (l) => (l.kind === "billed" ? l.e.amount : "") },
    { header: "Total paid", value: (l) => (l.kind === "paid" ? l.e.amount : "") },
    { header: "Total received", value: (l) => (l.kind === "received" ? l.e.amount : "") },
    { header: "Balance", value: (l) => balanceText(l.balance) },
  ];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"><ArrowLeft size={14} /> All parties</button>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{party.name}</h2>
            {typeName && <span className="inline-block mt-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{typeName}</span>}
            <div className="text-sm text-slate-500 mt-1 space-y-0.5">
              {party.phone && <div className="flex items-center gap-1.5"><Phone size={13} />{party.phone}</div>}
              {party.address && <div className="flex items-center gap-1.5"><MapPin size={13} />{party.address}</div>}
            </div>
          </div>
          <div className="fin-no-print flex flex-wrap gap-2">
            <ExportBar onXlsx={() => exportXlsx(`ledger-${party.name}`, cols, st.lines)} />
            {openReport && [["sales", "Sales"], ["purchase", "Purchases"], ["expense", "Expenses"]].map(([k, l]) => (
              <button key={k} onClick={() => openReport(k, party.id)} className={btnGhost} data-testid={`party-report-${k}`}>{l} report</button>
            ))}
            <button onClick={() => setEditing(true)} className={btnGhost}>Edit details</button>
            <TwoTapDelete label="Delete party" onConfirm={async () => { if (await del(`/fin/parties/${party.id}`, "Party deleted")) onBack(); }} />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">Deleting a party also deletes their whole ledger. Bills keep the name that was typed on them.</p>
      </Card>

      {/* The Ledger table's own figures for this one party */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Transaction (original price)" value={npr(st.billed)} tone={{ text: "#111827", base: "#374151" }} />
        <SummaryCard label="Total paid" value={npr(st.paid)} tone={TONE.payable} />
        <SummaryCard label="Total received" value={npr(st.received)} tone={TONE.receivable} />
        <SummaryCard label={st.closing > 0 ? "Balance (to receive)" : st.closing < 0 ? "Balance (to pay)" : "Balance"} value={`NPR ${balanceText(st.closing)}`} tone={st.closing < 0 ? TONE.payable : st.closing > 0 ? TONE.receivable : TONE.settled} />
        <SummaryCard label="Entries" value={String(st.lines.length)} tone={TONE.settled} />
      </div>

      <Card className="overflow-x-auto">
        {st.lines.length === 0 ? <Empty>No entries yet.</Empty> : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5 w-12">SN</th>
                <th className="px-3 py-2.5 hidden sm:table-cell">Date</th>
                <th className="px-3 py-2.5">Details</th>
                <th className="px-3 py-2.5 text-right">Transaction</th>
                <th className="px-3 py-2.5 text-right">Total paid</th>
                <th className="px-3 py-2.5 text-right">Total received</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {st.lines.map((l, i) => (
                <tr key={`${l.table}${l.e.id}`} onClick={() => setOpenRow({ table: l.table, data: l.e })} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-slate-600 whitespace-nowrap">{formatBSDate(l.date)}</td>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{l.label}{l.sub && <span className="font-normal text-slate-500"> · {l.sub}</span>}</div>
                    <div className="sm:hidden text-[11px] text-slate-400">{formatBSDate(l.date)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{fig(l.kind === "billed" ? l.e.amount : 0, "#0F172A")}</td>
                  <td className="px-3 py-2.5 text-right">{fig(l.kind === "paid" ? l.e.amount : 0, TONE.payable.text)}</td>
                  <td className="px-3 py-2.5 text-right">{fig(l.kind === "received" ? l.e.amount : 0, TONE.receivable.text)}</td>
                  <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ color: balanceColor(l.balance) }}>{l.balance ? balanceText(l.balance) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="px-3 py-2.5 hidden sm:table-cell" colSpan={3}>Total</td>
                <td className="px-3 py-2.5 sm:hidden" colSpan={2}>Total</td>
                <td className="px-3 py-2.5 text-right">{num(st.billed)}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: TONE.payable.text }}>{num(st.paid)}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: TONE.receivable.text }}>{num(st.received)}</td>
                <td className="px-3 py-2.5 text-right" style={{ color: balanceColor(st.closing) }}>{balanceText(st.closing)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
      <p className="text-xs text-slate-400">Dr = they owe you, Cr = you owe them. A journal voucher moves the balance but no money.</p>

      {editing && <PartyForm party={party} onClose={() => setEditing(false)} onOpenExisting={() => {}} />}
      {openRow && <EntryEditor row={openRow} onClose={() => setOpenRow(null)} />}
    </div>
  );
}

// The table's colours, as in Finance Nepal: money going out red, coming in green.
// Jageer Nepal's LEDGER_TONE: `text` for the figure, `base` for the card's coloured edge.
const TONE = { payable: { text: "#B91C1C", base: "#DC2626" }, receivable: { text: "#047857", base: "#059669" }, settled: { text: "#4B5563", base: "#9CA3AF" } };
const PERIODS = [["all", "All time"], ["month", "This month"], ["year", "This year"]];
const NO_TYPE = "__none";

function SummaryCard({ label, value, tone, active, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex text-left rounded-xl overflow-hidden border transition-colors disabled:cursor-default"
      style={{ borderColor: active ? tone.base : "#E5E7EB", backgroundColor: active ? "#F9FAFB" : "#FFFFFF" }}>
      <span className="w-1 shrink-0" style={{ backgroundColor: tone.base }} />
      <span className="flex-1 min-w-0 px-3 py-2.5">
        <span className="block text-[11px] font-semibold tracking-wide text-gray-400 truncate">{label}</span>
        <span className="block text-[17px] font-extrabold mt-0.5 truncate" style={{ color: tone.text }}>{value}</span>
      </span>
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
        <SummaryCard label="Total paid" value={npr(cards.paid)} tone={TONE.payable} onClick={() => goTab?.("total-paid")} />
        <SummaryCard label="Total received" value={npr(cards.received)} tone={TONE.receivable} onClick={() => goTab?.("total-received")} />
        <SummaryCard label="Payable" value={npr(cards.payable)} tone={TONE.payable} active={filter === "payable"} onClick={() => setFilter(filter === "payable" ? "all" : "payable")} />
        <SummaryCard label="Receivable" value={npr(cards.receivable)} tone={TONE.receivable} active={filter === "receivable"} onClick={() => setFilter(filter === "receivable" ? "all" : "receivable")} />
        <SummaryCard label="Total ledgers" value={String(analysed.length)} tone={TONE.settled} active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      <div className="fin-no-print flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-0.5 bg-gray-100 rounded-lg p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
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
