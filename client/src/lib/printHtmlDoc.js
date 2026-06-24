// Print an arbitrary HTML document via a hidden iframe.
//
// Works in the browser AND the Electron desktop app. The desktop app blocks
// window.open("", "_blank") (it resolves to about:blank, which Electron hands
// to the OS → "We can't open this 'about' link"), so any print path that used
// window.open should use this instead.
//
// `html` must be a full document string (<!doctype html>…</html>).
export function printHtmlDoc(html) {
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
