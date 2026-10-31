import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { BookmarkCheck, MessageCircle, Search, Download, Check, X, ArrowUp, ArrowDown, ChevronDown, UserCheck, Users, Target, Link2 } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import useSellers from "../hooks/useSellers";
import { SOURCES, SOURCE_STYLE, referredByLabel, leadLabel } from "../utils/crm";

// Every customer on one line: who they are, what they have given the shop, who sold to them, which kind of lead
// they were, and (for a referral) the name of who referred them. Rows are read live from the customers, sales and
// bookings already posted and the table re-reads itself every half minute, so nothing is entered twice. The
// Lead and Sold By dropdowns save the moment they are changed.
const FONT = { fontFamily: "Manrope" };
const PAGE_SIZE = 50;
const REFRESH_MS = 30000;
const FIRST_DIR = { name: "asc", amount: "desc", soldby: "asc", lead: "asc", referred: "asc" };
const AVATARS = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700", "bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700"];

const avatarOf = (name) => AVATARS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATARS.length];
const initialsOf = (name) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
const waNumber = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `977${d}` : d;
};

const selectBase = "appearance-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-wait";

// Lead: the kind of lead, as a colour-coded dropdown. Untagged customers get an amber "Select lead".
function LeadSelect({ value, disabled, onChange, testid = "crm-lead" }) {
  const tone = value ? SOURCE_STYLE[value].pill : "bg-amber-50 text-amber-700 ring-1 ring-amber-300";
  return (
    <div className="relative inline-block">
      <select value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)} aria-label="Lead" data-testid={testid}
        className={`${selectBase} h-8 pl-3 pr-7 rounded-full text-xs font-semibold ${tone}`}>
        {!value && <option value="" disabled>Select lead</option>}
        {SOURCES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60" />
    </div>
  );
}

// Sold By: the Team member who sold the customer's latest vehicle. Only customers who have bought can have one.
function SellerSelect({ c, sellers, disabled, onChange }) {
  if (c.purchases === 0 && !c.sold_by_id) return <span className="text-slate-300" title="No sale yet">—</span>;
  const known = sellers.some(s => s.id === c.sold_by_id);
  return (
    <div className="relative w-[124px]">
      <select value={c.sold_by_id || ""} disabled={disabled} onChange={e => onChange(c, e.target.value)} aria-label={`Sold by, ${c.name}`} data-testid="crm-sold-by"
        className={`${selectBase} h-8 w-full pl-2.5 pr-7 rounded-lg border text-xs font-medium truncate ${c.sold_by_id ? "bg-white border-slate-200 text-slate-800 hover:border-slate-300" : "bg-slate-50 border-dashed border-slate-300 text-slate-400 hover:border-slate-400"}`}>
        <option value="">Not set</option>
        {c.sold_by_id && !known && <option value={c.sold_by_id}>{c.sold_by_name || "Previous seller"}</option>}
        {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

// Search the customers (or type a name for someone who isn't one) to say who referred a customer. The list is drawn
// in a portal so the table's own scrolling never clips it.
function ReferrerCombo({ customers, excludeId, onPick, onName, onCancel }) {
  const inputRef = useRef(null);
  const [q, setQ] = useState("");
  const [box, setBox] = useState(null);
  const place = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setBox({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 270) });
  }, []);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [place]);

  const typed = q.trim();
  const matches = useMemo(() => {
    const needle = typed.toLowerCase();
    return customers
      .filter(c => c.id !== excludeId && (!needle || c.name.toLowerCase().includes(needle) || c.contact_number.includes(needle)))
      .slice(0, 6);
  }, [customers, typed, excludeId]);

  const onKey = (e) => {
    if (e.key === "Escape") onCancel();
    else if (e.key === "Enter") {
      if (matches.length === 1) onPick(matches[0].id);
      else if (typed.length >= 2) onName(typed);
    }
  };
  return (
    <div className="relative w-full" data-testid="crm-referrer-combo">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} onBlur={() => setTimeout(onCancel, 150)}
        placeholder="Search or type a name" data-testid="referrer-search"
        className="w-full h-8 pl-7 pr-2 text-xs border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {box && createPortal(
        <ul style={{ position: "fixed", top: box.top, left: box.left, width: box.width }} className="z-[70] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1">
          {matches.map(c => (
            <li key={c.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onPick(c.id)} data-testid="referrer-option"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-3">
                <span className="truncate font-medium text-slate-800">{c.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{c.contact_number}</span>
              </button>
            </li>
          ))}
          {typed.length >= 2 && (
            <li className="border-t border-slate-100 mt-1 pt-1">
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onName(typed)} data-testid="referrer-typed"
                className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-blue-50">Use “<b>{typed}</b>” (not a customer)</button>
            </li>
          )}
          {matches.length === 0 && typed.length < 2 && <li className="px-3 py-2 text-xs text-slate-400">Type a name to search</li>}
        </ul>, document.body)}
    </div>
  );
}

function OtherNote({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial || "");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="flex items-center gap-1 w-full" data-testid="crm-other-note">
      <input ref={ref} value={v} onChange={e => setV(e.target.value)} placeholder="e.g. TikTok" data-testid="source-note"
        onKeyDown={e => { if (e.key === "Enter") onSave(v); else if (e.key === "Escape") onCancel(); }}
        className="flex-1 min-w-0 h-8 px-2.5 text-xs border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={() => onSave(v)} aria-label="Save" data-testid="crm-save-note" className="shrink-0 h-8 w-7 rounded-lg bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center"><Check size={14} /></button>
      <button onClick={onCancel} aria-label="Cancel" className="shrink-0 h-8 w-6 rounded-lg text-slate-400 hover:bg-slate-100 inline-flex items-center justify-center"><X size={14} /></button>
    </div>
  );
}

// Referred by: just a name. For a referral, who referred them (tap to change); for Other, the detail; blank otherwise.
function ReferredByCell(props) {
  return <div className="w-[150px] max-w-full"><ReferredByContent {...props} /></div>;
}
function ReferredByContent({ c, pending, customers, onPickReferrer, onNameReferrer, onSaveNote, onCancel, onEdit }) {
  const mine = pending?.id === c.id ? pending : null;
  const kind = mine ? mine.source : c.source;
  if (kind === "referral") {
    if (mine) return <ReferrerCombo customers={customers} excludeId={c.id} onPick={id => onPickReferrer(c, id)} onName={name => onNameReferrer(c, name)} onCancel={onCancel} />;
    const name = referredByLabel(c);
    return (
      <button onClick={() => onEdit(c, "referral")} title="Change who referred them" data-testid="crm-referred-by"
        className={`max-w-full block truncate text-sm text-left hover:underline ${name ? "font-semibold text-slate-900 hover:text-blue-700" : "text-slate-400 italic"}`}>{name || "Add name"}</button>
    );
  }
  if (kind === "other") {
    if (mine) return <OtherNote initial={mine.note} onSave={note => onSaveNote(c, note)} onCancel={onCancel} />;
    const note = referredByLabel(c);
    return (
      <button onClick={() => onEdit(c, "other")} title="Edit" data-testid="crm-referred-by"
        className={`max-w-full block truncate text-sm text-left hover:underline ${note ? "text-slate-700 hover:text-blue-700" : "text-slate-400 italic"}`}>{note || "Add detail"}</button>
    );
  }
  return <span className="text-slate-300">—</span>;
}

function Contact({ c }) {
  if (!c.contact_number) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <a href={`tel:${c.contact_number}`} className="text-sm font-medium text-slate-700 hover:text-blue-700 tabular-nums">{c.contact_number}</a>
      <a href={`https://wa.me/${waNumber(c.contact_number)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.name}`} className="w-6 h-6 rounded-md bg-green-600 text-white hover:bg-green-700 inline-flex items-center justify-center"><MessageCircle size={12} /></a>
    </div>
  );
}

function Amount({ c }) {
  const tip = [c.purchases ? `${c.purchases} vehicle${c.purchases > 1 ? "s" : ""}` : "No purchase yet", c.booked ? `${formatNPR(c.booked)} booking deposit` : ""].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap" title={tip}>
      {c.booked > 0 && <BookmarkCheck size={14} className="text-sky-600" aria-label="Has a booking deposit" />}
      <span className={`text-sm font-bold ${c.amount > 0 ? "text-slate-900" : "text-slate-300"}`} style={FONT}>{formatNPR(c.amount)}</span>
    </span>
  );
}

function CustomerName({ c, onShowReferred }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className={`shrink-0 w-8 h-8 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${avatarOf(c.name)}`} aria-hidden="true">{initialsOf(c.name)}</span>
      <span className="font-semibold text-slate-900 truncate" title={c.name}>{c.name}</span>
      {c.referral_count > 0 && (
        <button onClick={() => onShowReferred(c)} title="Show everyone they referred" data-testid="crm-referred-badge"
          className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100">Referred {c.referral_count}</button>
      )}
    </div>
  );
}

// Only one layout is mounted at a time: the table from 1360px up (where all eight columns fit on one line), cards below. (Rendering both and hiding one
// with CSS would mount two referrer pickers for the same row.)
function useWide() {
  const query = "(min-width: 1360px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function CRM() {
  const sellers = useSellers();
  const wide = useWide();
  const [customers, setCustomers] = useState(null);
  const [filter, setFilter] = useState("all"); // all | needs | a lead key
  const [seller, setSeller] = useState("all"); // all | none | a team member id
  const [search, setSearch] = useState("");
  const [referrer, setReferrer] = useState(null); // { id, name }: only the people this customer referred
  const [sort, setSort] = useState({ key: "newest", dir: "desc" });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [pending, setPending] = useState(null); // { id, source, note }: a Referral/Other being filled in
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async (silent) => {
    try { setCustomers((await api.get("/crm/customers", { suppressErrorToast: !!silent })).data); }
    catch { if (!silent) toast.error("Failed to load customers"); }
  }, []);

  useEffect(() => {
    load(false);
    const refresh = () => { if (document.visibilityState === "visible") load(true); };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  useEffect(() => { setShown(PAGE_SIZE); }, [filter, seller, search, referrer, sort]);

  const counts = useMemo(() => {
    const n = { all: 0, needs: 0 };
    SOURCES.forEach(s => { n[s.key] = 0; });
    (customers || []).forEach(c => { n.all += 1; if (c.source) n[c.source] += 1; else n.needs += 1; });
    return n;
  }, [customers]);

  // Everyone who has sold something (current Team list plus anyone only named on a sale), for the filter.
  const sellerOptions = useMemo(() => {
    const seen = new Map(sellers.map(s => [s.id, s.name]));
    (customers || []).forEach(c => { if (c.sold_by_id && !seen.has(c.sold_by_id)) seen.set(c.sold_by_id, c.sold_by_name || "Previous seller"); });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sellers, customers]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keyOf = {
      newest: c => c.created_at || "", name: c => c.name.toLowerCase(), amount: c => c.amount,
      soldby: c => (c.sold_by_name || "").toLowerCase(), lead: c => leadLabel(c).toLowerCase(), referred: c => referredByLabel(c).toLowerCase(),
    }[sort.key];
    const dir = sort.dir === "asc" ? 1 : -1;
    return (customers || [])
      .filter(c =>
        (filter === "all" || (filter === "needs" ? !c.source : c.source === filter)) &&
        (seller === "all" || (seller === "none" ? !c.sold_by_id : c.sold_by_id === seller)) &&
        (!referrer || c.referred_by_id === referrer.id) &&
        (!q || c.name.toLowerCase().includes(q) || c.contact_number.includes(q) || c.address.toLowerCase().includes(q)))
      .sort((a, b) => { const x = keyOf(a), y = keyOf(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [customers, filter, seller, search, referrer, sort]);

  const total = useMemo(() => list.reduce((n, c) => n + c.amount, 0), [list]);

  const toggleSort = (key) => setSort(s => (
    s.key !== key ? { key, dir: FIRST_DIR[key] }
      : s.dir === FIRST_DIR[key] ? { key, dir: FIRST_DIR[key] === "asc" ? "desc" : "asc" }
        : { key: "newest", dir: "desc" }));

  const saveLead = async (c, value) => {
    setSavingId(c.id);
    try {
      await api.put(`/customers/${c.id}/source`, { source: value.source, source_note: value.source_note || null, referred_by_id: value.referred_by_id || null });
      setPending(null);
      await load(true);
      toast.success(`${c.name} updated`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save the lead");
    } finally { setSavingId(null); }
  };
  const changeLead = (c, key) => {
    if (key === "referral" || key === "other") { setPending({ id: c.id, source: key, note: c.source === key ? c.source_note || "" : "" }); return; }
    setPending(null);
    if (key !== c.source) saveLead(c, { source: key });
  };
  const editDetail = (c, kind) => setPending({ id: c.id, source: kind, note: c.source === kind ? c.source_note || "" : "" });
  const pickReferrer = (c, id) => saveLead(c, { source: "referral", referred_by_id: id });
  const nameReferrer = (c, name) => saveLead(c, { source: "referral", source_note: name });
  const saveNote = (c, note) => saveLead(c, { source: "other", source_note: note.trim() });
  const cancelPending = useCallback(() => setPending(null), []);

  const changeSeller = async (c, id) => {
    setSavingId(c.id);
    try {
      await api.put(`/customers/${c.id}/sold-by`, { sold_by_id: id || null });
      await load(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save who sold it");
    } finally { setSavingId(null); }
  };
  const showReferred = (c) => { setReferrer({ id: c.id, name: c.name }); setFilter("all"); setSeller("all"); setSearch(""); };

  const exportCsv = () => {
    const rows = [["SN", "Customer", "Address", "Contact", "Transaction amount", "Sold by", "Lead", "Referred by"],
      ...list.map((c, i) => [i + 1, c.name, c.address, c.contact_number, c.amount, c.sold_by_name || "", leadLabel(c) || "Not tagged", referredByLabel(c)])];
    const blob = new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `crm-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!customers) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }

  const tagged = counts.all - counts.needs;
  const referrers = customers.filter(c => c.referral_count > 0).length;
  const visible = list.slice(0, shown);
  const chips = [["all", "All"], ["needs", "Not tagged"], ...SOURCES.map(s => [s.key, s.label])];
  const cellProps = { customers, pending, onPickReferrer: pickReferrer, onNameReferrer: nameReferrer, onSaveNote: saveNote, onCancel: cancelPending, onEdit: editDetail };

  const sortableTh = (k, label, right) => (
    <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-2.5 py-3 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${right ? "flex-row-reverse" : ""}`}>
        {label}{sort.key === k && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  const plainTh = (label, cls = "") => <th scope="col" className={`px-2.5 py-3 text-left font-semibold uppercase tracking-wider whitespace-nowrap ${cls}`}>{label}</th>;

  const stats = [
    [Users, "bg-blue-50 text-blue-600", counts.all.toLocaleString(), "Customers", `${tagged.toLocaleString()} with a lead`],
    [Target, "bg-emerald-50 text-emerald-600", `${counts.all ? Math.round((tagged / counts.all) * 100) : 0}%`, "Lead known", counts.needs ? `${counts.needs} not tagged` : "All tagged"],
    [Link2, "bg-amber-50 text-amber-600", counts.referral.toLocaleString(), "By referral", referrers ? `${referrers} referred others` : "No chains yet"],
  ];

  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map(([Icon, tone, value, label, sub]) => (
          <div key={label} className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-3 sm:p-4 flex items-center gap-3">
            <span className={`hidden sm:inline-flex shrink-0 w-11 h-11 rounded-xl items-center justify-center ${tone}`}><Icon size={20} /></span>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight" style={FONT}>{value}</div>
              <div className="text-xs font-semibold text-slate-600">{label}</div>
              <div className="text-[11px] text-slate-400 truncate">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or address" className="w-full h-11 pl-10 pr-3 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" data-testid="crm-search" />
        </div>
        <div className="relative">
          <select value={seller} onChange={e => setSeller(e.target.value)} aria-label="Filter by seller" data-testid="crm-seller-filter"
            className={`${selectBase} h-11 pl-4 pr-9 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700`}>
            <option value="all">All sellers</option>
            {sellerOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="none">Seller not set</option>
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <button onClick={exportCsv} disabled={list.length === 0} data-testid="crm-export" className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"><Download size={15} /> Export CSV</button>
      </div>

      <div role="group" aria-label="Filter by lead" style={{ scrollbarWidth: "none" }} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-scroll sm:overflow-visible sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {chips.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} data-testid={`crm-filter-${k}`}
            className={`shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === k ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {label}<span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === k ? "bg-white/25" : k === "needs" && counts.needs ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {referrer && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2.5 text-sm text-amber-900" data-testid="crm-referrer-banner">
          <span>Customers referred by <b>{referrer.name}</b> ({list.length})</span>
          <button onClick={() => setReferrer(null)} className="font-semibold text-amber-800 hover:underline inline-flex items-center gap-1"><X size={14} /> Show all</button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><UserCheck size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{filter === "needs" && seller === "all" && !search && !referrer ? "Everyone has a lead" : counts.all === 0 ? "No customers yet" : "No customers match"}</h3>
          <p className="mt-1 text-sm text-slate-600">{counts.all === 0 ? "Customers appear here as soon as they are added from Sales, Bookings or the Ledger." : "Try another filter or search."}</p>
        </div>
      ) : (
        <>
          {wide ? (
          /* Table on wide screens: one line per customer */
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm" data-testid="crm-table">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 text-[11px] text-slate-500 border-b border-slate-200">
                <tr>
                  {plainTh("SN", "w-12")}
                  {sortableTh("name", "Customer")}
                  {plainTh("Address")}
                  {plainTh("Contact")}
                  {sortableTh("amount", "Transaction amount", true)}
                  {sortableTh("soldby", "Sold By")}
                  {sortableTh("lead", "Lead")}
                  {sortableTh("referred", "Referred by")}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c, i) => (
                  <tr key={c.id} className={`group transition-colors hover:bg-blue-50/40 ${c.source ? "" : "bg-amber-50/30"}`} data-testid="crm-row">
                    <td className={`px-2.5 py-2.5 text-slate-400 tabular-nums ${c.source ? "" : "shadow-[inset_3px_0_0_0_#f59e0b]"}`}>{i + 1}</td>
                    <td className="px-2.5 py-2.5 max-w-[186px]"><CustomerName c={c} onShowReferred={showReferred} /></td>
                    <td className="px-2.5 py-2.5 max-w-[100px] truncate text-slate-600" title={c.address}>{c.address || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2.5 py-2.5"><Contact c={c} /></td>
                    <td className="px-2.5 py-2.5 text-right"><Amount c={c} /></td>
                    <td className="px-2.5 py-2.5"><SellerSelect c={c} sellers={sellers} disabled={savingId === c.id} onChange={changeSeller} /></td>
                    <td className="px-2.5 py-2.5"><LeadSelect value={pending?.id === c.id ? pending.source : c.source} disabled={savingId === c.id} onChange={key => changeLead(c, key)} /></td>
                    <td className="px-2.5 py-2.5"><ReferredByCell c={c} {...cellProps} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={4} className="px-2.5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total · {list.length.toLocaleString()} customer{list.length === 1 ? "" : "s"}</td>
                  <td className="px-2.5 py-3 text-right text-sm font-bold text-slate-900 whitespace-nowrap" style={FONT}>{formatNPR(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          ) : (
          /* Cards on phones and tablets */
          <div className="space-y-3">
            {visible.map((c, i) => (
              <div key={c.id} className={`bg-white border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${c.source ? "border-slate-200/80" : "border-amber-300"}`} data-testid="crm-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1"><CustomerName c={c} onShowReferred={showReferred} /></div>
                  <Amount c={c} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-slate-500">
                  <span className="tabular-nums">SN {i + 1}{c.address ? ` · ${c.address}` : ""}</span>
                  <Contact c={c} />
                </div>
                <dl className="mt-3 grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2 text-xs">
                  <dt className="font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Sold by</dt>
                  <dd><SellerSelect c={c} sellers={sellers} disabled={savingId === c.id} onChange={changeSeller} /></dd>
                  <dt className="font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Lead</dt>
                  <dd><LeadSelect value={pending?.id === c.id ? pending.source : c.source} disabled={savingId === c.id} onChange={key => changeLead(c, key)} testid="crm-lead-card" /></dd>
                  <dt className="font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Referred by</dt>
                  <dd className="min-w-0"><ReferredByCell c={c} {...cellProps} /></dd>
                </dl>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total · {list.length.toLocaleString()}</span>
              <span className="font-bold text-slate-900" style={FONT}>{formatNPR(total)}</span>
            </div>
          </div>
          )}

          {list.length > shown && (
            <button onClick={() => setShown(s => s + PAGE_SIZE)} className="w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50">Show more ({list.length - shown} left)</button>
          )}
        </>
      )}
    </div>
  );
}
