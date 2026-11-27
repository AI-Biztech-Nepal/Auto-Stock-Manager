import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { SECTIONS, ROLE_DEFAULT_ACCESS, ROLE_FEATURE, featureOn } from "../utils/permissions";

// Settings > Staff & Access (admin only): every login with their details, work role, job title, work hours and, per section
// of the app, No Access / View / View & Edit. The role fills the grid in; any row can then be changed for that one person.
// Only the changed rows are saved, and the server enforces them (backend staff_access.py).

const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "stock_supervisor", label: "Front Desk" },
  { key: "parts_supervisor", label: "Parts Department" },
  { key: "social_media", label: "Social Media" },
  { key: "sanakhat_officer", label: "Sanakhat Desk" },
];
const roleLabel = (key) => ROLES.find((r) => r.key === key)?.label || key;
const LEVELS = [
  { key: "none", label: "No Access", short: "None", on: "border-slate-500 [&>span]:bg-slate-500" },
  { key: "view", label: "View", short: "View", on: "border-blue-600 [&>span]:bg-blue-600" },
  { key: "edit", label: "View & Edit", short: "Edit", on: "border-emerald-600 [&>span]:bg-emerald-600" },
];
const SECTION_FEATURE = { jobs: "stock.job_cards", spare_parts: "stock.spare_parts", sanakhat: "stock.sanakhat", warranty: "stock.warranty", ai: "stock.ai_assistant", leads: "stock.leads", crm: "stock.crm", share: "stock.share", offers: "stock.offers", visits: "stock.visits" };

const inp = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400";
const ghost = "h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const primary = "h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50";
const initials = (name) => (name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
const draftOf = (s) => ({ name: s.name, role: s.role, password: "", phone: s.phone, address: s.address, pan: s.pan, job_title: s.job_title, work_start: s.work_start, work_end: s.work_end, portal_email: s.portal_email || "", access: s.access || {}, status: s.status });
const errText = (e, fallback) => (typeof e.response?.data?.detail === "string" ? e.response.data.detail : fallback);

const Field = ({ label, children, className = "" }) => (
  <label className={`block min-w-0 ${className}`}>
    <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</span>
    {children}
  </label>
);

function RolePicker({ value, onChange, features, disabled }) {
  // A role whose feature is off is not offered, but stays for someone who already has it.
  const offered = ROLES.filter((r) => r.key === value || featureOn(features, ROLE_FEATURE[r.key]));
  return (
    <div role="radiogroup" aria-label="Work role" className="flex flex-wrap gap-2">
      {offered.map((r) => (
        <button key={r.key} type="button" role="radio" aria-checked={value === r.key} disabled={disabled} onClick={() => onChange(r.key)} data-testid={`role-${r.key}`}
          className={`h-10 px-4 rounded-lg border text-sm font-semibold disabled:opacity-60 ${value === r.key ? "border-slate-800 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

function AddStaff({ ready, features, onClose, onAdded }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "stock_supervisor", phone: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.email.trim() || !f.password) return toast.error("Name, email and password are needed to sign in");
    if (f.password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", { name: f.name.trim(), email: f.email.trim(), password: f.password, role: f.role }, { suppressErrorToast: true });
      if (ready && f.phone.trim()) {
        await api.put(`/staff/${data.id}`, { name: f.name.trim(), role: f.role, phone: f.phone.trim(), access: {}, status: "active" }, { suppressErrorToast: true })
          .catch(() => toast.error("The account was created, but the mobile number was not saved"));
      }
      toast.success("Staff added");
      onAdded(data.id);
    } catch (ex) { toast.error(errText(ex, "Failed to add")); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <form onSubmit={add} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add staff" className="bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Add staff</h2>
        <Field label="Role to start with"><RolePicker value={f.role} onChange={(role) => setF({ ...f, role })} features={features} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name *"><input value={f.name} onChange={set("name")} className={inp} data-testid="new-user-name" autoComplete="off" /></Field>
          <Field label="Mobile"><input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="98XXXXXXXX" className={inp} autoComplete="off" /></Field>
          <Field label="Email (used to sign in) *"><input type="email" value={f.email} onChange={set("email")} placeholder="name@email.com" className={inp} data-testid="new-user-email" autoComplete="off" /></Field>
          <Field label="Password *"><input type="password" value={f.password} onChange={set("password")} placeholder="Min 8 characters" className={inp} data-testid="new-user-password" autoComplete="new-password" /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghost}>Cancel</button>
          <button type="submit" disabled={busy} className={primary} data-testid="save-new-user-btn">{busy ? "Adding..." : "Add staff"}</button>
        </div>
      </form>
    </div>
  );
}

export default function StaffAccess() {
  const { user, features } = useAuth();
  const [data, setData] = useState(null); // { ready, staff }
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setData((await api.get("/staff")).data); }
    catch (e) { toast.error(errText(e, "Failed to load staff")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const staff = useMemo(() => data?.staff || [], [data]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => !q || [s.name, s.email, s.phone].some((v) => (v || "").toLowerCase().includes(q)));
  }, [staff, search]);
  const selected = staff.find((s) => s.id === selectedId) || null;

  // On a wide screen the first person opens by themselves.
  useEffect(() => {
    if (!selectedId && staff.length && window.matchMedia("(min-width: 1024px)").matches) setSelectedId(staff[0].id);
  }, [staff, selectedId]);
  useEffect(() => { setDraft(selected ? draftOf(selected) : null); }, [selected]);

  const changed = !!selected && !!draft && JSON.stringify(draftOf(selected)) !== JSON.stringify(draft);
  const isSelf = selected?.email === user?.username;
  const isAdminRow = draft?.role === "admin";

  const save = async (person, values, success) => {
    setBusy(true);
    try {
      if (data.ready) {
        await api.put(`/staff/${person.id}`, { ...values, password: values.password || null }, { suppressErrorToast: true });
      } else { // the access table is not there: account name, role and password still work
        await api.put(`/auth/users/${person.id}`, { name: values.name, role: values.role, ...(values.password ? { password: values.password } : {}) }, { suppressErrorToast: true });
      }
      toast.success(success);
      await load();
    } catch (e) { toast.error(errText(e, "Could not save")); }
    finally { setBusy(false); }
  };

  const saveDraft = () => {
    if (!draft.name.trim()) return toast.error("Name is required");
    if (draft.password && draft.password.length < 8) return toast.error("Password must be at least 8 characters");
    save(selected, draft, "Saved");
  };

  const togglePause = () => save(selected, { ...draftOf(selected), status: selected.status === "active" ? "paused" : "active" }, selected.status === "active" ? "Access paused" : "Access resumed");

  const remove = async () => {
    if (!window.confirm(`Remove ${selected.name}'s account? They will no longer be able to sign in. This cannot be undone.`)) return;
    try {
      await api.delete(`/auth/users/${selected.id}`);
      toast.success("Account removed");
      setSelectedId(null);
      load();
    } catch (e) { toast.error(errText(e, "Failed to remove")); }
  };

  const roleLevel = (section) => ROLE_DEFAULT_ACCESS[draft.role]?.[section] || "none";
  const setLevel = (section, level) => {
    const access = { ...draft.access };
    if (level === roleLevel(section)) delete access[section]; else access[section] = level; // only changes are kept
    setDraft({ ...draft, access });
  };
  const sections = SECTIONS.filter((s) => featureOn(features, SECTION_FEATURE[s.key]));
  const text = (key) => ({ value: draft[key] || "", onChange: (e) => setDraft({ ...draft, [key]: e.target.value }), className: inp });

  if (!data) return <div className="flex items-center justify-center h-40"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4" data-testid="staff-access">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Who works with you, what they do, and which parts of the app they can open.</p>
        <button onClick={() => setAdding(true)} className={`${primary} inline-flex items-center gap-1.5`} data-testid="add-account-btn"><Plus size={16} /> Add staff</button>
      </div>
      {!data.ready && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Access settings and staff details cannot be saved yet: the server could not prepare its database table. Names, roles and passwords still save.
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="lg:w-80 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="p-3 border-b border-slate-100 relative">
            <Search size={15} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff" aria-label="Search staff" className={`${inp} pl-9`} />
          </div>
          {list.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500"><Users size={26} className="mx-auto mb-2 text-slate-300" />No one matches.</div>
          ) : list.map((s) => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} data-testid="account-row" aria-current={s.id === selectedId}
              className={`w-full flex items-center gap-3 px-3.5 py-3 border-b border-slate-100 text-left ${s.id === selectedId ? "bg-blue-50" : "hover:bg-slate-50"}`}>
              <span className="size-10 shrink-0 rounded-full bg-indigo-100 text-indigo-800 text-xs font-extrabold flex items-center justify-center">{initials(s.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{s.name}</span>
                <span className="block truncate text-xs text-slate-500">{[s.phone, s.status === "paused" ? "Paused" : null].filter(Boolean).join(" · ") || s.email}</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{roleLabel(s.role)}</span>
            </button>
          ))}
        </div>

        {!draft || !selected ? ( // the draft trails the selection by a render (just added, just removed)
          <div className="hidden lg:flex flex-1 min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Pick a person to set their role and access.</div>
        ) : (
          <div className="flex-1 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="size-12 shrink-0 rounded-full bg-indigo-100 text-indigo-800 font-extrabold flex items-center justify-center">{initials(selected.name)}</span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold text-slate-900">{selected.name}</h2>
                  <p className="truncate text-sm text-slate-500">Signs in with {selected.email}{selected.status === "paused" ? " · access paused" : ""}</p>
                </div>
              </div>
              {!isSelf && (
                <div className="flex gap-2">
                  {data.ready && selected.role !== "admin" && <button onClick={togglePause} disabled={busy} className={ghost} data-testid="pause-access">{selected.status === "paused" ? "Resume access" : "Pause access"}</button>}
                  <button onClick={remove} className="h-10 px-4 rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100" data-testid="delete-account-btn">Remove</button>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <Field label="Name"><input {...text("name")} data-testid="edit-user-name" /></Field>
              <Field label="Mobile"><input {...text("phone")} inputMode="tel" placeholder="98XXXXXXXX" disabled={!data.ready} /></Field>
              <Field label="Email (sign-in)"><input value={selected.email} disabled className={inp} /></Field>
              <Field label="Address"><input {...text("address")} placeholder="Address" disabled={!data.ready} /></Field>
              <Field label="PAN no."><input {...text("pan")} placeholder="PAN no." disabled={!data.ready} /></Field>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Work role</span>
              <RolePicker value={draft.role} features={features} disabled={isSelf} onChange={(role) => setDraft({ ...draft, role, access: {} })} />
              {draft.role !== selected.role && <p className="mt-1.5 text-xs text-amber-700">A new role applies fully after they sign out and sign in again.</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Job title"><input {...text("job_title")} placeholder="e.g. Showroom manager" disabled={!data.ready} /></Field>
              <div>
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Work hours</span>
                <div className="flex items-center gap-2">
                  <input type="time" {...text("work_start")} aria-label="Work starts" disabled={!data.ready} />
                  <span className="text-slate-400">–</span>
                  <input type="time" {...text("work_end")} aria-label="Work ends" disabled={!data.ready} />
                </div>
              </div>
              <Field label="New password"><input type="password" {...text("password")} placeholder="Leave empty to keep the current one" autoComplete="new-password" data-testid="edit-user-password" /></Field>
              <Field label="AiBizTech email (one-login from the portal)"><input type="email" {...text("portal_email")} placeholder="Only if different from the sign-in email" disabled={!data.portal_email_ready} data-testid="edit-user-portal-email" /></Field>
            </div>

            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-1 mb-2">
                <h3 className="text-base font-extrabold text-slate-900">Portal access</h3>
                <p className="text-xs text-slate-500">{isAdminRow ? "An Admin can always open and change everything." : "The role fills these in; change any one for this person."}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <span className="flex-1 px-3.5 py-2.5">Section</span>
                  {LEVELS.map((l) => <span key={l.key} className="w-14 sm:w-24 py-2.5 text-center"><span className="hidden sm:inline">{l.label}</span><span className="sm:hidden">{l.short}</span></span>)}
                </div>
                {sections.map((s) => {
                  const level = isAdminRow ? "edit" : draft.access[s.key] || roleLevel(s.key);
                  return (
                    <div key={s.key} role="radiogroup" aria-label={s.label} className="flex items-center min-h-11 border-b border-slate-100">
                      <span className={`flex-1 min-w-0 py-2 pr-2 text-sm ${s.group ? "pl-7 text-slate-700" : "pl-3.5 font-semibold text-slate-900"}`}>
                        {s.label}
                        {!isAdminRow && draft.access[s.key] && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">changed</span>}
                      </span>
                      {LEVELS.map((l) => (
                        <button key={l.key} type="button" role="radio" aria-checked={level === l.key} aria-label={`${s.label}: ${l.label}`} disabled={isAdminRow || !data.ready}
                          onClick={() => setLevel(s.key, l.key)} data-testid={`access-${s.key}-${l.key}`} className="w-14 sm:w-24 h-11 flex items-center justify-center disabled:opacity-50">
                          <span className={`size-5 rounded-full border-2 flex items-center justify-center ${level === l.key ? l.on : "border-slate-300"}`}>{level === l.key && <span className="size-2.5 rounded-full" />}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between min-h-11 bg-slate-50 px-3.5 text-sm text-slate-500"><span className="font-semibold">Staff &amp; Access</span><span className="text-xs">Admin only</span></div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Deleting vehicles, returns, imports and storefront settings stay with Admin, whatever is chosen here.</p>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setDraft(draftOf(selected))} disabled={!changed} className={ghost}>Cancel</button>
              <button onClick={saveDraft} disabled={!changed || busy} className={primary} data-testid="save-edit-user-btn">{busy ? "Saving..." : "Save Access"}</button>
            </div>
          </div>
        )}
      </div>

      {adding && <AddStaff ready={data.ready} features={features} onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); setSelectedId(id); load(); }} />}
    </div>
  );
}
