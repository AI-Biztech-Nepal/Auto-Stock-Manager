import { useState, useRef, useEffect } from "react";
import { Sparkles, TrendingUp, CalendarDays, MessageCircle, Send, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, BRANDS, FUEL_TYPES, CONDITIONS, OWNERSHIP_OPTIONS } from "../utils/helpers";
import { getCurrentBSDate, BS_MONTHS } from "../utils/nepali-date";

// ── Defined outside component ─────────────────────────────────────────
const TABS = [
  { id: "chatbot",   label: "Sales Chatbot",      icon: MessageCircle },
  { id: "pricing",   label: "AI Pricing Engine",  icon: TrendingUp },
  { id: "festival",  label: "Festival Intel",      icon: CalendarDays },
  { id: "suggest",   label: "Business Advisor",   icon: Sparkles },
];

const SUGGEST_CONTEXTS = [
  { id: "inventory", label: "Inventory Strategy" },
  { id: "finance",   label: "Finance Overview" },
  { id: "festival",  label: "Festival Planning" },
  { id: "customer",  label: "Customer Insights" },
  { id: "vendor",    label: "Vendor Relations" },
];

const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel = `${inp} bg-white`;

function Markdown({ text }) {
  if (!text) return null;
  // Safe renderer — no dangerouslySetInnerHTML
  return (
    <div className="text-sm text-slate-800 leading-relaxed space-y-1">
      {text.split("\n").map((line, i) => {
        const segments = line.split(/\*\*(.*?)\*\*/g);
        const content = segments.map((seg, j) =>
          j % 2 === 1 ? <strong key={j}>{seg}</strong> : seg
        );
        return (
          <p
            key={`md-${i}`}
            className={line.startsWith("-") || line.startsWith("•") ? "ml-2" : ""}
          >
            {content.some(Boolean) ? content : <>&nbsp;</>}
          </p>
        );
      })}
    </div>
  );
}

// ── AI Pricing Tab ────────────────────────────────────────────────────
function PricingTab() {
  const [form, setForm] = useState({ brand: "", model: "", year: new Date().getFullYear(), engine_cc: 125, fuel_type: "Petrol", condition: "Good", ownership_number: 1, kilometer_run: "", purchase_price: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand || !form.model) { toast.error("Select brand and model"); return; }
    setLoading(true); setResult(null);
    try {
      const r = await api.post("/ai/price-suggestion", { vehicle: { ...form, year: Number(form.year), engine_cc: Number(form.engine_cc), kilometer_run: Number(form.kilometer_run) || null, purchase_price: Number(form.purchase_price) || null } });
      setResult(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "AI error"); }
    finally { setLoading(false); }
  };

  const copy = () => { if (result?.suggestion) { navigator.clipboard.writeText(result.suggestion); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        Enter vehicle details to get an AI-powered selling price recommendation based on Nepal market data and your sales history.
      </div>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Brand <span className="text-red-500">*</span></label>
            <select value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} className={sel}><option value="">Select</option>{BRANDS.map(b => <option key={b}>{b}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Model <span className="text-red-500">*</span></label>
            <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="e.g. CB Shine, FZ-S" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
            <input type="text" inputMode="numeric" value={form.year} onChange={e => setForm({...form, year: e.target.value})} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Engine CC</label>
            <input type="text" inputMode="numeric" value={form.engine_cc} onChange={e => setForm({...form, engine_cc: e.target.value})} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
            <select value={form.condition} onChange={e => setForm({...form, condition: e.target.value})} className={sel}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ownership</label>
            <select value={form.ownership_number} onChange={e => setForm({...form, ownership_number: Number(e.target.value)})} className={sel}>
              {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kilometer Run</label>
            <input type="text" inputMode="numeric" value={form.kilometer_run} onChange={e => setForm({...form, kilometer_run: e.target.value})} placeholder="e.g. 15000" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Your Purchase Price (NPR)</label>
            <input type="text" inputMode="numeric" value={form.purchase_price} onChange={e => setForm({...form, purchase_price: e.target.value})} placeholder="e.g. 150000" className={inp} />
          </div>
        </div>
        <button type="submit" disabled={loading} data-testid="ai-price-btn"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-60">
          {loading ? <><Loader2 size={15} className="animate-spin" />Analyzing market...</> : <><Sparkles size={15} />Get Price Suggestion</>}
        </button>
      </form>

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid="pricing-result">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900">AI Price Recommendation</h3>
              {result.sold_history_count > 0 && <p className="text-xs text-slate-500 mt-0.5">Based on {result.sold_history_count} similar sold vehicles in your history</p>}
            </div>
            <button onClick={copy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${copied ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}`}>
              {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
            </button>
          </div>
          <div className="p-5"><Markdown text={result.suggestion} /></div>
        </div>
      )}
    </div>
  );
}

// ── Festival Intelligence Tab ─────────────────────────────────────────
function FestivalTab() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const bs = getCurrentBSDate();

  const fetch = async () => {
    setLoading(true); setResult(null);
    try {
      const r = await api.get("/ai/festival-intelligence");
      setResult(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "AI error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays size={16} className="text-amber-600" />
          <span className="font-semibold text-amber-900 text-sm">Nepal Festival Intelligence</span>
        </div>
        <p className="text-xs text-amber-800">
          Today: {bs ? `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year} BS` : "—"} ·
          AI analyzes upcoming Nepali festivals and gives you stock & pricing strategy.
        </p>
      </div>

      <button onClick={fetch} disabled={loading} data-testid="festival-intel-btn"
        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-60">
        {loading ? <><Loader2 size={15} className="animate-spin" />Analyzing festivals...</> : <><CalendarDays size={15} />Get Festival Intelligence</>}
      </button>

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid="festival-result">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">Festival Business Intelligence</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.stock_snapshot || {}).map(([brand, cnt]) => (
                <span key={brand} className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{brand}: {cnt}</span>
              ))}
            </div>
          </div>
          <div className="p-5"><Markdown text={result.intelligence} /></div>
        </div>
      )}
    </div>
  );
}

// ── Business Advisor Tab ──────────────────────────────────────────────
function AdvisorTab() {
  const [context, setContext] = useState("inventory");
  const [note, setNote] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true); setResult(null);
    try {
      const r = await api.post("/ai/suggestions", { context_type: context, additional_context: note || null });
      setResult(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "AI error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Select Context</label>
          <div className="flex flex-wrap gap-2">
            {SUGGEST_CONTEXTS.map(c => (
              <button key={c.id} onClick={() => setContext(c.id)} data-testid={`context-${c.id}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${context === c.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Additional Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Dashain is coming, focus on 125cc..." className={inp} />
        </div>
        <button onClick={fetch} disabled={loading} data-testid="get-suggestions-btn"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-60">
          {loading ? <><Loader2 size={15} className="animate-spin" />Thinking...</> : <><Sparkles size={15} />Get Recommendations</>}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid="suggestions-result">
          <div className="p-4 border-b border-slate-100"><h3 className="font-bold text-slate-900">AI Recommendations · {context}</h3></div>
          <div className="p-5"><Markdown text={result.suggestions} /></div>
        </div>
      )}
    </div>
  );
}

// ── Sales Chatbot Tab ─────────────────────────────────────────────────
function ChatbotTab() {
  const [messages, setMessages] = useState([
    { id: "init", role: "assistant", text: "Hi! I'm your AI sales assistant. Ask me about available vehicles, prices, or anything related to our stock!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`chat-${Date.now()}`);
  const bottomRef = useRef(null);
  const msgCounter = useRef(1);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const userMsgId = `msg-${msgCounter.current++}`;
    const botMsgId  = `msg-${msgCounter.current++}`;
    setInput("");
    setMessages(prev => [...prev, { id: userMsgId, role: "user", text: msg }]);
    setLoading(true);
    setMessages(prev => [...prev, { id: botMsgId, role: "assistant", text: "", typing: true }]);

    try {
      const r = await api.post("/ai/chatbot", { message: msg, session_id: sessionId.current });
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: r.data.reply, typing: false } : m));
      sessionId.current = r.data.session_id || sessionId.current;
    } catch (err) {
      console.error("Chatbot error:", err);
      const detail = err.response?.data?.detail || "Sorry, I couldn't connect. Please try again.";
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: detail, typing: false } : m));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-testid="chatbot-panel">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><MessageCircle size={16} className="text-white" /></div>
        <div>
          <div className="font-semibold text-white text-sm">G&G Sales Assistant</div>
          <div className="text-xs text-blue-100">AI-powered · Knows your current stock</div>
        </div>
        <button onClick={() => {
          setMessages([{ id: "init", role: "assistant", text: "Hi! I'm your AI sales assistant. Ask me about available vehicles, prices, or anything related to our stock!" }]);
          sessionId.current = `chat-${Date.now()}`;
          msgCounter.current = 1;
        }}
          className="ml-auto p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="New chat">
          <RefreshCw size={14} className="text-white" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-slate-100 text-slate-900 rounded-bl-sm"
            }`}>
              {msg.text || (msg.typing && <span className="flex gap-1 items-center py-1"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:"0ms"}} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:"150ms"}} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:"300ms"}} /></span>)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-100">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about available bikes, prices..."
            rows={1}
            data-testid="chatbot-input"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            data-testid="chatbot-send-btn"
            className="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

// ── Main AI Assistant Page ────────────────────────────────────────────
export default function AIAssistant() {
  const [activeTab, setActiveTab] = useState("chatbot");

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Assistant</h1>
          <p className="text-sm text-slate-500">Pricing Engine · Festival Intel · Sales Chatbot · Business Advisor</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            data-testid={`ai-tab-${t.id}`}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "chatbot"  && <ChatbotTab />}
      {activeTab === "pricing"  && <PricingTab />}
      {activeTab === "festival" && <FestivalTab />}
      {activeTab === "suggest"  && <AdvisorTab />}
    </div>
  );
}
