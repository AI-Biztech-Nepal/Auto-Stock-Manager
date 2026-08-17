import { useState, useEffect, useCallback } from "react";
import { Building2, Users, Bike, Shield } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

export default function Platform() {
  const [companies, setCompanies] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [companyUsers, setCompanyUsers] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(null);

  const fetchCompanies = useCallback(() => {
    api.get("/platform/companies").then(r => setCompanies(r.data)).catch(() => toast.error("Failed to load companies"));
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

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
              <button
                onClick={() => toggleExpand(c)}
                data-testid="company-row"
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors text-left"
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
                  <span className="flex items-center gap-1"><Bike size={13} /> {c.vehicle_count}</span>
                  <span className="flex items-center gap-1"><Users size={13} /> {c.user_count}</span>
                </div>
              </button>

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
    </div>
  );
}
