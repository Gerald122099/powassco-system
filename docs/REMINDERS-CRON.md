# Reliable daily bill reminders (Render Cron)

The reminder job runs **in-process** on the API server: an hourly tick fires
the daily pass once per day at the configured local hour
(Admin → Water Settings → Bill Reminders → "Daily send time"). On an
**always-on** Render instance this is enough — nothing else is needed.

The catch: on Render's **free tier the service sleeps** when idle, so the
in-process timer can miss a day. To guarantee delivery, have an external
scheduler wake the endpoint once a day. The endpoint is idempotent (the
once-per-day claim + the per-bill `ReminderLog` mean a double call sends
nothing extra), so calling it more than once a day is safe.

## 1. Set a shared secret on the API service
Render → your **API** service → **Environment** → add:

```
CRON_SECRET = <a long random string>
```

(Without this, the cron endpoint returns 503 and refuses to run — it's the
only thing protecting the trigger, since it's unauthenticated.)

## 2. Create the Render Cron Job
Render → **New** → **Cron Job**:

- **Schedule:** `0 * * * *` (hourly — the server's own gate ensures the real
  pass still happens just once a day at your chosen send time). Or, if you
  prefer one shot, set it for ~your send hour in UTC, e.g. `0 0 * * *`
  (08:00 Manila = 00:00 UTC).
- **Command:**

```bash
curl -fsS -X POST https://<your-api-host>/api/admin/reminders/cron \
  -H "x-cron-secret: $CRON_SECRET"
```

(Set `CRON_SECRET` in the Cron Job's own environment to the same value.)

## Alternative: any uptime pinger
Anything that can send an authenticated POST works (UptimeRobot with a custom
header, GitHub Actions schedule, cron-job.org). Point it at:

```
POST https://<your-api-host>/api/admin/reminders/cron
Header: x-cron-secret: <CRON_SECRET>
```

## Admin controls (no secret needed — uses your login)
- **Preview (no send):** `GET /api/admin/reminders/preview`
- **Run now:** `POST /api/admin/reminders/run` with body `{ "dry": false }`
  These are also wired into Admin → Water Settings → Bill Reminders
  ("Preview now" / "Send now").

## What gets sent
One push per bill per day, most-urgent first: a new-bill notice, then
collection-day and due-date reminders, then a daily overdue reminder until
paid — which stops only when the meter is disconnected or the account is
suspended. Quiet days send nothing.
