// Public push-subscription endpoints. No authentication — these are
// for public visitors saving their meter/PN/loan on the device. The
// subscription endpoint is itself the secret (Chrome / FCM tie it to
// the device key pair) so even if you knew someone's PN you couldn't
// inject a fake subscription that would push to their phone.

import express from "express";
import PushSubscription from "../../models/PushSubscription.js";
import { pushEnabled } from "../../utils/push.js";

const router = express.Router();

// VAPID public key — the client uses this to call PushManager.subscribe.
router.get("/vapid-key", (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || "";
  if (!key) return res.status(503).json({ message: "Push not configured on this server." });
  res.json({ publicKey: key });
});

// Idempotent: create or update by endpoint. items is the saved handles
// list the device wants reminders for.
router.post("/subscribe", async (req, res) => {
  try {
    const { subscription, items = [] } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: "Invalid subscription payload." });
    }
    const cleanItems = (Array.isArray(items) ? items : [])
      .filter((i) => i && i.kind && i.value)
      .map((i) => ({ kind: i.kind, value: String(i.value).toUpperCase().trim() }))
      .filter((i, idx, arr) => arr.findIndex((x) => x.kind === i.kind && x.value === i.value) === idx);

    const doc = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          items: cleanItems,
          userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
          lastSeenAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );
    res.status(201).json({ ok: true, id: doc._id, items: doc.items });
  } catch (e) {
    console.error("subscribe error:", e);
    res.status(500).json({ message: "Could not save subscription." });
  }
});

// Update the items list for an existing subscription (e.g. user saved
// a new meter on the inquiry page).
router.post("/update-items", async (req, res) => {
  const { endpoint, items = [] } = req.body || {};
  if (!endpoint) return res.status(400).json({ message: "endpoint required." });
  const cleanItems = items
    .filter((i) => i && i.kind && i.value)
    .map((i) => ({ kind: i.kind, value: String(i.value).toUpperCase().trim() }));
  const doc = await PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { items: cleanItems, lastSeenAt: new Date() } },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Subscription not found." });
  res.json({ ok: true, items: doc.items });
});

router.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ message: "endpoint required." });
  await PushSubscription.deleteOne({ endpoint });
  res.json({ ok: true });
});

// Status (for the client to know if pushes are enabled on this server).
router.get("/status", (req, res) => {
  res.json({ enabled: pushEnabled() });
});

export default router;
