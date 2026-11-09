// The bordered "book" table shared by Inventory, Sales and CRM, drawn like the Finance Day Book's: grey header,
// a rule under every row and between every column. Put BOOK_CARD on the card around a <table> and render
// <BookTableStyle /> once inside it; add className="sticky-head" to the <table> to pin its header while the
// card scrolls, and className="text-right" on a <th> to right-align a figures column. Add "compact" next to
// BOOK_CARD to tighten the cells (headers may wrap), and className="fixed-cols" with a <colgroup> of percentages to
// share the card's width between the columns (long text is cut with an ellipsis), so a many-column table fits
// without sideways scrolling and without one column soaking up all the spare room.
export const BOOK_CARD = "book-table bg-white border border-gray-200 rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_12px_rgba(16,24,40,0.03)] overflow-hidden";

const BOOK_TABLE_CSS = `
.book-table table { border-collapse: collapse; width: 100%; font-size: 13px; color: #111827; }
.book-table thead th { background: #F9FAFB; color: #4B5563; font-size: 11.5px; font-weight: 700; text-align: left; text-transform: none; letter-spacing: 0;
  padding: 8px 10px; border-bottom: 1px solid #D1D5DB; white-space: nowrap; }
.book-table thead th.text-right { text-align: right; }
.book-table tbody td, .book-table tfoot td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: middle; }
.book-table thead th + th, .book-table tbody td + td, .book-table tfoot td + td { border-left: 1px solid #E5E7EB; }
.book-table tbody tr:last-child td { border-bottom: none; }
.book-table tfoot td { background: #F9FAFB; font-weight: 700; border-top: 1px solid #D1D5DB; border-bottom: none; }
.book-table tbody tr:hover td { background-color: #F8FAFC; }
.book-table.compact table { font-size: 12.5px; }
.book-table.compact thead th { font-size: 11px; line-height: 1.25; white-space: normal; vertical-align: bottom; padding: 6px 8px; }
.book-table.compact tbody td, .book-table.compact tfoot td { padding: 6px 8px; }
.book-table table.fixed-cols { table-layout: fixed; }
.book-table table.fixed-cols tbody td, .book-table table.fixed-cols tfoot td, .book-table table.fixed-cols thead th { overflow: hidden; text-overflow: ellipsis; }
.book-table table.sticky-head thead th { position: sticky; top: 0; z-index: 10; box-shadow: inset 0 -1px 0 #D1D5DB; border-bottom: none; }
`;

export function BookTableStyle() {
  return <style>{BOOK_TABLE_CSS}</style>;
}
