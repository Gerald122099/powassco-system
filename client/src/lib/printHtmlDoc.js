// Print an arbitrary HTML document.
//
//  • Desktop app (Electron): prints SILENTLY (no OS dialog) to the chosen
//    printer — empty device = the Windows default printer. This is the
//    "auto-print, no pop-up" path. Falls back to the iframe dialog if the
//    silent print fails.
//  • Browser: prints via a hidden iframe (Chrome/Edge always show the print
//    dialog — they don't allow silent printing for security).
//
// `html` must be a full document string (<!doctype html>…</html>).

function printViaIframe(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  let done = false;
  const doPrint = () => {
    if (done) return;
    done = true;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 2000);
  };
  iframe.onload = doPrint;

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  // Safety net if onload doesn't fire after document.write on some engines.
  setTimeout(doPrint, 500);
}

// The desktop bridge (preload.js) exposes window.powassco.printSilent.
function silentPrinter() {
  const api = typeof window !== "undefined" ? window.powassco : null;
  return api && typeof api.printSilent === "function" ? api : null;
}

// opts.paper: "58mm" prints at the thermal roll width in the desktop app.
export function printHtmlDoc(html, opts = {}) {
  const api = silentPrinter();
  if (api) {
    let deviceName = "";
    try { deviceName = localStorage.getItem("pow_print_device") || ""; } catch { /* ignore */ }
    api.printSilent(html, deviceName, opts.paper || "")
      .then((res) => { if (!res || !res.ok) printViaIframe(html); }) // silent failed → show dialog
      .catch(() => printViaIframe(html));
    return;
  }
  printViaIframe(html);
}

export function silentPrintAvailable() {
  return !!silentPrinter();
}
