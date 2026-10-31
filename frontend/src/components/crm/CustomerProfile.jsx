import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Pencil, Phone, MessageCircle, CalendarPlus, Trash2, CheckCircle2, CalendarClock, StickyNote, Undo2, ShoppingBag, Bookmark, UserPlus, Link2, ChevronDown } from "lucide-react";
import { notify } from "../../utils/notify";
import api from "../../utils/api";
import { formatNPR } from "../../utils/helpers";
import useSellers from "../../hooks/useSellers";
import {
  CONTACT_KINDS, LOGGABLE_KINDS, PICKABLE_STATUSES, SOURCE_LABEL, SOURCE_STYLE,
  dateTimeTitle, fromLocalInput, fullBS, referredByLabel, shortBS, timeOf, toLocalInput, waNumber,
} from "../../utils/crm";
import { Drawer, Avatar, StatusBadge, EmptyState, FONT, inputCls, btnPrimary, btnGhost, Skeleton } from "./ui";

// A customer in full: who they are, where they came from, what they bought, everything that was said and what is due.
const TABS = [["overview", "Overview"], ["timeline", "Timeline"], ["followups", "Follow-ups"], ["purchases", "Purchases"]];

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

export default function CustomerProfile({ customerId, onClose, onChanged, onEdit, onOpenCustomer, onFollowup, onDelete, reloadKey }) {
  const sellers = useSellers();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [log, setLog] = useState({ kind: "call", summary: "", at: toLocalInput() });
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    try { setData((await api.get(`/crm/customers/${customerId}`, { suppressErrorToast: true })).data); setError(""); }
    catch (ex) { setError(ex.response?.status === 404 ? "This customer no longer exists." : "Couldn't load this customer."); }
  }, [customerId]);
  // A different customer starts from a clean Overview; a refresh of the same customer (after scheduling a follow-up,
  // logging a call ...) must keep the tab and the scroll position where they are.
  useEffect(() => { setData(null); setTab("overview"); setError(""); }, [customerId]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const changed = async () => { await load(); onChanged(); };
  const c = data?.customer;

  const setStatus = async (status) => {
    try { await api.put(`/crm/customers/${customerId}/lead-status`, { status }); notify.success("Status updated"); changed(); }
    catch (ex) { notify.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't change the status"); }
  };
  const assign = async (id) => {
    try { await api.put(`/crm/customers/${customerId}/assign`, { assigned_to_id: id || null }); notify.success("Assignment updated"); changed(); }
    catch (ex) { notify.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't change the assignment"); }
  };
  const addLog = async (e) => {
    e.preventDefault();
    if (log.kind !== "call" && log.kind !== "whatsapp" && !log.summary.trim()) { notify.error("Write a short note about it"); return; }
    setLogging(true);
    try {
      await api.post(`/crm/customers/${customerId}/interactions`, { kind: log.kind, summary: log.summary.trim(), occurred_at: fromLocalInput(log.at) });
      setLog({ kind: log.kind, summary: "", at: toLocalInput() });
      notify.success("Added to the history");
      changed();
    } catch (ex) { notify.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't save that"); }
    finally { setLogging(false); }
  };
  const removeInteraction = async (id) => {
    try { await api.delete(`/crm/interactions/${id}`); changed(); } catch { notify.error("Couldn't remove that entry"); }
  };
  const removeFollowup = async (id) => {
    try { await api.delete(`/crm/followups/${id}`); notify.success("Follow-up deleted"); changed(); } catch { notify.error("Couldn't delete that follow-up"); }
  };
  const reopen = async (id) => {
    try { await api.put(`/crm/followups/${id}`, { status: "pending" }); changed(); } catch { notify.error("Couldn't reopen that follow-up"); }
  };

  // Everything that happened, newest first: contacts, purchases, bookings, and the day they were added.
  const timeline = useMemo(() => {
    if (!data) return [];
    const items = data.interactions.map(i => ({ key: `i${i.id}`, at: i.occurred_at, kind: i.kind, text: i.summary, interactionId: i.id }));
    data.sales.forEach(s => items.push({ key: `s${s.id}`, at: `${s.sale_date || ""}T00:00:00`, kind: "sale", text: `${s.returned ? "Bought and returned" : "Bought"} ${s.vehicle} for ${formatNPR(s.sale_price)}${s.sold_by_name ? ` · sold by ${s.sold_by_name}` : ""}` }));
    data.bookings.forEach(b => items.push({ key: `b${b.id}`, at: `${b.booking_date || ""}T00:00:00`, kind: "booking", text: `Booked ${b.vehicle} with ${formatNPR(b.booking_amount)} deposit (${b.status})` }));
    if (data.customer.created_at) items.push({ key: "created", at: data.customer.created_at, kind: "created", text: `Added as a customer${data.customer.source ? ` · ${SOURCE_LABEL[data.customer.source]}` : ""}` });
    return items.filter(i => i.at).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [data]);

  const pending = data?.followups.filter(f => f.status !== "done") || [];
  const finished = data?.followups.filter(f => f.status === "done") || [];
  const asFollowup = (f) => ({ ...f, customer_name: c.name });
  const known = c && sellers.some(s => s.id === c.assigned_to_id);

  return (
    <Drawer onClose={onClose} testid="profile-drawer">
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
              <button onClick={onClose} aria-label="Close profile" className="shrink-0 w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.contact_number && <a href={`tel:${c.contact_number}`} onClick={() => api.post(`/crm/customers/${customerId}/interactions`, { kind: "call", summary: "" }).then(changed).catch(() => {})} className={`${btnGhost} !h-9 !px-3`}><Phone size={14} className="text-sky-600" /> Call</a>}
              {c.contact_number && <a href={`https://wa.me/${waNumber(c.contact_number)}`} target="_blank" rel="noopener noreferrer" onClick={() => api.post(`/crm/customers/${customerId}/interactions`, { kind: "whatsapp", summary: "" }).then(changed).catch(() => {})} className={`${btnGhost} !h-9 !px-3`}><MessageCircle size={14} className="text-green-600" /> WhatsApp</a>}
              <button onClick={() => onEdit(c)} className={`${btnGhost} !h-9 !px-3`} data-testid="profile-edit"><Pencil size={14} /> Edit</button>
              <button onClick={() => onFollowup("schedule", null, { id: c.id, name: c.name })} className={`${btnPrimary} !h-9 !px-3`} data-testid="profile-schedule"><CalendarPlus size={14} /> Follow-up</button>
              {!c.purchases && <button onClick={() => onDelete(c)} className="ml-auto h-9 px-3 rounded-lg text-red-600 hover:bg-red-50 text-sm font-semibold inline-flex items-center gap-1.5" data-testid="profile-delete"><Trash2 size={14} /> Delete</button>}
            </div>
          </div>

          <div role="tablist" className="flex gap-1 px-4 pt-2 border-b border-slate-100 overflow-x-auto">
            {TABS.map(([k, label]) => {
              const n = k === "timeline" ? timeline.length : k === "followups" ? pending.length : k === "purchases" ? data.sales.length + data.bookings.length : 0;
              return (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`profile-tab-${k}`}
                  className={`px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                  {label}{n > 0 && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{n}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === "overview" && (
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

            {tab === "timeline" && (
              <div className="space-y-5" data-testid="profile-timeline">
                <form onSubmit={addLog} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of contact">
                    {LOGGABLE_KINDS.map(k => {
                      const K = CONTACT_KINDS[k];
                      return <button key={k} type="button" onClick={() => setLog({ ...log, kind: k })} aria-pressed={log.kind === k} data-testid={`log-kind-${k}`}
                        className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${log.kind === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}><K.Icon size={13} />{K.label}</button>;
                    })}
                  </div>
                  <textarea value={log.summary} onChange={e => setLog({ ...log, summary: e.target.value })} rows={2} maxLength={2000} placeholder={log.kind === "call" || log.kind === "whatsapp" ? "What was discussed? (optional)" : "What happened?"} className={`${inputCls} h-auto py-2 resize-none`} data-testid="log-summary" />
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <input type="datetime-local" value={log.at} onChange={e => setLog({ ...log, at: e.target.value })} className={`${inputCls} !w-auto !h-9`} aria-label="When" />
                    <button type="submit" disabled={logging} className={`${btnPrimary} !h-9`} data-testid="log-save">{logging ? "Saving..." : "Add to history"}</button>
                  </div>
                </form>
                {timeline.length === 0 ? <EmptyState icon={StickyNote} title="Nothing yet">Calls, WhatsApp chats, visits and notes will build up here.</EmptyState> : (
                  <ol className="relative border-l-2 border-slate-100 ml-3 space-y-4">
                    {timeline.map(i => {
                      const K = CONTACT_KINDS[i.kind] || (i.kind === "sale" ? { Icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-700" } : i.kind === "booking" ? { Icon: Bookmark, tone: "bg-sky-50 text-sky-700" } : { Icon: UserPlus, tone: "bg-slate-100 text-slate-600" });
                      return (
                        <li key={i.key} className="pl-5 relative group" data-testid="timeline-item">
                          <span className={`absolute -left-[13px] top-0 w-6 h-6 rounded-full inline-flex items-center justify-center ring-4 ring-white ${K.tone}`}><K.Icon size={12} /></span>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm text-slate-800 whitespace-pre-line break-words">{i.text}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5" title={dateTimeTitle(i.at)}>{CONTACT_KINDS[i.kind] ? `${CONTACT_KINDS[i.kind].label} · ` : ""}{fullBS(i.at)}{i.at.includes("T00:00:00") && !i.interactionId ? "" : ` · ${timeOf(i.at)}`}</p>
                            </div>
                            {i.interactionId && <button onClick={() => removeInteraction(i.interactionId)} aria-label="Remove this entry" className="shrink-0 w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center justify-center"><Trash2 size={13} /></button>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            {tab === "followups" && (
              <div className="space-y-5" data-testid="profile-followups">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900" style={FONT}>Scheduled</h4>
                  <button onClick={() => onFollowup("schedule", null, { id: c.id, name: c.name })} className={`${btnGhost} !h-8 !px-3 !text-xs`}><CalendarPlus size={13} /> Schedule</button>
                </div>
                {pending.length === 0 ? <p className="text-sm text-slate-400">Nothing scheduled.</p> : (
                  <ul className="space-y-2">
                    {pending.map(f => (
                      <li key={f.id} className="rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3" data-testid="profile-followup">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{f.purpose}</p>
                          <p className={`text-xs ${new Date(f.due_at) < new Date() ? "text-red-600 font-semibold" : "text-slate-500"}`}>{fullBS(f.due_at)} · {timeOf(f.due_at)}{new Date(f.due_at) < new Date() ? " · overdue" : ""}</p>
                          {f.notes && <p className="text-xs text-slate-400 italic mt-0.5">{f.notes}</p>}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => onFollowup("complete", asFollowup(f))} title="Mark done" aria-label="Mark done" className="w-8 h-8 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center"><CheckCircle2 size={16} /></button>
                          <button onClick={() => onFollowup("reschedule", asFollowup(f))} title="Reschedule" aria-label="Reschedule" className="w-8 h-8 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700 inline-flex items-center justify-center"><CalendarClock size={15} /></button>
                          <button onClick={() => onFollowup("note", asFollowup(f))} title="Note" aria-label="Note" className="w-8 h-8 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700 inline-flex items-center justify-center"><StickyNote size={15} /></button>
                          <button onClick={() => removeFollowup(f.id)} title="Delete" aria-label="Delete follow-up" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"><Trash2 size={14} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <h4 className="text-sm font-bold text-slate-900 pt-1" style={FONT}>History</h4>
                {finished.length === 0 ? <p className="text-sm text-slate-400">No completed follow-ups yet.</p> : (
                  <ul className="space-y-2">
                    {finished.map(f => (
                      <li key={f.id} className="rounded-xl bg-slate-50 p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-500 line-through">{f.purpose}</p>
                          <p className="text-xs text-slate-400">Done {f.completed_at ? `${fullBS(f.completed_at)} · ${timeOf(f.completed_at)}` : ""}</p>
                          {f.outcome && <p className="text-xs text-slate-600 mt-0.5">{f.outcome}</p>}
                        </div>
                        <button onClick={() => reopen(f.id)} title="Reopen" aria-label="Reopen follow-up" className="shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:bg-white hover:text-blue-700 inline-flex items-center justify-center"><Undo2 size={15} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "purchases" && (
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
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
