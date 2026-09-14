// Generic single-line "list view" row: thumbnail/icon, title + subtitle, optional
// meta/pills, a right-aligned value block, and trailing actions. Every page's list
// view is built out of these so the compact layout reads the same across tabs.
export default function ListRow({ onClick, thumb, title, subtitle, meta, pills, right, actions, testid, dim }) {
  return (
    <div
      onClick={onClick}
      data-testid={testid}
      className={`flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:shadow-sm hover:border-slate-300 transition-all ${onClick ? "cursor-pointer" : ""} ${dim ? "opacity-60 saturate-50" : ""}`}
    >
      {thumb !== undefined && (
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-50 flex items-center justify-center">
          {thumb}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>{title}</div>
        {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
      </div>
      {meta && <div className="hidden sm:block text-xs text-slate-500 shrink-0 text-right">{meta}</div>}
      {pills && <div className="hidden md:flex items-center gap-1.5 shrink-0">{pills}</div>}
      {right && <div className="text-right shrink-0">{right}</div>}
      {actions && (
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
