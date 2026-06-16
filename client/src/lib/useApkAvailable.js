import { useEffect, useState } from "react";

// HEAD-checks a same-origin download URL once on mount and returns true
// ONLY if a real binary is actually served there. This matters because a
// missing file on Vercel doesn't 404 — the SPA fallback returns index.html
// with a 200 and `content-type: text/html`. Linking straight to it would
// download that HTML page saved as .apk/.exe, which the OS then rejects as
// "corrupted" / "cannot install". Checking the content-type prevents that.
export default function useApkAvailable(url) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (cancelled) return;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const looksBinary =
          (ct.includes("vnd.android.package-archive") ||
            ct.includes("octet-stream") ||
            ct.startsWith("application/")) &&
          !ct.startsWith("text/");
        setAvailable(res.ok && looksBinary);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);
  return available;
}
