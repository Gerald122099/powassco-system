import { useEffect, useId } from "react";
import { Html5Qrcode } from "html5-qrcode";

// Renders a live camera QR scanner. Calls onResult(decodedText) once on the
// first successful decode, then stops the camera. Cleans up on unmount.
export default function QRScannerView({ onResult, onError }) {
  const rawId = useId();
  const id = `qr-reader-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    const scanner = new Html5Qrcode(id);
    let stopped = false;

    const stop = () => {
      stopped = true;
      return scanner.stop().catch(() => {});
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (stopped) return;
          stop().then(() => onResult?.(decodedText));
        },
        () => {} // per-frame decode failures are normal; ignore
      )
      .catch((e) => onError?.(e?.message || "Unable to access camera. Check permissions."));

    return () => {
      stopped = true;
      scanner.stop().catch(() => {});
      try {
        scanner.clear();
      } catch {
        /* already stopped */
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div id={id} className="w-full overflow-hidden rounded-xl bg-black" />;
}
