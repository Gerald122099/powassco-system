// Exposes a flag the web app reads to know it's running inside the
// desktop shell (see client/src/lib/desktop.js). contextIsolation is on,
// so this is the safe bridge into the page.
const { contextBridge } = require("electron");
try {
  contextBridge.exposeInMainWorld("__IS_DESKTOP__", true);
} catch {
  /* contextBridge unavailable — the UA "Electron" check still works */
}
