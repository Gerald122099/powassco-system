// In the desktop (Electron) staff app, the public homepage isn't relevant —
// employees should only ever see the staff login and their dashboard. So
// whenever the desktop app lands on "/" (first launch, or after logout
// redirects home), send it to /employee-login. No-op in a normal browser.
// Watches the location so client-side (SPA) navigations are caught too.
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { isDesktopApp } from "../lib/desktop";

export default function DesktopBoot() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (isDesktopApp() && location.pathname === "/") {
      navigate("/employee-login", { replace: true });
    }
  }, [location.pathname, navigate]);
  return null;
}
