# Building the POWASSCO Member Android App (.apk)

The member app is the existing website wrapped as a **TWA** (Trusted Web
Activity) — a thin native Android shell that opens `https://powassco.site/app`
full-screen, with web push working inside it. No separate codebase.

There is already a working TWA for the staff/field app
(`package_name: site.powassco.twa`, fingerprint committed in
`client/public/.well-known/assetlinks.json`). The **member** app is a
second TWA with its own package, `site.powassco.member`, opening `/app`.

---

## What's already wired in the repo

- **`/app`** — the member home route (My Bills, My Balance, reminders, app PIN).
- **`client/public/member.webmanifest`** — the manifest the member TWA is built from (`start_url: /app`, name "POWASSCO Member"). Served at `https://powassco.site/member.webmanifest`.
- **`client/public/.well-known/assetlinks.json`** — Digital Asset Links. It already lists the staff TWA; the member entry has a **placeholder fingerprint** you replace after building (step 4).
- Icons/screenshots (`icon-192/512`, `icon-maskable-*`, `screenshot-*`) are already in `client/public/`.

---

## One-time build steps (≈10 minutes)

### 1. Open PWABuilder
Go to **https://www.pwabuilder.com** and enter:

```
https://powassco.site/member.webmanifest
```

(You can also enter `https://powassco.site/app` and pick the member manifest if prompted.)

### 2. Package for Android
- Click **Package For Stores → Android**.
- Choose **"Signed APK"** (not just the app bundle) so you get an installable `.apk` for direct download.
- Set:
  - **Package ID / App ID:** `site.powassco.member`
  - **App name:** `POWASSCO Member`
  - **Launcher name:** `POWASSCO`
  - **Start URL:** `/app`
  - **Host:** `powassco.site`
- Let PWABuilder **generate a new signing key** (download and keep the `signing.keystore` + the password file it gives you — you need the SAME key for every future update).

### 3. Download the package
PWABuilder returns a zip with `app-release-signed.apk` and a
`assetlinks.json` snippet that contains your app's **SHA-256 fingerprint**.

### 4. Install the fingerprint (makes the app open without a browser bar)
Open the `assetlinks.json` PWABuilder gave you, copy the
`sha256_cert_fingerprints` value for `site.powassco.member`, and paste it
over `REPLACE_WITH_MEMBER_APK_SIGNING_SHA256_FINGERPRINT` in:

```
client/public/.well-known/assetlinks.json
```

Commit + deploy so it's live at
`https://powassco.site/.well-known/assetlinks.json`. (Without this, the app
still works but shows a URL bar.)

### 5. Host the APK for download
Put the signed apk in the client's public folder so it deploys with the site:

```
client/public/downloads/powassco-member.apk
```

The member app page (`/app`) and the homepage install banner already link to
`/downloads/powassco-member.apk`. (Alternatively, attach the apk to a GitHub
Release and point those links there — large binaries are better off out of git.)

---

## How members install it
- On the homepage or **My App** page, tap **Download the Android app (.apk)**.
- Android may ask to allow installing from the browser/Files (Settings → Apps →
  Special access → Install unknown apps) — allow once, then tap the apk.
- The app opens straight to **My POWASSCO**. They save their account in **My Bills**,
  turn on **reminders**, and (optionally) set an **app PIN**.

> iPhone: Apple doesn't allow side-loaded apks. iPhone members use the website
> (Safari → Share → Add to Home Screen) — it behaves like an app, but Apple
> restricts web push, so reminders are Android-only for now.

---

## Updating the app later
Code/UI changes ship with the website automatically — the TWA always loads the
live site, so members get updates with no reinstall. You only rebuild the apk
when you change the manifest, icons, or package identity. Always sign updates
with the **same keystore** from step 2.
