import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Fingerprint, UserPlus, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { isNative, isBiometricAvailable, hasSavedCredentials, saveCredentials, deleteCredentials, verifyIdentity } from "../utils/biometric";

const SITE_FIELDS = [
  ["Business Name", "business_name", "text"],
  ["Contact Phone", "contact_phone", "tel"],
  ["Contact Email", "contact_email", "email"],
  ["Address", "address", "text"],
  ["Logo Image URL", "logo_url", "url"],
  ["Hero Image URL", "hero_image_url", "url"],
  ["Service Section Image URL", "service_image_url", "url"],
];

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

export default function Settings() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [siteForm, setSiteForm] = useState(null);
  const [savingSite, setSavingSite] = useState(false);
  const [storage, setStorage] = useState(null);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioPassword, setBioPassword] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [companyUsers, setCompanyUsers] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: "", username: "", password: "", role: "stock_supervisor" });
  const [savingUser, setSavingUser] = useState(false);

  const fetchCompanyUsers = () => {
    api.get("/auth/users").then(r => setCompanyUsers(r.data)).catch(() => toast.error("Failed to load accounts"));
  };

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/settings").then(r => setSiteForm(r.data || {})).catch(() => toast.error("Failed to load storefront settings"));
    api.get("/admin/storage-usage").then(r => setStorage(r.data)).catch(() => {});
    fetchCompanyUsers();
  }, [isAdmin]);

  useEffect(() => {
    if (!isNative()) return;
    (async () => {
      const available = await isBiometricAvailable();
      setBioSupported(available);
      if (available) setBioEnabled(await hasSavedCredentials());
    })();
  }, []);

  const enableBiometric = async (e) => {
    e.preventDefault();
    if (!bioPassword) { toast.error("Enter your password to enable biometric login"); return; }
    setBioBusy(true);
    try {
      await api.post("/auth/login", { username: user.username, password: bioPassword });
      await verifyIdentity("Enable biometric login");
      await saveCredentials(user.username, bioPassword);
      setBioEnabled(true);
      setBioPassword("");
      toast.success("Biometric login enabled");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Incorrect password");
    } finally { setBioBusy(false); }
  };

  const disableBiometric = async () => {
    setBioBusy(true);
    try {
      await deleteCredentials();
      setBioEnabled(false);
      toast.success("Biometric login disabled");
    } finally { setBioBusy(false); }
  };

  const saveSiteSettings = async (e) => {
    e.preventDefault();
    setSavingSite(true);
    try {
      const r = await api.put("/settings", siteForm);
      setSiteForm(r.data);
      toast.success("Storefront settings updated!");
    } catch { toast.error("Failed to save"); } finally { setSavingSite(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!pwForm.current_password || !pwForm.new_password) { toast.error("Fill all fields"); return; }
    if (pwForm.new_password !== pwForm.confirm) { toast.error("Passwords don't match"); return; }
    if (pwForm.new_password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success("Password changed successfully!");
      setPwForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to change password");
    } finally { setSaving(false); }
  };

  const openAddUser = () => {
    setNewUserForm({ name: "", username: "", password: "", role: "stock_supervisor" });
    setShowAddUserModal(true);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.username || !newUserForm.password) { toast.error("Fill all fields"); return; }
    if (newUserForm.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSavingUser(true);
    try {
      await api.post("/auth/register", newUserForm);
      toast.success("Account created!");
      setShowAddUserModal(false);
      fetchCompanyUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create account");
    } finally { setSavingUser(false); }
  };

  const ROLE_LABELS = { admin: "Admin", stock_supervisor: "Front Desk", parts_supervisor: "Parts Department" };

  const inp = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>Profile</h2>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
            {user?.name?.[0]?.toUpperCase() || "A"}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg">{user?.name}</div>
            <div className="text-sm text-slate-500">@{user?.username} · {user?.role}</div>
          </div>
        </div>
      </div>

      {/* Team Accounts (Admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Team Accounts</h2>
            <button onClick={openAddUser} data-testid="add-account-btn" className="flex items-center gap-1.5 h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-all active:scale-95">
              <UserPlus size={14} /> Add Account
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">Login accounts for your employees — front desk, parts, or another admin</p>
          {!companyUsers ? (
            <div className="flex items-center justify-center h-16"><div className="animate-spin w-5 h-5 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : (
            <div className="space-y-2">
              {companyUsers.map((u) => (
                <div key={u.id} data-testid="account-row" className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                      {u.name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                        {u.name}
                        {u.role === "admin" && <Shield size={12} className="text-blue-500" />}
                      </div>
                      <div className="text-xs text-slate-500">@{u.username}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{ROLE_LABELS[u.role] || u.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Storefront Settings (Admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope" }}>Storefront Settings</h2>
          <p className="text-xs text-slate-500 mb-4">Branding and contact info shown on the public website (hamroauto.com.np)</p>
          {!siteForm ? (
            <div className="flex items-center justify-center h-24"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : (
            <form onSubmit={saveSiteSettings} className="space-y-4">
              {SITE_FIELDS.map(([label, key, type]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={siteForm[key] || ""}
                    onChange={e => setSiteForm({ ...siteForm, [key]: e.target.value })}
                    className={inp}
                    data-testid={`site-${key}`}
                  />
                </div>
              ))}
              <button type="submit" disabled={savingSite} data-testid="save-site-settings-btn" className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-all active:scale-95">
                {savingSite ? "Saving..." : "Save Storefront Settings"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Biometric Login */}
      {bioSupported && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <Fingerprint size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Biometric Login</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Use your fingerprint or face to sign in instead of typing your password.</p>
          {bioEnabled ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-600 font-medium">Enabled on this device</span>
              <button
                onClick={disableBiometric}
                disabled={bioBusy}
                data-testid="disable-biometric-btn"
                className="h-9 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold disabled:opacity-60 transition-all active:scale-95"
              >
                {bioBusy ? "Working..." : "Disable"}
              </button>
            </div>
          ) : (
            <form onSubmit={enableBiometric} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={bioPassword}
                  onChange={e => setBioPassword(e.target.value)}
                  className={inp}
                  data-testid="bio-confirm-password"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={bioBusy}
                data-testid="enable-biometric-btn"
                className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-all active:scale-95"
              >
                {bioBusy ? "Verifying..." : "Enable"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>Change Password</h2>
        <form onSubmit={changePassword} className="space-y-4">
          {[["Current Password","current_password"],["New Password","new_password"],["Confirm New Password","confirm"]].map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
              <input
                type="password"
                value={pwForm[key]}
                onChange={e => setPwForm({...pwForm, [key]: e.target.value})}
                className={inp}
                data-testid={`pw-${key}`}
                placeholder="••••••••"
                minLength={key === "new_password" ? 8 : undefined}
              />
              {key === "new_password" && <p className="text-xs text-slate-400 mt-1">At least 8 characters</p>}
            </div>
          ))}
          <button type="submit" disabled={saving} data-testid="change-pw-btn" className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-all active:scale-95">
            {saving ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* Storage Usage (Admin only) */}
      {isAdmin && storage && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" data-testid="storage-usage-card">
          <h2 className="text-base font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope" }}>Storage Usage</h2>
          <p className="text-xs text-slate-500 mb-4">Space used by uploaded vehicle photos and legal documents. Documents over 2MB are compressed automatically.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Photos</p>
              <p className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{formatBytes(storage.photos.bytes)}</p>
              <p className="text-xs text-slate-400">{storage.photos.count} file{storage.photos.count !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Documents</p>
              <p className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{formatBytes(storage.documents.bytes)}</p>
              <p className="text-xs text-slate-400">{storage.documents.count} file{storage.documents.count !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-blue-600">Total</p>
              <p className="text-lg font-bold text-blue-900" style={{ fontFamily: "Manrope" }}>{formatBytes(storage.total_bytes)}</p>
              <p className="text-xs text-blue-400">{storage.photos.count + storage.documents.count} files</p>
            </div>
          </div>
          {storage.top_vehicles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Heaviest Vehicles</p>
              <div className="space-y-1.5">
                {storage.top_vehicles.map(v => (
                  <div key={v.vehicle_id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <span className="text-slate-700 truncate">{v.label}</span>
                    <span className="font-medium text-slate-900 shrink-0 ml-3">{formatBytes(v.bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* App Info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>System Information</h2>
        <div className="space-y-3 text-sm">
          {[
            ["Business", "Hamro G&G Auto"],
            ["Version", "1.0.0"],
            ["Currency", "NPR (Nepalese Rupee)"],
            ["AI Engine", "Google Gemini"],
            ["Database", "MySQL (Hostinger)"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
              <span className="text-slate-500">{k}</span>
              <span className="font-medium text-slate-900">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Add Account</h2>
              <button onClick={() => setShowAddUserModal(false)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleAddUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Name</label>
                <input value={newUserForm.name} onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })} className={inp} data-testid="new-user-name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Username</label>
                <input value={newUserForm.username} onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })} className={inp} data-testid="new-user-username" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
                <input type="password" value={newUserForm.password} onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })} placeholder="Min 8 characters" className={inp} data-testid="new-user-password" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Role</label>
                <select value={newUserForm.role} onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })} className={inp} data-testid="new-user-role">
                  <option value="stock_supervisor">Front Desk</option>
                  <option value="parts_supervisor">Parts Department</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" disabled={savingUser} data-testid="save-new-user-btn" className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-all active:scale-95">
                {savingUser ? "Creating..." : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
