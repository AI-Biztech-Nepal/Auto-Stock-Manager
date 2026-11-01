import { toast } from "sonner";

// Where CRM messages appear matters: the page keeps its Add Customer / Import buttons in the top-right corner (where
// the app's toasts normally go) and the profile drawer keeps Save / Cancel in the bottom-right. So on a computer they
// show bottom-centre, which is clear of both; on a phone, where a toast spans the whole width, at the top.
const at = () => ({ position: typeof window !== "undefined" && window.matchMedia?.("(min-width: 640px)").matches ? "bottom-center" : "top-center" });
export const notify = {
  success: (message, opts) => toast.success(message, { ...at(), ...opts }),
  error: (message, opts) => toast.error(message, { ...at(), ...opts }),
  info: (message, opts) => toast(message, { ...at(), ...opts }),
};
