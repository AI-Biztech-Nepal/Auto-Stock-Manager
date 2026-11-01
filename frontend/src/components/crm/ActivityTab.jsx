import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, CheckCircle2, Undo2, CalendarPlus, StickyNote, ShoppingBag, Bookmark, UserPlus, ExternalLink, History } from "lucide-react";
import { notify } from "../../utils/notify";
import api from "../../utils/api";
import { formatNPR } from "../../utils/helpers";
import {
  CONTACT_KINDS, FOLLOWUP_PURPOSES, LOGGABLE_KINDS, SOURCE_LABEL,
  dateTimeTitle, fromLocalInput, fullBS, timeOf, toLocalInput, tomorrowAt,
} from "../../utils/crm";
import { EmptyState, FONT, inputCls, btnPrimary, btnGhost } from "./ui";

// Everything about a customer in one place: add a call / note / visit or schedule a follow-up at the top, then what is
// still to do, then everything that already happened (contacts, finished follow-ups, purchases, bookings), newest first.
// Every contact and follow-up can be edited in place (Save / Cancel) or deleted.
const iconBtn = "w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
const errMsg = (ex, fallback) => (typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : fallback);
const needsText = (kind) => kind !== "call" && kind !== "whatsapp";
const when = (iso) => `${fullBS(iso)} · ${timeOf(iso)}`;

function KindChips({ value, onChange, testid = "log-kind" }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of contact">
      {LOGGABLE_KINDS.map(k => {
        const K = CONTACT_KINDS[k];
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k} data-testid={`${testid}-${k}`}
            className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${value === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}><K.Icon size={13} />{K.label}</button>
        );
      })}
    </div>
  );
}

function SaveCancel({ busy, onCancel, label = "Save" }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className={`${btnGhost} !h-9`} data-testid="edit-cancel">Cancel</button>
      <button type="submit" disabled={busy} className={`${btnPrimary} !h-9`} data-testid="edit-save">{busy ? "Saving..." : label}</button>
    </div>
  );
}

const Dot = ({ tone, Icon }) => <span className={`absolute -left-[13px] top-0 w-6 h-6 rounded-full inline-flex items-center justify-center ring-4 ring-white ${tone}`}><Icon size={12} /></span>;

const Label = ({ children }) => <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{children}</label>;

// ── the in-place editors ──
function ContactEditor({ item, busy, onSave, onCancel }) {
  const keepKind = item.kind === "followup";
  const [kind, setKind] = useState(item.kind);
  const [summary, setSummary] = useState(item.summary || "");
  const [at, setAt] = useState(toLocalInput(item.occurred_at));
  const submit = (e) => {
    e.preventDefault();
    if (needsText(kind) && !summary.trim()) { notify.error("Write a short note about it"); return; }
    if (!at || Number.isNaN(new Date(at).getTime())) { notify.error("Pick a valid date and time"); return; }
    onSave({ ...(keepKind ? {} : { kind }), summary: summary.trim(), occurred_at: fromLocalInput(at) });
  };
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid="edit-contact">
      {!keepKind && <KindChips value={kind} onChange={setKind} testid="edit-kind" />}
      <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} maxLength={2000} autoFocus className={`${inputCls} h-auto py-2 resize-none`} placeholder={needsText(kind) ? "What happened?" : "What was discussed? (optional)"} data-testid="edit-summary" />
      <div><Label>When</Label><input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={`${inputCls} !w-auto !h-9`} data-testid="edit-at" /></div>
      <SaveCancel busy={busy} onCancel={onCancel} />
    </form>
  );
}

function FollowupEditor({ item, busy, onSave, onCancel }) {
  const [due, setDue] = useState(toLocalInput(item.due_at));
  const [purpose, setPurpose] = useState(item.purpose || "");
  const [notes, setNotes] = useState(item.notes || "");
  const submit = (e) => {
    e.preventDefault();
    if (!due || Number.isNaN(new Date(due).getTime())) { notify.error("Pick a date and time"); return; }
    if (!purpose.trim()) { notify.error("Say what the follow-up is for"); return; }
    onSave({ due_at: fromLocalInput(due), purpose: purpose.trim(), notes: notes.trim() || null });
  };
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid="edit-followup">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div><Label>When</Label><input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className={`${inputCls} !h-9`} data-testid="edit-due" /></div>
        <div><Label>What for</Label><input value={purpose} onChange={e => setPurpose(e.target.value)} list="activity-purposes" maxLength={255} className={`${inputCls} !h-9`} data-testid="edit-purpose" /></div>
      </div>
      <div><Label>Note</Label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={2000} className={`${inputCls} h-auto py-2 resize-none`} placeholder="Anything to remember" data-testid="edit-notes" /></div>
      <SaveCancel busy={busy} onCancel={onCancel} />
    </form>
  );
}

// Finishing a follow-up, or fixing how a finished one went.
function OutcomeEditor({ item, finishing, busy, onSave, onCancel }) {
  const [purpose, setPurpose] = useState(item.purpose || "");
  const [outcome, setOutcome] = useState(item.outcome || "");
  const submit = (e) => {
    e.preventDefault();
    if (!finishing && !purpose.trim()) { notify.error("Say what the follow-up was for"); return; }
    onSave(finishing ? { status: "done", outcome: outcome.trim() || null } : { purpose: purpose.trim(), outcome: outcome.trim() || null });
  };
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid={finishing ? "finish-followup" : "edit-done-followup"}>
      {!finishing && <div><Label>What for</Label><input value={purpose} onChange={e => setPurpose(e.target.value)} list="activity-purposes" maxLength={255} className={`${inputCls} !h-9`} data-testid="edit-purpose" /></div>}
      <div>
        <Label>How did it go? (optional)</Label>
        <textarea value={outcome} onChange={e => setOutcome(e.target.value)} rows={2} maxLength={2000} autoFocus className={`${inputCls} h-auto py-2 resize-none`} placeholder="e.g. Came to the showroom, wants to book next week" data-testid="edit-outcome" />
      </div>
      <SaveCancel busy={busy} onCancel={onCancel} label={finishing ? "Mark done" : "Save"} />
    </form>
  );
}

export default function ActivityTab({ customer: c, data, request, onChanged, onAskDelete, onDirty }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("log"); // log | followup
  const [log, setLog] = useState({ kind: "call", summary: "", at: toLocalInput() });
  const [fu, setFu] = useState({ due: tomorrowAt(10), purpose: "Call back", notes: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // `${type}:${id}`: the one entry being edited

  // The profile's action bar ("Add note", "Follow-up") opens the right form here.
  useEffect(() => {
    if (!request) return;
    setMode(request.mode);
    if (request.kind) setLog(l => ({ ...l, kind: request.kind }));
  }, [request]);
  // Unsaved typing must not vanish because the drawer was closed with Esc or a stray click.
  const dirty = !!editing || !!log.summary.trim() || !!fu.notes.trim();
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  const act = async (fn, ok, fail) => {
    setBusy(true);
    try { await fn(); if (ok) notify.success(ok); await onChanged(); return true; }
    catch (ex) { notify.error(errMsg(ex, fail)); return false; }
    finally { setBusy(false); }
  };

  const addLog = async (e) => {
    e.preventDefault();
    if (needsText(log.kind) && !log.summary.trim()) { notify.error("Write a short note about it"); return; }
    const ok = await act(() => api.post(`/crm/customers/${c.id}/interactions`, { kind: log.kind, summary: log.summary.trim(), occurred_at: fromLocalInput(log.at) }, { suppressErrorToast: true }), "Added to the history", "Couldn't save that");
    if (ok) setLog({ kind: log.kind, summary: "", at: toLocalInput() });
  };
  const addFollowup = async (e) => {
    e.preventDefault();
    if (!fu.due || Number.isNaN(new Date(fu.due).getTime())) { notify.error("Pick a date and time"); return; }
    if (!fu.purpose.trim()) { notify.error("Say what the follow-up is for"); return; }
    const ok = await act(() => api.post(`/crm/customers/${c.id}/followups`, { due_at: fromLocalInput(fu.due), purpose: fu.purpose.trim(), notes: fu.notes.trim() || null }, { suppressErrorToast: true }), "Follow-up scheduled", "Couldn't schedule that");
    if (ok) setFu({ due: tomorrowAt(10), purpose: "Call back", notes: "" });
  };

  const saveContact = async (id, body) => { if (await act(() => api.put(`/crm/interactions/${id}`, body, { suppressErrorToast: true }), "Entry updated", "Couldn't save that change")) setEditing(null); };
  const saveFollowup = async (id, body, ok = "Follow-up updated") => { if (await act(() => api.put(`/crm/followups/${id}`, body, { suppressErrorToast: true }), ok, "Couldn't save that change")) setEditing(null); };
  const reopen = (f) => act(() => api.put(`/crm/followups/${f.id}`, { status: "pending" }, { suppressErrorToast: true }), "Follow-up reopened", "Couldn't reopen that follow-up");

  const askDeleteContact = (i) => onAskDelete({
    title: "Delete this entry?", confirmLabel: "Delete entry", message: "It will be removed from this customer's history. This can't be undone.",
    run: () => act(() => api.delete(`/crm/interactions/${i.id}`, { suppressErrorToast: true }), "Entry deleted", "Couldn't delete that entry"),
  });
  const askDeleteFollowup = (f) => onAskDelete({
    title: "Delete this follow-up?", confirmLabel: "Delete follow-up",
    message: f.status === "done" ? "It will be removed, along with the contact it added to the history. This can't be undone." : "It will no longer be scheduled. This can't be undone.",
    run: () => act(() => api.delete(`/crm/followups/${f.id}`, { suppressErrorToast: true }), "Follow-up deleted", "Couldn't delete that follow-up"),
  });

  const pending = useMemo(() => data.followups.filter(f => f.status !== "done").sort((a, b) => new Date(a.due_at) - new Date(b.due_at)), [data]);
  // History, newest first. A finished follow-up wrote its own contact entry; show it once, as the follow-up.
  const history = useMemo(() => {
    const doneAt = new Set(data.followups.filter(f => f.status === "done" && f.completed_at).map(f => f.completed_at));
    const items = [];
    data.interactions.forEach(i => { if (!(i.kind === "followup" && doneAt.has(i.occurred_at))) items.push({ key: `i:${i.id}`, type: "contact", at: i.occurred_at, i }); });
    data.followups.filter(f => f.status === "done").forEach(f => items.push({ key: `d:${f.id}`, type: "done", at: f.completed_at || f.due_at, f }));
    data.sales.forEach(s => items.push({ key: `s:${s.id}`, type: "sale", at: `${s.sale_date || ""}T00:00:00`, dateOnly: true, s }));
    data.bookings.forEach(b => items.push({ key: `b:${b.id}`, type: "booking", at: `${b.booking_date || ""}T00:00:00`, dateOnly: true, b }));
    if (data.customer.created_at) items.push({ key: "created", type: "created", at: data.customer.created_at });
    return items.filter(x => x.at && !Number.isNaN(new Date(x.at).getTime())).sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [data]);

  return (
    <div className="space-y-5" data-testid="profile-activity">
      <datalist id="activity-purposes">{FOLLOWUP_PURPOSES.map(p => <option key={p} value={p} />)}</datalist>

      {/* add something */}
      <div className="rounded-xl border border-slate-200">
        <div role="tablist" aria-label="Add" className="flex border-b border-slate-100 p-1 gap-1">
          {[["log", "Log contact", StickyNote], ["followup", "Schedule follow-up", CalendarPlus]].map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} data-testid={`composer-${k}`}
              className={`flex-1 h-9 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${mode === k ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}><Icon size={14} />{label}</button>
          ))}
        </div>
        {mode === "log" ? (
          <form onSubmit={addLog} className="p-3 space-y-2.5" data-testid="composer-log-form">
            <KindChips value={log.kind} onChange={k => setLog({ ...log, kind: k })} />
            <textarea value={log.summary} onChange={e => setLog({ ...log, summary: e.target.value })} rows={2} maxLength={2000} placeholder={needsText(log.kind) ? "What happened?" : "What was discussed? (optional)"} className={`${inputCls} h-auto py-2 resize-none`} data-testid="log-summary" />
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <input type="datetime-local" value={log.at} onChange={e => setLog({ ...log, at: e.target.value })} className={`${inputCls} !w-auto !h-9`} aria-label="When" data-testid="log-at" />
              <button type="submit" disabled={busy} className={`${btnPrimary} !h-9`} data-testid="log-save">{busy ? "Saving..." : "Add to history"}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={addFollowup} className="p-3 space-y-2.5" data-testid="composer-followup-form">
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div><Label>When</Label><input type="datetime-local" value={fu.due} onChange={e => setFu({ ...fu, due: e.target.value })} className={`${inputCls} !h-9`} data-testid="fu-due" /></div>
              <div><Label>What for</Label><input value={fu.purpose} onChange={e => setFu({ ...fu, purpose: e.target.value })} list="activity-purposes" maxLength={255} className={`${inputCls} !h-9`} data-testid="fu-purpose" /></div>
            </div>
            <textarea value={fu.notes} onChange={e => setFu({ ...fu, notes: e.target.value })} rows={2} maxLength={2000} placeholder="Note (optional)" className={`${inputCls} h-auto py-2 resize-none`} data-testid="fu-notes" />
            <div className="flex justify-end"><button type="submit" disabled={busy} className={`${btnPrimary} !h-9`} data-testid="fu-save">{busy ? "Saving..." : "Schedule follow-up"}</button></div>
          </form>
        )}
      </div>

      {/* still to do */}
      {pending.length > 0 && (
        <section data-testid="activity-scheduled">
          <h4 className="text-sm font-bold text-slate-900 mb-2" style={FONT}>Scheduled <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">{pending.length}</span></h4>
          <ul className="space-y-2">
            {pending.map(f => {
              const late = new Date(f.due_at) < new Date();
              const key = `f:${f.id}`, fin = `x:${f.id}`;
              return (
                <li key={f.id} data-testid="profile-followup">
                  {editing === key ? <FollowupEditor item={f} busy={busy} onCancel={() => setEditing(null)} onSave={body => saveFollowup(f.id, body)} />
                    : editing === fin ? <OutcomeEditor item={f} finishing busy={busy} onCancel={() => setEditing(null)} onSave={body => saveFollowup(f.id, body, "Follow-up marked done")} />
                      : (
                        <div className={`rounded-xl border p-3 flex items-start justify-between gap-3 ${late ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900" data-testid="followup-purpose-text">{f.purpose}</p>
                            <p className={`text-xs ${late ? "text-red-600 font-semibold" : "text-slate-500"}`} title={dateTimeTitle(f.due_at)}>{when(f.due_at)}{late ? " · overdue" : ""}</p>
                            {f.notes && <p className="text-xs text-slate-500 italic mt-0.5 whitespace-pre-line">{f.notes}</p>}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => setEditing(fin)} title="Mark done" aria-label="Mark done" data-testid="item-done" className={`${iconBtn} text-emerald-600 hover:bg-emerald-50`}><CheckCircle2 size={16} /></button>
                            <button onClick={() => setEditing(key)} title="Edit" aria-label="Edit follow-up" data-testid="item-edit" className={`${iconBtn} text-slate-500 hover:bg-blue-50 hover:text-blue-700`}><Pencil size={14} /></button>
                            <button onClick={() => askDeleteFollowup(f)} title="Delete" aria-label="Delete follow-up" data-testid="item-delete" className={`${iconBtn} text-slate-400 hover:bg-red-50 hover:text-red-600`}><Trash2 size={14} /></button>
                          </div>
                        </div>
                      )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* what already happened */}
      <section data-testid="activity-history">
        <h4 className="text-sm font-bold text-slate-900 mb-2.5" style={FONT}>History</h4>
        {history.length === 0 ? <EmptyState icon={History} title="Nothing yet">Calls, chats, visits, notes and finished follow-ups will build up here.</EmptyState> : (
          <ol className="relative border-l-2 border-slate-100 ml-3 space-y-4">
            {history.map(it => {
              if (it.type === "contact") {
                const i = it.i, K = CONTACT_KINDS[i.kind] || CONTACT_KINDS.other;
                return (
                  <li key={it.key} className="pl-5 relative" data-testid="activity-item" data-kind={i.kind}>
                    <Dot tone={K.tone} Icon={K.Icon} />
                    {editing === it.key ? <ContactEditor item={i} busy={busy} onCancel={() => setEditing(null)} onSave={body => saveContact(i.id, body)} /> : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-800 whitespace-pre-line break-words">{i.summary}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5" title={dateTimeTitle(i.occurred_at)}>{K.label} · {when(i.occurred_at)}</p>
                        </div>
                        <div className="flex items-center shrink-0">
                          <button onClick={() => setEditing(it.key)} title="Edit" aria-label="Edit this entry" data-testid="item-edit" className={`${iconBtn} text-slate-400 hover:bg-blue-50 hover:text-blue-700`}><Pencil size={13} /></button>
                          <button onClick={() => askDeleteContact(i)} title="Delete" aria-label="Delete this entry" data-testid="item-delete" className={`${iconBtn} text-slate-400 hover:bg-red-50 hover:text-red-600`}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              }
              if (it.type === "done") {
                const f = it.f, K = CONTACT_KINDS.followup;
                return (
                  <li key={it.key} className="pl-5 relative" data-testid="activity-item" data-kind="followup-done">
                    <Dot tone={K.tone} Icon={K.Icon} />
                    {editing === it.key ? <OutcomeEditor item={f} busy={busy} onCancel={() => setEditing(null)} onSave={body => saveFollowup(f.id, body)} /> : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-800 break-words"><span className="font-semibold">Follow-up done:</span> {f.purpose}</p>
                          {f.outcome && <p className="text-sm text-slate-600 whitespace-pre-line break-words">{f.outcome}</p>}
                          <p className="text-[11px] text-slate-400 mt-0.5" title={dateTimeTitle(it.at)}>Was due {when(f.due_at)} · done {when(it.at)}</p>
                        </div>
                        <div className="flex items-center shrink-0">
                          <button onClick={() => reopen(f)} disabled={busy} title="Reopen" aria-label="Reopen follow-up" data-testid="item-reopen" className={`${iconBtn} text-slate-400 hover:bg-blue-50 hover:text-blue-700`}><Undo2 size={14} /></button>
                          <button onClick={() => setEditing(it.key)} title="Edit" aria-label="Edit this follow-up" data-testid="item-edit" className={`${iconBtn} text-slate-400 hover:bg-blue-50 hover:text-blue-700`}><Pencil size={13} /></button>
                          <button onClick={() => askDeleteFollowup(f)} title="Delete" aria-label="Delete this follow-up" data-testid="item-delete" className={`${iconBtn} text-slate-400 hover:bg-red-50 hover:text-red-600`}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              }
              if (it.type === "sale") {
                const s = it.s;
                return (
                  <li key={it.key} className="pl-5 relative" data-testid="activity-item" data-kind="sale">
                    <Dot tone="bg-emerald-50 text-emerald-700" Icon={ShoppingBag} />
                    <p className="text-sm text-slate-800 break-words">{s.returned ? "Bought and returned" : "Bought"} {s.vehicle} for {formatNPR(s.sale_price)}{s.sold_by_name ? ` · sold by ${s.sold_by_name}` : ""}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">Sale · {fullBS(it.at)}
                      <button onClick={() => navigate(`/sales/${s.id}`)} className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline" data-testid="open-sale"><ExternalLink size={11} /> Open sale</button></p>
                  </li>
                );
              }
              if (it.type === "booking") {
                const b = it.b;
                return (
                  <li key={it.key} className="pl-5 relative" data-testid="activity-item" data-kind="booking">
                    <Dot tone="bg-sky-50 text-sky-700" Icon={Bookmark} />
                    <p className="text-sm text-slate-800 break-words">Booked {b.vehicle} with {formatNPR(b.booking_amount)} deposit ({b.status})</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Booking · {fullBS(it.at)}</p>
                  </li>
                );
              }
              return (
                <li key={it.key} className="pl-5 relative" data-testid="activity-item" data-kind="created">
                  <Dot tone="bg-slate-100 text-slate-600" Icon={UserPlus} />
                  <p className="text-sm text-slate-800">Added as a customer{c.source ? ` · ${SOURCE_LABEL[c.source]}` : ""}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5" title={dateTimeTitle(it.at)}>{when(it.at)}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
