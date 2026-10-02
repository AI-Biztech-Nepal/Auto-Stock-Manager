import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Copy, Share2, MessageCircle, Download, Sparkles, Package, RotateCcw, Check, Send } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { useAuth } from "../context/AuthContext";
import { hidesVehiclePricing } from "../utils/permissions";
import { DEFAULT_TEMPLATE, TEMPLATE_KEY, PLACEHOLDERS, renderVehicle, vehicleValues, absoluteUrl } from "../utils/shareCaption";

const MAX_SHARE_PHOTOS = 10;
const STYLES = [
  ["facebook_sales", "Facebook sales post"],
  ["short", "Short & punchy"],
  ["detailed", "Detailed"],
  ["friendly", "Friendly"],
];
const LANGUAGES = [["english", "English"], ["mixed", "Nepali + English"], ["nepali", "नेपाली"]];

const loadTemplate = () => {
  try { return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE; } catch { return DEFAULT_TEMPLATE; }
};

const photoFiles = async (vehicleId) => {
  const { data } = await api.get(`/vehicles/${vehicleId}/photos`);
  const files = await Promise.all(data.slice(0, MAX_SHARE_PHOTOS).map(async (p, i) => {
    try {
      const blob = await (await fetch(absoluteUrl(api, p.url))).blob();
      if (!blob.type.startsWith("image/")) return null;
      // Name by the served type, not the original upload name: uploads are re-encoded on the
      // server, and Android's share sheet rejects every file if one name has a non-image
      // extension (e.g. "IMG_1234.HEIC" or a gallery "blob" with none).
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1];
      return new File([blob], `vehicle-${i + 1}.${ext}`, { type: blob.type });
    } catch { return null; }
  }));
  return files.filter(Boolean);
};

function PostCard({ vehicle, text, onChange, aiBadge, fbPage }) {
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);

  const postToPage = async () => {
    if (!window.confirm(`Post this to ${fbPage.page_name} on Facebook now?`)) return;
    setPosting(true);
    try {
      const { data } = await api.post("/facebook/post", { vehicle_id: vehicle.id, message: text }, { timeout: 180000 });
      toast.success(`Posted to ${data.page_name} with ${data.photos} photo${data.photos === 1 ? "" : "s"}`,
        { action: { label: "View", onClick: () => window.open(data.url, "_blank", "noopener") } });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Posting to Facebook failed");
    } finally { setPosting(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("Caption copied. Paste it into your post"); }
    catch { toast.error("Could not copy. Select the text and copy it manually."); }
  };

  const prepared = useRef(null);

  const share = async () => {
    if (!navigator.share) { await copy(); return; }
    // Facebook drops text that comes in through the share sheet, so put the caption on the
    // clipboard first; the user just pastes it into the post.
    navigator.clipboard?.writeText(text).catch(() => {});
    setBusy(true);
    try {
      const files = prepared.current || await photoFiles(vehicle.id);
      prepared.current = files;
      const data = { text };
      if (files.length && navigator.canShare?.({ files })) data.files = files;
      else toast.info(files.length ? "Photos can't be attached on this device. Sharing the caption only" : "This vehicle has no photos yet. Sharing the caption only");
      await navigator.share(data);
    } catch (e) {
      // Downloading the photos can outlast the tap's permission to open the share sheet;
      // they're cached now, so a second tap opens it instantly.
      if (e?.name === "NotAllowedError") toast.info("Photos ready. Tap Share again");
      else if (e?.name !== "AbortError") toast.error("Share failed. Use Copy caption instead");
    } finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    try {
      const files = await photoFiles(vehicle.id);
      if (!files.length) { toast.info("This vehicle has no photos yet"); return; }
      files.forEach((f, i) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f);
        a.download = `${vehicle.brand}-${vehicle.model}-${i + 1}.${f.type.split("/")[1] || "jpg"}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    } catch { toast.error("Could not download photos"); }
    finally { setBusy(false); }
  };

  const thumbs = vehicle.thumb_photos || [];
  const btn = "flex items-center gap-1.5 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" data-testid="share-post-card">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {thumbs.length ? thumbs.map(t => (
            <img key={t.id} src={absoluteUrl(api, t.url)} alt="" className="w-14 h-14 rounded-lg object-cover" />
          )) : <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center"><Package size={18} className="text-slate-300" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 truncate">{vehicle.brand} {vehicle.model} {vehicle.year}</div>
          <div className="text-xs text-slate-500">{vehicle.photo_count || 0} photo{vehicle.photo_count === 1 ? "" : "s"}</div>
        </div>
        {aiBadge && <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles size={11} /> AI</span>}
      </div>
      <textarea value={text} onChange={e => onChange(e.target.value)} rows={12} className="w-full border border-slate-200 rounded-lg p-3 text-sm" />
      <div className="flex flex-wrap gap-2">
        {fbPage && (
          <button onClick={postToPage} disabled={posting || !text.trim()} data-testid="post-to-page"
            className="flex items-center gap-1.5 bg-[#1877F2] hover:bg-[#166FE5] text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            <Send size={15} /> {posting ? "Posting…" : `Post to ${fbPage.page_name}`}
          </button>
        )}
        <button onClick={copy} className={btn}><Copy size={15} /> Copy</button>
        <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")} className={btn}><MessageCircle size={15} /> WhatsApp</button>
        <button onClick={download} disabled={busy} className={btn}><Download size={15} /> Photos</button>
        <button onClick={share} disabled={busy} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          <Share2 size={15} /> {busy ? "Preparing…" : "Share with photos"}
        </button>
      </div>
    </div>
  );
}

const FB_RESULTS = {
  connected: ["success", "Facebook Page connected"],
  cancelled: ["info", "Facebook connection cancelled"],
  expired: ["error", "That Facebook sign-in took too long. Try connecting again"],
  failed: ["error", "Couldn't connect to Facebook. Try again"],
  nopages: ["error", "That Facebook account doesn't manage any Page it can post to"],
};

// One-click posting to the company's Facebook Page, done by the server, so it works on a
// computer and inside the Android app, where the share sheet can't attach photos.
function FacebookBar({ status, isAdmin, onChanged }) {
  const [params, setParams] = useSearchParams();
  const [pickPages, setPickPages] = useState(null);
  const nonce = params.get("nonce");

  useEffect(() => {
    const fb = params.get("fb");
    if (!fb) return;
    if (fb === "pick" && nonce) {
      api.get(`/facebook/pending/${nonce}`).then(r => setPickPages(r.data))
        .catch(e => toast.error(e.response?.data?.detail || "Couldn't load your Pages"));
      return;
    }
    const [kind, msg] = FB_RESULTS[fb] || [];
    if (kind) toast[kind](msg);
    if (fb === "connected") onChanged();
    setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    try { window.location.href = (await api.get("/facebook/connect")).data.url; }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't start Facebook connection"); }
  };
  const pick = async (pageId) => {
    try {
      await api.post("/facebook/select", { nonce, page_id: pageId });
      toast.success("Facebook Page connected");
      setPickPages(null); setParams({}, { replace: true }); onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't connect that Page"); }
  };
  const disconnect = async () => {
    if (!window.confirm(`Disconnect ${status.page.page_name}? You can connect again any time.`)) return;
    try { await api.delete("/facebook/page"); onChanged(); }
    catch { toast.error("Couldn't disconnect"); }
  };

  if (pickPages) return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-slate-800">Which Page should vehicles be posted to?</p>
      <div className="flex flex-wrap gap-2">
        {pickPages.map(p => <button key={p.id} onClick={() => pick(p.id)} className="border border-slate-200 px-3 py-2 rounded-lg text-sm hover:bg-blue-50">{p.name}</button>)}
      </div>
    </div>
  );
  if (!status?.configured) return null;
  if (status.page) return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Posting to Facebook Page <b>{status.page.page_name}</b></span>
      {isAdmin && <button onClick={disconnect} className="text-xs text-slate-500 hover:text-red-600">Disconnect</button>}
    </div>
  );
  if (!isAdmin) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between">
      <p className="text-sm text-slate-600">Connect your Facebook Page to post photos and caption in one click, from a computer or phone.</p>
      <button onClick={connect} className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-4 py-2 rounded-lg text-sm font-medium">Connect Facebook Page</button>
    </div>
  );
}

export default function Share() {
  const { user } = useAuth();
  const showPrice = !hidesVehiclePricing(user?.role);
  const role = user?.role || "admin";
  const [fbStatus, setFbStatus] = useState(null);
  const loadFb = () => api.get("/facebook/status").then(r => setFbStatus(r.data)).catch(() => {});
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({});
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]); // ordered, so posts appear in the order picked
  const [style, setStyle] = useState("facebook_sales");
  const [language, setLanguage] = useState("english");
  const [extra, setExtra] = useState("");
  const [template, setTemplate] = useState(loadTemplate);
  const [showTemplate, setShowTemplate] = useState(false);
  const [edits, setEdits] = useState({});   // vehicle id -> text the user typed
  const [aiTexts, setAiTexts] = useState({}); // vehicle id -> AI caption
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get("/vehicles", { params: { status: "available" } })
      .then(r => setVehicles(r.data)).catch(() => toast.error("Failed to load vehicles"))
      .finally(() => setLoading(false));
    api.get("/share/profile").then(r => setProfile(r.data || {})).catch(() => {});
    loadFb();
  }, []);

  const shown = useMemo(() => vehicles.filter(v =>
    `${v.brand} ${v.model} ${v.year} ${v.registration_number || ""}`.toLowerCase().includes(q.toLowerCase())), [vehicles, q]);
  const chosen = selected.map(id => vehicles.find(v => v.id === id)).filter(Boolean);

  const textFor = (v) => edits[v.id] ?? aiTexts[v.id] ?? renderVehicle(template, vehicleValues(v, profile, showPrice));

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const saveTemplate = (t) => {
    setTemplate(t);
    setEdits({}); setAiTexts({});
    try { localStorage.setItem(TEMPLATE_KEY, t); } catch { /* storage unavailable: template just won't persist */ }
  };

  const generate = async () => {
    if (!chosen.length) return;
    setGenerating(true);
    try {
      const { data } = await api.post("/share/captions", { vehicle_ids: chosen.map(v => v.id), style, language, extra: extra || null }, { timeout: 90000 });
      setAiTexts(prev => ({ ...prev, ...data.captions }));
      setEdits(prev => { const n = { ...prev }; Object.keys(data.captions).forEach(id => delete n[id]); return n; });
      const missing = chosen.length - Object.keys(data.captions).length;
      toast.success(missing ? `Generated ${Object.keys(data.captions).length} captions. ${missing} kept the template` : "Captions ready");
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI captions failed. The template caption is still there");
    } finally { setGenerating(false); }
  };

  const sel = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white";
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Share</h1>
        <p className="text-sm text-slate-500">Pick vehicles, get a ready-to-post caption for each, then share to Facebook, WhatsApp or anywhere else.</p>
      </div>

      <FacebookBar status={fbStatus} isAdmin={role === "admin"} onChanged={loadFb} />

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        {/* Vehicle picker */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 space-y-3 lg:sticky lg:top-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search brand, model, plate…" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{selected.length} of {vehicles.length} selected</span>
            <span className="space-x-3">
              <button className="text-blue-600" onClick={() => setSelected(Array.from(new Set([...selected, ...shown.map(v => v.id)])))}>Select all</button>
              <button className="text-blue-600" onClick={() => setSelected([])}>Clear</button>
            </span>
          </div>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {loading && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}
            {shown.map(v => {
              const on = selected.includes(v.id);
              return (
                <button key={v.id} onClick={() => toggle(v.id)} data-testid="share-vehicle-row"
                  className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${on ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:bg-slate-50"}`}>
                  <div className="w-14 h-11 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {v.thumb_photos?.[0] ? <img src={absoluteUrl(api, v.thumb_photos[0].url)} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{v.brand} {v.model} {v.year}</div>
                    <div className="text-xs text-slate-500">{showPrice ? (v.selling_price ? formatNPR(v.selling_price) : "No price set") : (v.registration_number || "")}</div>
                  </div>
                  {on && <Check size={16} className="text-blue-600 shrink-0" />}
                </button>
              );
            })}
            {!loading && shown.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No available vehicles</p>}
          </div>
        </div>

        {/* Captions */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <select value={style} onChange={e => setStyle(e.target.value)} className={sel} aria-label="Style">
                {STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={language} onChange={e => setLanguage(e.target.value)} className={sel} aria-label="Language">
                {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={extra} onChange={e => setExtra(e.target.value)} maxLength={500} placeholder="Anything to mention? e.g. exchange available, EMI offer" className={`${sel} flex-1 min-w-[200px]`} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={generate} disabled={!chosen.length || generating} data-testid="generate-captions"
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                <Sparkles size={16} /> {generating ? "Writing…" : `Write ${chosen.length > 1 ? `${chosen.length} captions` : "caption"} with AI`}
              </button>
              <button className="text-xs text-blue-600" onClick={() => setShowTemplate(o => !o)}>{showTemplate ? "Hide template" : "Edit fallback template"}</button>
              {Object.keys(aiTexts).length > 0 && (
                <button className="text-xs text-slate-500 flex items-center gap-1" onClick={() => { setAiTexts({}); setEdits({}); }}><RotateCcw size={12} /> Back to template</button>
              )}
            </div>
            {showTemplate && (
              <div className="space-y-1 p-2 bg-slate-50 rounded-lg border border-slate-200">
                <textarea value={template} onChange={e => saveTemplate(e.target.value)} rows={10} className="w-full border border-slate-200 rounded-lg p-2 text-xs font-mono" />
                <p className="text-[11px] text-slate-500">Used instantly for every selected vehicle (and whenever AI is unavailable). Lines with a missing value are skipped. Available: {PLACEHOLDERS.map(p => `{${p}}`).join(" ")}</p>
                <button className="text-xs text-blue-600" onClick={() => saveTemplate(DEFAULT_TEMPLATE)}>Reset to default</button>
              </div>
            )}
          </div>

          {chosen.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl py-16 text-center text-slate-400 text-sm">Select one or more vehicles to get a caption</div>
          ) : chosen.map(v => (
            <PostCard key={v.id} vehicle={v} text={textFor(v)} aiBadge={!!aiTexts[v.id] && edits[v.id] === undefined}
              fbPage={["admin", "social_media"].includes(role) ? fbStatus?.page : null}
              onChange={t => setEdits(prev => ({ ...prev, [v.id]: t }))} />
          ))}
        </div>
      </div>
    </div>
  );
}
