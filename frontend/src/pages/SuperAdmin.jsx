import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Building2, Users, Bike, Ban, CheckCircle2, LogIn, Trash2, UsersRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";

const EMPTY_FORM = { name: "", code: "", admin_name: "", admin_username: "", admin_password: "" };

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { enterCompany } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [teamTarget, setTeamTarget] = useState(null);
  const [teamMembers, setTeamMembers] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [usersTarget, setUsersTarget] = useState(null);
  const [companyUsers, setCompanyUsers] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try { const r = await api.get("/super-admin/companies"); setCompanies(r.data); }
    catch { toast.error("Failed to load companies"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const openAdd = () => { setForm(EMPTY_FORM); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.code || !form.admin_name || !form.admin_username || !form.admin_password) {
      toast.error("All fields are required"); return;
    }
    if (form.admin_password.length < 8) { toast.error("Admin password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.post("/super-admin/companies", form);
      toast.success("Company created!");
      setShowModal(false);
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create company");
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (company) => {
    if (company.active && !window.confirm(`Suspend ${company.name}? Its users won't be able to log in until reactivated.`)) return;
    setBusyId(company.id);
    try {
      await api.put(`/super-admin/companies/${company.id}`, { active: !company.active });
      toast.success(company.active ? "Company suspended" : "Company reactivated");
      fetchCompanies();
    } catch {
      toast.error("Failed to update company");
    } finally { setBusyId(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.code) return;
    setDeleting(true);
    try {
      await api.delete(`/super-admin/companies/${deleteTarget.id}`);
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete company");
    } finally { setDeleting(false); }
  };

  const handleViewTeam = async (company) => {
    setTeamTarget(company);
    setTeamMembers(null);
    setTeamLoading(true);
    try {
      const r = await api.get(`/super-admin/companies/${company.id}/team`);
      setTeamMembers(r.data);
    } catch {
      toast.error("Failed to load team");
      setTeamMembers([]);
    } finally { setTeamLoading(false); }
  };

  const handleViewUsers = async (company) => {
    setUsersTarget(company);
    setCompanyUsers(null);
    setUsersLoading(true);
    try {
      const r = await api.get(`/super-admin/companies/${company.id}/users`);
      setCompanyUsers(r.data);
    } catch {
      toast.error("Failed to load accounts");
      setCompanyUsers([]);
    } finally { setUsersLoading(false); }
  };

  const handleEnter = async (company) => {
    setBusyId(company.id);
    try {
      const r = await api.post(`/super-admin/companies/${company.id}/enter`);
      const { username, name, role, company_id, company_name, token } = r.data;
      enterCompany({ username, name, role, company_id, company_name }, token);
      navigate("/");
    } catch {
      toast.error("Failed to enter company");
    } finally { setBusyId(null); }
  };

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500">{companies.length} companies on the platform</p>
        </div>
        <button onClick={openAdd} data-testid="add-company-button" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
          <Plus size={16} /> Create Company
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{companies.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Companies</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700" style={{ fontFamily: "Manrope" }}>{companies.filter(c => c.active).length}</div>
          <div className="text-xs text-green-600 mt-0.5">Active</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-700" style={{ fontFamily: "Manrope" }}>{companies.filter(c => !c.active).length}</div>
          <div className="text-xs text-red-600 mt-0.5">Suspended</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <Building2 size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No companies yet</p>
          <p className="text-sm mt-1">Create a company to get them onboarded</p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <div key={c.id} data-testid="company-card" className={`bg-white rounded-xl border shadow-sm overflow-hidden ${c.active ? "border-slate-200" : "border-red-200"}`}>
              <div className="p-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm">{c.name[0]?.toUpperCase()}</div>
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        {c.name}
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{c.code}</span>
                        {c.active ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Active</span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Suspended</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Created {c.created_at ? new Date(c.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(c)}
                      disabled={busyId === c.id}
                      data-testid="toggle-company-active-btn"
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                        c.active ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {c.active ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                      {c.active ? "Suspend" : "Reactivate"}
                    </button>
                    <button
                      onClick={() => handleEnter(c)}
                      disabled={busyId === c.id || !c.active}
                      data-testid="enter-company-btn"
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-60"
                    >
                      <LogIn size={12} />
                      Enter
                    </button>
                    <button
                      onClick={() => handleViewTeam(c)}
                      data-testid="view-team-btn"
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                      title="View staff roster"
                    >
                      <UsersRound size={12} />
                      Team
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(c); setDeleteConfirmText(""); }}
                      disabled={busyId === c.id}
                      data-testid="delete-company-btn"
                      className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
                      title="Permanently delete this company"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={() => handleViewUsers(c)}
                    data-testid="view-users-btn"
                    title="View login accounts"
                    className="bg-slate-50 hover:bg-slate-100 rounded-lg p-3 text-center flex items-center justify-center gap-2 transition-colors"
                  >
                    <Users size={14} className="text-slate-400" />
                    <div>
                      <div className="text-lg font-bold text-slate-900 leading-tight" style={{ fontFamily: "Manrope" }}>{c.user_count ?? 0}</div>
                      <div className="text-xs text-slate-500">Users</div>
                    </div>
                  </button>
                  <div className="bg-blue-50 rounded-lg p-3 text-center flex items-center justify-center gap-2">
                    <Bike size={14} className="text-blue-400" />
                    <div>
                      <div className="text-lg font-bold text-blue-700 leading-tight" style={{ fontFamily: "Manrope" }}>{c.vehicle_count ?? 0}</div>
                      <div className="text-xs text-blue-600">Vehicles</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Company Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Create Company</h2>
              <button onClick={() => setShowModal(false)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Auto Traders" className={inp} data-testid="company-name-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company Code <span className="text-red-500">*</span></label>
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toLowerCase() })} placeholder="e.g. acme" className={inp} data-testid="company-code-input" />
                <p className="text-xs text-slate-400 mt-1">Short lowercase slug used for login (e.g. "acme")</p>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-3 mt-2">First Admin User</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Admin Name <span className="text-red-500">*</span></label>
                    <input value={form.admin_name} onChange={e => setForm({ ...form, admin_name: e.target.value })} placeholder="e.g. Ram Bahadur Shrestha" className={inp} data-testid="admin-name-input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Admin Username <span className="text-red-500">*</span></label>
                    <input value={form.admin_username} onChange={e => setForm({ ...form, admin_username: e.target.value })} placeholder="e.g. admin" className={inp} data-testid="admin-username-input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Admin Password <span className="text-red-500">*</span></label>
                    <input type="password" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} placeholder="Min 8 characters" className={inp} data-testid="admin-password-input" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="save-company-btn">
                  {saving ? "Creating..." : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Team Roster */}
      {teamTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{teamTarget.name}</h2>
                <p className="text-xs text-slate-500">Staff roster</p>
              </div>
              <button onClick={() => setTeamTarget(null)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {teamLoading ? (
                <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                  <UsersRound size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No team members added yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((m) => (
                    <div key={m.id} data-testid="team-roster-row" className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-lg">
                      <div>
                        <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                          {m.name}
                          {m.is_active === false && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Inactive</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 capitalize mt-0.5">{m.role}{m.specialization ? ` — ${m.specialization}` : ""}</div>
                        {m.contact && <div className="text-xs text-slate-400 mt-0.5">{m.contact}</div>}
                      </div>
                      {m.commission_rate != null && (
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{m.commission_rate}%</div>
                          <div className="text-[10px] text-slate-400">commission</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login Accounts */}
      {usersTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{usersTarget.name}</h2>
                <p className="text-xs text-slate-500">Login accounts</p>
              </div>
              <button onClick={() => setUsersTarget(null)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {usersLoading ? (
                <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
              ) : companyUsers.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                  <ShieldCheck size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No accounts found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {companyUsers.map((u) => (
                    <div key={u.id} data-testid="account-row" className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                          {u.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{u.name}</div>
                          <div className="text-xs text-slate-500">@{u.username}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Company Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-red-600 flex items-center gap-2"><Trash2 size={18} /> Delete Company</h2>
              <button onClick={() => setDeleteTarget(null)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700">
                This permanently deletes <span className="font-bold">{deleteTarget.name}</span> and every record under it —
                {" "}{deleteTarget.user_count ?? 0} user(s), {deleteTarget.vehicle_count ?? 0} vehicle(s), and all
                other data (customers, sales, jobs, etc.). This cannot be undone.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Type <span className="font-mono font-bold text-slate-900">{deleteTarget.code}</span> to confirm
                </label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  data-testid="delete-confirm-input"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmText !== deleteTarget.code}
                  data-testid="confirm-delete-company-btn"
                  className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-all active:scale-95"
                >
                  {deleting ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
