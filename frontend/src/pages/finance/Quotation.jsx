import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileDown, Bike, ImagePlus, X, Printer } from "lucide-react";
import { toast } from "sonner";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { Card, Field, DateField, Modal, Empty, TwoTapDelete, inputCls, btnPrimary, btnGhost } from "./ui";
import { todayStr, num } from "./money";
import { adToBsDate, formatBSDate } from "../../utils/nepali-date";

// Quotation, as Jageer Nepal's: a letterhead quote for a client - items with MRP, discount, rate and quantity,
// terms, and who it is from - generated as a printable page (the browser's print dialog has "Save as PDF") and
// kept as a numbered copy. Not a bill: it touches no ledger. Items can be picked from Inventory.

const DEFAULT_TERMS = `Above price are Inclusive of VAT amount.
Order shall be confirmed only after the client company Purchase Order is received.
We will provide two-year parts replacement warranty from the date of purchase.
Warranty will be worthless, if one of the following is occurred:
Damage resulting from relocation, power fluctuation, and natural disasters.
Operating not with manufacturer specification or abuse or misuse.
Customer making himself any repair or modification.
50% in advance and remaining amount shall be paid within 15 days after the bill is received by the client after the completion of work.`;

// A business's initials from its own name ("Hamro G&G Auto" -> "HGA"), the last part of a quote number.
const initials = (name) => name.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")[0]).filter(Boolean).join("").toUpperCase();
// The Nepali fiscal year a BS date falls in, from Shrawan: "082/83".
const fiscalYear = (adDate) => {
  const bs = adToBsDate(adDate);
  if (!bs) return "";
  const start = bs.month >= 4 ? bs.year : bs.year - 1;
  return `${String(start).slice(-3)}/${String(start + 1).slice(-2)}`;
};
const amt = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
// Rate is the discounted unit price already; without one, the unit price is MRP less the per-unit discount.
const unitPrice = (r) => ((amt(r.rate) || 0) > 0 ? amt(r.rate) : Math.max(0, (amt(r.mrp) || 0) - (amt(r.discount) || 0)));
const lineAmount = (r) => unitPrice(r) * (Number(r.qty) || 0);
const filled = (r) => !!r.subject.trim();
let seq = 0;
const emptyRow = () => ({ key: ++seq, photo: null, subject: "", description: "", mrp: "", discount: "", rate: "", qty: "1" });
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (url) => (!url ? null : /^(https?:|data:)/.test(url) ? url : `${window.location.origin}${url}`);

function quotationHtml({ biz, quoteNo, date, subject, clientName, clientAddress, items, total, terms, salesName, salesPhone }) {
  const cell = "border:1px solid #999;padding:6px;";
  const n = (v) => (amt(v) != null ? amt(v).toLocaleString("en-IN") : "");
  const rows = items.map((r) => `<tr>
    <td style="${cell}text-align:center;">${r.photo ? `<img src="${esc(abs(r.photo))}" style="width:70px;height:70px;object-fit:cover;" />` : ""}</td>
    <td style="${cell}">${esc(r.subject)}</td>
    <td style="${cell}font-size:11px;">${esc(r.description).replace(/\n/g, "<br/>")}</td>
    <td style="${cell}text-align:right;">${n(r.mrp)}</td>
    <td style="${cell}text-align:right;">${n(r.discount)}</td>
    <td style="${cell}text-align:right;">${n(r.rate)}</td>
    <td style="${cell}text-align:center;">${esc(r.qty)}</td>
    <td style="${cell}text-align:right;">${lineAmount(r).toLocaleString("en-IN")}</td>
  </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Quotation ${esc(quoteNo)}</title><style>
    body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { border: 1px solid #999; padding: 6px; background: #f2f2f2; font-size: 12px; }
  </style></head><body>
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #2563EB;padding-bottom:12px;">
      <div>${biz.logo ? `<img src="${esc(abs(biz.logo))}" style="height:60px;" />` : `<div style="font-size:22px;font-weight:bold;color:#2563EB;">${esc(biz.name)}</div>`}</div>
      <div style="text-align:right;font-size:12px;">
        ${biz.reg ? `REG. NO: ${esc(biz.reg)}<br/>` : ""}${biz.vat ? `VAT NO: ${esc(biz.vat)}<br/>` : ""}
        <b>${esc(biz.name)}</b><br/>${biz.address ? `${esc(biz.address)}<br/>` : ""}${biz.phone ? `Contact No.: ${esc(biz.phone)}` : ""}
      </div>
    </div>
    <div style="margin-top:14px;font-size:13px;"><b>Quote no. ${esc(quoteNo)}</b>&nbsp;&nbsp;&nbsp;&nbsp;Date: ${esc(formatBSDate(date))}</div>
    ${subject ? `<div style="margin-top:4px;font-size:13px;font-weight:bold;">Quotation for ${esc(subject)}</div>` : ""}
    <table>
      <tr><td style="${cell}"><b>CLIENT:</b> ${esc(clientName)}</td><td colspan="7" style="${cell}"><b>Address:</b> ${esc(clientAddress)}</td></tr>
      <tr><th>Item</th><th>Subject</th><th>Description</th><th>MRP<br/>(NRs.)</th><th>Discount<br/>(NRs.)</th><th>Rate<br/>(NRs.)</th><th>Qty</th><th>Amount<br/>(NRs.)</th></tr>
      ${rows}
      <tr><td colspan="7" style="${cell}text-align:right;"><b>TOTAL (NRs.)</b></td><td style="${cell}text-align:right;"><b>${total.toLocaleString("en-IN")}</b></td></tr>
    </table>
    <div style="margin-top:18px;font-size:12px;"><b>Terms &amp; Conditions:</b><br/>${(terms || "").split("\n").map(esc).join("<br/>")}</div>
    <div style="margin-top:24px;font-size:13px;">With Thanks &amp; Regards,<br/>On Behalf of ${esc(biz.name)},<br/><br/>Marketing Manager<br/><b>${esc(salesName)}</b><br/>${esc(salesPhone)}</div>
    <script>window.onload = function () { window.focus(); window.print(); };</script>
  </body></html>`;
}

// Opened before any await, so a pop-up blocker treats it as part of the button press.
function openPrint(html) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("Your browser blocked the quotation window. Allow pop-ups for this site and try again."); return false; }
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}

// Pick a vehicle from Inventory to quote: its name, details, selling price and first photo.
function VehiclePicker({ onPick, onClose }) {
  const [vehicles, setVehicles] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get("/vehicles").then((r) => setVehicles(r.data || [])).catch(() => setVehicles([]));
  }, []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (vehicles || []).filter((v) => v.status !== "sold").filter((v) => !s || [v.brand, v.model, v.variant, v.registration_number, v.year].join(" ").toLowerCase().includes(s)).slice(0, 60);
  }, [vehicles, q]);
  return (
    <Modal title="Pick from Inventory" onClose={onClose} wide>
      <div className="space-y-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, model or registration" className={inputCls} autoFocus />
        {vehicles === null ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : shown.length === 0 ? <Empty>No vehicles match.</Empty> : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-[55vh] overflow-y-auto">
            {shown.map((v) => (
              <button key={v.id} type="button" onClick={() => onPick(v)} className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                {v.thumb_photos?.[0] ? <img src={v.thumb_photos[0].thumb || v.thumb_photos[0].url} alt="" className="w-12 h-12 rounded object-cover shrink-0" /> : <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center shrink-0"><Bike size={18} className="text-slate-400" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{[v.brand, v.model, v.variant].filter(Boolean).join(" ")} {v.year || ""}</div>
                  <div className="text-xs text-slate-400 truncate">{[v.registration_number, v.color, v.kilometer_run ? `${num(v.kilometer_run)} km` : null].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="text-sm font-semibold text-slate-700 shrink-0">{v.selling_price ? `NPR ${num(v.selling_price)}` : "—"}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Quotation() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({});
  const [quotes, setQuotes] = useState(null);
  const [biz, setBiz] = useState({ name: "", reg: "", vat: "", address: "", phone: "", logo: "" });
  const [editingBiz, setEditingBiz] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [quoteNo, setQuoteNo] = useState("");
  const [touchedNo, setTouchedNo] = useState(false);
  const [subject, setSubject] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [salesName, setSalesName] = useState(user?.name || "");
  const [salesPhone, setSalesPhone] = useState("");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [items, setItems] = useState([emptyRow()]);
  const [picking, setPicking] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/fin/quotations").then((r) => setQuotes(r.data || [])).catch(() => setQuotes([]));
  useEffect(() => {
    load();
    api.get("/settings").then((r) => setSettings(r.data || {})).catch(() => {});
  }, []);
  // The letterhead: the business settings, with the registration and VAT numbers of the last quote made.
  useEffect(() => {
    const last = (quotes || [])[0]?.business || {};
    setBiz((b) => ({
      name: b.name || settings.business_name || user?.company_name || "",
      reg: b.reg || last.reg || "", vat: b.vat || last.vat || "",
      address: b.address || settings.address || "", phone: b.phone || settings.contact_phone || "",
      logo: b.logo || settings.logo_url || "",
    }));
  }, [settings, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextSeq = useMemo(() => (quotes || []).reduce((m, q) => Math.max(m, Number(q.quote_seq) || 0), 0) + 1, [quotes]);
  const suggested = biz.name ? `${nextSeq}/${fiscalYear(date)}/${initials(biz.name)}` : String(nextSeq);
  useEffect(() => { if (!touchedNo) setQuoteNo(suggested); }, [suggested, touchedNo]);

  const setRow = (key, patch) => setItems((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = items.filter(filled).reduce((s, r) => s + lineAmount(r), 0);

  const pickVehicle = (v) => {
    setRow(picking, {
      subject: [v.brand, v.model, v.variant].filter(Boolean).join(" ") + (v.year ? ` ${v.year}` : ""),
      description: [v.registration_number && `Reg. ${v.registration_number}`, v.color, v.engine_cc && `${v.engine_cc} cc`, v.kilometer_run && `${num(v.kilometer_run)} km`, v.fuel_type].filter(Boolean).join(", "),
      mrp: v.selling_price ? String(v.selling_price) : "",
      photo: v.thumb_photos?.[0]?.url || null,
    });
    setPicking(null);
  };
  const attachPhoto = (key, file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error("Pick a photo under 3 MB");
    const reader = new FileReader();
    reader.onload = () => setRow(key, { photo: reader.result });
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setDate(todayStr()); setTouchedNo(false); setSubject(""); setClientName(""); setClientAddress("");
    setTerms(DEFAULT_TERMS); setItems([emptyRow()]);
  };

  const generate = async () => {
    if (!biz.name.trim()) { setEditingBiz(true); return toast.error("Add your business name for the letterhead"); }
    if (!clientName.trim()) return toast.error("Enter the client's name for this quotation");
    const lines = items.filter(filled);
    if (!lines.length) return toast.error("Add at least one line item to quote");
    const html = quotationHtml({ biz, quoteNo, date, subject, clientName, clientAddress, items: lines, total, terms, salesName, salesPhone });
    if (!openPrint(html)) return;
    setBusy(true);
    try {
      // The saved copy keeps the quote, not the photos (they stay on the printed page).
      await api.post("/fin/quotations", {
        quote_no: quoteNo, quote_date: date, subject, client_name: clientName, client_address: clientAddress,
        salesperson_name: salesName, salesperson_phone: salesPhone, terms,
        items: lines.map((r) => ({ subject: r.subject, description: r.description, mrp: amt(r.mrp), discount: amt(r.discount), rate: amt(r.rate), qty: Number(r.qty) || 0 })),
        business: { name: biz.name, reg: biz.reg, vat: biz.vat, address: biz.address, phone: biz.phone },
      });
      toast.success(`Quotation ${quoteNo} generated and saved`);
      reset();
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "The quotation printed, but its copy could not be saved");
    } finally {
      setBusy(false);
    }
  };

  const reprint = (q) => openPrint(quotationHtml({
    biz: { ...biz, ...(q.business || {}), logo: biz.logo }, quoteNo: q.quote_no, date: q.quote_date, subject: q.subject,
    clientName: q.client_name, clientAddress: q.client_address,
    items: (q.items || []).map((i) => ({ ...i, photo: null, qty: String(i.qty) })), total: q.total, terms: q.terms,
    salesName: q.salesperson_name, salesPhone: q.salesperson_phone,
  }));
  const remove = async (q) => {
    try { await api.delete(`/fin/quotations/${q.id}`); toast.success("Quotation deleted"); load(); } catch { toast.error("Could not delete"); }
  };

  const section = (title, children) => (
    <Card className="p-5 space-y-3"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>{children}</Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Generate Quotation</h2>
        <p className="text-sm text-slate-500">A letterhead quote for a client. It prints (choose “Save as PDF” to keep a file) and a numbered copy is kept below. It does not touch any ledger.</p>
      </div>

      {section("Your business (letterhead)", editingBiz || !biz.name ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Business name *"><input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Contact no."><input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} className={inputCls} /></Field>
          <Field label="Reg. no."><input value={biz.reg} onChange={(e) => setBiz({ ...biz, reg: e.target.value })} className={inputCls} /></Field>
          <Field label="VAT no."><input value={biz.vat} onChange={(e) => setBiz({ ...biz, vat: e.target.value })} className={inputCls} /></Field>
          <Field label="Address" className="sm:col-span-2"><input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} className={inputCls} /></Field>
          <p className="text-xs text-slate-400 sm:col-span-2">Name, address, phone and logo come from Settings; the registration and VAT numbers are remembered from your last quote.</p>
          {biz.name && <div className="sm:col-span-2"><button onClick={() => setEditingBiz(false)} className={btnGhost}>Done</button></div>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {biz.logo && <img src={biz.logo} alt="" className="h-10 w-auto rounded" />}
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{biz.name}</div>
              <div className="text-xs text-slate-500 truncate">{[biz.reg && `Reg. ${biz.reg}`, biz.vat && `VAT ${biz.vat}`, biz.address, biz.phone].filter(Boolean).join(" · ") || "No details yet"}</div>
            </div>
          </div>
          <button onClick={() => setEditingBiz(true)} className={btnGhost}>Edit</button>
        </div>
      ))}

      <div className="grid lg:grid-cols-2 gap-4">
        {section("Client", (
          <>
            <Field label="Client / company name *"><input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} /></Field>
            <Field label="Client address"><input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className={inputCls} /></Field>
          </>
        ))}
        {section("Quote details", (
          <div className="grid sm:grid-cols-2 gap-3">
            <DateField value={date} onChange={(d) => d && setDate(d)} />
            <Field label="Quote no."><input value={quoteNo} onChange={(e) => { setQuoteNo(e.target.value); setTouchedNo(true); }} className={inputCls} /></Field>
            <Field label="Subject" className="sm:col-span-2"><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Honda Shine 2022 for office use" className={inputCls} /></Field>
            <Field label="Salesperson"><input value={salesName} onChange={(e) => setSalesName(e.target.value)} className={inputCls} /></Field>
            <Field label="Salesperson phone"><input value={salesPhone} onChange={(e) => setSalesPhone(e.target.value)} className={inputCls} /></Field>
          </div>
        ))}
      </div>

      {section("Items", (
        <>
          <div className="space-y-3">
            {items.map((r) => (
              <div key={r.key} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex gap-3">
                  <div className="shrink-0">
                    {r.photo ? (
                      <div className="relative">
                        <img src={r.photo} alt="" className="w-16 h-16 rounded object-cover" />
                        <button type="button" onClick={() => setRow(r.key, { photo: null })} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-300 flex items-center justify-center" aria-label="Remove photo"><X size={11} /></button>
                      </div>
                    ) : (
                      <label className="w-16 h-16 rounded border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-600 cursor-pointer" title="Add a photo">
                        <ImagePlus size={18} />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => attachPhoto(r.key, e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input value={r.subject} onChange={(e) => setRow(r.key, { subject: e.target.value })} placeholder="Subject (short name)" className={inputCls} />
                    <textarea value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} placeholder="Description / specs" rows={2} className={`${inputCls} h-auto py-2`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_5rem_1fr_auto_auto] gap-2 items-center">
                  <input value={r.mrp} onChange={(e) => setRow(r.key, { mrp: e.target.value })} placeholder="MRP" inputMode="decimal" className={inputCls} />
                  <input value={r.discount} onChange={(e) => setRow(r.key, { discount: e.target.value })} placeholder="Disc./unit" inputMode="decimal" className={inputCls} />
                  <input value={r.rate} onChange={(e) => setRow(r.key, { rate: e.target.value })} placeholder="Rate" inputMode="decimal" className={inputCls} />
                  <input value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Qty" inputMode="numeric" className={inputCls} />
                  <div className="text-right text-sm font-semibold text-slate-800 px-1">NPR {num(lineAmount(r))}</div>
                  <button type="button" onClick={() => setPicking(r.key)} className={`${btnGhost} !px-3`} title="Pick from Inventory"><Bike size={15} /><span className="sm:hidden lg:inline">Inventory</span></button>
                  <button type="button" onClick={() => setItems((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))} disabled={items.length === 1}
                    className="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center" aria-label="Remove item"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setItems((rs) => [...rs, emptyRow()])} className={btnGhost}><Plus size={16} /> Add item</button>
            <span className="text-sm text-slate-600">Total <b className="text-slate-900">NPR {num(total)}</b></span>
          </div>
          <p className="text-xs text-slate-400">Rate is the price after discount. Leave it empty and the amount is MRP less the discount per unit.</p>
        </>
      ))}

      {section("Terms & Conditions", (
        <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={8} className={`${inputCls} h-auto py-2`} />
      ))}

      <div className="flex justify-end">
        <button onClick={generate} disabled={busy} className={`${btnPrimary} !h-11 !px-6`}><FileDown size={17} /> {busy ? "Generating…" : "Generate PDF"}</button>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Quotations made</div>
        {quotes === null ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : quotes.length === 0 ? <Empty>No quotations yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Quote no.</th><th className="px-3 py-2.5 hidden sm:table-cell">Date</th><th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5 hidden md:table-cell">Subject</th><th className="px-3 py-2.5 text-right">Total</th><th className="px-3 py-2.5" />
              </tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{q.quote_no}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-slate-600 whitespace-nowrap">{q.quote_date ? formatBSDate(q.quote_date) : "—"}</td>
                    <td className="px-3 py-2.5">{q.client_name}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-slate-500">{q.subject || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{num(q.total)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => reprint(q)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50" title="Print again"><Printer size={15} /></button>
                        <TwoTapDelete label="Delete" onConfirm={() => remove(q)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {picking !== null && <VehiclePicker onPick={pickVehicle} onClose={() => setPicking(null)} />}
    </div>
  );
}
