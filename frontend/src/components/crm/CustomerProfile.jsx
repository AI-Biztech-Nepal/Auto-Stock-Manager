import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Pencil, Phone, MessageCircle, CalendarPlus, StickyNote, Trash2, ShoppingBag, Link2, ChevronDown, ExternalLink } from "lucide-react";
import { notify } from "../../utils/notify";
import api from "../../utils/api";
import { formatNPR } from "../../utils/helpers";
import useSellers from "../../hooks/useSellers";
import { PICKABLE_STATUSES, SOURCE_LABEL, SOURCE_STYLE, fullBS, referredByLabel, shortBS, timeOf, waNumber } from "../../utils/crm";
import { Drawer, Avatar, StatusBadge, EmptyState, ConfirmModal, FONT, inputCls, btnPrimary, btnGhost, Skeleton } from "./ui";
import CustomerForm from "./CustomerForm";
import ActivityTab from "./ActivityTab";

// A customer in full, and everything you can do to them: call, WhatsApp, edit (right here, with Save / Cancel), log a
// note, schedule a follow-up, delete. Overview = who they are; Activity = what is due and what happened (contacts,
// follow-ups, purchases, bookings in one list); Purchases = what they bought.
const TABS = [["overview", "Overview"], ["activity", "Activity"], ["purchases", "Purchases"]];
const actionBtn = `${btnGhost} !h-9 !px-2.5`;

const Info = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm text-slate-800 break-words">{children || <span className="text-slate-300">—</span>}</dd>
  </div>
);

function Select({ value, onChange, children, testid, disabled }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} data-testid={testid} className={`${inputCls} appearance-none pr-8 h-9`}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export default function CustomerProfile({ customerId, customers, startEditing, reloadKey, onClose, onChanged, onOpenCustomer, onDelete }) {
  const sellers = useSellers();
  const navigate = useNavigate();
  const scroller = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(!!startEditing);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false); // typing in the Activity forms that isn't saved yet
  const [request, setRequest] = useState(null); // asks the Activity tab to open "log a note" or "schedule a follow-up"
  const [ask, setAsk] = useState(null); // a confirmation: { title, message, confirmLabel, run }
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try { setData((await api.get(`/crm/customers/${customerId}`, { suppressErrorToast: true })).data); setError(""); }
    catch (ex) { setError(ex.response?.status === 404 ? "This customer no longer exists." : "Couldn't load this customer."); }
  }, [customerId]);
  // The page gives each customer a fresh profile (key), so a refresh of the same customer (after saving an edit,
  // logging a call ...) only reloads the data and keeps the tab, the open editor and the scroll position.
  useEffect(() => { load(); }, [load, reloadKey]);

  const changed = useCallback(async () => { await load(); onChanged(); }, [load, onChanged]);
  const c = data?.customer;
  const unsaved = editing || dirty;

  // Closing with unsaved typing asks first (Esc, a click outside and the X all come through here).
  const requestClose = () => {
    if (ask) return;
    if (unsaved) setAsk({ title: "Discard your changes?", message: "What you typed hasn't been saved yet.", confirmLabel: "Discard", run: async () => onClose() });
    else onClose();
  };
  const confirmAsk = async () => {
    setAsking(true);
    try { await ask.run(); } finally { setAsking(false); setAsk(null); }
  };

  const goTo = (key, req) => {
    setTab(key);
    if (req) setRequest({ ...req, n: Date.now() });
    scroller.current?.scrollTo({ top: 0 });
  };
  const startEdit = () => { setEditing(true); goTo("overview"); };

  const setStatus = async (status) => {
    try { await api.put(`/crm/customers/${customerId}/lead-status`, { status }, { suppressErrorToast: true }); notify.success("Status updated"); changed(); }
    catch (ex) { notify.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't change the status"); }
  };
  const assign = async (id) => {
    try { await api.put(`/crm/customers/${customerId}/assign`, { assigned_to_id: id || null }, { suppressErrorToast: true }); notify.success("Assignment updated"); changed(); }
    catch (ex) { notify.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't change the assignment"); }
  };
  const logContact = (kind) => api.post(`/crm/customers/${customerId}/interactions`, { kind, summary: "" }, { suppressErrorToast: true }).then(changed).catch(() => {});

  const pending = data?.followups.filter(f => f.status !== "done").length || 0;
  const known = c && sellers.some(s => s.id === c.assigned_to_id);

  return (
    <>
      <Drawer onClose={requestClose} testid="profile-drawer">
        {error ? (
          <div className="p-6"><EmptyState icon={X} title={error} action={<button onClick={onClose} className={btnGhost}>Close</button>} /></div>
        ) : !c ? (
          <div className="p-6 space-y-4"><Skeleton className="h-14 w-2/3" /><Skeleton className="h-8 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <div className="px-5 pt-5 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <Avatar name={c.name} size={12} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-extrabold text-slate-900 truncate" style={FONT} data-testid="profile-name">{c.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={c.lead_status} />
                    {c.source && <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold ${SOURCE_STYLE[c.source].pill}`}>{SOURCE_LABEL[c.source]}</span>}
                    {c.contact_number && <span className="text-xs text-slate-500 tabular-nums">{c.contact_number}</span>}
                  </div>
                </div>
                <button onClick={requestClose} aria-label="Close profile" data-testid="profile-close" className="shrink-0 w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"><X size={18} /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" data-testid="profile-actions">
                {c.contact_number && <a href={`tel:${c.contact_number}`} onClick={() => logContact("call")} className={actionBtn} data-testid="profile-call"><Phone size={14} className="text-sky-600" /> Call</a>}
                {c.contact_number && <a href={`https://wa.me/${waNumber(c.contact_number)}`} target="_blank" rel="noopener noreferrer" onClick={() => logContact("whatsapp")} className={actionBtn} data-testid="profile-whatsapp"><MessageCircle size={14} className="text-green-600" /> WhatsApp</a>}
                <button onClick={() => goTo("activity", { mode: "log", kind: "note" })} className={actionBtn} data-testid="profile-note"><StickyNote size={14} className="text-amber-600" /> Add note</button>
                <button onClick={() => goTo("activity", { mode: "followup" })} className={actionBtn} data-testid="profile-schedule"><CalendarPlus size={14} className="text-blue-600" /> Follow-up</button>
                <button onClick={startEdit} disabled={editing} className={actionBtn} data-testid="profile-edit"><Pencil size={14} /> Edit</button>
                <button onClick={() => onDelete(c)} className="ml-auto h-9 px-2.5 rounded-lg text-red-600 hover:bg-red-50 text-sm font-semibold inline-flex items-center gap-1.5" data-testid="profile-delete"><Trash2 size={14} /> Delete</button>
              </div>
            </div>

            <div role="tablist" className="flex gap-1 px-4 pt-2 border-b border-slate-100 overflow-x-auto">
              {TABS.map(([k, label]) => {
                const n = k === "activity" ? pending : k === "purchases" ? data.sales.length + data.bookings.length : 0;
                return (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`profile-tab-${k}`}
                    className={`px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                    {label}{n > 0 && <span title={k === "activity" ? `${n} scheduled` : undefined} className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${k === "activity" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{n}</span>}
                  </button>
                );
              })}
            </div>

            {/* the three panels stay mounted, so half-typed text survives a trip to another tab */}
            <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-4">
              <div hidden={tab !== "overview"}>
                {editing ? (
                  <div data-testid="profile-edit-panel">
                    <CustomerForm formId="profile-form" mode="edit" customer={c} customers={customers || []} onBusy={setSaving} onOpenExisting={onOpenCustomer}
                      onSaved={() => { setEditing(false); changed(); }} />
                  </div>
                ) : (
                  <div className="space-y-5" data-testid="profile-overview">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                      <Info label="Phone">{c.contact_number}</Info>
                      <Info label="Address">{c.address}</Info>
                      <Info label="ID number">{data.details.id_number}</Info>
                      <Info label="Occupation">{data.details.occupation}</Info>
                      <Info label="Customer since">{c.created_at ? fullBS(c.created_at) : ""}</Info>
                      <Info label="Interested vehicle">{c.interested_vehicle || (c.purchased_vehicle ? `${c.purchased_vehicle} (bought)` : "")}</Info>
                      <Info label="Lead source">{c.source ? SOURCE_LABEL[c.source] : ""}</Info>
                      <Info label={c.source === "other" ? "Detail" : "Referred by"}>
                        {c.referred_by_id ? <button onClick={() => onOpenCustomer(c.referred_by_id)} className="text-blue-600 font-semibold hover:underline">{c.referred_by_name}</button> : referredByLabel(c)}
                      </Info>
                      <Info label="Transaction amount"><span className="font-bold" style={FONT}>{formatNPR(c.amount)}</span>{c.purchases > 0 && <span className="text-xs text-slate-400"> · {c.purchases} vehicle{c.purchases > 1 ? "s" : ""}</span>}</Info>
                      <Info label="Last contact">{c.last_contact_at ? `${shortBS(c.last_contact_at)} · ${timeOf(c.last_contact_at)}` : ""}</Info>
                    </dl>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Lead status</label>
                        {c.status_locked
                          ? <div className="h-9 flex items-center"><StatusBadge status="converted" /><span className="ml-2 text-xs text-slate-400">has bought a vehicle</span></div>
                          : <Select value={c.lead_status} onChange={setStatus} testid="profile-status">{PICKABLE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Assigned to</label>
                        <Select value={c.assigned_to_id || ""} onChange={assign} testid="profile-assigned">
                          <option value="">Unassigned</option>
                          {c.assigned_to_id && !known && <option value={c.assigned_to_id}>{c.assigned_to_name || "Previous salesperson"}</option>}
                          {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes</h4>
                      <p className="text-sm text-slate-700 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 min-h-[2.5rem]">{data.details.notes || <span className="text-slate-300">No notes. Use Edit to add one.</span>}</p>
                    </div>
                    {data.referred.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1"><Link2 size={12} /> Referred {data.referred.length} customer{data.referred.length > 1 ? "s" : ""}</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {data.referred.map(r => <button key={r.id} onClick={() => onOpenCustomer(r.id)} className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100" data-testid="profile-referred">{r.name}</button>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div hidden={tab !== "activity"}>
                <ActivityTab customer={c} data={data} request={request} onChanged={changed} onAskDelete={setAsk} onDirty={setDirty} />
              </div>

              <div hidden={tab !== "purchases"}>
                <div className="space-y-5" data-testid="profile-purchases">
                  {data.sales.length === 0 && data.bookings.length === 0 ? <EmptyState icon={ShoppingBag} title="No purchases yet">When this customer buys or books a vehicle it shows up here.</EmptyState> : (
                    <>
                      {data.sales.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 mb-2" style={FONT}>Sales</h4>
                          <ul className="space-y-2">
                            {data.sales.map(s => (
                              <li key={s.id} className="rounded-xl border border-slate-200 p-3" data-testid="profile-sale">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{s.vehicle}{s.registration_number && <span className="text-slate-400 font-normal"> · {s.registration_number}</span>}</p>
                                    <p className="text-xs text-slate-500">{s.sale_date ? fullBS(`${s.sale_date}T00:00:00`) : ""}{s.sold_by_name ? ` · sold by ${s.sold_by_name}` : ""}</p>
                                    <button onClick={() => navigate(`/sales/${s.id}`)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"><ExternalLink size={11} /> Open sale</button>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-bold text-slate-900" style={FONT}>{formatNPR(s.sale_price)}</p>
                                    {s.returned ? <span className="text-[11px] font-semibold text-amber-700">Returned</span> : s.due_amount > 0 ? <span className="text-[11px] font-semibold text-red-600">{formatNPR(s.due_amount)} due</span> : <span className="text-[11px] font-semibold text-emerald-600">{s.payment_status || "Paid"}</span>}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {data.bookings.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 mb-2" style={FONT}>Bookings</h4>
                          <ul className="space-y-2">
                            {data.bookings.map(b => (
                              <li key={b.id} className="rounded-xl border border-slate-200 p-3 flex justify-between gap-3">
                                <div><p className="text-sm font-semibold text-slate-900">{b.vehicle}</p><p className="text-xs text-slate-500 capitalize">{b.status}</p></div>
                                <p className="text-sm font-bold text-slate-900" style={FONT}>{formatNPR(b.booking_amount)}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {editing && tab === "overview" && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2" data-testid="profile-edit-bar">
                <button type="button" onClick={() => setEditing(false)} className={btnGhost} data-testid="profile-edit-cancel">Cancel</button>
                <button type="submit" form="profile-form" disabled={saving} className={btnPrimary} data-testid="profile-edit-save">{saving ? "Saving..." : "Save changes"}</button>
              </div>
            )}
          </>
        )}
      </Drawer>
      {ask && <ConfirmModal title={ask.title} message={ask.message} confirmLabel={ask.confirmLabel} busy={asking} onClose={() => setAsk(null)} onConfirm={confirmAsk} />}
    </>
  );
}
