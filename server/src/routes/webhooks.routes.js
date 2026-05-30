// PSP webhook receivers. Signature/token verified per provider, then the
// shared postOnlinePayment posts the payment idempotently (so duplicate
// webhook deliveries can't double-post). Public — no auth.

import express from "express";
import PaymentSettings from "../models/PaymentSettings.js";
import OnlinePayment from "../models/OnlinePayment.js";
import { verifyPaymongoSignature, verifyXenditCallback } from "../utils/paymentProviders.js";
import { postOnlinePayment } from "../utils/postOnlinePayment.js";

const router = express.Router();

async function getSettings() {
  let s = await PaymentSettings.findOne();
  if (!s) s = await PaymentSettings.create({});
  return s;
}

// ---- PayMongo ----
router.post("/paymongo", async (req, res) => {
  try {
    const s = await getSettings();
    const sigHeader = req.headers["paymongo-signature"] || req.headers["Paymongo-Signature"];
    const ok = verifyPaymongoSignature(req.rawBody, sigHeader, s.paymongoWebhookSecret);
    if (!ok) return res.status(401).send("bad signature");

    const event = req.body?.data?.attributes;
    const type = event?.type || "";
    // Both checkout-session and direct payment paid events confirm.
    const isPaid = /payment\.paid$/.test(type) || /checkout_session\.payment\.paid$/.test(type);
    if (!isPaid) return res.json({ ok: true, ignored: type });

    // The originating checkout-session id (matches our stored providerRef).
    const sessionId =
      event?.data?.attributes?.checkout_session_id ||
      event?.data?.attributes?.checkout_session?.id ||
      event?.data?.id; // for checkout_session.payment.paid the data.id is the session
    if (!sessionId) return res.status(400).send("no session id in event");

    const op = await OnlinePayment.findOne({ providerRef: sessionId, provider: "paymongo" });
    if (!op) return res.json({ ok: true, missing: true });

    const orNo = `PM-${String(sessionId).slice(-12).toUpperCase()}`;
    await postOnlinePayment(op, { orNo, receivedBy: "paymongo" });
    res.json({ ok: true });
  } catch (e) {
    // 200 still — PSPs retry on non-2xx; we logged and return ok to avoid loops on logic errors.
    console.error("PayMongo webhook error:", e?.message);
    res.json({ ok: false, error: e?.message });
  }
});

// ---- Xendit ----
router.post("/xendit", async (req, res) => {
  try {
    const s = await getSettings();
    const ok = verifyXenditCallback(req.headers["x-callback-token"], s.xenditCallbackToken);
    if (!ok) return res.status(401).send("bad token");

    const inv = req.body || {};
    const status = String(inv.status || "").toUpperCase();
    if (status !== "PAID" && status !== "SETTLED") return res.json({ ok: true, ignored: status });

    const op = await OnlinePayment.findOne({ providerRef: inv.id, provider: "xendit" });
    if (!op) return res.json({ ok: true, missing: true });

    const orNo = `XN-${String(inv.id).slice(-12).toUpperCase()}`;
    await postOnlinePayment(op, { orNo, receivedBy: "xendit" });
    res.json({ ok: true });
  } catch (e) {
    console.error("Xendit webhook error:", e?.message);
    res.json({ ok: false, error: e?.message });
  }
});

export default router;
