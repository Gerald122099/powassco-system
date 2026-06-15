# POWASSCO Staff — Desktop App (Electron)

A dedicated **desktop application** for employees. It opens the staff side
of the system in its own window — **not the browser** — and lands directly
on **`/employee-login`**. After login, staff use their normal dashboard
(admin / cashier / bookkeeper / etc.) inside the app. Reuses the existing
React app, so there's no separate UI to maintain.

It lives in `desktop/` and loads the **live site** (`https://powassco.site`),
so it always shows the current version — no reinstall when the web app
updates. Same-origin pages stay inside the app; any link to another site
opens in the real browser.

> The web app already cooperates: `DesktopBoot` (in the deployed site)
> detects the desktop shell and keeps it on `/employee-login` instead of the
> public homepage, including after logout.

---

## Run it (development)
```bash
cd desktop
npm install            # first time (downloads Electron)
npm start              # opens the production site at /employee-login

# point it at your local dev server instead:
npm run start:local    # uses http://localhost:5173
```
Set any other target with the `POWASSCO_DESKTOP_URL` env var.

---

## Build the installer (.exe)
```bash
cd desktop
npm run build:win      # Windows installer (NSIS) → desktop/dist/
# or: npm run build    # current platform (mac = .dmg, linux = .AppImage)
```
The signed/packaged installer lands in `desktop/dist/`. Distribute that
`.exe` to staff PCs. (For code-signing the Windows installer, add a cert in
the `build.win` block of `desktop/package.json` — optional but removes the
SmartScreen "unknown publisher" warning.)

---

## How the "no browser / login-only" behavior works
- **`desktop/main.js`** creates the window and loads `${APP_URL}/employee-login`.
  External-origin links/navigations are sent to the system browser so the
  window never becomes a generic browser.
- **`desktop/preload.js`** exposes `window.__IS_DESKTOP__ = true`.
- **`client/src/components/DesktopBoot.jsx`** (in the web app) watches the
  route; in the desktop shell it redirects `/` → `/employee-login` (covers
  first launch and post-logout), so employees only ever see the login +
  their dashboard.

---

## Notes
- **Always current:** because it loads the live site, a web deploy updates
  the desktop app instantly — you only rebuild the `.exe` if you change the
  Electron shell itself (window size, menu, target URL).
- **Target URL:** defaults to `https://powassco.site`. If your staff client
  is hosted elsewhere, change `APP_URL` in `desktop/main.js` (or set
  `POWASSCO_DESKTOP_URL` at build time).
- **Offline:** this shell needs the site reachable (staff work online). If
  you ever want a fully bundled offline build, it can load `client/dist`
  instead — ask and I'll switch it.
- Build output (`desktop/dist/`) and `node_modules` are gitignored.
