import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { notify } from "../../utils/notify";
import api from "../../utils/api";
import SourceField from "../SourceField";
import useSellers from "../../hooks/useSellers";
import { EMPTY_SOURCE, FOLLOWUP_PURPOSES, PICKABLE_STATUSES, fromLocalInput, isSourceComplete, phoneLooksValid, sourceFromCustomer, sourcePayload, tomorrowAt } from "../../utils/crm";
import { Modal, FormField, inputCls, btnPrimary, btnGhost } from "./ui";

// Add or edit a customer. The phone must be real and not already someone else's (the server checks it too, and says
// who has it). A new customer must say how they found the shop; a follow-up can be scheduled in the same step.
let vehicleOptions = null;
const loadVehicleOptions = () => {
  if (!vehicleOptions) vehicleOptions = api.get("/crm/vehicle-options", { suppressErrorToast: true }).then(r => r.data).catch(() => { vehicleOptions = null; return []; });
  return vehicleOptions;
};

export default function CustomerFormModal({ mode, customer, customers, onClose, onSaved, onOpenExisting, onDelete }) {
  const edit = mode === "edit";
  const sellers = useSellers();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({
    name: customer?.name || "", contact_number: customer?.contact_number || "", address: customer?.address || "",
    interested_vehicle: customer?.interested_vehicle || "", lead_status: customer?.lead_status || "new",
    assigned_to_id: customer?.assigned_to_id || "", notes: customer?.notes || "",
  });
  const [src, setSrc] = useState(edit ? sourceFromCustomer(customer) : EMPTY_SOURCE);
  const [fu, setFu] = useState({ on: false, due: tomorrowAt(10), purpose: "Call back" });
  const [errors, setErrors] = useState({});
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { let alive = true; loadVehicleOptions().then(v => { if (alive) setVehicles(v); }); return () => { alive = false; }; }, []);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: undefined }); setDup(null); };
  const known = sellers.some(s => s.id === form.assigned_to_id);

  const validate = () => {
    const err = {};
    if (form.name.trim().length < 2) err.name = "Enter the customer's name";
    if (!phoneLooksValid(form.contact_number)) err.contact_number = "Enter a valid phone number (7 to 15 digits)";
    if (!edit && !isSourceComplete(src)) err.source = src.source === "referral" ? "Say who referred them" : "Pick how they found the shop";
    if (edit && src.source === "referral" && !isSourceComplete(src)) err.source = "Say who referred them";
    if (!edit && fu.on && (!fu.due || Number.isNaN(new Date(fu.due).getTime()))) err.followup = "Pick a date and time for the follow-up";
    return err;
  };

  const submit = async (e) => {
    e.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), contact_number: form.contact_number.trim(), address: form.address.trim() || null,
        interested_vehicle: form.interested_vehicle.trim() || null, notes: form.notes.trim() || null, ...sourcePayload(src),
      };
      let saved;
      if (edit) {
        if (!customer.status_locked) body.lead_status = form.lead_status;
        saved = (await api.put(`/customers/${customer.id}?strict=true`, body)).data;
        if ((form.assigned_to_id || "") !== (customer.assigned_to_id || "")) await api.put(`/crm/customers/${customer.id}/assign`, { assigned_to_id: form.assigned_to_id || null });
      } else {
        saved = (await api.post("/customers?strict=true", { ...body, lead_status: form.lead_status, assigned_to_id: form.assigned_to_id || null })).data;
        if (fu.on) {
          try { await api.post(`/crm/customers/${saved.id}/followups`, { due_at: fromLocalInput(fu.due), purpose: fu.purpose.trim() || "Follow-up" }); }
          catch { notify.error("The customer was added, but the follow-up couldn't be scheduled"); }
        }
      }
      notify.success(edit ? "Customer updated" : "Customer added");
      onSaved(saved);
    } catch (ex) {
      const d = ex.response?.data?.detail;
      if (ex.response?.status === 409 && d?.existing_id) {
        setDup(d);
        setErrors({ contact_number: d.message });
      } else notify.error(typeof d === "string" ? d : "Couldn't save the customer. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title={edit ? "Edit customer" : "Add customer"} subtitle={edit ? customer.name : "Add a customer or lead"} size="lg" onClose={onClose} testid="customer-modal"
      footer={<>
        {edit && !customer.purchases && (
          <button type="button" onClick={() => onDelete(customer)} className="mr-auto h-10 px-3 rounded-lg text-red-600 hover:bg-red-50 text-sm font-semibold inline-flex items-center gap-1.5" data-testid="customer-delete"><Trash2 size={15} /> Delete</button>
        )}
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="submit" form="customer-form" disabled={busy} className={btnPrimary} data-testid="customer-save">{busy ? "Saving..." : edit ? "Save changes" : "Add customer"}</button>
      </>}>
      <form id="customer-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-x-4 gap-y-4" noValidate>
        <FormField label="Full name" required error={errors.name}>
          <input value={form.name} onChange={set("name")} className={inputCls} placeholder="e.g. Ram Sharma" autoFocus maxLength={200} data-testid="customer-name" />
        </FormField>
        <FormField label="Phone" required error={errors.contact_number}>
          <input value={form.contact_number} onChange={set("contact_number")} className={inputCls} placeholder="e.g. 9841234567" inputMode="tel" maxLength={30} data-testid="customer-phone" />
          {dup && <button type="button" onClick={() => onOpenExisting(dup.existing_id)} className="mt-1 text-xs font-semibold text-blue-600 hover:underline" data-testid="customer-open-existing">Open {dup.existing_name || "that customer"}</button>}
        </FormField>
        <FormField label="Address" className="sm:col-span-2">
          <input value={form.address} onChange={set("address")} className={inputCls} placeholder="Area / city" maxLength={500} data-testid="customer-address" />
        </FormField>
        <FormField label="Interested vehicle" hint="Pick from your stock or type any vehicle">
          <input value={form.interested_vehicle} onChange={set("interested_vehicle")} list="crm-vehicle-options" className={inputCls} placeholder="e.g. Honda Dio 2020" maxLength={255} data-testid="customer-vehicle" />
          <datalist id="crm-vehicle-options">{vehicles.map(v => <option key={v.id} value={v.label} />)}</datalist>
        </FormField>
        <FormField label="Assigned to">
          <select value={form.assigned_to_id} onChange={set("assigned_to_id")} className={inputCls} data-testid="customer-assigned">
            <option value="">Unassigned</option>
            {form.assigned_to_id && !known && <option value={form.assigned_to_id}>{customer?.assigned_to_name || "Previous salesperson"}</option>}
            {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormField>
        <FormField label="Lead status" hint={edit && customer.status_locked ? "Converted: this customer has bought a vehicle" : undefined}>
          {edit && customer.status_locked
            ? <input value="Converted" disabled className={inputCls} />
            : <select value={form.lead_status} onChange={set("lead_status")} className={inputCls} data-testid="customer-status">{PICKABLE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>}
        </FormField>
        <div className="sm:col-span-2">
          <SourceField value={src} onChange={v => { setSrc(v); if (errors.source) setErrors({ ...errors, source: undefined }); }} customers={customers} excludeId={customer?.id} required={!edit} />
          {errors.source && <p className="mt-1 text-xs text-red-600" role="alert">{errors.source}</p>}
        </div>
        <FormField label="Notes" className="sm:col-span-2">
          <textarea value={form.notes} onChange={set("notes")} rows={2} className={`${inputCls} h-auto py-2 resize-none`} placeholder="Anything worth remembering" data-testid="customer-notes" />
        </FormField>
        {!edit && (
          <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={fu.on} onChange={e => setFu({ ...fu, on: e.target.checked })} className="w-4 h-4 accent-blue-600" data-testid="customer-followup-on" /> Schedule a follow-up
            </label>
            {fu.on && (
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <FormField label="When" error={errors.followup}><input type="datetime-local" value={fu.due} onChange={e => setFu({ ...fu, due: e.target.value })} className={inputCls} data-testid="customer-followup-due" /></FormField>
                <FormField label="What for"><input value={fu.purpose} onChange={e => setFu({ ...fu, purpose: e.target.value })} list="customer-followup-purposes" className={inputCls} /><datalist id="customer-followup-purposes">{FOLLOWUP_PURPOSES.map(p => <option key={p} value={p} />)}</datalist></FormField>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
