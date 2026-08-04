import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";

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

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/settings").then(r => setSiteForm(r.data || {})).catch(() => toast.error("Failed to load storefront settings"));
    api.get("/admin/storage-usage").then(r => setStorage(r.data)).catch(() => {});
  }, [isAdmin]);

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

      {/* Storefront Settings (Super admin only) */}
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

      {/* Storage Usage (Super admin only) */}
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
            ["Business", "Hamro G n G Auto"],
            ["Version", "1.0.0"],
            ["Currency", "NPR (Nepalese Rupee)"],
            ["AI Engine", "Google Gemini"],
            ["Database", "MongoDB"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
              <span className="text-slate-500">{k}</span>
              <span className="font-medium text-slate-900">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
