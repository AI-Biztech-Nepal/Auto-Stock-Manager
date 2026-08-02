import { useEffect, useState } from "react";
import { Megaphone, Copy, Check, Loader2, Globe, Download, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

const PLATFORMS = [
  { id: "facebook", label: "Facebook", icon: "📘", color: "bg-blue-600" },
  { id: "hamrobazar", label: "Hamrobazar", icon: "🛍️", color: "bg-orange-500" },
  { id: "instagram", label: "Instagram", icon: "📸", color: "bg-pink-600" },
  { id: "tiktok", label: "TikTok", icon: "🎵", color: "bg-slate-900" },
];

export default function Marketing() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["facebook", "hamrobazar"]);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [syncData, setSyncData] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [pushed, setPushed] = useState(false);

  useEffect(() => {
    api.get("/vehicles?status=available").then(r => setVehicles(r.data)).catch(console.error);
  }, []);

  const togglePlatform = (pid) => {
    setSelectedPlatforms(prev =>
      prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]
    );
  };

  const exportSync = async () => {
    setSyncing(true);
    try {
      const r = await api.get("/sync/export");
      setSyncData(r.data);
      toast.success(`${r.data.count} vehicles ready to sync`);
    } catch { toast.error("Export failed"); }
    finally { setSyncing(false); }
  };

  const pushSync = async () => {
    setSyncing(true);
    try {
      const r = await api.post("/sync/push");
      setPushed(true);
      toast.success(r.data.message);
      setTimeout(() => setPushed(false), 3000);
    } catch { toast.error("Sync failed"); }
    finally { setSyncing(false); }
  };

  const downloadJSON = () => {
    if (!syncData) return;
    const blob = new Blob([JSON.stringify(syncData.listings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hamroauto_listings.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const generate = async () => {
    if (!selectedVehicle) { toast.error("Please select a vehicle"); return; }
    if (selectedPlatforms.length === 0) { toast.error("Select at least one platform"); return; }
    setLoading(true); setResult(null);
    try {
      const r = await api.post("/marketing/generate", {
        vehicle_id: selectedVehicle,
        platforms: selectedPlatforms,
        additional_info: additionalInfo || null
      });
      setResult(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Generation failed");
    } finally { setLoading(false); }
  };

  const copyAll = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      setCopied(true);
      toast.success("Content copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const vehicle = vehicles.find(v => v.id === selectedVehicle);

  // Parse content into sections
  const parseContent = (content) => {
    if (!content) return [];
    const sections = [];
    const platformOrder = ["FACEBOOK", "HAMROBAZAR", "INSTAGRAM", "TIKTOK"];
    for (const platform of platformOrder) {
      const regex = new RegExp(`(${platform}[:\\s*]*[^\\n]*)([\\s\\S]*?)(?=(?:${platformOrder.join('|')})[:\\s]|$)`, 'i');
      const match = content.match(regex);
      if (match) {
        sections.push({ platform, content: match[0].trim() });
      }
    }
    return sections.length > 0 ? sections : [{ platform: "ALL PLATFORMS", content }];
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-600 flex items-center justify-center">
          <Megaphone size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing Automation</h1>
          <p className="text-sm text-slate-500">AI-generated social media posts in one click</p>
        </div>
      </div>

      {/* Setup Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Generate Marketing Content</h2>

        {/* Vehicle Select */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Select Vehicle <span className="text-red-500">*</span></label>
          <select
            value={selectedVehicle}
            onChange={e => setSelectedVehicle(e.target.value)}
            className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            data-testid="marketing-vehicle-select"
          >
            <option value="">-- Select a vehicle --</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} {v.year} {v.registration_number ? `(${v.registration_number})` : ""} {v.selling_price ? `· ${formatNPR(v.selling_price)}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Vehicle Preview */}
        {vehicle && (
          <div className="mb-4 bg-blue-50 rounded-xl p-4 text-sm">
            <div className="font-bold text-blue-900">{vehicle.brand} {vehicle.model} {vehicle.year}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs text-blue-700">
              <span>{vehicle.engine_cc}cc · {vehicle.fuel_type}</span>
              <span>{vehicle.color || "Color N/A"} · {vehicle.condition}</span>
              <span>{vehicle.kilometer_run ? `${vehicle.kilometer_run.toLocaleString()} km` : "Km N/A"}</span>
            </div>
            {vehicle.selling_price && <div className="mt-2 font-bold text-blue-800">Price: {formatNPR(vehicle.selling_price)}</div>}
          </div>
        )}

        {/* Platform Selection */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-2">Platforms <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                data-testid={`platform-${p.id}`}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${selectedPlatforms.includes(p.id) ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <span className="text-2xl">{p.icon}</span>
                <span className={`text-xs font-semibold ${selectedPlatforms.includes(p.id) ? "text-blue-700" : "text-slate-600"}`}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Additional Info */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Additional Info (optional)</label>
          <textarea
            value={additionalInfo}
            onChange={e => setAdditionalInfo(e.target.value)}
            placeholder="e.g. 'Urgent sale', 'Price negotiable', 'Dashain offer'"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            data-testid="marketing-additional-info"
          />
        </div>

        <button
          onClick={generate}
          disabled={loading || !selectedVehicle || selectedPlatforms.length === 0}
          data-testid="generate-marketing-btn"
          className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-60"
        >
          {loading ? <><Loader2 size={16} className="animate-spin" />Generating...</> : <><Megaphone size={16} />Generate Content</>}
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Loader2 size={32} className="animate-spin mx-auto text-pink-600 mb-3" />
          <p className="font-medium text-slate-700">AI is crafting your marketing posts...</p>
          <p className="text-sm text-slate-500 mt-1">Optimizing for Nepal market</p>
        </div>
      )}

      {result && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid="marketing-result">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Generated Marketing Content</h2>
            <button onClick={copyAll} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${copied ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {copied ? <><Check size={14} />Copied!</> : <><Copy size={14} />Copy All</>}
            </button>
          </div>
          <div className="p-5">
            <div className="bg-slate-50 rounded-xl p-5 text-sm text-slate-800 whitespace-pre-wrap font-mono leading-relaxed max-h-[600px] overflow-y-auto">
              {result.content}
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
              <span>Generated for: {result.platforms?.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}</span>
              <span>·</span>
              <span>Powered by Gemini AI</span>
            </div>
          </div>
        </div>
      )}

      {/* Website Sync */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="website-sync-section">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><Globe size={16} className="text-emerald-700" /></div>
          <div>
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Website Sync · hamroauto.com.np</h2>
            <p className="text-xs text-slate-500">Export your available inventory for listing on hamroauto.com.np</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <button onClick={exportSync} disabled={syncing} data-testid="export-sync-btn"
            className="flex items-center justify-center gap-2 h-10 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-60">
            {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Export Listings
          </button>
          {syncData && (
            <>
              <button onClick={downloadJSON} data-testid="download-json-btn"
                className="flex items-center justify-center gap-2 h-10 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors">
                <Download size={15} /> Download JSON
              </button>
              <button onClick={pushSync} disabled={syncing || pushed} data-testid="push-sync-btn"
                className={`flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold transition-colors ${pushed ? "bg-green-600 text-white" : "bg-slate-900 hover:bg-slate-700 text-white"} disabled:opacity-60`}>
                {pushed ? <><Check size={15} /> Synced!</> : <><ExternalLink size={15} /> Push to hamroauto</>}
              </button>
            </>
          )}
        </div>
        {syncData && (
          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
            <div className="font-semibold text-slate-700 mb-2">{syncData.count} vehicles ready</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {syncData.listings.slice(0, 6).map((v, i) => (
                <div key={v.id || `listing-${i}`} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700">
                  <div className="font-semibold">{v.title}</div>
                  {v.price && <div className="text-green-700 font-medium">{formatNPR(v.price)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-100 rounded-xl p-4">
        <h3 className="text-sm font-bold text-pink-900 mb-2">Marketing Tips for Nepal</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-pink-800">
          <span>• Post during 8-10 AM and 7-9 PM for max reach</span>
          <span>• Hamrobazar listings get 3x more views with photos</span>
          <span>• Mention &quot;Dashain offer&quot; or &quot;Tihar special&quot; during festivals</span>
          <span>• Add WhatsApp number for instant lead generation</span>
        </div>
      </div>
    </div>
  );
}
