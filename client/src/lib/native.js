// Capacitor (native Android/iOS app) helpers. On the plain web these are
// all no-ops, so the same React build runs as the website AND inside the
// native app shell.
import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => {
  try { return Capacitor?.isNativePlatform?.() === true; } catch { return false; }
};

// One-time native setup: themed status bar + hide the splash screen once
// the React app has painted. Plugins are imported lazily so a missing one
// never breaks startup.
export async function initNative() {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#166534" });
  } catch { /* plugin not present */ }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch { /* plugin not present */ }
}
