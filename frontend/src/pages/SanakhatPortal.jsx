import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, X, CheckCircle2, Clock, XCircle, Bike, AlertTriangle, SearchX, CalendarCheck2, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import BSDatePicker from "../components/BSDatePicker";
import { formatBSDate } from "../utils/nepali-date";

// The Sanakhat desk: every vehicle in the company, whatever its stock status, with its Sanaakhat (ownership
// termination) progress. Search for a bike, see at a glance whether its Sanakhat is done, and update it.
// Data comes from /sanakhat/vehicles, which carries no prices or purchase details, so this is safe to hand to one person.
const FONT = { fontFamily: "Manrope" };
const PAGE = 36;
const OVERDUE_DAYS = 30;

const STATES = {
  yes: { label: "Done", short: "Done", Icon: CheckCircle2, chip: "bg-emerald-100 text-emerald-800", on: "bg-emerald-600 text-white shadow-sm", ring: "border-emerald-300 bg-emerald-50/50" },
  pending: { label: "Not done yet", short: "Not done", Icon: Clock, chip: "bg-amber-100 text-amber-800", on: "bg-amber-500 text-white shadow-sm", ring: "border-amber-300 bg-amber-50/40" },
  no: { label: "Refused / No", short: "No", Icon: XCircle, chip: "bg-red-100 text-red-800", on: "bg-red-600 text-white shadow-sm", ring: "border-red-300 bg-red-50/40" },
};
// The desk only deals in Done / Not done. A vehicle an older screen marked "No" counts as Not done here.
const stateOf = v => (v.ownership_termination_status === "yes" ? "yes" : "pending");
const STOCK = {
  available: ["In stock", "bg-blue-50 text-blue-700"],
  reserved: ["Booked", "bg-violet-50 text-violet-700"],
  in_repair: ["In repair", "bg-orange-50 text-orange-700"],
  sold: ["Sold", "bg-slate-200 text-slate-700"],
  scrap: ["Scrap", "bg-slate-200 text-slate-500"],
  unlisted: ["Unlisted", "bg-slate-100 text-slate-600"],
};
const stockOf = s => STOCK[s] || [String(s || "").replace(/_/g, " ") || "In stock", "bg-slate-100 text-slate-600"];

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysSince = d => {
  const t = new Date(`${(d || "").slice(0, 10)}T00:00:00`);
  return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t.getTime()) / 86400000));
};

const ACCENT = { yes: "bg-emerald-500", pending: "bg-amber-400", no: "bg-red-500" };

function VehicleCard({ v, busy, onDone, onUndo }) {
  const state = stateOf(v);
  const st = STATES[state];
  const [stockLabel, stockCls] = stockOf(v.status);
  const waiting = state === "pending" ? daysSince(v.sanakhat_date) : null;
  const overdue = waiting !== null && waiting > OVERDUE_DAYS && v.status !== "sold" && v.status !== "scrap";
  return (
    <div data-testid="sanakhat-card" data-state={state}
      className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white pl-5 pr-4 py-4 shadow-sm transition hover:shadow-md ${busy ? "opacity-70" : ""}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${ACCENT[state]}`} />
      <div className="flex items-center gap-3">
        <span className={`size-10 shrink-0 rounded-xl flex items-center justify-center ${st.chip}`}><Bike size={19} /></span>
        <h3 className="min-w-0 flex-1 text-base font-bold text-slate-900 leading-snug line-clamp-2 break-words" style={FONT}>{[v.brand, v.model, v.year].filter(Boolean).join(" ")}</h3>
        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 ${st.chip}`}><st.Icon size={13} />{st.short}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {v.registration_number
          ? <span className="font-mono text-sm font-bold tracking-wide text-slate-800 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-0.5">{v.registration_number}</span>
          : <span className="text-xs text-slate-400 italic">No number yet</span>}
        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${stockCls}`}>{stockLabel}</span>
        {v.color && <span className="text-xs text-slate-400">{v.color}</span>}
      </div>

      {state === "yes" ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
          <span className="size-9 shrink-0 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><CalendarCheck2 size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/70">Sanakhat date</div>
            <div className="text-sm font-bold text-emerald-900 truncate">{v.sanakhat_date ? `${formatBSDate(v.sanakhat_date.slice(0, 10))} BS` : "No date saved"}</div>
          </div>
          <button type="button" onClick={() => onDone(v)} disabled={busy} aria-label="Change the Sanakhat date" title="Change the date" className="touch-manipulation size-10 rounded-lg text-emerald-700 hover:bg-emerald-100 flex items-center justify-center"><Pencil size={16} /></button>
          <button type="button" onClick={() => onUndo(v)} disabled={busy} aria-label="Mark as not done" title="Mark as not done" className="touch-manipulation size-10 rounded-lg text-slate-500 hover:bg-white flex items-center justify-center"><Undo2 size={16} /></button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {waiting !== null && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${overdue ? "text-red-600" : "text-slate-500"}`}>
              {overdue ? <AlertTriangle size={13} /> : <Clock size={13} />}
              Started {formatBSDate(v.sanakhat_date.slice(0, 10))} BS · {waiting === 0 ? "today" : `${waiting} day${waiting > 1 ? "s" : ""} waiting`}
            </div>
          )}
          <button type="button" onClick={() => onDone(v)} disabled={busy} data-testid="sanakhat-mark-done"
            className="touch-manipulation w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm hover:from-emerald-700 hover:to-emerald-600 active:scale-[0.99] transition">
            <CheckCircle2 size={18} /> Mark Sanakhat done
          </button>
        </div>
      )}
    </div>
  );
}

// Opens when "Mark Sanakhat done" is pressed: pick the Sanakhat date (Nepali calendar), then Save or Cancel.
function DoneModal({ v, saving, onCancel, onSave }) {
  const [date, setDate] = useState((v.sanakhat_date || "").slice(0, 10) || todayLocal());
  useEffect(() => {
    const h = e => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  const editing = stateOf(v) === "yes";
  return (
    <div className="fixed inset-0 z-[45] flex items-end sm:items-center justify-center bg-slate-900/55 backdrop-blur-[2px] sm:p-4" onClick={onCancel} data-testid="sanakhat-done-modal">
      <div role="dialog" aria-modal="true" aria-label="Sanakhat date" onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-500 text-white px-5 pt-5 pb-4">
          <span className="size-11 rounded-2xl bg-white/20 flex items-center justify-center"><CheckCircle2 size={24} /></span>
          <h2 className="mt-3 text-lg font-bold leading-tight" style={FONT}>{editing ? "Change Sanakhat date" : "Sanakhat done"}</h2>
          <p className="mt-0.5 text-sm text-emerald-50 truncate">{[v.brand, v.model, v.year].filter(Boolean).join(" ")}{v.registration_number ? ` · ${v.registration_number}` : ""}</p>
        </div>
        <div className="px-5 py-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><CalendarCheck2 size={14} /> Sanakhat date (BS)</div>
          <BSDatePicker value={date} onChange={setDate} />
          <p className="mt-3 text-xs text-slate-400">Pick the day the Sanakhat was done, then press Save.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 pb-5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onCancel} disabled={saving} className="touch-manipulation h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" data-testid="sanakhat-cancel">Cancel</button>
          <button type="button" onClick={() => onSave(v, date)} disabled={saving || !date} className="touch-manipulation h-12 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center justify-center gap-2" data-testid="sanakhat-save">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SanakhatPortal() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  // While the keyboard is up on a phone, only the search box stays on screen so the list below it is still visible.
  const [typing, setTyping] = useState(false);
  const [filter, setFilter] = useState("all");   // all | pending | yes
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState(null);
  const [doneFor, setDoneFor] = useState(null); // the vehicle whose Sanakhat-date popup is open

  const load = useCallback(async () => {
    try { const { data } = await api.get("/sanakhat/vehicles"); setRows(data); }
    catch { toast.error("Could not load the vehicles"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [q, filter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, yes: 0, pending: 0 };
    rows.forEach(v => { c[stateOf(v)] += 1; });
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, " ");
    const squash = s => String(s || "").toLowerCase().replace(/[\s-]/g, "");
    return rows.filter(v => {
      if (filter !== "all" && stateOf(v) !== filter) return false;
      if (!t) return true;
      const hay = `${v.brand || ""} ${v.model || ""} ${v.year || ""} ${v.color || ""} ${v.registration_number || ""}`.toLowerCase();
      return hay.includes(t) || squash(v.registration_number).includes(squash(t));
    });
  }, [rows, q, filter]);

  const patch = async (v, body, okMsg) => {
    const before = { ownership_termination_status: v.ownership_termination_status, sanakhat_date: v.sanakhat_date };
    setRows(rs => rs.map(x => (x.id === v.id ? { ...x, ...body } : x)));
    setBusyId(v.id);
    try { await api.patch(`/sanakhat/vehicles/${v.id}`, body, { suppressErrorToast: true }); toast.success(okMsg); return true; }
    catch (ex) {
      setRows(rs => rs.map(x => (x.id === v.id ? { ...x, ...before } : x)));
      toast.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Could not save that change");
      return false;
    } finally { setBusyId(null); }
  };
  const saveDone = async (v, date) => {
    const ok = await patch(v, { ownership_termination_status: "yes", sanakhat_date: date }, `${[v.brand, v.model].filter(Boolean).join(" ")}: Sanakhat done`);
    if (ok) setDoneFor(null);
  };
  const undo = v => {
    if (!window.confirm(`Mark Sanakhat of ${[v.brand, v.model].filter(Boolean).join(" ")} as not done?`)) return;
    patch(v, { ownership_termination_status: "pending" }, "Marked as not done");
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const FILTERS = [["all", "All", counts.all], ["pending", "Not done", counts.pending], ["yes", "Done", counts.yes]];
  return (
    <div className="space-y-4 animate-fade-in pb-8" data-testid="sanakhat-portal">
      {/* Search */}
      <div className="rounded-xl bg-white border border-slate-200/80 shadow-sm p-3 space-y-3 sticky top-0 z-10">
        <form onSubmit={e => { e.preventDefault(); document.activeElement?.blur?.(); }} className="flex items-center gap-2" role="search">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" enterKeyHint="search" inputMode="search" autoComplete="off" autoCorrect="off" spellCheck={false}
              value={q} onChange={e => setQ(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} placeholder="Search plate, brand or model"
              className="w-full h-11 pl-10 pr-10 rounded-lg border border-slate-200 bg-slate-50 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-search-cancel-button]:hidden" data-testid="sanakhat-search" />
            {q && <button type="button" onPointerDown={e => e.preventDefault()} onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={17} /></button>}
          </div>
          {/* Closes the keyboard so the whole list can be seen (the keyboard's own Enter / Search key does the same). */}
          {typing && <button type="submit" onPointerDown={e => e.preventDefault()} className="sm:hidden h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold shrink-0" data-testid="sanakhat-search-done">Search</button>}
        </form>
        <div className={`${typing ? "hidden sm:block" : ""} -mx-3 px-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:overflow-visible`}>
          <div className="flex items-center gap-2 w-max sm:w-auto sm:flex-wrap">
            {FILTERS.map(([k, label, n]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                className={`touch-manipulation h-9 px-3.5 rounded-full text-sm font-semibold border whitespace-nowrap transition ${filter === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {label} <span className={`ml-1 text-xs ${filter === k ? "text-blue-100" : "text-slate-400"}`}>{n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <p className="text-xs font-medium text-slate-500 px-1 -mb-1">{list.length === rows.length ? `${rows.length.toLocaleString()} vehicles` : `${list.length.toLocaleString()} of ${rows.length.toLocaleString()} vehicles`}</p>
      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-14 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><SearchX size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{rows.length ? "No vehicle matches" : "No vehicles yet"}</h3>
          <p className="mt-1 text-sm text-slate-600">{rows.length ? "Try a different number plate or clear the filters." : "Vehicles added to the stock appear here."}</p>
          {(q || filter !== "all") && <button type="button" onClick={() => { setQ(""); setFilter("all"); }} className="mt-4 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold">Clear search and filters</button>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {list.slice(0, shown).map(v => <VehicleCard key={v.id} v={v} busy={busyId === v.id} onDone={setDoneFor} onUndo={undo} />)}
          </div>
          {shown < list.length && (
            <div className="text-center"><button type="button" onClick={() => setShown(shown + PAGE)} className="h-10 px-6 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">Show more ({list.length - shown} left)</button></div>
          )}
        </>
      )}
      {doneFor && <DoneModal v={doneFor} saving={busyId === doneFor.id} onCancel={() => setDoneFor(null)} onSave={saveDone} />}
    </div>
  );
}
