# POWASSCO Member — Native Android App (Capacitor)

The member app is the existing React app packaged as a **real native
Android app** with Capacitor: its own icon + splash, an installable/signed
`.apk`, Play-Store ready, optional native push (FCM). **One codebase** —
no separate UI to maintain. The app opens straight to the member home
(`/app`) and talks to the production API.

> The repo already has Capacitor wired up (deps, `capacitor.config.json`,
> native boot that lands on `/app`, CORS origins for the app). **The
> production API base (`client/.env.capacitor`) and the app icon + splash
> sources (`client/resources/icon.png`, `splash.png`) are already committed**
> — so steps A.1 and B below are pre-done. What's left is generating the
> Android project and building the `.apk` on **Android Studio** (it can't be
> built from the web code alone — needs the Android SDK + JDK).
>
> **Turnkey build (everything pre-staged):**
> ```bash
> cd client
> npm run app:add-android                   # first time only
> npx @capacitor/assets generate --android  # brands icon + splash from resources/
> npm run app:sync                          # build web (prod API) + copy in
> npm run app:open                          # → Android Studio → Build APK
> ```

---

## Prerequisites (one time)
- **Android Studio** (latest) + a JDK 17 (Android Studio bundles one).
- Node 18+ (you already have it).

---

## A. Build the app

All commands run inside `client/`.

```bash
cd client

# 1. Point the app at the PRODUCTION API (baked into the build).
#    DONE — client/.env.capacitor (a dedicated build mode) already holds:
#    VITE_API_BASE=https://powassco-system.onrender.com/api
#    (separate from the website build, which is unaffected.)

# 2. Create the native Android project (first time only).
npm run app:add-android      # = npx cap add android

# 3. Build the web app (capacitor mode → prod API) and copy it in.
npm run app:sync             # = vite build --mode capacitor && npx cap sync android

# 4. Open it in Android Studio.
npm run app:open             # = npx cap open android
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
The debug `.apk` lands in `android/app/build/outputs/apk/debug/`. For a
distributable build, create a **signed** release APK:
**Build → Generate Signed Bundle / APK → APK**, create/choose a keystore
(keep it safe — the same key is required for every future update).

After any web/UI change later, just re-run `npm run app:sync` and rebuild
in Android Studio — no code changes needed.

---

## B. App identity (icon, name, colors)
- **App ID / name**: already set in `capacitor.config.json`
  (`site.powassco.member` / "POWASSCO Member").
- **Icon + splash**: already provided — `client/resources/icon.png`
  (1024×1024) and `splash.png` (2732×2732), the POWASSCO logo centered on
  brand green with adaptive-icon safe-zone padding. After `app:add-android`,
  generate the Android densities from them:
  ```bash
  npx @capacitor/assets generate --android
  npm run app:sync
  ```
  (To restyle, replace those two PNGs and re-run the generate command.)
- **Theme color** is POWASSCO green (`#166534`), set in the config.

---

## C. Host the APK for download
Put the signed apk where the site already links it:
```
client/public/downloads/powassco-member.apk
```
The homepage install banner and the `/app` page already link to
`/downloads/powassco-member.apk`. (Large binaries are better attached to a
GitHub Release — if you do that, point those two links at the release URL.)

Or publish to **Google Play** (recommended for auto-updates and trust):
upload the signed **App Bundle** (`.aab`) in Play Console.

---

## D. Native push (FCM) — scaffolded, needs Firebase to activate
Native FCM push is **fully wired in code** and inert until you add a
Firebase project. What's already done:

- **Client**: `@capacitor/push-notifications` is installed; `lib/nativePush.js`
  registers the device's FCM token and uploads the saved handles. The
  existing reminder toggle (`lib/pushClient.js`) automatically routes to
  FCM on the native app and Web Push on the website — no caller changes.
- **Server**: `models/FcmToken.js` + `utils/fcm.js` (lazy-loads
  `firebase-admin`, safe no-op until configured) + public endpoints
  `POST /api/public/push/fcm-subscribe` / `fcm-update-items` /
  `fcm-unsubscribe`. The reminder + announcement fan-out (`utils/push.js`)
  already calls the FCM channel alongside Web Push.

**To turn it on (one time):**
1. **Firebase** → create a project → add an Android app with package
   `site.powassco.member` → download **`google-services.json`** into
   `client/android/app/` (after `npm run app:add-android`).
2. **Server SDK**: in `server/`, `npm i firebase-admin`.
3. **Server creds** (Render → Environment): set **`FIREBASE_SERVICE_ACCOUNT`**
   to the service-account JSON (Project Settings → Service accounts →
   Generate new private key), as a single-line string. Redeploy.
4. Rebuild the APK (`npm run app:sync` → Android Studio). Done — native
   devices now get the same reminders/announcements as the web.

Until step 1–3 are complete, `fcmEnabled()` is false and the FCM fan-out
is a no-op; **Web Push keeps working** the whole time.

---

## Notes
- **CORS**: the API already allows the app's WebView origins
  (`https://localhost`, `capacitor://localhost`) — see `server/src/index.js`.
- **API base**: the app calls whatever `VITE_API_BASE` you built with
  (step A.1). Build with the production API, not localhost.
- **iOS**: the same project supports iOS (`npx cap add ios`) but needs a Mac
  + Xcode + an Apple Developer account to build/ship.
