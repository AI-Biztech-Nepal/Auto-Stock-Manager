export default function LedgerTable({ title, countLabel, headers, rows, totalLabel, totalValue, empty, accent = "slate" }) {
  const headBg = accent === "green" ? "bg-green-50/60" : "bg-slate-50";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        <span className="text-[11px] text-slate-400">{countLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">{empty || "No records"}</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className={headBg}>
                {headers.map((h, i) => (
                  <th key={i} className={`text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 ${i === headers.length - 1 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((cells, ri) => (
                <tr key={ri}>
                  {cells.map((cell, ci) => (
                    <td key={ci} className={`px-3 py-2 align-top text-slate-700 ${ci === cells.length - 1 ? "text-right font-semibold whitespace-nowrap" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totalValue != null && (
              <tfoot>
                <tr className={headBg}>
                  <td colSpan={headers.length - 1} className="px-3 py-2 text-right font-semibold text-slate-600">{totalLabel}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900 whitespace-nowrap">{totalValue}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
