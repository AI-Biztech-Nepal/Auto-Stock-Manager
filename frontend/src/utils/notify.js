import { toast } from "sonner";

// The CRM puts its Add Customer / Import buttons in the top-right corner, which is where the app's toasts appear, so a
// toast would sit on top of them for a few seconds. CRM messages go to the bottom-right instead.
const at = { position: "bottom-right" };
export const notify = {
  success: (message, opts) => toast.success(message, { ...at, ...opts }),
  error: (message, opts) => toast.error(message, { ...at, ...opts }),
  info: (message, opts) => toast(message, { ...at, ...opts }),
};
