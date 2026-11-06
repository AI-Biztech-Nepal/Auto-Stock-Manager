import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Upload, Download, Search, ChevronDown, X, UserCheck, RefreshCw, AlertCircle } from "lucide-react";
import { notify } from "../utils/notify";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import useSellers from "../hooks/useSellers";
import DateRangeFilter, { resolveDateFilter } from "../components/DateRangeFilter";
import StatCards from "../components/crm/StatCards";
import CustomerTable, { SORTERS, FIRST_DIR } from "../components/crm/CustomerTable";
import FollowUpsPanel from "../components/crm/FollowUpsPanel";
import FollowUpModal from "../components/crm/FollowUpModal";
import CustomerFormModal from "../components/crm/CustomerFormModal";
import CustomerProfile from "../components/crm/CustomerProfile";
import ImportModal from "../components/crm/ImportModal";
import { FONT, ConfirmModal, EmptyState, Skeleton, btnPrimary, btnGhost } from "../components/crm/ui";
import { SOURCES, LEAD_STATUSES, bsMonthRanges, localDateOf, referredByLabel, leadLabel, shortNPR, timeOf } from "../utils/crm";

// Customer Relationship Management: every customer on one page with where they stand, who handles them, what is due
// next, and what was said. All of it is read live from what has already been posted (customers, sales, bookings)
// plus the follow-ups and history kept here, and the page re-reads itself every half minute.
const PAGE_SIZE = 50;
const REFRESH_MS = 30000;
const selectCls = "appearance-none cursor-pointer h-11 pl-3.5 pr-9 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500";

function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const errText = (ex, fallback) => (typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : fallback);

function FilterSelect({ value, onChange, label, children, testid }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} data-testid={testid} className={selectCls}>{children}</select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export default function CRM() {
  const sellers = useSellers();
  const wide = useMedia("(min-width: 1024px)");
  const sidePanel = useMedia("(min-width: 2000px)");
  const ranges = useMemo(() => bsMonthRanges(), []);

  const [data, setData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState("all"); // all | needs | a lead source
  const [status, setStatus] = useState("all");
  const [assigned, setAssigned] = useState("all"); // all | none | a team member id
  const [dateRange, setDateRange] = useState({ key: "all", custom: null });
  const [search, setSearch] = useState("");
  const [referrer, setReferrer] = useState(null); // { id, name }: only the people this customer referred
  const [sort, setSort] = useState({ key: "newest", dir: "desc" });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [savingId, setSavingId] = useState(null);

  const [profileId, setProfileId] = useState(null);
  const [profileEdit, setProfileEdit] = useState(false); // open the profile with the edit form showing
  const [profileKey, setProfileKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [fu, setFu] = useState(null); // { mode, followup?, customer? }
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [needsForce, setNeedsForce] = useState(null); // the 409 detail: this customer has sales / bookings on record
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent) => {
    try {
      const { data: d } = await api.get("/crm/overview", { params: ranges || {}, suppressErrorToast: !!silent });
      setData(d);
      setLoadFailed(false);
    } catch { if (!silent) setLoadFailed(true); }
  }, [ranges]);

  useEffect(() => {
    load(false);
    const refresh = () => { if (document.visibilityState === "visible") load(true); };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  useEffect(() => { setShown(PAGE_SIZE); }, [filter, status, assigned, dateRange, search, referrer, sort]);

  const customers = data?.customers;
  // How many customers, and how much they have bought (the Transaction Amount column), per lead source.
  const { counts, amounts } = useMemo(() => {
    const n = { all: 0, needs: 0 }, a = { all: 0, needs: 0 };
    SOURCES.forEach(s => { n[s.key] = 0; a[s.key] = 0; });
    (customers || []).forEach(c => {
      const k = c.source || "needs";
      n.all += 1; n[k] += 1; a.all += c.amount; a[k] += c.amount;
    });
    return { counts: n, amounts: a };
  }, [customers]);

  const assignees = useMemo(() => {
    const seen = new Map(sellers.map(s => [s.id, s.name]));
    (customers || []).forEach(c => { if (c.assigned_to_id && !seen.has(c.assigned_to_id)) seen.set(c.assigned_to_id, c.assigned_to_name || "Previous salesperson"); });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sellers, customers]);

  const range = dateRange.key === "all" ? null : resolveDateFilter(dateRange.key, dateRange.custom);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keyOf = SORTERS[sort.key];
    const dir = sort.dir === "asc" ? 1 : -1;
    return (customers || [])
      .filter(c => {
        if (filter !== "all" && (filter === "needs" ? c.source : c.source !== filter)) return false;
        if (status !== "all" && c.lead_status !== status) return false;
        if (assigned !== "all" && (assigned === "none" ? c.assigned_to_id : c.assigned_to_id !== assigned)) return false;
        if (referrer && c.referred_by_id !== referrer.id) return false;
        if (range) { const d = localDateOf(c.created_at); if (!d || d < range.start || d > range.end) return false; }
        return !q || c.name.toLowerCase().includes(q) || c.contact_number.includes(q) || c.address.toLowerCase().includes(q)
          || (c.interested_vehicle || c.purchased_vehicle || "").toLowerCase().includes(q);
      })
      .sort((a, b) => { const x = keyOf(a), y = keyOf(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [customers, filter, status, assigned, referrer, range, search, sort]);
  const total = useMemo(() => list.reduce((n, c) => n + c.amount, 0), [list]);
  const anyFilter = filter !== "all" || status !== "all" || assigned !== "all" || !!referrer || !!range || !!search.trim();

  const toggleSort = (key) => setSort(s => (
    s.key !== key ? { key, dir: FIRST_DIR[key] }
      : s.dir === FIRST_DIR[key] ? { key, dir: FIRST_DIR[key] === "asc" ? "desc" : "asc" }
        : { key: "newest", dir: "desc" }));
  const openProfile = (id, edit = false) => { setProfileEdit(edit); setProfileId(id); };
  const clearFilters = () => { setFilter("all"); setStatus("all"); setAssigned("all"); setReferrer(null); setDateRange({ key: "all", custom: null }); setSearch(""); };

  // ── things done to a customer ──
  const refresh = async () => { await load(true); setProfileKey(k => k + 1); };
  const run = async (c, fn, okMsg) => {
    setSavingId(c.id);
    try { await fn(); if (okMsg) notify.success(okMsg); await load(true); return true; }
    catch (ex) { notify.error(errText(ex, "That didn't save. Please try again.")); return false; }
    finally { setSavingId(null); }
  };
  const saveLead = (c, v) => run(c, () => api.put(`/customers/${c.id}/source`, { source: v.source || null, source_note: v.source_note || null, referred_by_id: v.referred_by_id || null }), `${c.name} updated`);
  const changeStatus = (c, s) => run(c, () => api.put(`/crm/customers/${c.id}/lead-status`, { status: s }), "Status updated");
  const assign = (c, id) => run(c, () => api.put(`/crm/customers/${c.id}/assign`, { assigned_to_id: id || null }), "Assignment updated");
  const logContact = async (c, kind) => {
    try {
      const { data: i } = await api.post(`/crm/customers/${c.id}/interactions`, { kind, summary: "" });
      notify.info(`Logged ${kind === "call" ? "a call" : "a WhatsApp chat"} with ${c.name}`, { action: { label: "Undo", onClick: () => api.delete(`/crm/interactions/${i.id}`).then(() => refresh()).catch(() => {}) } });
      load(true);
    } catch { /* the call or chat still opens; only the history entry was missed */ }
  };
  const reopenFollowup = async (f) => {
    try { await api.put(`/crm/followups/${f.id}`, { status: "pending" }); notify.success("Follow-up reopened"); refresh(); } catch { notify.error("Couldn't reopen that follow-up"); }
  };
  // Deleting asks once. A customer with sales or bookings on record asks a second time (the server says so with a 409
  // and the counts): those records stay, they just stop belonging to anyone.
  const closeDelete = () => { setToDelete(null); setNeedsForce(null); };
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const { data: r } = await api.delete(`/crm/customers/${toDelete.id}`, { params: needsForce ? { force: true } : {}, suppressErrorToast: true });
      const kept = (r.unlinked_sales || 0) + (r.unlinked_bookings || 0);
      notify.success(`${toDelete.name} deleted${kept ? ` · ${kept} sale/booking record${kept === 1 ? "" : "s"} kept` : ""}`);
      closeDelete(); setAdding(false); setProfileId(null);
      await load(true);
    } catch (ex) {
      const d = ex.response?.data?.detail;
      if (ex.response?.status === 409 && d?.needs_force) setNeedsForce(d);
      else { notify.error(errText(ex, "Couldn't delete that customer")); closeDelete(); }
    } finally { setDeleting(false); }
  };

  const exportCsv = () => {
    const rows = [["SN", "Customer", "Contact", "Address", "Interested Vehicle", "Lead Source", "Referred By", "Lead Status", "Last Contact", "Next Follow-up", "Assigned To", "Transaction Amount", "Notes"],
      ...list.map((c, i) => [i + 1, c.name, c.contact_number, c.address, c.interested_vehicle || c.purchased_vehicle, leadLabel(c) || "Not tagged", referredByLabel(c),
        LEAD_STATUSES.find(s => s.key === c.lead_status)?.label, c.last_contact_at ? localDateOf(c.last_contact_at) : "",
        c.next_followup ? `${localDateOf(c.next_followup.due_at)} ${timeOf(c.next_followup.due_at)}` : "", c.assigned_to_name || "", c.amount, c.notes])];
    const blob = new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `crm-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify.success(`Exported ${list.length} customer${list.length === 1 ? "" : "s"}`);
  };

  const panelProps = {
    followups: data?.followups, onAdd: () => setFu({ mode: "schedule" }), onComplete: f => setFu({ mode: "complete", followup: f }), onReopen: reopenFollowup,
    onReschedule: f => setFu({ mode: "reschedule", followup: f }), onNote: f => setFu({ mode: "note", followup: f }), onView: id => openProfile(id),
  };
  const visible = list.slice(0, shown);
  const chips = [["all", "All"], ["needs", "Not Tagged"], ...SOURCES.map(s => [s.key, s.label])];

  const table = !customers ? null : list.length === 0 ? (
    <div className="bg-white border border-slate-200 rounded-2xl">
      {counts.all === 0
        ? <EmptyState icon={UserCheck} title="No customers yet" action={<button onClick={() => setAdding(true)} className={btnPrimary}><Plus size={16} /> Add your first customer</button>}>Customers appear here as soon as they are added from Sales, Bookings or the Ledger, or you can add or import them here.</EmptyState>
        : <EmptyState icon={UserCheck} title="No customers match" action={anyFilter && <button onClick={clearFilters} className={btnGhost}>Clear filters</button>}>Try another filter or search.</EmptyState>}
    </div>
  ) : (
    <>
      <CustomerTable rows={visible} customers={customers} sellers={sellers} wide={wide} sort={sort} onSort={toggleSort} total={total} count={list.length} savingId={savingId}
        onSaveLead={saveLead} onStatus={changeStatus} onAssign={assign} onView={c => openProfile(c.id)} onEdit={c => openProfile(c.id, true)} onContact={logContact}
        onShowReferred={c => { setReferrer({ id: c.id, name: c.name }); setFilter("all"); setSearch(""); }} />
      {list.length > shown && <button onClick={() => setShown(s => s + PAGE_SIZE)} className="mt-3 w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50" data-testid="crm-more">Show more ({list.length - shown} left)</button>}
    </>
  );

  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex gap-2">
          <button onClick={() => setAdding(true)} className={btnPrimary} data-testid="crm-add"><Plus size={17} /> Add Customer</button>
          <button onClick={() => setImportOpen(true)} className={btnGhost} data-testid="crm-import"><Upload size={16} /> Import</button>
        </div>
      </div>

      {loadFailed && !data ? (
        <div className="bg-white border border-red-200 rounded-2xl"><EmptyState icon={AlertCircle} title="Couldn't load the CRM" action={<button onClick={() => { setLoadFailed(false); load(false); }} className={btnPrimary}><RefreshCw size={15} /> Try again</button>}>Check your connection and try again.</EmptyState></div>
      ) : (
        <>
          <StatCards summary={data?.summary} />
          {data && !sidePanel && <FollowUpsPanel layout="top" {...panelProps} />}

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, vehicle or address" className="w-full h-11 pl-10 pr-3 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" data-testid="crm-search" />
            </div>
            <FilterSelect value={filter} onChange={setFilter} label="Lead source" testid="crm-source-filter">
              <option value="all">Lead Source</option><option value="needs">Not tagged</option>
              {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </FilterSelect>
            <FilterSelect value={status} onChange={setStatus} label="Lead status" testid="crm-status-filter">
              <option value="all">Lead Status</option>
              {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </FilterSelect>
            <FilterSelect value={assigned} onChange={setAssigned} label="Assigned salesperson" testid="crm-assigned-filter">
              <option value="all">Assigned Seller</option>
              {assignees.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="none">Unassigned</option>
            </FilterSelect>
            <DateRangeFilter value={dateRange.key} custom={dateRange.custom} onChange={(key, custom) => setDateRange({ key, custom })} testid="crm-date-filter" />
            <button onClick={exportCsv} disabled={list.length === 0} data-testid="crm-export" className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"><Download size={15} /> Export</button>
          </div>

          <div role="group" aria-label="Quick filter by lead source" style={{ scrollbarWidth: "none" }} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-scroll sm:overflow-visible sm:flex-wrap [&::-webkit-scrollbar]:hidden">
            {chips.map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} data-testid={`crm-filter-${k}`}
                title={customers ? `${label}: ${counts[k].toLocaleString()} customer${counts[k] === 1 ? "" : "s"} · ${formatNPR(amounts[k])} in sales` : undefined}
                className={`shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === k ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {label}<span data-testid={`crm-filter-${k}-count`} className={`text-xs px-1.5 py-0.5 rounded-full ${filter === k ? "bg-white/25" : k === "needs" && counts.needs ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{customers ? counts[k] : "–"}</span>
                {customers && amounts[k] > 0 && <span className={`text-xs font-medium tabular-nums ${filter === k ? "text-white/85" : "text-slate-400"}`} data-testid={`crm-filter-${k}-amount`}>{shortNPR(amounts[k])}</span>}
              </button>
            ))}
          </div>
          {data && data.sales_without_customer > 0 && (
            <p className="text-xs text-slate-400 -mt-1.5" data-testid="crm-unlinked-note">
              Amounts are what each group of customers has bought. A further <span className="font-semibold text-slate-500" title={formatNPR(data.sales_without_customer)}>{shortNPR(data.sales_without_customer)}</span> of sales was made without customer details, so it isn't in any group.
            </p>
          )}

          {referrer && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="crm-referrer-banner">
              <span>Customers referred by <b>{referrer.name}</b> ({list.length})</span>
              <button onClick={() => setReferrer(null)} className="font-semibold text-amber-800 hover:underline inline-flex items-center gap-1"><X size={14} /> Show all</button>
            </div>
          )}

          <div className={sidePanel ? "grid grid-cols-[minmax(0,1fr)_320px] gap-4 items-start" : ""}>
            <div className="min-w-0">
              {table || (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3" aria-busy="true" aria-label="Loading customers">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              )}
            </div>
            {sidePanel && data && <div className="sticky top-4"><FollowUpsPanel layout="side" {...panelProps} /></div>}
          </div>
        </>
      )}

      {profileId && (
        <CustomerProfile key={profileId} customerId={profileId} customers={customers || []} startEditing={profileEdit} reloadKey={profileKey} onClose={() => setProfileId(null)} onChanged={() => load(true)}
          onOpenCustomer={id => openProfile(id)} onDelete={c => setToDelete(c)} />
      )}
      {adding && (
        <CustomerFormModal customers={customers || []} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refresh(); }} onOpenExisting={id => { setAdding(false); openProfile(id); }} />
      )}
      {fu && <FollowUpModal mode={fu.mode} followup={fu.followup} customer={fu.customer} customers={customers || []} onClose={() => setFu(null)} onSaved={() => { setFu(null); refresh(); }} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImported={() => load(true)} />}
      {toDelete && (needsForce ? (
        <ConfirmModal title="Delete anyway?" confirmLabel="Delete anyway" busy={deleting} onClose={closeDelete} onConfirm={confirmDelete}
          message={`${toDelete.name} has ${needsForce.sales} sale${needsForce.sales === 1 ? "" : "s"} and ${needsForce.bookings} booking${needsForce.bookings === 1 ? "" : "s"} on record. Those records stay in Sales, Bookings and the Dashboard, but will no longer be linked to any customer. The customer's follow-ups and history are deleted. This can't be undone.`} />
      ) : (
        <ConfirmModal title="Delete customer?" confirmLabel="Delete customer" busy={deleting} onClose={closeDelete} onConfirm={confirmDelete}
          message={`${toDelete.name} will be removed together with their follow-ups and contact history. This can't be undone.`} />
      ))}
    </div>
  );
}
