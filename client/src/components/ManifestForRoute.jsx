// Picks the right PWA manifest for who's installing:
//   • Field routes (/plumber, /meter) → the FIELD manifest (start_url
//     /plumber) so field staff install the offline field app.
//   • Everywhere else (homepage, /app, /inquiry, …) → the DEFAULT member
//     manifest (start_url "/") so members install the member app and land
//     on the homepage, NOT the staff login.
// Swaps the <link rel="manifest"> href on navigation so the browser's
// install prompt uses the correct one. No-op if the link isn't present.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const FIELD_PREFIXES = ["/plumber", "/meter"];

export default function ManifestForRoute() {
  const { pathname } = useLocation();
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    // Remember the build-generated (member) manifest href the first time.
    if (!link.dataset.defaultHref) {
      link.dataset.defaultHref = link.getAttribute("href") || "/manifest.webmanifest";
    }
    const isField = FIELD_PREFIXES.some((p) => pathname.startsWith(p));
    const target = isField ? "/field.webmanifest" : link.dataset.defaultHref;
    if (link.getAttribute("href") !== target) link.setAttribute("href", target);
  }, [pathname]);
  return null;
}
