import { useState } from "react";

// Thumbnail that only fetches once it nears the viewport (native lazy loading) and retries a
// couple of times on failure. Inventory renders every vehicle card at once with up to 3
// photos each; eager <img> tags would fire hundreds of simultaneous requests, so many
// thumbnails stalled or errored and the cards looked half-loaded.
export default function LazyThumb({ src, className = "w-full h-full object-cover", alt = "" }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="w-full h-full bg-slate-100" />;
  const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        if (attempt >= 2) { setFailed(true); return; }
        setTimeout(() => setAttempt(a => a + 1), 800 * (attempt + 1));
      }}
    />
  );
}
