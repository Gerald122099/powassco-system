// Runs once when the app mounts. Inside the native Capacitor app it
// initializes the status bar / splash and lands the user on the member
// home (/app) instead of the public website homepage. On the web it does
// nothing. Must be rendered inside the Router.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeApp, initNative } from "../lib/native";

export default function NativeBoot() {
  const navigate = useNavigate();
  useEffect(() => {
    initNative();
    if (isNativeApp() && window.location.pathname === "/") {
      navigate("/app", { replace: true });
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
