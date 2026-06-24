// Bridges the desktop shell into the web app (contextIsolation is on, so this
// is the safe boundary). Exposes:
//   • __IS_DESKTOP__   — legacy flag the web app already reads.
//   • powassco.*       — silent printing (no OS dialog) + printer list.
const { contextBridge, ipcRenderer } = require("electron");

try {
  contextBridge.exposeInMainWorld("__IS_DESKTOP__", true);
} catch {
  /* contextBridge unavailable — the UA "Electron" check still works */
}

try {
  contextBridge.exposeInMainWorld("powassco", {
    isDesktop: true,
    // Print a full HTML document silently to `deviceName` (empty = Windows
    // default printer). `paper` "58mm" prints at the thermal roll width.
    // Returns { ok, error }.
    printSilent: (html, deviceName, paper) => ipcRenderer.invoke("pow:print-silent", { html, deviceName: deviceName || "", paper: paper || "" }),
    // List installed printers: [{ name, displayName, isDefault }].
    listPrinters: () => ipcRenderer.invoke("pow:list-printers"),
  });
} catch {
  /* older Electron without contextBridge — silent print simply won't be offered */
}
