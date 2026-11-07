import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import { Card, Field, Modal, DateField, Empty, Notice, PartyPicker, Stat, TwoTapDelete, ExportBar, exportXlsx, inputCls, btnPrimary, btnGhost } from "./ui";
import { todayStr, npr, num, COLORS } from "./money";
import { round2, rentalFigures, rentalStatus, receivedFor, vehicleNames } from "./rentLogic";
import { formatBSDate } from "../../utils/nepali-date";

const Pill = ({ s }) => <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap" style={{ color: s.color, background: s.bg }}>{s.label}</span>;

// An AD date with its Bikram Sambat equivalent underneath.
const DateCell = ({ date }) => (date
  ? <><div className="whitespace-nowrap">{date}</div><div className="text-xs text-slate-400 whitespace-nowrap">{formatBSDate(date)} BS</div></>
  : <span className="text-slate-300">—</span>);

// Money cell: a figure in a colour, or a faint dash when there is none.
const Fig = ({ v, color, bold }) => (v ? <span className={bold ? "font-bold" : "font-medium"} style={{ color }}>{num(v)}</span> : <span className="text-slate-300">—</span>);

function NotReady() {
  return (
    <Card className="p-6 space-y-3 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">Rent is not set up yet</h2>
      <p className="text-sm text-slate-600">The server creates its table when it starts, so restart the backend once. If that does not do it, the database user may not be allowed to create tables:</p>
      <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
        <li>Open <code className="bg-slate-100 px-1 rounded">backend/migration_add_finance_rent.sql</code> from the project.</li>
        <li>Run it once on the database. It only adds two new tables and two columns on <code className="bg-slate-100 px-1 rounded">fin_transactions</code>.</li>
        <li>Reload this page.</li>
      </ol>
    </Card>
  );
}

// ════════════════════════════ RENT ════════════════════════════════════════
// Rent: the vehicles given out on rent: who has each, from when, at what rate, and what it comes to. Kept apart
// from Sale and Purchase bills: a vehicle on rent comes back, so it is not a sale. The renter owes the daily
// rate for every day it is out (written onto their ledger by the server) and pays it as Received entries with
// the vehicle picked in Item.
function RentalForm({ rental, onClose }) {
  const { books, post, put, del } = useBooks();
  const today = todayStr();
  const [item, setItem] = useState(rental?.car || "");
  const [model, setModel] = useState(rental?.model || "");
  const [renter, setRenter] = useState({ id: rental?.customer_id || null, name: rental?.customer_name || "" });
  const [rate, setRate] = useState(rental ? String(rental.rate_per_day) : "");
  const [start, setStart] = useState(rental?.start_date || today);
  const [returnedOn, setReturnedOn] = useState(rental?.returned_on || "");
  const [note, setNote] = useState(rental?.note || "");
  const [busy, setBusy] = useState(false);
  const vehicles = useMemo(() => vehicleNames(books), [books]);

  const figures = rentalFigures({ start_date: start, end_date: rental?.end_date || null, returned_on: returnedOn || null, rate_per_day: Number(rate) || 0 }, today);
  const status = rentalStatus({ end_date: rental?.end_date || null, returned_on: returnedOn || null }, today);

  const save = async () => {
    if (!item.trim()) return toast.error("Add the item that is rented out");
    if (!start) return toast.error("Pick the day it was rented");
    if (returnedOn && returnedOn < start) return toast.error("It cannot come back before the day it was rented");
    if (renter.name.trim() && !renter.id) return toast.error("Pick the renter from the list, or tap Add to save them as a new customer, so the daily rent lands on their ledger");
    setBusy(true);
    const body = { car: item.trim(), model: model.trim(), customer_id: renter.id, start_date: start, returned_on: returnedOn || null, rate_per_day: Number(rate) || 0, note: note.trim() };
    const ok = rental ? await put(`/fin/rentals/${rental.id}`, body, "Rental saved") : await post("/fin/rentals", body, "Rental added");
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title={rental ? "Edit rental" : "New rental"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Item *">
            <input list="fin-rent-vehicles" value={item} onChange={(e) => setItem(e.target.value)} className={inputCls} placeholder="Vehicle" autoFocus />
            <datalist id="fin-rent-vehicles">{vehicles.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Model"><input value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} /></Field>
          <div className="sm:col-span-2">
            <PartyPicker label="Rented to" parties={books.parties} id={renter.id} name={renter.name}
              onChange={(p) => setRenter({ id: p.id, name: p.name })} onCreate={(name) => post("/fin/parties", { name })} />
          </div>
          <DateField label="Rented on *" value={start} onChange={setStart} />
          <div>
            <DateField label="Returned on" value={returnedOn} onChange={setReturnedOn} />
            {returnedOn && <button type="button" onClick={() => setReturnedOn("")} className="text-xs text-blue-600 hover:underline mt-1">Clear (still out)</button>}
          </div>
          <Field label="Rate per day (NPR)"><input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} /></Field>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-slate-500">Status</span><Pill s={status} /></div>
          <div className="flex justify-between"><span className="text-slate-500">Days (the day it went out and the day it came back both count)</span><span>{figures.days}</span></div>
          <div className="flex justify-between font-bold border-t border-slate-200 pt-2" style={{ color: COLORS.in }}><span>Rent</span><span>{npr(figures.total)}</span></div>
          {renter.id && <p className="text-xs text-slate-500">{renter.name} owes the daily rent on their ledger and pays it on the Received page, with this vehicle picked in Item.</p>}
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {rental ? <TwoTapDelete label="Remove rental" onConfirm={async () => { if (await del(`/fin/rentals/${rental.id}`, "Rental removed")) onClose(); }} /> : <span />}
          <div className="flex gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save"}</button></div>
        </div>
      </div>
    </Modal>
  );
}

export default function Rent({ openParty }) {
  const { books } = useBooks();
  const today = todayStr();
  const [show, setShow] = useState("all"); // all | out | received | due
  const [form, setForm] = useState(null);  // null | "new" | rental

  // Vehicles still out first, then the rest, newest first in each.
  const rows = useMemo(() => books.rentals
    .map((r) => {
      const f = rentalFigures(r, today);
      const paid = receivedFor(books, r.customer_id, r.car);
      return { r, ...f, paid, left: round2(Math.max(0, f.total - paid)), status: rentalStatus(r, today) };
    })
    .sort((a, b) => Number(!!a.r.returned_on) - Number(!!b.r.returned_on) || b.r.start_date.localeCompare(a.r.start_date)), [books, today]);
  const shown = rows.filter((x) => (show === "out" ? !x.r.returned_on : show === "received" ? x.paid > 0 : show === "due" ? x.left > 0 : true));
  const sum = (f, list = rows) => round2(list.reduce((s, x) => s + f(x), 0));
  const pick = (k) => setShow((cur) => (cur === k ? "all" : k));

  if (!books.rent_ready) return <NotReady />;

  const open = (x) => (x.r.customer_id ? openParty(x.r.customer_id) : setForm(x.r));
  const exportRows = () => exportXlsx("Rent", [
    { header: "Item", value: (x) => x.r.car }, { header: "Model", value: (x) => x.r.model || "" },
    { header: "Rented to", value: (x) => x.r.customer_name || "" }, { header: "From", value: (x) => x.r.start_date },
    { header: "To", value: (x) => x.r.returned_on || x.r.end_date || "" }, { header: "Days", value: (x) => x.days },
    { header: "Rate / day", value: (x) => x.r.rate_per_day }, { header: "Rent", value: (x) => x.total },
    { header: "Received", value: (x) => x.paid }, { header: "Due", value: (x) => x.left }, { header: "Status", value: (x) => x.status.label },
  ], shown);

  return (
    <div className="space-y-5">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Vehicles given out on rent, billed by the day.</p>
        <div className="flex gap-2">
          <ExportBar onXlsx={exportRows} />
          <button onClick={() => setForm("new")} className={btnPrimary} data-testid="new-rental"><Plus size={16} /> New rental</button>
        </div>
      </div>

      {/* Each tile narrows the table to its rentals; a second tap shows them all again. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Out now" value={String(rows.filter((x) => !x.r.returned_on).length)} color={COLORS.sale} onClick={() => pick("out")} />
        <Stat label="Rent" value={sum((x) => x.total)} onClick={() => setShow("all")} />
        <Stat label="Received" value={sum((x) => x.paid)} color={COLORS.in} onClick={() => pick("received")} />
        <Stat label="Due" value={sum((x) => x.left)} color={COLORS.out} onClick={() => pick("due")} />
        <Stat label="Rentals" value={String(rows.length)} onClick={() => setShow("all")} />
      </div>
      {show !== "all" && <Notice tone="blue">Showing {shown.length} of {rows.length} rentals. Tap the tile again to see them all.</Notice>}

      {rows.length === 0 ? <Card><Empty>No rentals yet. Tap New rental.</Empty></Card> : (
        <>
          <Card className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  {["Item", "Rented to", "Period", "Days", "Rate / day", "Rent", "Received", "Due", "Status", ""].map((h, i) => (
                    <th key={i} className={`px-2.5 py-2.5 ${i >= 3 && i <= 7 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.r.id} onClick={() => open(x)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer align-top">
                    <td className="px-2.5 py-2.5"><div className="font-semibold text-slate-900">{x.r.car}</div>{(x.r.model || x.r.note) && <div className="text-xs text-slate-400">{[x.r.model, x.r.note].filter(Boolean).join(" · ")}</div>}</td>
                    <td className="px-2.5 py-2.5">{x.r.customer_name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2.5 py-2.5"><DateCell date={x.r.start_date} /><div className="text-xs text-slate-500 whitespace-nowrap">{x.r.returned_on || x.r.end_date ? `to ${x.r.returned_on || x.r.end_date}` : "still out"}</div></td>
                    <td className="px-2.5 py-2.5 text-right">{x.days}</td>
                    <td className="px-2.5 py-2.5 text-right">{num(x.r.rate_per_day)}</td>
                    <td className="px-2.5 py-2.5 text-right font-bold text-slate-900">{num(x.total)}</td>
                    <td className="px-2.5 py-2.5 text-right"><Fig v={x.paid} color={COLORS.in} bold /></td>
                    <td className="px-2.5 py-2.5 text-right"><Fig v={x.left} color={COLORS.out} bold /></td>
                    <td className="px-2.5 py-2.5"><Pill s={x.status} /></td>
                    <td className="px-2.5 py-2.5 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setForm(x.r); }} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" aria-label="Edit this rental"><Pencil size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-700">
                  <td colSpan={5} className="px-2.5 py-2.5">{shown.length} {shown.length === 1 ? "rental" : "rentals"} · Total</td>
                  <td className="px-2.5 py-2.5 text-right">{num(sum((x) => x.total, shown))}</td>
                  <td className="px-2.5 py-2.5 text-right"><Fig v={sum((x) => x.paid, shown)} color={COLORS.in} bold /></td>
                  <td className="px-2.5 py-2.5 text-right"><Fig v={sum((x) => x.left, shown)} color={COLORS.out} bold /></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </Card>

          <div className="md:hidden space-y-2">
            {shown.map((x) => (
              <Card key={x.r.id} className="p-3">
                <div onClick={() => open(x)} className="cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-semibold text-slate-900 truncate">{x.r.car}</div><div className="text-xs text-slate-500 truncate">{[x.r.customer_name, x.r.model].filter(Boolean).join(" · ") || "—"}</div></div>
                    <Pill s={x.status} />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{x.r.start_date} · {x.days} {x.days === 1 ? "day" : "days"} · NPR {num(x.r.rate_per_day)} a day</div>
                  <div className="flex justify-between text-sm mt-2">
                    <span>Rent <b>{num(x.total)}</b></span>
                    <span style={{ color: COLORS.in }}>Received <b>{num(x.paid)}</b></span>
                    <span style={{ color: COLORS.out }}>Due <b>{num(x.left)}</b></span>
                  </div>
                </div>
                <button onClick={() => setForm(x.r)} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">Edit rental</button>
              </Card>
            ))}
          </div>
        </>
      )}

      <p className="text-xs leading-relaxed text-slate-400">
        Tap a rental to open the renter's ledger; the pencil edits the rental. Received is what the renter paid on the Received page with the vehicle picked in Item.
        A rental is billed by the day, counting the day it was rented and every day since. Rent is kept apart from Sales, so a vehicle on rent stays in your stock.
      </p>

      {form && <RentalForm rental={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}
