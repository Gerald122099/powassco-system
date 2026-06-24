// POWASSCO Staff — desktop app (Electron shell).
//
// Opens the staff side of the web app in its OWN window (never the system
// browser) and lands directly on /employee-login. Same-origin navigation
// stays inside the app; links to other sites open in the real browser.
//
// By default it loads the production site. For local dev, set:
//   POWASSCO_DESKTOP_URL=http://localhost:5173
const { app, BrowserWindow, shell, Menu, ipcMain } = require("electron");
const path = require("path");

// ── Silent printing (no OS print dialog) ──────────────────────────────────
// The renderer (web app) sends a full HTML document; we render it in a hidden
// window and print it directly to the chosen (or default) printer. This is the
// "auto-print, no pop-up" path the cashier wants — only possible in the desktop
// app (browsers always show a print dialog).
ipcMain.handle("pow:list-printers", async () => {
  try {
    const wc = (mainWindow && mainWindow.webContents) || null;
    const printers = wc ? await wc.getPrintersAsync() : [];
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault, status: p.status }));
  } catch { return []; }
});

ipcMain.handle("pow:print-silent", async (_e, payload = {}) => {
  const { html = "", deviceName = "" } = payload;
  return await new Promise((resolve) => {
    let win = new BrowserWindow({ show: false, webPreferences: { offscreen: false, sandbox: true } });
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      try { if (win && !win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
      win = null;
      resolve({ ok, error: error || "" });
    };
    win.webContents.once("did-finish-load", () => {
      // Let images/QR render before printing.
      setTimeout(() => {
        const opts = { silent: true, printBackground: true, margins: { marginType: "none" } };
        if (deviceName) opts.deviceName = deviceName;
        try {
          win.webContents.print(opts, (success, failureReason) => finish(success, success ? "" : failureReason));
        } catch (e) { finish(false, e.message); }
      }, 300);
    });
    win.webContents.once("did-fail-load", (_ev, _code, desc) => finish(false, desc || "load failed"));
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html)).catch((e) => finish(false, e.message));
    setTimeout(() => finish(false, "print timeout"), 20000);
  });
});

const APP_URL = (process.env.POWASSCO_DESKTOP_URL || "https://powassco.site").replace(/\/+$/, "");
const START_PATH = "/employee-login";
const APP_ORIGIN = (() => { try { return new URL(APP_URL).origin; } catch { return APP_URL; } })();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 640,
    title: "POWASSCO Staff",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // No remote module; the renderer is just the web app.
    },
  });

  // Minimal menu (keep Reload / DevTools / Quit; drop the default browser-y menu).
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "App", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] },
  ]));

  mainWindow.loadURL(`${APP_URL}${START_PATH}`);

  // window.open / target=_blank → keep app links in-app, send the rest to the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Print/preview windows are opened with window.open("", "_blank") which
    // resolves to about:blank (or empty). ALLOW these so the in-app print
    // dialog works — otherwise Electron hands "about:" to the OS shell and
    // Windows shows "We can't open this 'about' link".
    if (!url || url === "about:blank" || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) {
      return { action: "allow" };
    }
    try {
      if (new URL(url).origin === APP_ORIGIN) return { action: "allow" };
    } catch { /* fall through */ }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // A full navigation that leaves our origin opens in the real browser
  // instead of turning this window into a generic browser. about:/blob:/data:
  // (print windows) are left alone.
  mainWindow.webContents.on("will-navigate", (e, url) => {
    try {
      if (/^(about:|blob:|data:)/.test(url)) return;
      if (new URL(url).origin !== APP_ORIGIN) {
        e.preventDefault();
        shell.openExternal(url);
      }
    } catch { /* ignore */ }
  });
}

// One running instance only.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
