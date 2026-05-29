import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Shows a small "Install app" button when the browser offers PWA installation
// (Android Chrome fires beforeinstallprompt). Hidden once installed/dismissed.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred || hidden) return null;

  const install = async () => {
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* dismissed */
    }
    setDeferred(null);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-xl">
      <div className="text-sm">
        <div className="font-semibold text-slate-900">Install POWASSCO</div>
        <div className="text-xs text-slate-500">Add to your home screen for offline field use.</div>
      </div>
      <button onClick={install} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
        <Download size={15} /> Install
      </button>
      <button onClick={() => setHidden(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
