import { Users, UserPlus, CalendarClock, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import { FONT, Sparkline, Skeleton } from "./ui";

// The four numbers at the top, each with a little graph. Everything comes from /crm/overview, i.e. from the
// customers, sales and follow-ups actually on file.
const Trend = ({ good, children }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${good === true ? "text-emerald-600" : good === false ? "text-red-600" : "text-slate-400"}`}>{children}</span>
);

const arrow = (n) => (n > 0 ? <TrendingUp size={12} /> : n < 0 ? <TrendingDown size={12} /> : null);

export default function StatCards({ summary }) {
  const cards = summary ? [
    {
      key: "total", label: "Total Customers", Icon: Users, tint: "bg-blue-100 text-blue-600", color: "#2563eb",
      value: summary.total.value.toLocaleString(), series: summary.total.series,
      trend: <Trend good={summary.total.added_this_month > 0 ? true : null}>{arrow(summary.total.added_this_month)}+{summary.total.added_this_month} this month</Trend>,
    },
    {
      key: "new", label: "New This Month", Icon: UserPlus, tint: "bg-emerald-100 text-emerald-600", color: "#16a34a",
      value: summary.new_this_month.value.toLocaleString(), series: summary.new_this_month.series,
      trend: summary.new_this_month.delta_pct === null
        ? <Trend>{summary.new_this_month.previous === 0 ? "Nothing last month to compare" : ""}</Trend>
        : <Trend good={summary.new_this_month.delta_pct >= 0}>{arrow(summary.new_this_month.delta_pct)}{Math.abs(summary.new_this_month.delta_pct)}% vs last month</Trend>,
    },
    {
      key: "due", label: "Follow-ups Due", Icon: CalendarClock, tint: "bg-orange-100 text-orange-600", color: "#f97316",
      value: summary.followups_due.value.toLocaleString(), series: summary.followups_due.series,
      trend: summary.followups_due.overdue > 0
        ? <Trend good={false}>{summary.followups_due.overdue} overdue</Trend>
        : <Trend good={true}>{summary.followups_due.value === 0 ? "Nothing waiting" : "None overdue"}</Trend>,
    },
    {
      key: "converted", label: "Converted Leads", Icon: CheckCircle2, tint: "bg-emerald-100 text-emerald-600", color: "#10b981",
      value: `${summary.converted.value}%`, series: summary.converted.series,
      trend: <Trend good={summary.converted.change_pts > 0 ? true : summary.converted.change_pts < 0 ? false : null}>{arrow(summary.converted.change_pts)}{summary.converted.change_pts > 0 ? "+" : ""}{summary.converted.change_pts} pts · {summary.converted.count} bought</Trend>,
    },
  ] : null;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3" data-testid="crm-stats">
      {(cards || [0, 1, 2, 3]).map((c, i) => (
        <div key={c.key || i} className="relative overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4 pb-12 min-h-[132px]" data-testid={c.key ? `stat-${c.key}` : undefined}>
          {c.key ? (
            <>
              <Sparkline data={c.series} color={c.color} className="absolute inset-x-0 bottom-0 w-full h-10" />
              <div className="relative flex items-start gap-3">
                <span className={`hidden sm:inline-flex shrink-0 w-12 h-12 rounded-2xl items-center justify-center ${c.tint}`}><c.Icon size={22} /></span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-500 truncate">{c.label}</div>
                  <div className="text-[28px] leading-9 font-extrabold text-slate-900 tabular-nums" style={FONT} data-testid={`stat-${c.key}-value`}>{c.value}</div>
                  <div className="mt-0.5">{c.trend}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3"><Skeleton className="hidden sm:block w-12 h-12 rounded-2xl" /><div className="space-y-2 flex-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-28" /></div></div>
          )}
        </div>
      ))}
    </div>
  );
}
