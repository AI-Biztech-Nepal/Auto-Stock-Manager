export default function LedgerTable({ title, countLabel, headers, rows, totalLabel, totalValue, empty, accent = "slate" }) {
  const headBg = accent === "green" ? "bg-green-50/60" : "bg-slate-50";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        <span className="text-xs text-slate-400">{countLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">{empty || "No records"}</p>
      ) : (
        <>
        {/* Phones: one card per entry — labelled lines, amount last and never off-screen. */}
        <div className="sm:hidden border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
          {rows.map((cells, ri) => (
            <div key={ri} className="px-3 py-2.5 text-sm">
              <dl className="space-y-0.5">
                {cells.slice(0, -1).map((cell, ci) => (
                  <div key={ci} className="flex justify-between gap-3">
                    <dt className="text-xs text-slate-500 shrink-0">{headers[ci]}</dt>
                    <dd className="text-slate-700 text-right min-w-0 break-words">{cell}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex justify-between items-baseline gap-3 mt-1 pt-1 border-t border-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{headers[headers.length - 1]}</span>
                <span className="font-bold text-slate-900">{cells[cells.length - 1]}</span>
              </div>
            </div>
          ))}
          {totalValue != null && (
            <div className={`flex justify-between items-baseline gap-3 px-3 py-2.5 ${headBg}`}>
              <span className="text-sm font-semibold text-slate-600">{totalLabel}</span>
              <span className="font-bold text-slate-900">{totalValue}</span>
            </div>
          )}
        </div>
        <div className="hidden sm:block border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={headBg}>
                  {headers.map((h, i) => (
                    <th key={i} className={`text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 whitespace-nowrap ${i === headers.length - 1 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y-4 divide-slate-100 bg-white">
                {rows.map((cells, ri) => (
                  <tr key={ri} className={ri % 2 === 1 ? "bg-slate-50/50" : undefined}>
                    {cells.map((cell, ci) => (
                      <td key={ci} className={`px-3 py-3 align-top text-slate-700 whitespace-nowrap ${ci === cells.length - 1 ? "text-right font-semibold" : ""}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {totalValue != null && (
                <tfoot>
                  <tr className={headBg}>
                    <td colSpan={headers.length - 1} className="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">{totalLabel}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">{totalValue}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
