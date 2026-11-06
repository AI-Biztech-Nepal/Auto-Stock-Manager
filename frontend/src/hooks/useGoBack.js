import { useLocation, useNavigate } from "react-router-dom";

// A page's back arrow: one step back in the app's own history, wherever the user came from. A page opened directly
// (new tab, shared link, refresh) has nothing to go back to, so it goes to `fallback` instead.
export default function useGoBack(fallback) {
  const navigate = useNavigate();
  const { key } = useLocation();
  return () => (key !== "default" ? navigate(-1) : navigate(fallback));
}
