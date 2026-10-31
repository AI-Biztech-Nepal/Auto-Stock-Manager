import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Pencil, Phone, MessageCircle, Search, Check, X, ChevronDown, ArrowUp, ArrowDown, BookmarkCheck } from "lucide-react";
import { formatNPR } from "../../utils/helpers";
import {
  SOURCES, SOURCE_STYLE, STATUS_BY_KEY, PICKABLE_STATUSES, referredByLabel,
  shortBS, timeOf, dateTimeTitle, waNumber,
} from "../../utils/crm";
import { FONT, Avatar, StatusBadge } from "./ui";

// The customer table: one row per customer, the way the mockup lays it out. Lead Source, Lead Status and Assigned To
// are dropdowns that save the moment they change; the referrer's name is picked (or typed) right under Lead Source.
const selectBase = "appearance-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-wait";

function Chevron({ className = "right-2" }) {
  return <ChevronDown size={12} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-60 ${className}`} />;
}

function LeadSourceSelect({ value, disabled, onChange }) {
  const tone = value ? SOURCE_STYLE[value].pill : "bg-amber-50 text-amber-700 ring-1 ring-amber-300";
  return (
    <div className="relative inline-block">
      <select value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)} aria-label="Lead source" data-testid="crm-lead"
        className={`${selectBase} h-7 pl-2.5 pr-6 rounded-full text-[11px] font-semibold ${tone}`}>
        {!value && <option value="" disabled>Select source</option>}
        {SOURCES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Chevron />
    </div>
  );
}

function StatusSelect({ c, disabled, onChange }) {
  if (c.status_locked) return <StatusBadge status="converted" title="Converted automatically: this customer has bought a vehicle" />;
  const s = STATUS_BY_KEY[c.lead_status];
  return (
    <div className="relative inline-block">
      <select value={c.lead_status} disabled={disabled} onChange={e => onChange(c, e.target.value)} aria-label={`Lead status, ${c.name}`} data-testid="crm-status"
        className={`${selectBase} h-6 pl-2.5 pr-6 rounded-full text-[11px] font-semibold ${s.pill}`}>
        {PICKABLE_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <Chevron />
    </div>
  );
}

function AssignSelect({ c, sellers, disabled, onChange }) {
  const known = sellers.some(s => s.id === c.assigned_to_id);
  return (
    <div className="relative w-[134px] max-w-full">
      <select value={c.assigned_to_id || ""} disabled={disabled} onChange={e => onChange(c, e.target.value)} aria-label={`Assigned to, ${c.name}`} data-testid="crm-assigned"
        className={`${selectBase} h-7 w-full pl-2 pr-6 rounded-lg border text-xs font-medium truncate ${c.assigned_to_id ? "bg-white border-slate-200 text-slate-800 hover:border-slate-300" : "bg-slate-50 border-dashed border-slate-300 text-slate-400 hover:border-slate-400"}`}>
        <option value="">Unassigned</option>
        {c.assigned_to_id && !known && <option value={c.assigned_to_id}>{c.assigned_to_name || "Previous salesperson"}</option>}
        {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Chevron className="right-1.5 text-slate-400" />
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
      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} onBlur={() => setTimeout(onCancel, 150)}
        placeholder="Search or type a name" data-testid="referrer-search"
        className="w-full h-7 pl-6 pr-2 text-[11px] border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
        className="flex-1 min-w-0 h-7 px-2 text-[11px] border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={() => onSave(v)} aria-label="Save" data-testid="crm-save-note" className="shrink-0 h-7 w-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center"><Check size={13} /></button>
      <button onClick={onCancel} aria-label="Cancel" className="shrink-0 h-7 w-5 rounded-lg text-slate-400 hover:bg-slate-100 inline-flex items-center justify-center"><X size={13} /></button>
    </div>
  );
}

// Lead Source: the kind of lead, and under it the referrer's name (or the detail for "Other").
function LeadSourceCell({ c, pending, customers, disabled, onLeadChange, onPickReferrer, onNameReferrer, onSaveNote, onCancel, onEdit }) {
  const mine = pending?.id === c.id ? pending : null;
  const kind = mine ? mine.source : c.source;
  let detail = null;
  if (kind === "referral") {
    detail = mine
      ? <ReferrerCombo customers={customers} excludeId={c.id} onPick={id => onPickReferrer(c, id)} onName={name => onNameReferrer(c, name)} onCancel={onCancel} />
      : <button onClick={() => onEdit(c, "referral")} title="Change who referred them" data-testid="crm-referred-by"
          className={`block max-w-full truncate text-[11px] text-left hover:underline ${referredByLabel(c) ? "font-semibold text-slate-700 hover:text-blue-700" : "text-slate-400 italic"}`}>{referredByLabel(c) || "Add name"}</button>;
  } else if (kind === "other") {
    detail = mine
      ? <OtherNote initial={mine.note} onSave={note => onSaveNote(c, note)} onCancel={onCancel} />
      : <button onClick={() => onEdit(c, "other")} title="Edit" data-testid="crm-referred-by"
          className={`block max-w-full truncate text-[11px] text-left hover:underline ${referredByLabel(c) ? "text-slate-600 hover:text-blue-700" : "text-slate-400 italic"}`}>{referredByLabel(c) || "Add detail"}</button>;
  }
  return (
    <div className="flex flex-col items-start gap-1 w-[132px] max-w-full">
      <LeadSourceSelect value={kind} disabled={disabled} onChange={key => onLeadChange(c, key)} />
      {detail}
    </div>
  );
}

function VehicleCell({ c }) {
  const text = c.interested_vehicle || c.purchased_vehicle;
  if (!text) return <span className="text-slate-300">—</span>;
  return <span className={`block max-w-[124px] truncate ${c.interested_vehicle ? "text-slate-700" : "text-slate-500"}`} title={c.interested_vehicle ? text : `Bought: ${text}`}>{text}</span>;
}

function NextFollowUp({ c }) {
  const f = c.next_followup;
  if (!f) return <span className="text-slate-300">—</span>;
  const late = new Date(f.due_at).getTime() < Date.now();
  return (
    <div className={late ? "text-red-600" : "text-slate-700"} title={`${f.purpose} · ${dateTimeTitle(f.due_at)}`}>
      <div className="font-semibold leading-4">{shortBS(f.due_at)}</div>
      <div className="text-[11px] leading-4 opacity-75">{timeOf(f.due_at)}</div>
    </div>
  );
}

function LastContact({ c }) {
  if (!c.last_contact_at) return <span className="text-slate-300">—</span>;
  return <span className="text-slate-600 whitespace-nowrap" title={dateTimeTitle(c.last_contact_at)}>{shortBS(c.last_contact_at)}</span>;
}

function Amount({ c }) {
  const tip = [c.purchases ? `${c.purchases} vehicle${c.purchases > 1 ? "s" : ""}` : "No purchase yet", c.booked ? `${formatNPR(c.booked)} booking deposit` : ""].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap" title={tip}>
      {c.booked > 0 && <BookmarkCheck size={13} className="text-sky-600" aria-label="Has a booking deposit" />}
      <span className={`font-bold ${c.amount > 0 ? "text-slate-900" : "text-slate-300"}`} style={FONT}>{formatNPR(c.amount)}</span>
    </span>
  );
}

const iconBtn = "w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function Actions({ c, onView, onEdit, onContact }) {
  const has = !!c.contact_number;
  return (
    <div className="flex items-center gap-1" data-testid="crm-actions">
      <button onClick={() => onView(c)} aria-label={`View ${c.name}`} title="View profile" data-testid="crm-view" className={`${iconBtn} text-slate-500 hover:text-blue-700 hover:bg-blue-50`}><Eye size={16} /></button>
      <button onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`} title="Edit" data-testid="crm-edit" className={`${iconBtn} text-slate-500 hover:text-blue-700 hover:bg-blue-50`}><Pencil size={15} /></button>
      {has
        ? <a href={`tel:${c.contact_number}`} onClick={() => onContact(c, "call")} aria-label={`Call ${c.name}`} title="Call" data-testid="crm-call" className={`${iconBtn} text-sky-600 hover:bg-sky-50`}><Phone size={15} /></a>
        : <span className={`${iconBtn} text-slate-300`} title="No phone number"><Phone size={15} /></span>}
      {has
        ? <a href={`https://wa.me/${waNumber(c.contact_number)}`} target="_blank" rel="noopener noreferrer" onClick={() => onContact(c, "whatsapp")} aria-label={`WhatsApp ${c.name}`} title="WhatsApp" data-testid="crm-whatsapp" className={`${iconBtn} text-green-600 hover:bg-green-50`}><MessageCircle size={16} /></a>
        : <span className={`${iconBtn} text-slate-300`} title="No phone number"><MessageCircle size={16} /></span>}
    </div>
  );
}

function CustomerName({ c, onView, onShowReferred }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar name={c.name} size={8} />
      <div className="min-w-0">
        <button onClick={() => onView(c)} className="block max-w-[140px] truncate text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline" title={c.name}>{c.name}</button>
        {c.referral_count > 0 && (
          <button onClick={() => onShowReferred(c)} title="Show everyone they referred" data-testid="crm-referred-badge"
            className="text-[10px] font-bold px-1.5 py-px rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100">Referred {c.referral_count}</button>
        )}
      </div>
    </div>
  );
}

export default function CustomerTable({
  rows, customers, sellers, wide, sort, onSort, total, count, savingId,
  onSaveLead, onStatus, onAssign, onView, onEdit, onContact, onShowReferred,
}) {
  // A Referral / Other being filled in: { id, source, note }. Saved only once the name or detail is given.
  const [pending, setPending] = useState(null);
  const cancel = useCallback(() => setPending(null), []);
  const done = async (c, payload) => { const ok = await onSaveLead(c, payload); if (ok) setPending(null); };
  const leadChange = (c, key) => {
    if (key === "referral" || key === "other") { setPending({ id: c.id, source: key, note: c.source === key ? c.source_note || "" : "" }); return; }
    setPending(null);
    if (key !== c.source) onSaveLead(c, { source: key });
  };
  const cell = {
    customers, pending, onLeadChange: leadChange, onCancel: cancel,
    onEdit: (c, kind) => setPending({ id: c.id, source: kind, note: c.source === kind ? c.source_note || "" : "" }),
    onPickReferrer: (c, id) => done(c, { source: "referral", referred_by_id: id }),
    onNameReferrer: (c, name) => done(c, { source: "referral", source_note: name }),
    onSaveNote: (c, note) => done(c, { source: "other", source_note: note.trim() }),
  };

  const th = (key, label, cls = "", right = false) => (
    <th scope="col" aria-sort={key && sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={`px-2.5 py-3 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"} ${cls}`}>
      {key ? (
        <button onClick={() => onSort(key)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${right ? "flex-row-reverse" : ""}`}>
          {label}{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      ) : <span className="uppercase tracking-wider">{label}</span>}
    </th>
  );

  if (!wide) {
    return (
      <div className="space-y-3" data-testid="crm-cards">
        {rows.map((c, i) => {
          const busy = savingId === c.id;
          return (
            <div key={c.id} className={`bg-white border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${c.source ? "border-slate-200/80" : "border-amber-300"}`} data-testid="crm-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><CustomerName c={c} onView={onView} onShowReferred={onShowReferred} /></div>
                <div className="text-sm text-right"><Amount c={c} /></div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="tabular-nums">#{i + 1}{c.address ? ` · ${c.address}` : ""}</span>
                {c.contact_number && <span className="font-medium text-slate-700 tabular-nums">{c.contact_number}</span>}
              </div>
              {(c.interested_vehicle || c.purchased_vehicle) && (
                <p className="mt-1.5 text-xs text-slate-600 truncate"><span className="text-slate-400">{c.interested_vehicle ? "Interested in " : "Bought "}</span>{c.interested_vehicle || c.purchased_vehicle}</p>
              )}
              <dl className="mt-3 grid grid-cols-[92px_1fr] items-start gap-x-3 gap-y-2.5 text-xs">
                <dt className="pt-1 font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Lead source</dt>
                <dd><LeadSourceCell c={c} disabled={busy} {...cell} /></dd>
                <dt className="pt-0.5 font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</dt>
                <dd><StatusSelect c={c} disabled={busy} onChange={onStatus} /></dd>
                <dt className="pt-1 font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Assigned to</dt>
                <dd><AssignSelect c={c} sellers={sellers} disabled={busy} onChange={onAssign} /></dd>
                <dt className="font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Last contact</dt>
                <dd className="text-slate-600"><LastContact c={c} /></dd>
                <dt className="font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Next follow-up</dt>
                <dd><NextFollowUp c={c} /></dd>
              </dl>
              <div className="mt-3 pt-3 border-t border-slate-100"><Actions c={c} onView={onView} onEdit={onEdit} onContact={onContact} /></div>
            </div>
          );
        })}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total · {count.toLocaleString()}</span>
          <span className="font-bold text-slate-900" style={FONT}>{formatNPR(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-x-auto" data-testid="crm-table-wrap">
      <table className="w-full min-w-[1320px] text-[13px]" data-testid="crm-table">
        <thead className="bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200">
          <tr>
            <th scope="col" className="sticky left-0 z-20 bg-slate-50 w-10 min-w-[40px] px-2.5 py-3 text-left font-semibold uppercase tracking-wider">SN</th>
            {th("name", "Customer", "sticky left-10 z-20 bg-slate-50 min-w-[180px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)]")}
            {th(null, "Contact")}
            {th(null, "Address")}
            {th("vehicle", "Interested Vehicle")}
            {th("lead", "Lead Source")}
            {th("status", "Lead Status")}
            {th("lastcontact", "Last Contact")}
            {th("nextfollowup", "Next Follow-up")}
            {th("assigned", "Assigned To")}
            {th("amount", "Transaction Amount", "", true)}
            {th(null, "Actions", "sticky right-0 z-20 bg-slate-50 shadow-[-2px_0_4px_-2px_rgba(15,23,42,0.15)]")}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c, i) => {
            const busy = savingId === c.id;
            return (
              <tr key={c.id} className={`group h-[58px] transition-colors hover:bg-blue-50 ${c.source ? "bg-white" : "bg-amber-50"}`} data-testid="crm-row">
                <td className={`sticky left-0 z-10 bg-inherit px-2.5 text-slate-400 tabular-nums ${c.source ? "" : "shadow-[inset_3px_0_0_0_#f59e0b]"}`}>{i + 1}</td>
                <td className="sticky left-10 z-10 bg-inherit px-2.5 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)]"><CustomerName c={c} onView={onView} onShowReferred={onShowReferred} /></td>
                <td className="px-2.5 whitespace-nowrap font-medium text-slate-700 tabular-nums">{c.contact_number || <span className="text-slate-300">—</span>}</td>
                <td className="px-2.5 max-w-[110px] truncate text-slate-600" title={c.address}>{c.address || <span className="text-slate-300">—</span>}</td>
                <td className="px-2.5"><VehicleCell c={c} /></td>
                <td className="px-2.5"><LeadSourceCell c={c} disabled={busy} {...cell} /></td>
                <td className="px-2.5"><StatusSelect c={c} disabled={busy} onChange={onStatus} /></td>
                <td className="px-2.5"><LastContact c={c} /></td>
                <td className="px-2.5"><NextFollowUp c={c} /></td>
                <td className="px-2.5"><AssignSelect c={c} sellers={sellers} disabled={busy} onChange={onAssign} /></td>
                <td className="px-2.5 text-right"><Amount c={c} /></td>
                <td className="sticky right-0 z-10 bg-inherit px-2.5 shadow-[-2px_0_4px_-2px_rgba(15,23,42,0.15)]"><Actions c={c} onView={onView} onEdit={onEdit} onContact={onContact} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 border-t border-slate-200">
            <td colSpan={10} className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total · {count.toLocaleString()} customer{count === 1 ? "" : "s"}</td>
            <td className="px-2.5 py-3 text-right text-sm font-bold text-slate-900 whitespace-nowrap" style={FONT}>{formatNPR(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// How the page sorts (kept next to the table so the keys stay in step with the columns).
export const SORTERS = {
  newest: c => c.created_at || "",
  name: c => c.name.toLowerCase(),
  vehicle: c => (c.interested_vehicle || c.purchased_vehicle || "").toLowerCase(),
  lead: c => (c.source || "~").toLowerCase(),
  status: c => c.lead_status,
  lastcontact: c => c.last_contact_at || "",
  nextfollowup: c => c.next_followup?.due_at || "9999",
  assigned: c => (c.assigned_to_name || "").toLowerCase(),
  amount: c => c.amount,
};
export const FIRST_DIR = { name: "asc", vehicle: "asc", lead: "asc", status: "asc", lastcontact: "desc", nextfollowup: "asc", assigned: "asc", amount: "desc" };
