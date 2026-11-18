import { toast } from "sonner";

// A booking or a sale also goes on the customer's Finance Ledger (the deposit, the sale bill). The server says how that went
// in the save's response, as `finance`: "posted" (it is on the ledger), "nothing" (there was nothing to post, such as a
// booking with no amount) or "failed: <why>" (the booking or sale itself WAS saved). Call this with the response data right
// after a save: a good result is confirmed, a failure is explained, and a response without `finance` (a server that has not
// been updated yet) shows nothing.
export function financeNotice(data) {
  const result = data?.finance;
  if (result === "posted") toast.success("Also recorded on the customer's Finance ledger");
  else if (typeof result === "string" && result.startsWith("failed")) {
    toast.warning(`Saved, but it could not be recorded on the Finance ledger (${result.replace(/^failed:\s*/, "")})`, { duration: 15000 });
  }
}
