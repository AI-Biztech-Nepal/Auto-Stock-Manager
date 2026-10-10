import { useEffect, useState, useCallback } from "react";
import { Gift, Plus, Trash2, Copy, Ticket, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import api from "../utils/api";

const inp = "w-full h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// Dashain Spin & Win: the storefront's Offers tab. Each vehicle sale gets one gift code
// written on the bill; the customer enters it on the storefront and spins the wheel.
export default function Offers() {
  const [data, setData] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/offers/dashain");
      setData(data);
      setPrizes(data.prizes);
    } catch {
      toast.error("Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setPrize = (i, field, value) => setPrizes(ps => ps.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  const savePrizes = async () => {
    if (prizes.some(p => !p.name.trim())) return toast.error("Every prize needs a name");
    setSaving(true);
    try {
      const { data: saved } = await api.put("/offers/dashain/prizes", {
        prizes: prizes.map(p => ({ id: p.id, name: p.name, weight: Number(p.weight) || 0, stock: Number(p.stock) || 0 })),
      });
      setPrizes(saved);
      toast.success("Prizes saved");
    } catch {
      toast.error("Failed to save prizes");
    } finally {
      setSaving(false);
    }
  };

  const generateCodes = async () => {
    setGenerating(true);
    try {
      await api.post("/offers/dashain/codes", { count: 10 });
      toast.success("10 gift codes added");
      await load();
    } catch {
      toast.error("Failed to generate codes");
    } finally {
      setGenerating(false);
    }
  };

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success(`Copied ${text}`));

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }
  if (!data) return null;

  const codes = data.codes;
  const unused = codes.filter(c => c.status !== "USED").length;
  const totalWeight = prizes.reduce((sum, p) => sum + (Number(p.stock) > 0 ? Number(p.weight) || 0 : 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{unused}</div>
          <div className="text-xs text-slate-500 mt-0.5">Unused codes</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700" style={{ fontFamily: "Manrope" }}>{codes.length - unused}</div>
          <div className="text-xs text-green-600 mt-0.5">Gifts won</div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-700" style={{ fontFamily: "Manrope" }}>{prizes.reduce((s, p) => s + (Number(p.stock) || 0), 0)}</div>
          <div className="text-xs text-amber-600 mt-0.5">Gifts in stock</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 shadow-sm print:border-0">
          <QRCodeSVG value={data.storefront_url} size={72} />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-700">Customer QR</div>
            <a href={data.storefront_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 break-all hover:underline">{data.storefront_url}</a>
            <button onClick={() => window.print()} className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 print:hidden"><Printer size={12} /> Print</button>
          </div>
        </div>
      </div>

      {/* Prizes */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Gift size={17} className="text-amber-600" />Prizes on the wheel</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setPrizes(ps => [...ps, { name: "", weight: 0, stock: 0 }])} className="flex items-center gap-1.5 h-9 px-3 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"><Plus size={14} /> Add prize</button>
            <button onClick={savePrizes} disabled={saving} data-testid="save-prizes-btn" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">{saving ? "Saving..." : "Save prizes"}</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 font-medium">Prize</th>
                <th className="px-4 py-2 font-medium w-28">Weight</th>
                <th className="px-4 py-2 font-medium w-24">Chance</th>
                <th className="px-4 py-2 font-medium w-28">Stock</th>
                <th className="px-4 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {prizes.map((p, i) => {
                const live = Number(p.stock) > 0 && Number(p.weight) > 0;
                return (
                  <tr key={p.id || `new-${i}`} className="border-b border-slate-50">
                    <td className="px-4 py-2"><input value={p.name} onChange={e => setPrize(i, "name", e.target.value)} placeholder="e.g. Helmet" className={inp} /></td>
                    <td className="px-4 py-2"><input type="number" min="0" value={p.weight} onChange={e => setPrize(i, "weight", e.target.value)} className={inp} /></td>
                    <td className="px-4 py-2 text-slate-600">{live && totalWeight ? `${Math.round((Number(p.weight) / totalWeight) * 100)}%` : <span className="text-slate-400">never</span>}</td>
                    <td className="px-4 py-2"><input type="number" min="0" value={p.stock} onChange={e => setPrize(i, "stock", e.target.value)} className={inp} /></td>
                    <td className="px-4 py-2"><button onClick={() => setPrizes(ps => ps.filter((_, j) => j !== i))} className="w-9 h-9 flex items-center justify-center hover:bg-red-50 rounded-lg" title="Remove prize"><Trash2 size={14} className="text-red-400" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-slate-500">Weight is the relative chance of a prize. A prize with no stock stays on the wheel but can't be won. Changes apply after Save.</p>
      </div>

      {/* Gift codes */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Ticket size={17} className="text-blue-600" />Gift codes</h3>
          <button onClick={generateCodes} disabled={generating} data-testid="generate-codes-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 h-9 rounded-lg disabled:opacity-60">
            <Plus size={16} /> {generating ? "Generating..." : "Generate 10 codes"}
          </button>
        </div>
        {codes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Ticket size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No gift codes yet</p>
            <p className="text-sm mt-1">Generate codes, then write one on each vehicle sale's bill</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Prize</th>
                  <th className="px-4 py-2 font-medium">Won at</th>
                </tr>
              </thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c.id} className="border-b border-slate-50" data-testid="offer-code-row">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-900">
                      <button onClick={() => copy(c.code)} className="flex items-center gap-1.5 hover:text-blue-600" title="Copy code">{c.code} <Copy size={12} className="text-slate-400" /></button>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${c.status === "USED" ? "bg-slate-100 text-slate-600" : "bg-green-100 text-green-700"}`}>{c.status === "USED" ? "Used" : "Unused"}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{c.customer_name || "—"}</td>
                    <td className="px-4 py-2 text-slate-700">{c.phone || "—"}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{c.prize || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{c.used_at ? new Date(c.used_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
