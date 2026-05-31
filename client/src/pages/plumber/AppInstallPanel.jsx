// "Get the App" panel for the Plumber dashboard. The system ships as a PWA
// (no separate native APK from the Play Store yet), so the install flow is
// platform-aware:
//   • Android Chrome: triggers the beforeinstallprompt natively when fired.
//   • iOS Safari: shows the manual "Add to Home Screen" steps.
//   • Already installed: shows a "you're set" confirmation.
//
// If a Capacitor-wrapped APK is ever published, drop a static file at
// /downloads/powassco-field.apk in `client/public/` — the "Download APK"
// button auto-becomes a real download (the link below already points at
// that path).
import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { Smartphone, Download, ExternalLink, ShareIcon, Plus, CheckCircle, Apple } from "lucide-react";

function isStandalone() {
  return (
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && navigator.standalone === true)
  );
}
function isIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent || "") && !window.MSStream;
}

export default function AppInstallPanel() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setDeferred(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* dismissed */ }
    setDeferred(null);
  }

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Smartphone size={20} className="text-purple-600" /> Get the POWASSCO Field App
      </div>
      <div className="mt-0.5 text-sm text-slate-500">
        Install on your phone so you can read meters offline, scan QRs, and sync when you're back online.
      </div>

      {installed ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle size={22} className="text-emerald-600 mt-0.5" />
          <div>
            <div className="font-bold text-emerald-800">You're running the installed app.</div>
            <div className="mt-0.5 text-sm text-emerald-700">Field Mode works offline. The app auto-updates when a new version is published.</div>
          </div>
        </div>
      ) : (
        <>
          {/* Android quick install */}
          <div className="mt-5 rounded-2xl border border-purple-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900">Android — one-tap install</div>
                <div className="mt-0.5 text-xs text-slate-500">Chrome will offer to add POWASSCO to your home screen.</div>
              </div>
              {deferred ? (
                <button onClick={install} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
                  <Download size={16} /> Install now
                </button>
              ) : (
                <span className="text-xs text-slate-500">
                  Open this page in <b>Chrome</b>, tap the <b>⋮ menu</b>, then <b>Install app</b> or <b>Add to Home screen</b>.
                </span>
              )}
            </div>
          </div>

          {/* iOS manual */}
          {isIOS() && (
            <div className="mt-3 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Apple size={16} /> iPhone / iPad
              </div>
              <ol className="mt-2 list-decimal pl-5 text-xs text-slate-600 space-y-1">
                <li>Open this page in <b>Safari</b>.</li>
                <li>Tap the <ShareIcon size={11} className="inline -mt-0.5" /> Share button.</li>
                <li>Choose <b>Add to Home Screen</b> <Plus size={11} className="inline -mt-0.5" />.</li>
                <li>Tap <b>Add</b> — the POWASSCO icon appears on your home screen.</li>
              </ol>
            </div>
          )}

          {/* Direct APK link (only useful if you ever publish one) */}
          <div className="mt-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900">Native APK (advanced)</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  If the cooperative publishes a Capacitor-wrapped APK, download it here. Otherwise the install above is the official way.
                </div>
              </div>
              <a
                href="/downloads/powassco-field.apk"
                download
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download size={15} /> Download APK
              </a>
            </div>
          </div>

          {/* Helper link to the web app */}
          <div className="mt-3 rounded-2xl border border-slate-200 p-4 text-xs text-slate-500">
            <div className="flex items-center gap-2 font-semibold text-slate-700">
              <ExternalLink size={14} /> Bookmark <span className="font-mono">https://powassco.site</span> on a fresh device — Field Mode works in any modern browser, but the installed PWA is the fastest and works fully offline.
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
