import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, X, CheckCircle2, Clock, XCircle, FileCheck2, Bike, CalendarDays, AlertTriangle, SearchX } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

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
const fmtDate = d => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "");

function Ring({ pct }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-24 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="9" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
    </svg>
  );
}

const Tile = ({ icon: Icon, value, label, tone, active, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={active}
    className={`text-left rounded-2xl border p-4 transition shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:shadow-md ${active ? "border-blue-500 ring-2 ring-blue-100 bg-white" : "border-slate-200/80 bg-white"}`}>
    <span className={`size-9 rounded-xl flex items-center justify-center ${tone}`}><Icon size={18} /></span>
    <div className="mt-2 text-2xl font-bold text-slate-900 leading-none" style={FONT}>{value.toLocaleString()}</div>
    <div className="mt-1 text-xs text-slate-500">{label}</div>
  </button>
);

function VehicleCard({ v, busy, onStatus, onDate }) {
  const st = STATES[v.ownership_termination_status] || STATES.pending;
  const [stockLabel, stockCls] = stockOf(v.status);
  const waiting = v.ownership_termination_status === "pending" ? daysSince(v.sanakhat_date) : null;
  const overdue = waiting !== null && waiting > OVERDUE_DAYS && v.status !== "sold" && v.status !== "scrap";
  return (
    <div data-testid="sanakhat-card" data-state={v.ownership_termination_status}
      className={`rounded-2xl border p-4 transition shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${st.ring} ${busy ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="size-11 shrink-0 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center"><Bike size={20} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 leading-tight truncate" style={FONT}>{[v.brand, v.model, v.year].filter(Boolean).join(" ")}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {v.registration_number
              ? <span className="font-mono text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5">{v.registration_number}</span>
              : <span className="text-xs text-slate-400 italic">No number yet</span>}
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${stockCls}`}>{stockLabel}</span>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 ${st.chip}`}><st.Icon size={13} />{st.short}</span>
      </div>

      <div role="group" aria-label="Sanakhat status" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white border border-slate-200 p-1">
        {["yes", "pending", "no"].map(k => {
          const s = STATES[k]; const on = v.ownership_termination_status === k;
          return (
            <button key={k} type="button" disabled={busy || on} onClick={() => onStatus(v, k)} aria-pressed={on} data-testid={`sanakhat-set-${k}`}
              className={`touch-manipulation h-10 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition ${on ? s.on : "text-slate-500 hover:bg-slate-50"}`}>
              <s.Icon size={14} />{s.short}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays size={14} className="text-slate-400" /> Reached the shop
          <input type="date" value={(v.sanakhat_date || "").slice(0, 10)} onChange={e => onDate(v, e.target.value)} disabled={busy}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" data-testid="sanakhat-date" />
        </label>
        {waiting !== null && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
            {overdue && <AlertTriangle size={12} />}{waiting === 0 ? "Started today" : `${waiting} day${waiting > 1 ? "s" : ""} waiting`}
          </span>
        )}
        {v.ownership_termination_status === "yes" && v.sanakhat_date && <span className="text-xs text-slate-400">Started {fmtDate(v.sanakhat_date)}</span>}
      </div>
    </div>
  );
}

export default function SanakhatPortal({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");   // all | pending | yes | no
  const [stock, setStock] = useState("all");     // all | instock | sold
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/sanakhat/vehicles"); setRows(data); }
    catch { toast.error("Could not load the vehicles"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [q, filter, stock]);

  const counts = useMemo(() => {
    const c = { all: rows.length, yes: 0, pending: 0, no: 0 };
    rows.forEach(v => { c[v.ownership_termination_status] = (c[v.ownership_termination_status] || 0) + 1; });
    return c;
  }, [rows]);
  const pct = counts.all ? Math.round((counts.yes / counts.all) * 100) : 0;

  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, " ");
    const squash = s => String(s || "").toLowerCase().replace(/[\s-]/g, "");
    return rows.filter(v => {
      if (filter !== "all" && v.ownership_termination_status !== filter) return false;
      if (stock === "sold" && v.status !== "sold") return false;
      if (stock === "instock" && (v.status === "sold" || v.status === "scrap")) return false;
      if (!t) return true;
      const hay = `${v.brand || ""} ${v.model || ""} ${v.year || ""} ${v.color || ""} ${v.registration_number || ""}`.toLowerCase();
      return hay.includes(t) || squash(v.registration_number).includes(squash(t));
    });
  }, [rows, q, filter, stock]);

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

  const FILTERS = [["all", "All", counts.all], ["pending", "Not done", counts.pending], ["yes", "Done", counts.yes], ["no", "No", counts.no]];
  return (
    <div className="space-y-5 animate-fade-in" data-testid="sanakhat-portal">
      {/* Banner: overall progress */}
      <section className="rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 text-white p-5 sm:p-6 shadow-lg">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="relative">
            <Ring pct={pct} />
            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold" style={FONT}>{pct}%</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-100 text-xs font-semibold uppercase tracking-wider"><FileCheck2 size={15} /> Sanakhat desk</div>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold leading-tight" style={FONT}>{counts.yes.toLocaleString()} of {counts.all.toLocaleString()} bikes done</h1>
            <p className="mt-1 text-sm text-blue-100">{counts.pending.toLocaleString()} still waiting{counts.no ? `, ${counts.no} refused` : ""}. Search a bike below and update its Sanakhat.</p>
          </div>
        </div>
      </section>

      {/* Filter tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Bike} value={counts.all} label="All vehicles" tone="bg-slate-100 text-slate-600" active={filter === "all"} onClick={() => setFilter("all")} />
        <Tile icon={Clock} value={counts.pending} label="Not done yet" tone="bg-amber-100 text-amber-700" active={filter === "pending"} onClick={() => setFilter(filter === "pending" ? "all" : "pending")} />
        <Tile icon={CheckCircle2} value={counts.yes} label="Done" tone="bg-emerald-100 text-emerald-700" active={filter === "yes"} onClick={() => setFilter(filter === "yes" ? "all" : "yes")} />
        <Tile icon={XCircle} value={counts.no} label="Refused / No" tone="bg-red-100 text-red-700" active={filter === "no"} onClick={() => setFilter(filter === "no" ? "all" : "no")} />
      </div>

      {/* Search */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-3 sm:p-4 space-y-3 sticky top-0 z-10">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by number plate, brand, model, year or colour" autoFocus={!embedded}
            className="w-full h-12 pl-11 pr-11 rounded-xl border border-slate-200 bg-slate-50 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="sanakhat-search" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`h-9 px-3 rounded-full text-sm font-semibold border transition ${filter === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {label} <span className={`ml-1 text-xs ${filter === k ? "text-blue-100" : "text-slate-400"}`}>{n}</span>
            </button>
          ))}
          <select value={stock} onChange={e => setStock(e.target.value)} aria-label="Stock"
            className="ml-auto h-9 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="all">All stock</option>
            <option value="instock">In stock only</option>
            <option value="sold">Sold only</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <p className="text-xs text-slate-500 -mb-2">{list.length === rows.length ? `${rows.length.toLocaleString()} vehicles` : `${list.length.toLocaleString()} of ${rows.length.toLocaleString()} vehicles`}</p>
      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-14 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><SearchX size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{rows.length ? "No vehicle matches" : "No vehicles yet"}</h3>
          <p className="mt-1 text-sm text-slate-600">{rows.length ? "Try a different number plate or clear the filters." : "Vehicles added to the stock appear here."}</p>
          {(q || filter !== "all" || stock !== "all") && <button type="button" onClick={() => { setQ(""); setFilter("all"); setStock("all"); }} className="mt-4 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold">Clear search and filters</button>}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
