// POWASSCO Staff — desktop app (Electron shell).
//
// Opens the staff side of the web app in its OWN window (never the system
// browser) and lands directly on /employee-login. Same-origin navigation
// stays inside the app; links to other sites open in the real browser.
//
// By default it loads the production site. For local dev, set:
//   POWASSCO_DESKTOP_URL=http://localhost:5173
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

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
    try {
      if (new URL(url).origin === APP_ORIGIN) return { action: "allow" };
    } catch { /* fall through */ }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // A full navigation that leaves our origin opens in the real browser
  // instead of turning this window into a generic browser.
  mainWindow.webContents.on("will-navigate", (e, url) => {
    try {
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
