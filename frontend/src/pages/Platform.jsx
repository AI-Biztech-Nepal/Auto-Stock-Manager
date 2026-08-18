import { useState, useEffect, useCallback } from "react";
import { Building2, Users, Bike, Shield, Trash2, UserRound, HardDrive } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

export default function Platform() {
  const [companies, setCompanies] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [companyUsers, setCompanyUsers] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchCompanies = useCallback(() => {
    api.get("/platform/companies").then(r => setCompanies(r.data)).catch(() => toast.error("Failed to load companies"));
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleDelete = async () => {
    if (deleteConfirmText !== deleteTarget.name) return;
    setDeleting(true);
    try {
      await api.delete(`/platform/companies/${deleteTarget.id}`);
      toast.success(`${deleteTarget.name} and all its data have been deleted`);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete company");
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpand = async (company) => {
    if (expanded === company.id) { setExpanded(null); return; }
    setExpanded(company.id);
    if (!companyUsers[company.id]) {
      setLoadingUsers(company.id);
      try {
        const r = await api.get(`/platform/companies/${company.id}/users`);
        setCompanyUsers(prev => ({ ...prev, [company.id]: r.data }));
      } catch {
        toast.error("Failed to load accounts");
      } finally {
        setLoadingUsers(null);
      }
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
        <p className="text-sm text-slate-500">Every business that's signed up, and their accounts</p>
      </div>

      {!companies ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : companies.length === 0 ? (
        <div className="text-center text-slate-400 py-12">No companies yet</div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {companies.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div
                onClick={() => toggleExpand(c)}
                data-testid="company-row"
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-400">Since {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1" title="Vehicles"><Bike size={13} /> {c.vehicle_count}</span>
                  <span className="flex items-center gap-1" title="Customers"><UserRound size={13} /> {c.customer_count}</span>
                  <span className="flex items-center gap-1" title="Login accounts"><Users size={13} /> {c.user_count}</span>
                  <span className="flex items-center gap-1" title="Storage used (photos + documents)"><HardDrive size={13} /> {formatBytes(c.storage_bytes)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); setDeleteConfirmText(""); }}
                    data-testid="delete-company-btn"
                    className="w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>

              {expanded === c.id && (
                <div className="border-t border-slate-100 p-4 bg-slate-50">
                  {loadingUsers === c.id ? (
                    <div className="flex items-center justify-center h-12"><div className="animate-spin w-4 h-4 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
                  ) : (
                    <div className="space-y-2">
                      {(companyUsers[c.id] || []).map((u) => (
                        <div key={u.id} data-testid="platform-account-row" className="flex items-center justify-between gap-3 p-2.5 bg-white rounded-lg border border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                              {u.name}
                              {u.role === "admin" && <Shield size={11} className="text-blue-500" />}
                            </div>
                            <div className="text-xs text-slate-400">@{u.username}</div>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{u.role}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Delete {deleteTarget.name}?</h2>
              <p className="text-sm text-slate-500 mt-1">
                This permanently deletes this company and <strong>all</strong> of its data —
                {" "}{deleteTarget.vehicle_count} vehicle(s), {deleteTarget.customer_count} customer(s),
                {" "}{deleteTarget.user_count} account(s), and {formatBytes(deleteTarget.storage_bytes)} of
                photos/documents. This cannot be undone.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Type <strong>{deleteTarget.name}</strong> to confirm
              </label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                data-testid="delete-company-confirm-input"
                autoFocus
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
                  className="flex-1 h-10 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirmText !== deleteTarget.name || deleting}
                  data-testid="delete-company-confirm-btn"
                  className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
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
