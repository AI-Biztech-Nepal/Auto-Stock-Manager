import { useEffect, useState, useCallback } from "react";
import { Plus, Wrench, TrendingUp, Landmark, UserCog, Megaphone, Server, Users, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatBSDate } from "../utils/nepali-date";
import BSDatePicker from "../components/BSDatePicker";

// ── Role config — add a new role by adding an entry here and to ROLE_ORDER ──
const ROLE_META = {
  mechanic: { label: "Mechanic", Icon: Wrench, avatar: "bg-blue-500", badge: "bg-blue-100 text-blue-700", statBg: "bg-blue-50 border-blue-100", statText: "text-blue-700", statLabel: "text-blue-600" },
  sales: { label: "Sales Staff", Icon: TrendingUp, avatar: "bg-purple-500", badge: "bg-purple-100 text-purple-700", statBg: "bg-purple-50 border-purple-100", statText: "text-purple-700", statLabel: "text-purple-600" },
  investor: { label: "Investor", Icon: Landmark, avatar: "bg-amber-500", badge: "bg-amber-100 text-amber-700", statBg: "bg-amber-50 border-amber-100", statText: "text-amber-700", statLabel: "text-amber-600" },
  frontdesk_admin: { label: "Frontdesk Administrator", Icon: UserCog, avatar: "bg-teal-500", badge: "bg-teal-100 text-teal-700", statBg: "bg-teal-50 border-teal-100", statText: "text-teal-700", statLabel: "text-teal-600" },
  social_media_manager: { label: "Social Media Manager", Icon: Megaphone, avatar: "bg-pink-500", badge: "bg-pink-100 text-pink-700", statBg: "bg-pink-50 border-pink-100", statText: "text-pink-700", statLabel: "text-pink-600" },
  it_department: { label: "IT Department", Icon: Server, avatar: "bg-slate-500", badge: "bg-slate-200 text-slate-700", statBg: "bg-slate-50 border-slate-200", statText: "text-slate-700", statLabel: "text-slate-600" },
};
const ROLE_ORDER = ["mechanic", "sales", "investor", "frontdesk_admin", "social_media_manager", "it_department"];
const roleMeta = (role) => ROLE_META[role] || ROLE_META.mechanic;

export default function Team() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", role: "mechanic", contact: "", specialization: "", commission_rate: "", joining_date: "" });
  const [saving, setSaving] = useState(false);

  const fetchTeam = useCallback(async () => {
    try { const r = await api.get("/team"); setMembers(r.data); }
    catch { toast.error("Failed to load team"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const openAdd = () => { setEditItem(null); setForm({ name: "", role: "mechanic", contact: "", specialization: "", commission_rate: "", joining_date: "" }); setShowModal(true); };
  const openEdit = (m) => { setEditItem(m); setForm({ name: m.name, role: m.role, contact: m.contact || "", specialization: m.specialization || "", commission_rate: m.commission_rate || "", joining_date: m.joining_date || "" }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.role) { toast.error("Name and role are required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, commission_rate: form.commission_rate ? Number(form.commission_rate) : null };
      if (editItem) { await api.put(`/team/${editItem.id}`, payload); toast.success("Updated"); }
      else { await api.post("/team", payload); toast.success("Team member added!"); }
      setShowModal(false); fetchTeam();
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this team member?")) return;
    try { await api.delete(`/team/${id}`); toast.success("Removed"); fetchTeam(); }
    catch { toast.error("Failed"); }
  };

  const groupedByRole = ROLE_ORDER.map(role => ({ role, meta: ROLE_META[role], members: members.filter(m => m.role === role) })).filter(g => g.members.length > 0);

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
  const sel = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  const MemberCard = ({ member }) => {
    const meta = roleMeta(member.role);
    return (
      <div data-testid="team-member-card" className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${meta.avatar}`}>
              {member.name[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">{member.name}</div>
              <div className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block mt-0.5 ${meta.badge}`}>
                {meta.label}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => openEdit(member)} className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors"><Edit size={14} className="text-slate-400" /></button>
            <button onClick={() => handleDelete(member.id)} className="w-11 h-11 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} className="text-red-400" /></button>
          </div>
        </div>

        <div className="space-y-1.5 text-sm text-slate-600">
          {member.contact && <div className="flex items-center gap-2"><span className="text-slate-400 text-xs">Phone:</span>{member.contact}</div>}
          {member.specialization && <div className="flex items-center gap-2"><span className="text-slate-400 text-xs">Specialization:</span>{member.specialization}</div>}
          {member.commission_rate && <div className="flex items-center gap-2"><span className="text-slate-400 text-xs">Commission:</span>{member.commission_rate}%</div>}
          <div className="flex items-center gap-2"><span className="text-slate-400 text-xs">Joined:</span>{member.joining_date ? `${formatBSDate(member.joining_date)} BS` : "—"}</div>
        </div>

        {member.role === "mechanic" && (
          <div className="mt-3 pt-3 border-t border-slate-50 grid grid-cols-2 gap-2">
            <div className="text-center bg-slate-50 rounded-lg p-2">
              <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{member.total_jobs || 0}</div>
              <div className="text-xs text-slate-500">Total Jobs</div>
            </div>
            <div className="text-center bg-green-50 rounded-lg p-2">
              <div className="text-lg font-bold text-green-700" style={{ fontFamily: "Manrope" }}>{member.completed_jobs || 0}</div>
              <div className="text-xs text-green-600">Completed</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Management</h1>
          <p className="text-sm text-slate-500">{members.length} team members</p>
        </div>
        <button onClick={openAdd} data-testid="add-member-button" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> Add Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{members.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Staff</div>
        </div>
        {groupedByRole.map(({ role, meta, members: roleMembers }) => (
          <div key={role} className={`${meta.statBg} border rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${meta.statText}`} style={{ fontFamily: "Manrope" }}>{roleMembers.length}</div>
            <div className={`text-xs ${meta.statLabel} mt-0.5 flex items-center justify-center gap-1`}><meta.Icon size={11} />{meta.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : (
        <>
          {groupedByRole.map(({ role, meta, members: roleMembers }) => (
            <div key={role}>
              <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><meta.Icon size={17} className={meta.statText} />{meta.label}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {roleMembers.map(m => <MemberCard key={m.id} member={m} />)}
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              <Users size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No team members yet</p>
              <p className="text-sm mt-1">Add mechanics and sales staff to get started</p>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editItem ? "Edit Member" : "Add Team Member"}</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Ramesh Tamang" className={inp} data-testid="member-name-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role <span className="text-red-500">*</span></label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className={sel} data-testid="member-role-select">
                  {ROLE_ORDER.map(role => <option key={role} value={role}>{ROLE_META[role].label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contact Number</label>
                <input type="tel" value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} placeholder="9841234567" className={inp} />
              </div>
              {form.role === "mechanic" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Specialization</label>
                  <input value={form.specialization} onChange={e => setForm({...form, specialization: e.target.value})} placeholder="e.g. Engine repair, electrical" className={inp} />
                </div>
              )}
              {form.role === "sales" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Commission Rate (%)</label>
                  <input type="number" value={form.commission_rate} onChange={e => setForm({...form, commission_rate: e.target.value})} placeholder="e.g. 2.5" className={inp} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date (BS)</label>
                <BSDatePicker value={form.joining_date} onChange={val => setForm({...form, joining_date: val})} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="save-member-btn">
                  {saving ? "Saving..." : editItem ? "Update" : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
