/**
 * Warranty.jsx — warranty tracker for sold vehicles.
 *
 * Every sold vehicle's warranty runs from its sale date for the company default length
 * (Settings) or a per-vehicle override. Front desk follows up with customers from here and,
 * if a customer had the vehicle serviced anywhere other than this shop, voids the warranty
 * ("Serviced elsewhere"). Warranty services themselves are job cards opened against the sold
 * vehicle — labour free, parts charged — and show up here as its service history.
 */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldOff, Search, Phone, ChevronDown, ChevronRight, X, Clock, RotateCcw, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatWarrantyLength } from "../utils/helpers";
import HoverADDate from "../components/HoverADDate";
import WarrantyLengthInput from "../components/WarrantyLengthInput";
import { useAuth } from "../context/AuthContext";
import { canVoidWarranty, canManageWarranty } from "../utils/permissions";

const EXPIRING_SOON_DAYS = 30;

const STATUS_STYLES = {
  active:  { label: "Active",  pill: "bg-teal-100 text-teal-700" },
  expired: { label: "Expired", pill: "bg-slate-200 text-slate-600" },
  void:    { label: "Void",    pill: "bg-red-100 text-red-700" },
};

const isExpiringSoon = (w) => w.status === "active" && w.days_left <= EXPIRING_SOON_DAYS;

function getErrMsg(err) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg).join(", ");
  return err.response ? `Server error (${err.response.status})` : "Network error - could not reach the server";
}

function daysLeftLabel(w) {
  if (w.status === "void") return "Voided";
  if (w.status === "expired") return `Ended ${Math.abs(w.days_left)} day${Math.abs(w.days_left) === 1 ? "" : "s"} ago`;
  if (w.days_left === 0) return "Ends today";
  return `${w.days_left} day${w.days_left === 1 ? "" : "s"} left`;
}

export default function Warranty() {
  const { user } = useAuth();
  const canVoid = canVoidWarranty(user?.role);
  const canManage = canManageWarranty(user?.role);
  const [rows, setRows] = useState([]);
  const [defaultDays, setDefaultDays] = useState(182);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [voiding, setVoiding] = useState(null);      // row being voided
  const [voidReason, setVoidReason] = useState("");
  const [editingLength, setEditingLength] = useState(null);  // row whose length is being changed
  const [lengthDays, setLengthDays] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/warranties")
    .then(r => { setRows(r.data.warranties); setDefaultDays(r.data.default_days); })
    .catch(err => toast.error(getErrMsg(err)))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  const counts = useMemo(() => ({
    active: rows.filter(r => r.warranty.status === "active").length,
    expiring: rows.filter(r => isExpiringSoon(r.warranty)).length,
    expired: rows.filter(r => r.warranty.status === "expired").length,
    void: rows.filter(r => r.warranty.status === "void").length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === "expiring" ? !isExpiringSoon(r.warranty) : filter !== "all" && r.warranty.status !== filter) return false;
      if (!q) return true;
      return [r.brand, r.model, r.variant, r.registration_number, r.customer_name, r.customer_contact]
        .some(f => f && String(f).toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  const toggleExpanded = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submitVoid = async (e) => {
    e.preventDefault();
    if (!voidReason.trim()) { toast.error("Enter where / when the vehicle was serviced"); return; }
    setBusy(true);
    try {
      await api.post(`/warranties/${voiding.vehicle_id}/void`, { reason: voidReason.trim() });
      toast.success("Warranty voided");
      setVoiding(null);
      load();
    } catch (err) { toast.error(getErrMsg(err)); } finally { setBusy(false); }
  };

  const restore = async (row) => {
    if (!window.confirm(`Restore the warranty on ${row.brand} ${row.model} (${row.registration_number || "no reg"})?`)) return;
    try {
      await api.post(`/warranties/${row.vehicle_id}/restore`);
      toast.success("Warranty restored");
      load();
    } catch (err) { toast.error(getErrMsg(err)); }
  };

  const saveLength = async (useDefault) => {
    if (!useDefault && !lengthDays) { toast.error("Enter a warranty length"); return; }
    setBusy(true);
    try {
      await api.put(`/warranties/${editingLength.vehicle_id}/length`, { warranty_days: useDefault ? null : lengthDays });
      toast.success("Warranty length updated");
      setEditingLength(null);
      load();
    } catch (err) { toast.error(getErrMsg(err)); } finally { setBusy(false); }
  };

  const tiles = [
    ["active", "Active", counts.active, "text-teal-700"],
    ["expiring", `Ending in ${EXPIRING_SOON_DAYS} days`, counts.expiring, "text-amber-600"],
    ["expired", "Expired", counts.expired, "text-slate-600"],
    ["void", "Void (serviced elsewhere)", counts.void, "text-red-600"],
    ["all", "All sold", counts.all, "text-slate-900"],
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={22} className="text-slate-400" /> Warranty
          </h1>
          <p className="text-sm text-slate-500">
            {formatWarrantyLength(defaultDays)} from the sale date by default · labour free, parts charged · void if serviced outside Hamro G&amp;G
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicle, reg no, customer..."
            className="w-full h-10 pl-9 pr-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="warranty-search"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map(([key, label, count, color]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            data-testid={`warranty-filter-${key}`}
            className={`text-left bg-white rounded-xl border p-4 transition-all ${filter === key ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}
          >
            <div className={`text-2xl font-bold ${color}`} style={{ fontFamily: "Manrope" }}>{count}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          {rows.length === 0 ? "No sold vehicles yet." : "No warranties match this filter."}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {filtered.map(r => {
            const w = r.warranty;
            const st = STATUS_STYLES[w.status];
            const open = expanded.has(r.vehicle_id);
            const lastService = r.services[0];
            return (
              <div key={r.vehicle_id} data-testid="warranty-row" className="px-4 py-3">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <button onClick={() => toggleExpanded(r.vehicle_id)} className="flex items-start gap-2 text-left flex-1 min-w-0">
                    {open ? <ChevronDown size={16} className="text-slate-400 mt-0.5 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>
                        {r.brand} {r.model} {r.year || ""}
                        {r.registration_number && <span className="ml-2 text-xs font-mono font-normal text-slate-500">{r.registration_number}</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {r.customer_name || "No customer on record"}
                        {r.customer_contact && <> · <a href={`tel:${r.customer_contact}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline inline-flex items-center gap-0.5"><Phone size={10} />{r.customer_contact}</a></>}
                      </div>
                    </div>
                  </button>

                  <div className="grid grid-cols-3 gap-3 text-xs lg:w-[26rem] shrink-0">
                    <div>
                      <div className="text-slate-400">Sold</div>
                      <div className="font-medium text-slate-700"><HoverADDate date={r.sold_date?.slice(0, 10)} /></div>
                    </div>
                    <div>
                      <div className="text-slate-400">Ends</div>
                      <div className="font-medium text-slate-700"><HoverADDate date={w.end} /></div>
                      <div className="text-slate-400">{formatWarrantyLength(w.days)}{w.custom_length && " · custom"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Shop services</div>
                      <div className="font-medium text-slate-700">{r.services.length}</div>
                      {lastService && <div className="text-slate-400">last <HoverADDate date={(lastService.job_date || lastService.created_at)?.slice(0, 10)} /></div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 lg:w-60 lg:justify-end shrink-0 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${isExpiringSoon(w) ? "bg-amber-100 text-amber-700" : st.pill}`}>
                      {st.label}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={11} />{daysLeftLabel(w)}</span>
                  </div>
                </div>

                {open && (
                  <div className="mt-3 ml-6 space-y-3">
                    {w.status === "void" && (
                      <div className="text-xs bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2">
                        <span className="font-semibold">Serviced elsewhere:</span> {w.void_reason}
                        <span className="text-red-400"> · recorded by {w.voided_by} on <HoverADDate date={w.voided_at?.slice(0, 10)} /></span>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Warranty service history (at Hamro G&amp;G)</div>
                      {r.services.length === 0 ? (
                        <div className="text-xs text-slate-400">No warranty services yet.</div>
                      ) : (
                        <div className="space-y-1">
                          {r.services.map(s => (
                            <div key={s.job_number} className="flex gap-3 text-xs text-slate-600">
                              <span className="font-mono text-slate-400 shrink-0">{s.job_number}</span>
                              <span className="shrink-0"><HoverADDate date={(s.job_date || s.created_at)?.slice(0, 10)} /></span>
                              <span className="truncate">{s.work_description}</span>
                              <span className="ml-auto shrink-0 capitalize text-slate-400">{s.status?.replace("_", " ")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canVoid && w.status === "active" && (
                        <button onClick={() => { setVoidReason(""); setVoiding(r); }} data-testid="void-warranty-btn" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors">
                          <ShieldOff size={13} /> Serviced elsewhere (void warranty)
                        </button>
                      )}
                      {canManage && w.status === "void" && (
                        <button onClick={() => restore(r)} data-testid="restore-warranty-btn" className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold rounded-lg hover:bg-teal-100 transition-colors">
                          <RotateCcw size={13} /> Restore warranty
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => { setLengthDays(w.days); setEditingLength(r); }} data-testid="change-warranty-length-btn" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors">
                          <CalendarClock size={13} /> Change length
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {voiding && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVoiding(null)}>
          <form onSubmit={submitVoid} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Void warranty</h2>
                <p className="text-xs text-slate-500">{voiding.brand} {voiding.model} · {voiding.registration_number} · {voiding.customer_name || "no customer"}</p>
              </div>
              <button type="button" onClick={() => setVoiding(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              The customer had this vehicle serviced outside Hamro G&amp;G. No more free-labour warranty services will be allowed. Only an admin can restore it.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Where / when was it serviced? <span className="text-red-500">*</span></label>
              <textarea
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                rows={3} maxLength={500} autoFocus
                placeholder="e.g. Oil change at another workshop, customer told us on the phone"
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                data-testid="void-reason-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVoiding(null)} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={busy} data-testid="confirm-void-btn" className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                {busy ? "Voiding..." : "Void warranty"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingLength && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingLength(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Warranty length</h2>
                <p className="text-xs text-slate-500">{editingLength.brand} {editingLength.model} · {editingLength.registration_number} · counted from the sale date</p>
              </div>
              <button type="button" onClick={() => setEditingLength(null)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <WarrantyLengthInput days={editingLength.warranty.days} onChange={setLengthDays} />
            <div className="flex flex-wrap justify-end gap-2">
              {editingLength.warranty.custom_length && (
                <button type="button" disabled={busy} onClick={() => saveLength(true)} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg mr-auto">
                  Use default ({formatWarrantyLength(defaultDays)})
                </button>
              )}
              <button type="button" onClick={() => setEditingLength(null)} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="button" disabled={busy} onClick={() => saveLength(false)} data-testid="save-warranty-length-btn" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
