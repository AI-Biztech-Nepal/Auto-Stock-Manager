// Generic single-line "list view" row: thumbnail/icon, title + subtitle, optional
// meta/pills, a right-aligned value block, and trailing actions. Every page's list
// view is built out of these so the compact layout reads the same across tabs.
export default function ListRow({ onClick, thumb, title, subtitle, meta, pills, right, actions, testid, dim }) {
  // On phones the row wraps: thumb + title + actions stay on line one, and the money (meta /
  // right) and status pills drop to a full-width second line, indented under the title, so
  // nothing is hidden. From md up it collapses back to the single-line row.
  const indent = thumb !== undefined ? "pl-[3.25rem] md:pl-0" : "";
  return (
    <div
      onClick={onClick}
      data-testid={testid}
      className={`flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:shadow-sm hover:border-slate-300 transition-all ${onClick ? "cursor-pointer" : ""} ${dim ? "opacity-60 saturate-50" : ""}`}
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
      {actions && (
        <div className="flex items-center gap-0.5 shrink-0 order-2 md:order-5" onClick={e => e.stopPropagation()}>
          {actions}
        </div>
      )}
      {meta && <div className={`order-3 md:order-2 basis-full md:basis-auto ${indent} text-xs text-slate-500 md:shrink-0 md:text-right`}>{meta}</div>}
      {right && <div className={`order-3 md:order-4 basis-full md:basis-auto ${indent} md:shrink-0 md:text-right`}>{right}</div>}
      {pills && <div className={`order-4 md:order-3 basis-full md:basis-auto ${indent} flex flex-wrap items-center gap-1.5 md:shrink-0`}>{pills}</div>}
    </div>
  );
}
