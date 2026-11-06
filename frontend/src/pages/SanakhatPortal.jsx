import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, X, CheckCircle2, Clock, XCircle, FileCheck2, Bike, AlertTriangle, SearchX } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import BSDatePicker from "../components/BSDatePicker";

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

const daysSince = d => {
  const t = new Date(`${(d || "").slice(0, 10)}T00:00:00`);
  return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t.getTime()) / 86400000));
};

const ACCENT = { yes: "bg-emerald-500", pending: "bg-amber-400", no: "bg-red-500" };

function VehicleCard({ v, busy, onStatus, onDate }) {
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

      <div role="group" aria-label="Sanakhat status" className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5">
        {["yes", "pending"].map(k => {
          const s = STATES[k]; const on = state === k;
          return (
            <button key={k} type="button" disabled={busy || on} onClick={() => onStatus(v, k)} aria-pressed={on} data-testid={`sanakhat-set-${k}`}
              className={`touch-manipulation h-11 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition ${on ? s.on : "text-slate-500 hover:bg-white hover:text-slate-800"}`}>
              <s.Icon size={15} />{s.short}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sanakhat date (BS)</span>
          {waiting !== null && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 ${overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
              {overdue && <AlertTriangle size={12} />}{waiting === 0 ? "Started today" : `${waiting} day${waiting > 1 ? "s" : ""} waiting`}
            </span>
          )}
        </div>
        <BSDatePicker value={(v.sanakhat_date || "").slice(0, 10)} onChange={d => onDate(v, d)} />
      </div>
    </div>
  );
}

export default function SanakhatPortal() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");   // all | pending | yes
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState(null);

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
    try { await api.patch(`/sanakhat/vehicles/${v.id}`, body, { suppressErrorToast: true }); toast.success(okMsg); }
    catch (ex) {
      setRows(rs => rs.map(x => (x.id === v.id ? { ...x, ...before } : x)));
      toast.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Could not save that change");
    } finally { setBusyId(null); }
  };
  const setStatus = (v, k) => patch(v, { ownership_termination_status: k }, `${[v.brand, v.model].filter(Boolean).join(" ")}: Sanakhat ${STATES[k].short.toLowerCase()}`);
  const setDate = (v, d) => patch(v, { sanakhat_date: d }, d ? "Date saved" : "Date cleared");

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  const FILTERS = [["all", "All", counts.all], ["pending", "Not done", counts.pending], ["yes", "Done", counts.yes]];
  return (
    <div className="space-y-4 animate-fade-in pb-8" data-testid="sanakhat-portal">
      <div className="flex items-center gap-2.5">
        <span className="size-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm"><FileCheck2 size={18} /></span>
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight" style={FONT}>Sanakhat</h1>
          <p className="text-xs text-slate-500">Search a bike and set its Sanakhat status and date</p>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl bg-white border border-slate-200/80 shadow-sm p-3 space-y-3 sticky top-0 z-10">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search plate, brand or model"
            className="w-full h-11 pl-10 pr-10 rounded-lg border border-slate-200 bg-slate-50 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="sanakhat-search" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>}
        </div>
        <div className="-mx-3 px-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:overflow-visible">
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
            {list.slice(0, shown).map(v => <VehicleCard key={v.id} v={v} busy={busyId === v.id} onStatus={setStatus} onDate={setDate} />)}
          </div>
          {shown < list.length && (
            <div className="text-center"><button type="button" onClick={() => setShown(shown + PAGE)} className="h-10 px-6 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">Show more ({list.length - shown} left)</button></div>
          )}
        </>
      )}
    </div>
  );
}
