import { CalendarCheck, CalendarClock, CheckCircle2, Eye, Plus, StickyNote, Undo2 } from "lucide-react";
import { shortBS, timeOf, dateTimeTitle } from "../../utils/crm";
import { FONT, EmptyState } from "./ui";

// "Today's Follow-ups": what is overdue, what is on today (done or not) and what is coming this week. Each one can be
// completed, rescheduled, annotated, or opened at its customer. Beside the table (very wide screens) it is a column
// like the mockup; everywhere else it is a compact row of cards above the table that scrolls sideways.
const SECTIONS = [
  { key: "overdue", label: "Overdue", dot: "bg-red-500", edge: "border-l-red-500", chip: "bg-red-50 text-red-700", status: "Overdue" },
  { key: "today", label: "Today", dot: "bg-blue-500", edge: "border-l-blue-500", chip: "bg-blue-50 text-blue-700", status: "Due today" },
  { key: "upcoming", label: "Upcoming", dot: "bg-slate-400", edge: "border-l-slate-300", chip: "bg-slate-100 text-slate-600", status: "Scheduled" },
];

const btn = "w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function Body({ f, section, onComplete, onReopen, onReschedule, onNote, onView }) {
  const done = f.status === "done";
  const when = section.key === "today" ? timeOf(f.due_at) : `${shortBS(f.due_at)} · ${timeOf(f.due_at)}`;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500" title={dateTimeTitle(f.due_at)}>{when}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${done ? "bg-emerald-50 text-emerald-700" : section.chip}`} data-testid="followup-status">{done ? "Done" : section.status}</span>
      </div>
      <button onClick={() => onView(f.customer_id)} className={`block max-w-full truncate text-left text-sm font-bold hover:underline ${done ? "text-slate-400 line-through" : "text-slate-900"}`} style={FONT}>{f.customer_name}</button>
      <p className={`text-xs truncate ${done ? "text-slate-400" : "text-slate-500"}`}>{f.purpose}</p>
      {f.notes && <p className="text-[11px] text-slate-400 italic truncate" title={f.notes}>{f.notes}</p>}
      <div className="mt-1 flex items-center gap-0.5 -ml-1">
        {done
          ? <button onClick={() => onReopen(f)} className={btn} title="Reopen" aria-label={`Reopen follow-up with ${f.customer_name}`}><Undo2 size={15} /></button>
          : <button onClick={() => onComplete(f)} className={`${btn} hover:!text-emerald-700 hover:!bg-emerald-50`} title="Mark done" aria-label={`Mark follow-up with ${f.customer_name} done`} data-testid="followup-complete"><CheckCircle2 size={16} /></button>}
        <button onClick={() => onReschedule(f)} className={btn} title="Reschedule" aria-label={`Reschedule follow-up with ${f.customer_name}`} data-testid="followup-reschedule"><CalendarClock size={15} /></button>
        <button onClick={() => onNote(f)} className={btn} title="Add a note" aria-label={`Note on follow-up with ${f.customer_name}`} data-testid="followup-note"><StickyNote size={15} /></button>
        <button onClick={() => onView(f.customer_id)} className={btn} title="View customer" aria-label={`View ${f.customer_name}`}><Eye size={15} /></button>
      </div>
    </div>
  );
}

const Header = ({ children, onAdd }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
    <h3 className="flex items-center gap-2 text-base font-bold text-slate-900" style={FONT}>
      <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 inline-flex items-center justify-center"><CalendarCheck size={17} /></span>
      Today's Follow-ups
    </h3>
    <div className="flex items-center gap-2">
      {children}
      <button onClick={onAdd} data-testid="followup-add" className="h-8 px-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold inline-flex items-center gap-1"><Plus size={14} /> Add</button>
    </div>
  </div>
);

export default function FollowUpsPanel({ followups, layout = "side", onAdd, ...actions }) {
  const total = SECTIONS.reduce((n, s) => n + followups[s.key].length, 0);
  const shell = "bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)]";

  if (layout === "top") {
    return (
      <section className={shell} aria-label="Today's follow-ups" data-testid="followups-panel">
        <Header onAdd={onAdd}>
          {SECTIONS.map(s => followups[s.key].length > 0 && (
            <span key={s.key} className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full ${s.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{followups[s.key].length} {s.label.toLowerCase()}</span>
          ))}
        </Header>
        {total === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500">Nothing scheduled for today or the coming week.</p>
        ) : (
          <ul className="flex gap-3 overflow-x-auto px-4 pb-4 pt-1 snap-x" data-testid="followups-strip">
            {SECTIONS.flatMap(s => followups[s.key].map(f => (
              <li key={f.id} data-testid="followup-item" data-section={s.key}
                className={`snap-start shrink-0 w-[252px] flex rounded-xl border border-slate-200 border-l-4 ${f.status === "done" ? "border-l-emerald-500" : s.edge} bg-white px-3 py-2.5`}>
                <Body f={f} section={s} {...actions} />
              </li>
            )))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className={shell} aria-label="Today's follow-ups" data-testid="followups-panel">
      <Header onAdd={onAdd} />
      {total === 0 ? (
        <EmptyState icon={CalendarCheck} title="Nothing scheduled">No follow-ups for today or the coming week. Add one here, or from a customer's profile.</EmptyState>
      ) : (
        <div className="px-4 pb-3">
          {SECTIONS.map(s => followups[s.key].length > 0 && (
            <div key={s.key} data-testid={`followups-${s.key}`}>
              <h4 className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">{s.label}<span className="text-slate-300">{followups[s.key].length}</span></h4>
              <ul className="divide-y divide-slate-100">
                {followups[s.key].map(f => (
                  <li key={f.id} className="flex gap-3 py-3" data-testid="followup-item" data-section={s.key}>
                    <span className={`mt-1.5 shrink-0 w-2.5 h-2.5 rounded-full ${f.status === "done" ? "bg-emerald-500" : s.dot}`} aria-hidden="true" />
                    <Body f={f} section={s} {...actions} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
