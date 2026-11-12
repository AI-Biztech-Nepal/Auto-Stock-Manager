import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api from "../../utils/api";
import { emptyBooks } from "./money";

// One copy of the company's books for every finance screen. After ANY write the whole thing is
// re-read: a bill's posting writes to a ledger, so refreshing only the edited table would leave the
// screen wrong.
export const BooksCtx = createContext(null);
export const useBooks = () => useContext(BooksCtx);

export function BooksProvider({ children }) {
  const [books, setBooks] = useState(emptyBooks());
  const [loading, setLoading] = useState(true);
  const [setupMessage, setSetupMessage] = useState("");   // set when the finance tables don't exist yet
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/fin/books");
      setBooks({ ...emptyBooks(), ...data });
      setSetupMessage("");
      setLoadError("");
    } catch (e) {
      if (e.response?.status === 503) setSetupMessage(e.response.data?.detail || "Finance books are not set up yet.");
      else setLoadError(e.response?.data?.detail || "Could not load the finance books");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // A write: shows the server's own reason on failure and returns null; reloads everything on success.
  const call = useCallback(async (method, url, body, success) => {
    try {
      const { data } = await api[method](url, body);
      await reload();
      if (success) toast.success(success);
      return data ?? true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Something went wrong");
      return null;
    }
  }, [reload]);

  const value = useMemo(() => ({
    books, loading, setupMessage, loadError, reload,
    post: (url, body, ok) => call("post", url, body, ok),
    put: (url, body, ok) => call("put", url, body, ok),
    del: (url, ok) => call("delete", url, undefined, ok),
  }), [books, loading, setupMessage, loadError, reload, call]);

  return <BooksCtx.Provider value={value}>{children}</BooksCtx.Provider>;
}
