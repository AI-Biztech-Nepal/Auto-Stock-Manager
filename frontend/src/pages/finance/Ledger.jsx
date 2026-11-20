import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import useMediaQuery from "../../hooks/useMediaQuery";
import { Search, Plus, ChevronLeft, ArrowUpCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Field, Modal, DateField, Empty, TwoTapDelete, Notice, ExportBar, exportXlsx, inputCls, btnPrimary, btnGhost } from "./ui";
import { ledgerRows, partyStatement, partyOpening, suggestedOpeningDay, isOpening, npr, num } from "./money";
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
  // Opening balance: what they owed you (receive) or you owed them (pay) before these books began.
  const had = useMemo(() => (party ? partyOpening(books, party.id) : null), [books, party]);
  const [opening, setOpening] = useState(had ? String(had.amount) : "");
  const [direction, setDirection] = useState(had?.direction || "receive");
  const [openingDate, setOpeningDate] = useState(had?.date || suggestedOpeningDay(books));
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
    const amount = opening.trim() === "" ? 0 : Math.abs(Number(opening));
    if (!Number.isFinite(amount)) return toast.error("Opening balance must be a number");
    setBusy(true);
    const body = { name, phone: digits, address, ...(books.types_ready ? { party_type_id: typeId } : {}) };
    const ok = party ? await put(`/fin/parties/${party.id}`, body, "Saved") : await post("/fin/parties", body, "Party added");
    // Only touch the opening entry when there is something to save or something to clear.
    if (ok && (amount > 0 || had)) {
      const done = await put(`/fin/parties/${party?.id || ok.id}/opening`, { amount, direction, entry_date: openingDate || null });
      if (!done) toast.error("The party was saved, but the opening balance was not");
    }
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
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-3" data-testid="party-opening">
          <div className="text-xs font-semibold text-slate-700">Opening balance</div>
          <div className="grid grid-cols-2 gap-2">
            {[["receive", "They owe me (to receive)"], ["pay", "I owe them (to pay)"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setDirection(k)} aria-pressed={direction === k}
                className={`h-10 rounded-lg border text-[13px] font-semibold transition-colors ${direction === k ? (k === "receive" ? "border-emerald-600 bg-emerald-600 text-white" : "border-red-600 bg-red-600 text-white") : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>{label}</button>
            ))}
          </div>
          <Field label="Amount (NPR)" hint="What was owed before these books began. Leave empty for none; clear it to remove an opening balance.">
            <input type="number" min="0" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} className={inputCls} placeholder="0" data-testid="party-opening-amount" />
          </Field>
          <DateField label="As of" value={openingDate} onChange={setOpeningDate} />
        </div>
        <div className="flex justify-end gap-2"><button onClick={() => onClose(null)} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy || !!clash} className={btnPrimary}>Save</button></div>
      </div>
    </Modal>
  );
}

// One person's full ledger page, laid out like Jageer Nepal's customer page: a back arrow and the ledger type as the title with Payment,
// Print and Excel at the right (all in the app's top bar); a card with their name, their Balance, Edit and Delete; then one row per entry (the vehicle or what it
// was for, its date and reference number, the transaction amount, what was paid and received, and what it adds to Payable /
// Receivable) with a total row. `Balance` in a row is the original amount of a sale or purchase; the person's balance now is in the card.
function PartyDetail({ party, onBack, openReport, payParty }) {
  const { books, del } = useBooks();
  const { titleSlot, topbarSlot } = useOutletContext() || {};
  const wide = useMediaQuery("(min-width: 1024px)");
  const [editing, setEditing] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const st = useMemo(() => partyStatement(books, party.id), [books, party.id]);
  const title = useMemo(() => ledgerRows(books).find((r) => r.party.id === party.id)?.shownType || "Ledger", [books, party.id]);

  const sideWord = (b) => (b > 0 ? " Dr" : b < 0 ? " Cr" : "");
  const balanceColor = (b) => (b > 0 ? TONE.receivable.text : b < 0 ? TONE.payable.text : "#111827");
  const closing = st.closing ? `${num(Math.abs(st.closing))}${sideWord(st.closing)}` : "0";
  // What the entry was for: the bill's items (the vehicle), else its kind and note ("Paid · TONER BROTHER*10").
  const whatOf = (l) => l.what || [l.label, l.memo].filter(Boolean).join(" · ");
  const lineWord = st.lines.length === 1 ? "Line" : "Lines";

  const cols = [
    { header: "SN", value: (l) => st.lines.indexOf(l) + 1 },
    { header: "Vehicle", value: whatOf },
    { header: "Date", value: (l) => l.date },
    { header: "Ref no.", value: (l) => l.ref },
    { header: "Balance", value: (l) => (l.kind === "billed" ? l.e.amount : "") },
    { header: "Total paid", value: (l) => (l.kind === "paid" ? l.e.amount : "") },
    { header: "Total received", value: (l) => (l.kind === "received" ? l.e.amount : "") },
    { header: "Payable", value: (l) => l.credit || "" },
    { header: "Receivable", value: (l) => l.debit || "" },
  ];

  // The back arrow and the title are in the app's top bar, and on wide screens the buttons are up there too (as on the Sales page);
  // on narrower screens the buttons sit in a row here.
  const heading = (
    <>
      <button type="button" onClick={onBack} aria-label="Back to all parties" data-testid="party-back"
        className="fin-no-print h-10 w-10 shrink-0 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-800"><ChevronLeft size={20} /></button>
      <h1 className="min-w-0 truncate text-2xl font-bold text-slate-900" data-testid="party-title">{title}</h1>
    </>
  );
  const buttons = (
    <>
      {payParty && <button type="button" onClick={() => payParty(party.id)} className={btnPrimary} data-testid="party-pay"><ArrowUpCircle size={16} /> Payment</button>}
      <ExportBar onXlsx={() => exportXlsx(`ledger-${party.name}`, cols, st.lines)} />
    </>
  );

  return (
    <div className="space-y-4">
      {titleSlot ? createPortal(heading, titleSlot) : <div className="flex items-center gap-3 min-w-0">{heading}</div>}
      {wide && topbarSlot
        ? createPortal(<div className="fin-no-print flex items-center gap-2">{buttons}</div>, topbarSlot)
        : <div className="fin-no-print flex flex-wrap items-center justify-end gap-2">{buttons}</div>}

      <Card className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900" data-testid="party-name">{party.name}</h2>
          {(party.phone || party.address) && <div className="text-xs text-slate-500 mt-0.5">{[party.phone, party.address].filter(Boolean).join(" · ")}</div>}
          {openReport && (
            <div className="fin-no-print mt-1 flex flex-wrap gap-x-3 text-xs">
              {[["sales", "Sales"], ["purchase", "Purchases"], ["expense", "Expenses"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => openReport(k, party.id)} className="text-blue-600 hover:underline" data-testid={`party-report-${k}`}>{l} report</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right pr-1">
            <div className="text-[11px] font-semibold text-gray-400">Balance</div>
            <div className="text-lg font-extrabold leading-tight" style={{ color: balanceColor(st.closing) }} data-testid="party-balance">NPR {closing}</div>
          </div>
          <div className="fin-no-print flex items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className={btnGhost} data-testid="party-edit"><Pencil size={14} className="text-blue-600" /> Edit</button>
            <TwoTapDelete label="Delete" onConfirm={async () => { if (await del(`/fin/parties/${party.id}`, "Party deleted")) onBack(); }} />
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {st.lines.length === 0 ? <Empty>No entries yet.</Empty> : (
          <table className="w-full text-[13px]" data-testid="party-table">
            <thead>
              <tr className="text-left">
                <th className="w-12">SN</th>
                <th>Vehicle</th>
                <th>Last Transaction</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Total Paid</th>
                <th className="text-right">Total Received</th>
                <th className="text-right">Payable</th>
                <th className="text-right">Receivable</th>
              </tr>
            </thead>
            <tbody>
              {st.lines.map((l, i) => (
                <tr key={`${l.table}${l.e.id}`} onClick={() => (isOpening(l.e) ? setEditing(true) : setOpenRow({ table: l.table, data: l.e }))} className="cursor-pointer" data-testid="party-line">
                  <td className="text-slate-500">{i + 1}</td>
                  <td className="font-semibold text-slate-900 min-w-[12rem]">{whatOf(l)}</td>
                  <td className="whitespace-nowrap">
                    <div className="text-slate-800">{formatBSDate(l.date)}</div>
                    {l.ref && <div className="text-xs text-slate-400">Ref {l.ref}</div>}
                  </td>
                  <td className="text-right" data-testid="party-line-balance">{fig(l.kind === "billed" ? l.e.amount : 0, "#0F172A")}</td>
                  <td className="text-right" data-testid="party-line-paid">{fig(l.kind === "paid" ? l.e.amount : 0, TONE.payable.text)}</td>
                  <td className="text-right" data-testid="party-line-received">{fig(l.kind === "received" ? l.e.amount : 0, TONE.receivable.text)}</td>
                  <td className="text-right" data-testid="party-line-payable">{fig(l.credit, TONE.payable.text)}</td>
                  <td className="text-right" data-testid="party-line-receivable">{fig(l.debit, TONE.receivable.text)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="party-total">
                <td colSpan={3} className="text-right">{st.lines.length} {lineWord} · Total</td>
                <td className="text-right">{fig(st.billed, "#0F172A")}</td>
                <td className="text-right">{fig(st.paid, TONE.payable.text)}</td>
                <td className="text-right">{fig(st.received, TONE.receivable.text)}</td>
                <td className="text-right">{fig(st.credit, TONE.payable.text)}</td>
                <td className="text-right">{fig(st.debit, TONE.receivable.text)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
      <p className="text-xs text-slate-400">Payable = you owe them, Receivable = they owe you. A journal voucher moves these but no money. Deleting a party also deletes their whole ledger; bills keep the name that was typed on them.</p>

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

export default function Ledger({ partyId, setPartyId, openReport, payParty, goTab }) {
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

  if (party) return <PartyDetail party={party} onBack={() => setPartyId(null)} openReport={openReport} payParty={payParty} />;

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
                <tr key={r.party.id} onClick={() => setPartyId(r.party.id)} data-testid="ledger-row" className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
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
      {adding && <PartyForm onClose={(created) => { setAdding(false); if (created?.id) setPartyId(created.id); }} onOpenExisting={setPartyId} />}    </div>
  );
}
