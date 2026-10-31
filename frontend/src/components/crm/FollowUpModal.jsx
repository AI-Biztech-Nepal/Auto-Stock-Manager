import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { notify } from "../../utils/notify";
import api from "../../utils/api";
import { FOLLOWUP_PURPOSES, fromLocalInput, toLocalInput, tomorrowAt } from "../../utils/crm";
import { Modal, FormField, inputCls, btnPrimary, btnGhost } from "./ui";

// One dialog for everything done to a follow-up: schedule a new one, move it, finish it (with how it went), or
// attach a note. `customer` ({ id, name }) is fixed when opened from a customer, otherwise it is searched for.
const TITLES = { schedule: "Schedule follow-up", reschedule: "Reschedule follow-up", complete: "Mark follow-up done", note: "Follow-up note" };

export default function FollowUpModal({ mode, customer, followup, customers = [], onClose, onSaved }) {
  const [who, setWho] = useState(customer || null);
  const [q, setQ] = useState("");
  const [due, setDue] = useState(followup ? toLocalInput(followup.due_at) : tomorrowAt(10));
  const [purpose, setPurpose] = useState(followup?.purpose || "Call back");
  const [notes, setNotes] = useState(followup?.notes || "");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? customers.filter(c => c.name.toLowerCase().includes(needle) || c.contact_number.includes(needle)).slice(0, 6) : [];
  }, [customers, q]);

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (mode === "schedule" && !who) err.who = "Pick the customer";
    if ((mode === "schedule" || mode === "reschedule") && (!due || Number.isNaN(new Date(due).getTime()))) err.due = "Pick a date and time";
    if (mode === "schedule" && !purpose.trim()) err.purpose = "Say what the follow-up is for";
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      if (mode === "schedule") await api.post(`/crm/customers/${who.id}/followups`, { due_at: fromLocalInput(due), purpose: purpose.trim(), notes: notes.trim() || null });
      else if (mode === "reschedule") await api.put(`/crm/followups/${followup.id}`, { due_at: fromLocalInput(due) });
      else if (mode === "complete") await api.put(`/crm/followups/${followup.id}`, { status: "done", outcome: outcome.trim() || null });
      else await api.put(`/crm/followups/${followup.id}`, { notes: notes.trim() || null });
      notify.success(mode === "schedule" ? "Follow-up scheduled" : mode === "complete" ? "Follow-up marked done" : mode === "reschedule" ? "Follow-up rescheduled" : "Note saved");
      onSaved();
    } catch (ex) {
      notify.error(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't save the follow-up");
    } finally { setBusy(false); }
  };

  return (
    <Modal title={TITLES[mode]} subtitle={followup ? `${followup.customer_name} · ${followup.purpose}` : who?.name} onClose={onClose} testid="followup-modal"
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="submit" form="followup-form" disabled={busy} className={btnPrimary} data-testid="followup-save">{busy ? "Saving..." : mode === "complete" ? "Mark done" : mode === "schedule" ? "Schedule" : "Save"}</button>
      </>}>
      <form id="followup-form" onSubmit={submit} className="space-y-4">
        {mode === "schedule" && !customer && (
          <FormField label="Customer" required error={errors.who}>
            {who ? (
              <div className="flex items-center justify-between h-10 px-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
                <span className="font-semibold truncate">{who.name}</span>
                <button type="button" onClick={() => setWho(null)} className="text-xs font-semibold hover:underline">Change</button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or phone" className={`${inputCls} pl-9`} autoFocus data-testid="followup-customer-search" />
                {matches.length > 0 && (
                  <ul className="mt-1 border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                    {matches.map(c => (
                      <li key={c.id}><button type="button" onClick={() => { setWho({ id: c.id, name: c.name }); setQ(""); }} data-testid="followup-customer-option"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between gap-3"><span className="font-medium text-slate-800 truncate">{c.name}</span><span className="text-xs text-slate-400">{c.contact_number}</span></button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </FormField>
        )}
        {(mode === "schedule" || mode === "reschedule") && (
          <FormField label="When" required error={errors.due}>
            <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className={inputCls} data-testid="followup-due" />
          </FormField>
        )}
        {mode === "schedule" && (
          <FormField label="What is it for?" required error={errors.purpose}>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} list="followup-purposes" maxLength={255} className={inputCls} data-testid="followup-purpose" />
            <datalist id="followup-purposes">{FOLLOWUP_PURPOSES.map(p => <option key={p} value={p} />)}</datalist>
          </FormField>
        )}
        {(mode === "schedule" || mode === "note") && (
          <FormField label={mode === "note" ? "Note" : "Note (optional)"}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Anything to remember for this follow-up" className={`${inputCls} h-auto py-2 resize-none`} data-testid="followup-notes" />
          </FormField>
        )}
        {mode === "complete" && (
          <FormField label="How did it go? (optional)" hint="It goes into the customer's history and counts as the last contact.">
            <textarea value={outcome} onChange={e => setOutcome(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. Came to the showroom, wants to book next week" className={`${inputCls} h-auto py-2 resize-none`} data-testid="followup-outcome" autoFocus />
          </FormField>
        )}
      </form>
    </Modal>
  );
}
