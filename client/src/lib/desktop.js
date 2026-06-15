// Detects whether the web app is running inside the POWASSCO Staff desktop
// shell (Electron). True via the preload flag, or the "Electron" user-agent
// as a fallback. No-op concept on a normal browser.
export function isDesktopApp() {
  try {
    if (typeof window !== "undefined" && window.__IS_DESKTOP__ === true) return true;
    if (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "")) return true;
  } catch { /* ignore */ }
  return false;
}
