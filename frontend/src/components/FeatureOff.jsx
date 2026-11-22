import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

// Shown instead of a page (or a tab) whose feature is switched off for the organization.
export default function FeatureOff() {
  return (
    <div className="max-w-md mx-auto mt-16 text-center bg-white rounded-xl border border-slate-200 shadow-sm p-8" data-testid="feature-off-page">
      <div className="size-12 mx-auto mb-4 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><Lock size={22} /></div>
      <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>Not enabled for your organization</h1>
      <p className="text-sm text-slate-500 mt-2">This part of the app is switched off for your organization. Ask your organization's owner to switch it on in the portal's Settings.</p>
      <Link to="/" className="inline-block mt-5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Back to home</Link>
    </div>
  );
}
