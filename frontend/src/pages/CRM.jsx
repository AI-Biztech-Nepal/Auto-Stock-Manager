import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import { Phone, MessageCircle, Search, Download, Check, X, ArrowUp, ArrowDown, Pencil, UserCheck } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import SourceField from "../components/SourceField";
import { SOURCES, SOURCE_LABEL, SOURCE_STYLE, isSourceComplete, sourceFromCustomer, sourcePayload, referredByLabel } from "../utils/crm";

// Every customer in one table -- who they are, what they have given the shop, and how they found it
// (walk-in, website, Facebook, or the name of the customer who referred them). Rows are read live from
// the customers, sales and bookings already posted, and the table re-reads itself every half minute, so
// nothing has to be entered twice. Tagging a customer who has no source yet happens right in the last column.
const FONT = { fontFamily: "Manrope" };
const PAGE_SIZE = 50;
const REFRESH_MS = 30000;
const FIRST_DIR = { name: "asc", amount: "desc", source: "asc" };

const waNumber = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `977${d}` : d;
};

const csvSource = (c) => (c.source === "referral" ? `Referral: ${referredByLabel(c)}` : c.source === "other" && c.source_note ? `Other: ${c.source_note}` : referredByLabel(c) || "Not tagged");

function SourcePill({ source }) {
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${SOURCE_STYLE[source].pill}`}>{SOURCE_LABEL[source]}</span>;
}

// The "Referred by" column: the source and, for a referral, who referred them (tap the name to see everyone
// that person referred). A customer without a source gets one-tap buttons to tag them.
function SourceCell({ c, saving, onQuick, onEdit, onReferrer }) {
  if (!c.source) {
    return (
      <div>
        <p className="text-[11px] font-medium text-amber-700 mb-1">Not tagged yet. Tap one</p>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map(({ key, label }) => (
            <button key={key} onClick={() => onQuick(c, key)} disabled={saving} data-testid={`crm-quick-${key}`}
              className="h-7 px-2 rounded-md text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const detail = c.source === "referral" ? c.referred_by_name || c.source_note : c.source === "other" ? c.source_note : "";
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <SourcePill source={c.source} />
        {detail && (c.source === "referral" && c.referred_by_id
          ? <button onClick={() => onReferrer({ id: c.referred_by_id, name: c.referred_by_name })} title="Show everyone they referred" className="block max-w-full truncate text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline text-left">{detail}</button>
          : <div className="truncate text-sm font-semibold text-slate-900">{detail}</div>)}
      </div>
      <button onClick={() => onEdit(c)} aria-label={`Change source of ${c.name}`} data-testid="crm-edit-source"
        className="shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center"><Pencil size={14} /></button>
    </div>
  );
}

function SourceEditor({ c, edit, setEdit, customers, saving, onSave }) {
  const submit = () => {
    if (isSourceComplete(edit.draft)) onSave(c, edit.draft);
    else toast.error(edit.draft.source === "referral" ? "Say who referred them" : "Pick how they found the shop");
  };
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3" data-testid="crm-editor">
      <SourceField value={edit.draft} onChange={draft => setEdit({ ...edit, draft })} customers={customers} excludeId={c.id} required />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEdit(null)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
        <button onClick={submit} disabled={saving} data-testid="crm-save-source"
          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1"><Check size={14} /> {saving ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}

function Contact({ c }) {
  if (!c.contact_number) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <a href={`tel:${c.contact_number}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-blue-700"><Phone size={13} className="text-slate-400" />{c.contact_number}</a>
      <a href={`https://wa.me/${waNumber(c.contact_number)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.name}`} className="w-7 h-7 rounded-md bg-green-600 text-white hover:bg-green-700 inline-flex items-center justify-center"><MessageCircle size={13} /></a>
    </div>
  );
}

function Amount({ c }) {
  return (
    <div className="text-right">
      <div className="text-sm font-bold text-slate-900" style={FONT}>{formatNPR(c.amount)}</div>
      <div className="text-[11px] text-slate-400">
        {c.purchases > 0 ? `${c.purchases} vehicle${c.purchases > 1 ? "s" : ""}` : c.booked > 0 ? "" : "No purchase yet"}
        {c.booked > 0 && <span className="text-sky-600">{c.purchases > 0 ? " · " : ""}{formatNPR(c.booked)} booked</span>}
      </div>
    </div>
  );
}

export default function CRM() {
  const [customers, setCustomers] = useState(null);
  const [filter, setFilter] = useState("all"); // all | needs | a source key
  const [search, setSearch] = useState("");
  const [referrer, setReferrer] = useState(null); // { id, name }: only the people this customer referred
  const [sort, setSort] = useState({ key: "newest", dir: "desc" });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [edit, setEdit] = useState(null); // { id, draft }
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

  useEffect(() => { setShown(PAGE_SIZE); }, [filter, search, referrer, sort]);

  const counts = useMemo(() => {
    const n = { all: 0, needs: 0 };
    SOURCES.forEach(s => { n[s.key] = 0; });
    (customers || []).forEach(c => { n.all += 1; if (c.source) n[c.source] += 1; else n.needs += 1; });
    return n;
  }, [customers]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keyOf = {
      newest: c => c.created_at || "", name: c => c.name.toLowerCase(), amount: c => c.amount, source: c => referredByLabel(c).toLowerCase(),
    }[sort.key];
    const dir = sort.dir === "asc" ? 1 : -1;
    return (customers || [])
      .filter(c =>
        (filter === "all" || (filter === "needs" ? !c.source : c.source === filter)) &&
        (!referrer || c.referred_by_id === referrer.id) &&
        (!q || c.name.toLowerCase().includes(q) || c.contact_number.includes(q) || c.address.toLowerCase().includes(q)))
      .sort((a, b) => { const x = keyOf(a), y = keyOf(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [customers, filter, search, referrer, sort]);

  const total = useMemo(() => list.reduce((n, c) => n + c.amount, 0), [list]);

  const toggleSort = (key) => setSort(s => (
    s.key !== key ? { key, dir: FIRST_DIR[key] }
      : s.dir === FIRST_DIR[key] ? { key, dir: FIRST_DIR[key] === "asc" ? "desc" : "asc" }
        : { key: "newest", dir: "desc" }));

  const save = async (c, value) => {
    setSavingId(c.id);
    try {
      await api.put(`/customers/${c.id}/source`, sourcePayload(value));
      setEdit(null);
      await load(true);
      toast.success(`${c.name} tagged`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save the source");
    } finally { setSavingId(null); }
  };
  const quick = (c, key) => {
    if (key === "referral" || key === "other") setEdit({ id: c.id, draft: { source: key, source_note: "", referred_by_id: "" } });
    else save(c, { source: key, source_note: "", referred_by_id: "" });
  };
  const openEdit = (c) => setEdit({ id: c.id, draft: sourceFromCustomer(c) });
  const showReferred = (c) => { setReferrer({ id: c.id, name: c.name }); setFilter("all"); setSearch(""); };

  const exportCsv = () => {
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["SN", "Customer", "Address", "Contact", "Transaction amount", "Referred by"],
      ...list.map((c, i) => [i + 1, c.name, c.address, c.contact_number, c.amount, csvSource(c)])];
    const blob = new Blob(["﻿" + rows.map(r => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
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

  const sortableTh = (k, label, right) => (
    <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 font-semibold ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${right ? "flex-row-reverse" : ""}`}>
        {label}{sort.key === k && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const nameCell = (c) => (
    <>
      <div className="font-semibold text-slate-900 truncate">{c.name}</div>
      {c.referral_count > 0 && (
        <button onClick={() => showReferred(c)} title="Show everyone they referred" data-testid="crm-referred-badge"
          className="mt-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100">Referred {c.referral_count}</button>
      )}
    </>
  );

  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] grid grid-cols-3 divide-x divide-slate-100">
        {[
          [counts.all.toLocaleString(), "Customers", `${tagged.toLocaleString()} with a source`],
          [`${counts.all ? Math.round((tagged / counts.all) * 100) : 0}%`, "Source known", counts.needs ? `${counts.needs} not tagged` : "All tagged"],
          [counts.referral.toLocaleString(), "By referral", referrers ? `${referrers} referred others` : "No chains yet"],
        ].map(([value, label, sub]) => (
          <div key={label} className="px-3 sm:px-5 py-3.5">
            <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight" style={FONT}>{value}</div>
            <div className="text-xs font-medium text-slate-600">{label}</div>
            <div className="text-[11px] text-slate-400 truncate">{sub}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or address" className="w-full h-11 pl-10 pr-3 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" data-testid="crm-search" />
        </div>
        <button onClick={exportCsv} disabled={list.length === 0} data-testid="crm-export" className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"><Download size={15} /> Export CSV</button>
      </div>

      <div role="group" aria-label="Filter by source" style={{ scrollbarWidth: "none" }} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-scroll sm:overflow-visible sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {chips.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} data-testid={`crm-filter-${k}`}
            className={`shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {label}<span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === k ? "bg-white/25" : k === "needs" && counts.needs ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {referrer && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="crm-referrer-banner">
          <span>Customers referred by <b>{referrer.name}</b> ({list.length})</span>
          <button onClick={() => setReferrer(null)} className="font-semibold text-amber-800 hover:underline inline-flex items-center gap-1"><X size={14} /> Show all</button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><UserCheck size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{filter === "needs" && !search && !referrer ? "Everyone has a source" : counts.all === 0 ? "No customers yet" : "No customers match"}</h3>
          <p className="mt-1 text-sm text-slate-600">{counts.all === 0 ? "Customers appear here as soon as they are added from Sales, Bookings or the Ledger." : "Try another filter or search."}</p>
        </div>
      ) : (
        <>
          {/* Table on tablets and up */}
          <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden">
            <table className="w-full text-sm" data-testid="crm-table">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold uppercase tracking-wide w-14">SN</th>
                  {sortableTh("name", "Customer")}
                  <th scope="col" className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Address</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Contact</th>
                  {sortableTh("amount", "Transaction amount", true)}
                  {sortableTh("source", "Referred by")}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c, i) => (
                  <Fragment key={c.id}>
                    <tr className={`align-top ${c.source ? "" : "bg-amber-50/40"}`} data-testid="crm-row">
                      <td className="px-4 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 max-w-[200px]">{nameCell(c)}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px]">{c.address || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3"><Contact c={c} /></td>
                      <td className="px-4 py-3"><Amount c={c} /></td>
                      <td className="px-4 py-3 w-[270px]"><SourceCell c={c} saving={savingId === c.id} onQuick={quick} onEdit={openEdit} onReferrer={setReferrer} /></td>
                    </tr>
                    {edit?.id === c.id && (
                      <tr><td colSpan={6} className="px-4 pb-4 pt-0"><SourceEditor c={c} edit={edit} setEdit={setEdit} customers={customers} saving={savingId === c.id} onSave={save} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total · {list.length.toLocaleString()} customer{list.length === 1 ? "" : "s"}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-900" style={FONT}>{formatNPR(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Cards on phones */}
          <div className="md:hidden space-y-3">
            {visible.map((c, i) => (
              <div key={c.id} className={`bg-white border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${c.source ? "border-slate-200/80" : "border-amber-200"}`} data-testid="crm-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400">SN {i + 1}</div>
                    {nameCell(c)}
                  </div>
                  <Amount c={c} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <Contact c={c} />
                  {c.address && <span className="text-xs text-slate-500">{c.address}</span>}
                </div>
                <div className="mt-3">
                  {edit?.id === c.id
                    ? <SourceEditor c={c} edit={edit} setEdit={setEdit} customers={customers} saving={savingId === c.id} onSave={save} />
                    : <SourceCell c={c} saving={savingId === c.id} onQuick={quick} onEdit={openEdit} onReferrer={setReferrer} />}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total · {list.length.toLocaleString()}</span>
              <span className="font-bold text-slate-900" style={FONT}>{formatNPR(total)}</span>
            </div>
          </div>

          {list.length > shown && (
            <button onClick={() => setShown(s => s + PAGE_SIZE)} className="w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50">Show more ({list.length - shown} left)</button>
          )}
        </>
      )}
    </div>
  );
}
