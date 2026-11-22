import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import useMediaQuery from "../hooks/useMediaQuery";

/**
 * TopbarRow.jsx — a page's top row: its one-line description and its buttons / filters. On wide screens (1024px and up) it sits in the
 * app's top bar beside the page's title, as on the Sales page and the Dashboard; on narrower screens it stays at the top of the page.
 *
 * note: the description (text or JSX). In the top bar only where there is room (1536px and up); on a wide screen with less room it stays
 *       at the top of the page, so nothing in it (a "Clear filters" link, say) is lost.
 * children: the buttons / filters, or nothing.
 */
export default function TopbarRow({ note, children }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const roomy = useMediaQuery("(min-width: 1536px)");
  const { topbarSlot } = useOutletContext() || {};
  const hasChildren = children != null && children !== false;
  if (!note && !hasChildren) return null;

  if (wide && topbarSlot) {
    return (
      <>
        {note && !roomy && <p className="text-sm text-slate-500" data-testid="page-note">{note}</p>}
        {createPortal(
          <>
            {note && roomy && <span className="min-w-0 truncate text-sm text-slate-500 mr-1" data-testid="topbar-note">{note}</span>}
            {children}
          </>,
          topbarSlot,
        )}
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {note ? <p className="text-sm text-slate-500" data-testid="page-note">{note}</p> : <span />}
      {hasChildren && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}
