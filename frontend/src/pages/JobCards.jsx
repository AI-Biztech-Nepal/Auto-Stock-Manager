import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Wrench, X, Package, Pencil, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, getJobStyle } from "../utils/helpers";
import { formatBSDate } from "../utils/nepali-date";
import VehicleComboBox from "../components/VehicleComboBox";
import BSDatePicker from "../components/BSDatePicker";
import HoverADDate from "../components/HoverADDate";
import { useAuth } from "../context/AuthContext";
import { canEditJobs, canDeleteJobs } from "../utils/permissions";

const STATUSES = ["all", "pending", "in_progress", "completed"];
// Sold vehicles carry a 6-month warranty — still pickable for a job card within that window.
// Keep in sync with VEHICLE_WARRANTY_DAYS in backend/server.py.
const WARRANTY_DAYS = 182;
const isWithinWarranty = (soldDate) => {
  if (!soldDate) return false;
  const days = Math.floor((Date.now() - new Date(soldDate).getTime()) / 86400000);
  return days >= 0 && days <= WARRANTY_DAYS;
};
const EMPTY_FORM = {
  vehicle_id: "", is_external: false,
  vehicle_brand: "", vehicle_model: "", vehicle_year: "", registration_number: "",
  customer_name: "", customer_contact: "",
  work_description: "", mechanic_id: "", mechanic_name: "", estimated_cost: "", notes: "", coupon_no: "", job_date: "",
};

const makeKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const EMPTY_EXTERNAL_PART = { name: "", quantity: "1", unit_cost: "" };

function getErrMsg(err) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return `Server error (${err.response.status})`;
}

export default function JobCards() {
  const { user } = useAuth();
  const canEdit = canEditJobs(user?.role);
  const canDelete = canDeleteJobs(user?.role);
  const [jobs, setJobs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [vehicles, setVehicles] = useState([]);
  const [spareParts, setSpareParts] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(null);

  // Parts linked to the new job
  const [jobParts, setJobParts] = useState([]);
  const [partSearch, setPartSearch] = useState("");
  const [externalPart, setExternalPart] = useState({ ...EMPTY_EXTERNAL_PART });
  // Picking a single component out of a Set (Sets have no usable stock of their own to add whole)
  const [pendingSet, setPendingSet] = useState(null);
  const [pendingComponent, setPendingComponent] = useState("");
  const [pendingComponentQty, setPendingComponentQty] = useState("1");

  const fetchJobs = useCallback(async () => {
    try {
      const r = await api.get("/jobs");
      setJobs(r.data);
    } catch { toast.error("Failed to load jobs"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchJobs();
    Promise.all([
      api.get("/vehicles?status=in_repair"),
      api.get("/vehicles?status=sold"),
    ]).then(([repair, sold]) => {
      const underWarranty = sold.data.filter(v => isWithinWarranty(v.sold_date));
      setVehicles([...repair.data, ...underWarranty]);
    }).catch(() => {});
    api.get("/spare-parts").then(r => setSpareParts(r.data)).catch(() => {});
    api.get("/team").then(r => setMechanics(r.data.filter(m => m.role === "mechanic"))).catch(() => {});
  }, [fetchJobs]);

  useEffect(() => {
    let result = [...jobs];
    if (statusFilter !== "all") result = result.filter(j => j.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(j =>
        j.mechanic_name?.toLowerCase().includes(q) ||
        j.job_number?.toLowerCase().includes(q) ||
        j.work_description?.toLowerCase().includes(q) ||
        j.vehicle_brand?.toLowerCase().includes(q) ||
        j.vehicle_model?.toLowerCase().includes(q) ||
        j.registration_number?.toLowerCase().includes(q) ||
        j.customer_name?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [jobs, statusFilter, search]);

  const partsTotalCost = jobParts.reduce((s, p) => s + p.quantity * p.unit_cost, 0);

  const filteredSpareParts = spareParts.filter(p =>
    partSearch.length > 0 &&
    p.name.toLowerCase().includes(partSearch.toLowerCase()) &&
    // Sets stay searchable even after one of their components has been added, since a job
    // can use more than one item out of the same set. Plain parts still drop out once added.
    (p.stock_type === "set" || !jobParts.find(jp => jp.part_id === p.id))
  );

  const addPartToJob = (part) => {
    if (part.quantity <= 0) { toast.error(`${part.name} is out of stock`); return; }
    setJobParts(prev => [...prev, { _key: makeKey(), part_id: part.id, part_name: part.name, quantity: 1, unit_cost: part.unit_cost || 0, available_qty: part.quantity, original_qty: 0, external: false }]);
    setPartSearch("");
  };

  // Sets have no usable stock of their own — picking one from search opens this instead,
  // so the mechanic picks exactly which item inside the set (and how many) to use.
  const openSetPicker = (part) => {
    setPendingSet(part);
    setPendingComponent("");
    setPendingComponentQty("1");
    setPartSearch("");
  };

  const confirmAddSetComponent = () => {
    const comp = (pendingSet.set_components || []).find(c => c.name === pendingComponent);
    if (!comp) { toast.error("Pick which item to use"); return; }
    const qty = Math.max(1, parseInt(pendingComponentQty, 10) || 1);
    if (qty > comp.stock) { toast.error(`Only ${comp.stock} of ${comp.name} in stock`); return; }
    setJobParts(prev => [...prev, {
      _key: makeKey(), part_id: pendingSet.id, component_name: comp.name,
      part_name: `${pendingSet.name} — ${comp.name}`, quantity: qty,
      unit_cost: pendingSet.unit_cost || 0, available_qty: comp.stock, original_qty: 0, external: false,
    }]);
    setPendingSet(null); setPendingComponent(""); setPendingComponentQty("1");
  };

  const addExternalPartToJob = () => {
    const name = externalPart.name.trim();
    const qty = parseInt(externalPart.quantity) || 1;
    const cost = Number(externalPart.unit_cost) || 0;
    if (!name) { toast.error("Enter a part name"); return; }
    setJobParts(prev => [...prev, { _key: makeKey(), part_id: null, part_name: name, quantity: Math.max(1, qty), unit_cost: cost, external: true }]);
    setExternalPart({ ...EMPTY_EXTERNAL_PART });
  };

  const updatePartQty = (key, val) => {
    // Let the field go empty while the user is clearing it to retype a new number —
    // snapping straight back to 1 here would fight every backspace keystroke.
    if (val === "") { setJobParts(prev => prev.map(p => p._key === key ? { ...p, quantity: "" } : p)); return; }
    const num = parseInt(val, 10);
    if (Number.isNaN(num)) return;
    const part = jobParts.find(p => p._key === key);
    if (!part.external && num > part.available_qty) { toast.error(`Only ${part.available_qty} in stock`); return; }
    setJobParts(prev => prev.map(p => p._key === key ? { ...p, quantity: num } : p));
  };

  const normalizePartQty = (key) => {
    setJobParts(prev => prev.map(p => p._key === key && (p.quantity === "" || Number(p.quantity) < 1) ? { ...p, quantity: 1 } : p));
  };

  const removePartFromJob = (key) => setJobParts(prev => prev.filter(p => p._key !== key));

  const nextCouponNo = () => Math.max(0, ...jobs.map(j => Number(j.coupon_no) || 0)) + 1;

  const openModal = () => { setEditingJob(null); setForm({ ...EMPTY_FORM, coupon_no: String(nextCouponNo()) }); setJobParts([]); setPartSearch(""); setExternalPart({ ...EMPTY_EXTERNAL_PART }); setShowModal(true); };

  const openEditModal = (job) => {
    setEditingJob(job);
    setForm({
      vehicle_id: job.vehicle_id || "",
      work_description: job.work_description || "",
      mechanic_id: job.mechanic_id || "",
      mechanic_name: job.mechanic_name || "",
      estimated_cost: job.estimated_cost != null ? String(job.estimated_cost) : "",
      notes: job.notes || "",
      coupon_no: job.coupon_no != null ? String(job.coupon_no) : "",
      job_date: job.job_date || "",
    });
    setJobParts((job.parts || []).map(p => {
      const isExternal = !!p.external || !p.part_id;
      const stock = !isExternal ? spareParts.find(sp => sp.id === p.part_id) : null;
      const component = stock && p.component_name ? (stock.set_components || []).find(c => c.name === p.component_name) : null;
      // Add back what this job already has reserved so re-editing isn't capped below its own current usage.
      const currentStock = p.component_name ? (component?.stock || 0) : (stock?.quantity || 0);
      return {
        _key: makeKey(),
        part_id: p.part_id || null,
        component_name: p.component_name || undefined,
        part_name: p.part_name,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        original_qty: p.quantity,
        available_qty: currentStock + p.quantity,
        external: isExternal,
      };
    }));
    setPartSearch("");
    setExternalPart({ ...EMPTY_EXTERNAL_PART });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingJob(null); };

  const submitJob = async (e) => {
    e.preventDefault();
    if (editingJob) {
      if (!form.work_description || !form.mechanic_name || !form.estimated_cost) { toast.error("Fill all required fields"); return; }
      setSaving(true);
      try {
        await api.put(`/jobs/${editingJob.id}`, {
          work_description: form.work_description,
          mechanic_name: form.mechanic_name,
          estimated_cost: Number(form.estimated_cost),
          notes: form.notes,
          parts: jobParts.map(p => ({ part_id: p.part_id, component_name: p.component_name || null, part_name: p.part_name, quantity: Math.max(1, parseInt(p.quantity, 10) || 1), unit_cost: p.unit_cost, external: !!p.external })),
        });
        toast.success("Job card updated!");
        closeModal();
        fetchJobs();
        api.get("/spare-parts").then(r => setSpareParts(r.data)).catch(() => {});
      } catch (err) { toast.error(getErrMsg(err)); }
      finally { setSaving(false); }
      return;
    }
    const vehicleValid = form.is_external
      ? form.vehicle_brand && form.vehicle_model && form.registration_number
      : form.vehicle_id;
    if (!vehicleValid || !form.work_description || !form.mechanic_name || !form.estimated_cost || !form.coupon_no || !form.job_date) { toast.error("Fill all required fields"); return; }
    setSaving(true);
    try {
      await api.post("/jobs", {
        ...form,
        vehicle_id: form.is_external ? null : form.vehicle_id,
        vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : null,
        estimated_cost: Number(form.estimated_cost),
        coupon_no: Number(form.coupon_no),
        parts: jobParts.map(p => ({ part_id: p.part_id, component_name: p.component_name || null, part_name: p.part_name, quantity: Math.max(1, parseInt(p.quantity, 10) || 1), unit_cost: p.unit_cost, external: !!p.external })),
      });
      toast.success("Job card created!");
      closeModal();
      fetchJobs();
      // Refresh spare parts quantities after deduction
      api.get("/spare-parts").then(r => setSpareParts(r.data)).catch(() => {});
    } catch (err) { toast.error(getErrMsg(err)); }
    finally { setSaving(false); }
  };

  const updateStatus = async (jobId, newStatus, actualCost = null) => {
    setUpdating(jobId);
    try {
      const upd = { status: newStatus };
      if (actualCost !== null) upd.actual_cost = Number(actualCost);
      await api.put(`/jobs/${jobId}`, upd);
      toast.success("Status updated");
      fetchJobs();
    } catch (err) { toast.error(getErrMsg(err)); } finally { setUpdating(null); }
  };

  const deleteJob = async (jobId) => {
    if (!window.confirm("Delete this job card?")) return;
    try { await api.delete(`/jobs/${jobId}`); toast.success("Deleted"); fetchJobs(); } catch (err) { toast.error(getErrMsg(err)); }
  };

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
  const sel = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  const stats = {
    pending: jobs.filter(j => j.status === "pending").length,
    in_progress: jobs.filter(j => j.status === "in_progress").length,
    completed: jobs.filter(j => j.status === "completed").length,
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Cards</h1>
          <p className="text-sm text-slate-500">{filtered.length} records</p>
        </div>
        {canEdit && (
          <button onClick={openModal} data-testid="create-job-button" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all active:scale-95 shadow-sm">
            <Plus size={16} /> New Job Card
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending", count: stats.pending, bg: "bg-yellow-50 border-yellow-100", text: "text-yellow-800" },
          { label: "In Progress", count: stats.in_progress, bg: "bg-blue-50 border-blue-100", text: "text-blue-800" },
          { label: "Completed", count: stats.completed, bg: "bg-green-50 border-green-100", text: "text-green-800" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-xl p-4 text-center`} data-testid={`job-stat-${s.label.toLowerCase().replace(" ", "-")}`}>
            <div className={`text-2xl font-bold ${s.text}`} style={{ fontFamily: "Manrope" }}>{s.count}</div>
            <div className={`text-xs font-medium ${s.text} mt-0.5`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters — sticky so search/filters stay reachable while scrolling a long list */}
      <div className="sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job#, mechanic, vehicle..." className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} data-testid={`job-filter-${s}`} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Job Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">No job cards found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(job => {
            const js = getJobStyle(job.status);
            const overBudget = job.actual_cost && job.actual_cost > job.estimated_cost;
            const partsTotal = job.parts?.reduce((s, p) => s + p.quantity * p.unit_cost, 0) || 0;
            return (
              <div key={job.id} data-testid="job-card" className={`flex flex-col bg-white rounded-xl border ${overBudget ? "border-red-200" : "border-slate-200"} shadow-sm p-5 hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-slate-400">{job.job_number}</span>
                      {!job.vehicle_id && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-orange-100 text-orange-700">External</span>
                      )}
                      {job.is_warranty && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-teal-100 text-teal-700">Warranty</span>
                      )}
                    </div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5" style={{ fontFamily: "Manrope" }}>
                      {job.vehicle_brand} {job.vehicle_model} {job.vehicle_year}
                    </div>
                    {job.registration_number && <div className="text-xs text-slate-500 font-mono">{job.registration_number}</div>}
                    {job.customer_name && <div className="text-xs text-slate-500">{job.customer_name}{job.customer_contact ? ` · ${job.customer_contact}` : ""}</div>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${js.bg} ${js.text}`}>{js.label}</span>
                </div>

                <p className="text-sm text-slate-700 mb-3 line-clamp-2">{job.work_description}</p>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-3">
                  {job.coupon_no != null && <div>Coupon: <span className="font-medium text-slate-700">#{job.coupon_no}</span></div>}
                  {job.job_date && <div>Job Date: <span className="font-medium text-slate-700">{formatBSDate(job.job_date)} BS</span></div>}
                  <div>Mechanic: <span className="font-medium text-slate-700">{job.mechanic_name}</span></div>
                  <div>Est: <span className="font-medium text-slate-700">{formatNPR(job.estimated_cost)}</span></div>
                  {job.actual_cost != null && <div className={overBudget ? "text-red-600 font-medium" : ""}>Actual: <span className="font-medium">{formatNPR(job.actual_cost)}</span></div>}
                  <div>Created: <span className="font-medium text-slate-700"><HoverADDate date={job.created_at?.slice(0, 10)} /></span></div>
                </div>

                {/* Parts used in this job */}
                {job.parts?.length > 0 && (
                  <div className="mb-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
                      <Package size={11} /> Parts Used
                    </div>
                    <div className="max-h-40 overflow-y-auto pr-0.5">
                      {job.parts.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-600 py-0.5">
                          <span>{p.part_name} × {p.quantity}{(p.external || !p.part_id) && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-500">External</span>}</span>
                          <span className="font-medium">{formatNPR(p.quantity * p.unit_cost)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-800 border-t border-slate-200 mt-1 pt-1">
                      <span>Parts Total</span>
                      <span className="text-blue-700">{formatNPR(partsTotal)}</span>
                    </div>
                  </div>
                )}

                {overBudget && <div className="text-xs text-red-600 font-medium mb-3">Over budget by {formatNPR(job.actual_cost - job.estimated_cost)}</div>}

                <div className="mt-auto flex items-center gap-2 flex-wrap pt-1">
                  {canEdit && job.status === "pending" && (
                    <button onClick={() => updateStatus(job.id, "in_progress")} disabled={updating === job.id} className="px-2.5 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-60">
                      Start Work
                    </button>
                  )}
                  {canEdit && job.status === "in_progress" && (
                    <button onClick={() => { const cost = window.prompt("Enter actual cost (NPR):"); if (cost !== null) updateStatus(job.id, "completed", cost || job.estimated_cost); }} disabled={updating === job.id} className="px-2.5 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg hover:bg-green-200 transition-colors disabled:opacity-60">
                      Mark Complete
                    </button>
                  )}
                  {job.status === "completed" && <span className="text-xs text-green-600 font-medium">Completed {job.completed_at?.slice(0, 10)}</span>}
                  <div className="ml-auto flex items-center gap-2">
                    {canEdit && (
                      <button onClick={() => openEditModal(job)} data-testid="edit-job-button" className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors">
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                    {canDelete && <button onClick={() => deleteJob(job.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1">Delete</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Job Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editingJob ? `Edit Job Card ${editingJob.job_number || ""}` : "Create Job Card"}</h2>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={submitJob} className="p-5 space-y-4">
              {editingJob ? (
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 grid grid-cols-2 gap-2">
                  <div>Vehicle: <span className="font-medium text-slate-700">{editingJob.vehicle_brand} {editingJob.vehicle_model}</span></div>
                  <div>Coupon: <span className="font-medium text-slate-700">#{editingJob.coupon_no}</span></div>
                  {editingJob.job_date && <div>Job Date: <span className="font-medium text-slate-700">{formatBSDate(editingJob.job_date)} BS</span></div>}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Vehicle Source</label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, is_external: false })}
                        data-testid="job-source-inventory-btn"
                        className={`h-8 rounded-md transition-colors ${!form.is_external ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        From Inventory
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, is_external: true, vehicle_id: "" })}
                        data-testid="job-source-external-btn"
                        className={`h-8 rounded-md transition-colors ${form.is_external ? "bg-white text-orange-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        External Vehicle
                      </button>
                    </div>
                  </div>

                  {form.is_external ? (
                    <>
                      <p className="text-[11px] text-slate-400 -mt-2">For a repair-only vehicle that isn't part of our stock.</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Brand <span className="text-red-500">*</span></label>
                          <input value={form.vehicle_brand} onChange={e => setForm({...form, vehicle_brand: e.target.value})} placeholder="e.g. Honda" className={inp} data-testid="job-ext-brand-input" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Model <span className="text-red-500">*</span></label>
                          <input value={form.vehicle_model} onChange={e => setForm({...form, vehicle_model: e.target.value})} placeholder="e.g. Dio" className={inp} data-testid="job-ext-model-input" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
                          <input type="text" inputMode="numeric" value={form.vehicle_year} onChange={e => setForm({...form, vehicle_year: e.target.value})} placeholder="e.g. 2021" className={inp} data-testid="job-ext-year-input" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Registration Number <span className="text-red-500">*</span></label>
                          <input value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} placeholder="e.g. BA 12 PA 3456" className={inp} data-testid="job-ext-reg-input" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Customer Name</label>
                          <input value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} placeholder="Owner's name" className={inp} data-testid="job-ext-customer-name-input" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Customer Contact</label>
                          <input value={form.customer_contact} onChange={e => setForm({...form, customer_contact: e.target.value})} placeholder="Phone number" className={inp} data-testid="job-ext-customer-contact-input" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Vehicle <span className="text-red-500">*</span></label>
                      <VehicleComboBox
                        vehicles={vehicles}
                        value={form.vehicle_id}
                        onChange={id => setForm({...form, vehicle_id: id})}
                        placeholder="Search or select a vehicle..."
                        testId="job-vehicle"
                        tagStatus
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Coupon No. <span className="text-red-500">*</span></label>
                      <input type="text" inputMode="numeric" value={form.coupon_no} onChange={e => setForm({...form, coupon_no: e.target.value})} placeholder="0" className={inp} data-testid="job-coupon-no-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Job Date (BS) <span className="text-red-500">*</span></label>
                      <BSDatePicker value={form.job_date} onChange={val => setForm({...form, job_date: val})} required data-testid="job-date-input" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Work Description <span className="text-red-500">*</span></label>
                <textarea value={form.work_description} onChange={e => setForm({...form, work_description: e.target.value})} rows={3} placeholder="Describe work to be done..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mechanic Name <span className="text-red-500">*</span></label>
                <select
                  value={form.mechanic_id}
                  onChange={e => {
                    const m = mechanics.find(x => x.id === e.target.value);
                    setForm({...form, mechanic_id: e.target.value, mechanic_name: m ? m.name : ""});
                  }}
                  className={sel}
                  data-testid="job-mechanic-select"
                >
                  <option value="">Select a mechanic...</option>
                  {mechanics.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Estimated Cost (NPR) <span className="text-red-500">*</span></label>
                <input type="number" value={form.estimated_cost} onChange={e => setForm({...form, estimated_cost: e.target.value})} placeholder="e.g. 3000" className={inp} />
              </div>

              {/* Spare Parts Section */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                  <Wrench size={12} /> Add Spare Parts <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    value={partSearch}
                    onChange={e => setPartSearch(e.target.value)}
                    placeholder="Search parts from inventory..."
                    className={inp}
                    data-testid="part-search-input"
                    autoComplete="off"
                  />
                  {filteredSpareParts.length > 0 && (
                    <div className="absolute left-0 right-0 top-10 z-10 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto" data-testid="parts-dropdown">
                      {filteredSpareParts.map(p => (
                        <button type="button" key={p.id} onClick={() => p.stock_type === "set" ? openSetPicker(p) : addPartToJob(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex justify-between items-center border-b border-slate-50 last:border-0">
                          <div>
                            <span className="font-medium text-slate-800">{p.name}</span>
                            {p.brand_compatibility && <span className="text-slate-400 ml-1.5">({p.brand_compatibility})</span>}
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            {p.stock_type === "set" ? (
                              <div className="font-semibold text-indigo-600">pick item ›</div>
                            ) : (
                              <div className={`font-semibold ${p.quantity <= (p.min_stock_alert || 2) ? "text-red-600" : "text-green-600"}`}>{p.quantity} left</div>
                            )}
                            <div className="text-slate-400">{formatNPR(p.unit_cost)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {pendingSet && (
                  <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2" data-testid="set-component-picker">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-indigo-700">{pendingSet.name} — pick which item to use</p>
                      <button type="button" onClick={() => setPendingSet(null)} className="text-indigo-400 hover:text-indigo-600 shrink-0"><X size={13} /></button>
                    </div>
                    {(pendingSet.set_components || []).length === 0 ? (
                      <p className="text-xs text-indigo-600">This set has no components defined yet — edit it in Spare Parts to add some.</p>
                    ) : (
                      <>
                        <select value={pendingComponent} onChange={e => setPendingComponent(e.target.value)} className={sel} data-testid="set-component-select">
                          <option value="">Select component...</option>
                          {pendingSet.set_components.map(c => (
                            <option key={c.name} value={c.name} disabled={c.stock <= 0}>{c.name} ({c.stock} left)</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 shrink-0">Qty:</span>
                          <input
                            type="text" inputMode="numeric"
                            value={pendingComponentQty}
                            onChange={e => setPendingComponentQty(e.target.value)}
                            className="w-16 h-8 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button type="button" onClick={confirmAddSetComponent} disabled={!pendingComponent} data-testid="confirm-set-component-btn" className="flex-1 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors">
                            Add to Job
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {jobParts.length > 0 && (
                  <div className="mt-2 bg-slate-50 rounded-lg p-2 space-y-1.5" data-testid="job-parts-list">
                    {jobParts.map(p => (
                      <div key={p._key} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-slate-100 text-xs">
                        {p.external ? <ShoppingBag size={11} className="text-orange-400 shrink-0" /> : <Package size={11} className="text-slate-400 shrink-0" />}
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-slate-700 truncate block">{p.part_name}</span>
                          {p.external && <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">Externally bought</span>}
                        </span>
                        <span className="text-slate-400 shrink-0">Qty:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={p.quantity}
                          onChange={e => updatePartQty(p._key, e.target.value)}
                          onBlur={() => normalizePartQty(p._key)}
                          className="w-12 h-6 text-center text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 font-medium w-20 text-right shrink-0">{formatNPR(p.quantity * p.unit_cost)}</span>
                        <button type="button" onClick={() => removePartFromJob(p._key)} className="text-red-400 hover:text-red-600 shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-bold text-slate-800 border-t border-slate-200 pt-1.5 px-1">
                      <span>Parts Total</span>
                      <span className="text-blue-700">{formatNPR(partsTotalCost)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Externally Bought Parts */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                  <ShoppingBag size={12} /> Externally Bought Parts <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <p className="text-[11px] text-slate-400 mb-2 -mt-1">For parts bought specifically for this vehicle that aren't in your spare parts inventory.</p>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      value={externalPart.name}
                      onChange={e => setExternalPart({ ...externalPart, name: e.target.value })}
                      placeholder="Part name"
                      className={inp}
                      data-testid="external-part-name-input"
                    />
                  </div>
                  <div className="w-16 shrink-0">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={externalPart.quantity}
                      onChange={e => setExternalPart({ ...externalPart, quantity: e.target.value })}
                      placeholder="Qty"
                      className={inp}
                      data-testid="external-part-qty-input"
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={externalPart.unit_cost}
                      onChange={e => setExternalPart({ ...externalPart, unit_cost: e.target.value })}
                      placeholder="Cost"
                      className={inp}
                      data-testid="external-part-cost-input"
                    />
                  </div>
                  <button type="button" onClick={addExternalPartToJob} className="h-9 px-3 bg-orange-100 text-orange-700 text-xs font-semibold rounded-lg hover:bg-orange-200 transition-colors shrink-0" data-testid="add-external-part-btn">
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Additional notes" className={inp} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} data-testid="create-job-submit" className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {saving ? (editingJob ? "Saving..." : "Creating...") : (editingJob ? "Save Changes" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
