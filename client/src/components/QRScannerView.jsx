// Live camera QR scanner. Calls onResult(text) on the first successful
// decode, then stops the camera. Cleans up on unmount.
//
// Why so much DOM work? html5-qrcode attaches a <video> to whatever
// element id it's given. If that element is 0px tall when start() runs
// (e.g. because we just opened a modal and Tailwind classes haven't
// applied), the video lays out invisibly and the decoder never sees a
// frame. Two safeties:
//   1. Container has an explicit min-height + aspect-square so it has
//      real layout dimensions before start().
//   2. start() is deferred to the next frame via requestAnimationFrame.
import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScannerView({ onResult, onError }) {
  const rawId = useId();
  const id = `qr-reader-${rawId.replace(/:/g, "")}`;
  const containerRef = useRef(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let scanner = null;
    let stopped = false;

    const safeStop = async () => {
      stopped = true;
      if (!scanner) return;
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { scanner.clear(); } catch { /* fine */ }
    };

    const handleResult = (text) => {
      if (stopped) return;
      safeStop().then(() => onResult?.(text));
    };

    // Wait one frame so the modal animation finishes and the container
    // has real dimensions, then start. Without this, html5-qrcode can
    // silently fail to bind on a 0×0 element on some browsers.
    const raf = requestAnimationFrame(async () => {
      try {
        scanner = new Html5Qrcode(id, { verbose: false });
        // html5-qrcode validates `facingMode` as either a string or an
        // object with an `exact` key — `{ ideal: ... }` is rejected with
        // 'should be string or object with exact as key'. Plain string
        // is the most compatible form and is what we used originally.
        const constraints = { facingMode: "environment" };
        const config = {
          fps: 10,
          // qrbox proportional to container instead of fixed 240px — works
          // on phones, tablets, and desktops without cropping the corners.
          qrbox: (w, h) => {
            const side = Math.floor(Math.min(w, h) * 0.7);
            return { width: side, height: side };
          },
          aspectRatio: 1,
          disableFlip: false,
        };
        await scanner.start(constraints, config, handleResult, () => {
          // per-frame decode failures are normal; ignored
        });
        if (!stopped) setStarting(false);
      } catch (e) {
        const msg = e?.message || e?.toString() || "Unable to access camera.";
        // Most common: NotAllowedError (perm denied) or NotFoundError (no camera).
        const friendly =
          /NotAllowed|Permission/i.test(msg) ? "Camera permission denied. Enable it in your browser/app settings and try again."
          : /NotFound|no.*camera/i.test(msg) ? "No camera detected on this device."
          : /NotReadable|in use|busy/i.test(msg) ? "Camera is in use by another app. Close it and try again."
          : msg;
        onError?.(friendly);
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      safeStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      {/* aspect-square + min-h guarantees real layout dims before scanner attaches */}
      <div
        ref={containerRef}
        id={id}
        className="relative w-full aspect-square min-h-[280px] overflow-hidden rounded-xl bg-black"
      />
      {starting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/80">
          Starting camera…
        </div>
      )}
      {/* Crosshair overlay so the plumber knows where to aim. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[70%] w-[70%] max-w-[280px] max-h-[280px]">
          <div className="absolute left-0 top-0 h-5 w-5 border-l-4 border-t-4 border-emerald-400 rounded-tl" />
          <div className="absolute right-0 top-0 h-5 w-5 border-r-4 border-t-4 border-emerald-400 rounded-tr" />
          <div className="absolute left-0 bottom-0 h-5 w-5 border-l-4 border-b-4 border-emerald-400 rounded-bl" />
          <div className="absolute right-0 bottom-0 h-5 w-5 border-r-4 border-b-4 border-emerald-400 rounded-br" />
        </div>
      </div>
    </div>
  );
}
