// Homepage banner that nudges visitors to install the POWASSCO PWA.
//
// • Android Chrome / supported browsers: a one-tap "Install app" CTA
//   that triggers the native beforeinstallprompt event.
// • iOS Safari: a step-by-step "Add to Home Screen" guide (Apple
//   doesn't expose a programmatic install).
// • Desktop or unsupported: a short "how to install" guide.
// • Already installed: shows a small "You're set" confirmation
//   instead of the CTA.
//
// Hidden once dismissed for the session (per-tab via sessionStorage)
// so it doesn't re-appear on every navigation.
import { useEffect, useState } from "react";
import { Download, Smartphone, Apple, Bell, X, Plus, Share2, ChevronRight, CheckCircle } from "lucide-react";

const DISMISS_KEY = "pow_install_banner_dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function ua() {
  return typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
}
function isAndroid() { return /Android/i.test(ua()); }
function isIOS() { return /iPad|iPhone|iPod/i.test(ua()) && !window.MSStream; }

export default function PublicAppInstallBanner() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");
  const [showGuide, setShowGuide] = useState(false);

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

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }
  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* dismissed */ }
    setDeferred(null);
  }

  if (hidden) return null;

  // Already installed → quiet success card with notification reminder.
  if (installed) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center h-10 w-10 rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle size={20} />
            </div>
            <div>
              <div className="font-bold text-emerald-900">POWASSCO app is installed on this phone</div>
              <div className="text-xs text-emerald-700 mt-0.5">Save your meter or PN in <b>Bill Inquiry</b> to auto-load dues and (soon) receive push reminders.</div>
            </div>
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100"><X size={16} /></button>
        </div>
      </div>
    );
  }

  // Big call-to-action card — varies by platform.
  const ios = isIOS();
  const android = isAndroid();

  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-green-600 to-emerald-700 text-white p-5 sm:p-7 shadow-2xl ring-1 ring-emerald-700/20 relative overflow-hidden">
      <button onClick={dismiss} aria-label="Dismiss banner" className="absolute right-3 top-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X size={18} /></button>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
            <Smartphone size={12} /> Get the mobile app
          </div>
          <h3 className="mt-3 text-2xl sm:text-3xl font-extrabold leading-tight">Install POWASSCO to stay updated on your water bill.</h3>
          <p className="mt-1.5 text-sm text-emerald-50/90">
            Save your meter or PN — your dues auto-load on every visit. Reminders before due date and on penalty days{android ? "" : " (Android app)"}.
          </p>

          {/* CTA row varies by platform */}
          {android ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {deferred ? (
                <button onClick={install} className="inline-flex items-center gap-2 rounded-2xl bg-white text-emerald-700 px-5 py-3 text-sm font-extrabold shadow-lg hover:bg-emerald-50 active:scale-95">
                  <Download size={18} /> Install now
                </button>
              ) : (
                <a href="/downloads/powassco-member.apk" download className="inline-flex items-center gap-2 rounded-2xl bg-white text-emerald-700 px-5 py-3 text-sm font-extrabold shadow-lg hover:bg-emerald-50 active:scale-95">
                  <Download size={18} /> Download .APK
                </a>
              )}
              <button onClick={() => setShowGuide((v) => !v)} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20">
                How to install <ChevronRight size={16} className={`transition ${showGuide ? "rotate-90" : ""}`} />
              </button>
            </div>
          ) : ios ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-xs font-semibold">
              <Apple size={14} /> iPhone / iPad — no separate app yet. Use this website (works great in Safari).
            </div>
          ) : (
            <button onClick={() => setShowGuide((v) => !v)} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white text-emerald-700 px-5 py-3 text-sm font-extrabold shadow hover:bg-emerald-50">
              How to install on your phone <ChevronRight size={16} className={`transition ${showGuide ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>

        {/* Decorative phone illustration */}
        <div className="hidden sm:flex h-24 w-24 shrink-0 rounded-3xl bg-white/10 ring-2 ring-white/20 items-center justify-center backdrop-blur">
          <Bell size={36} className="text-white/90" />
        </div>
      </div>

      {/* Inline guide — collapses by default. */}
      {showGuide && (
        <div className="mt-5 rounded-2xl bg-white/10 backdrop-blur p-4 text-sm">
          {android ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-white/80">Android — install in 30 seconds</div>
              <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-emerald-50">
                <li>Tap <b>Install now</b> above (one-tap install).</li>
                <li>Or open this page in <b>Chrome</b>, tap the <b>⋮ menu</b>, then <b>Install app</b> / <b>Add to Home screen</b>.</li>
                <li>Or download the <b>.APK</b> directly; in <b>Settings → Apps → Special access → Install unknown apps</b>, allow Chrome / Files; then tap the .apk to install.</li>
                <li>Open POWASSCO from the home screen — sign in once, save your meter in Bill Inquiry, and your dues will be there on every open.</li>
              </ol>
            </>
          ) : ios ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-white/80">iPhone — use the website</div>
              <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-emerald-50">
                <li>Open this page in <b>Safari</b>.</li>
                <li>Tap the <Share2 size={12} className="inline -mt-0.5" /> <b>Share</b> button.</li>
                <li>Scroll and choose <b>Add to Home Screen</b> <Plus size={12} className="inline -mt-0.5" />.</li>
                <li>Tap <b>Add</b>. POWASSCO appears on your home screen with the website preloaded.</li>
              </ol>
            </>
          ) : (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-white/80">Install on your computer</div>
              <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-emerald-50">
                <li>Open this page in <b>Chrome</b> or <b>Edge</b>.</li>
                <li>Click the install icon in the address bar (the small +/screen icon), or use the <b>⋮ menu → Install POWASSCO</b>.</li>
                <li>The app opens in its own window.</li>
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
