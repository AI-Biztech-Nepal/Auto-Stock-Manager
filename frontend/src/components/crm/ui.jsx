import { useEffect, useId } from "react";
import { X, AlertTriangle } from "lucide-react";
import { STATUS_BY_KEY, avatarTone, initialsOf } from "../../utils/crm";

// Small pieces the CRM screens share: dialogs, the side drawer, badges, the little trend graph.
export const FONT = { fontFamily: "Manrope" };
export const inputCls = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400";
export const btnPrimary = "h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
export const btnGhost = "h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
export const btnDanger = "h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2";

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

// A dialog: full screen on a phone, centred card from sm up. Esc and the backdrop close it.
export function Modal({ title, subtitle, onClose, children, footer, size = "md", testid }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} data-testid={testid}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white w-full ${SIZES[size]} sm:rounded-2xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh]`}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate" style={FONT}>{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 sm:rounded-b-2xl flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children, testid }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} data-testid={testid}>
      <aside role="dialog" aria-modal="true" aria-label="Customer profile" className="bg-white w-full sm:w-[640px] h-[100dvh] shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">{children}</aside>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel = "Delete", busy, onConfirm, onClose, danger = true }) {
  return (
    <Modal title={title} onClose={onClose} size="sm" testid="confirm-modal"
      footer={<>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={onConfirm} disabled={busy} className={danger ? btnDanger : btnPrimary} data-testid="confirm-yes">{busy ? "Working..." : confirmLabel}</button>
      </>}>
      <div className="flex gap-3">
        <span className="shrink-0 w-10 h-10 rounded-full bg-red-50 text-red-600 inline-flex items-center justify-center"><AlertTriangle size={20} /></span>
        <p className="text-sm text-slate-700 leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}

export function FormField({ label, required, error, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Avatar({ name, size = 8 }) {
  const px = size * 4;
  return <span className={`shrink-0 rounded-full font-bold inline-flex items-center justify-center ${avatarTone(name)}`} style={{ width: px, height: px, fontSize: px * 0.36 }} aria-hidden="true">{initialsOf(name)}</span>;
}

export function StatusBadge({ status, title }) {
  const s = STATUS_BY_KEY[status] || STATUS_BY_KEY.new;
  return <span title={title} className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.pill}`}>{s.label}</span>;
}

// The little graph under a summary number: a smooth area over the last few points.
export function Sparkline({ data = [], color = "#2563eb", className = "" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts = data.length > 1 ? data : [0, 0];
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 100, 27 - ((v - min) / span) * 23]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L100,30 L0,30 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const Skeleton = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><Icon size={22} /></span>
      <h3 className="text-base font-bold text-slate-900" style={FONT}>{title}</h3>
      {children && <p className="mt-1 text-sm text-slate-600 max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
