# Real-time updates (Socket.IO + MongoDB change stream)

Staff screens update live: when data changes anywhere — a cashier posts a
payment, a webhook confirms an online payment, a field reader syncs, a
maintenance job runs — subscribed screens refresh on their own, no manual
reload.

## How it works
1. **One database change stream** (`server/src/realtime.js`,
   `startChangeStream`) watches every write via
   `mongoose.connection.watch()`. Because it's at the database level, it
   catches changes from *any* source — routes, webhooks, jobs, scripts.
2. Each changed collection maps to a **topic** (e.g. `waterpayments`,
   `loanpayments`, `onlinepayments` → `payments`; `waterbills` →
   `water-bills`; `loanapplications` → `loans`; `treasurytransactions` →
   `treasury`; …). The server emits a tiny `data:changed` ping to that
   topic's room. Emits are **debounced ~800ms per topic** so a bulk write
   (e.g. 50 bills) is one ping, not 50.
3. **No data travels over the socket** — only an invalidation ping. Clients
   refetch through the normal authenticated REST API, so there's no new
   data-exposure or auth surface.
4. **Auth**: the socket requires the same JWT as the API (`io.use`), so only
   signed-in staff receive live updates. Members rely on push + the existing
   periodic refresh.

## Add live updates to a screen (one line)
In any panel that already has a `load()` / refetch function:

```jsx
import { useRealtime } from "../lib/realtime"; // adjust path

useEffect(() => { load(); }, [load]);
useRealtime(["payments"], load);   // refetch whenever a payment posts
// multiple topics: useRealtime(["payments", "water-bills"], load)
```

Available topics: `payments`, `water-bills`, `readings`, `loans`,
`treasury`, `cbu`, `savings`, `payroll`, `expenses`, `members`, `requests`,
`adjustments`, `announcements`, `assets`, `meetings`.

Already wired: **Collection (today)** and **Transactions** feeds
(`payments`). Add `useRealtime(...)` to more panels as needed — the
infrastructure already broadcasts every topic.

## Requirements / notes
- **Replica set required** for change streams — MongoDB Atlas (what we use)
  is one, so it works in production. A standalone local `mongod` has no
  change streams; the layer logs a warning and simply disables live updates
  (everything still works, just no auto-refresh) — use Atlas locally or
  rely on manual refresh in dev.
- **Always-on server**: on Render's free tier the service sleeps and drops
  sockets; the client auto-reconnects when the server is awake. For
  uninterrupted live updates, run the API on an always-on (paid) instance.
- CORS for the socket reuses the REST allowlist (incl. Vercel previews).
