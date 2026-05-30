// PSP webhook receivers. Per the production checklist:
// • Idempotent posting (postOnlinePayment is a no-op on repeat callbacks).
// • Token / HMAC verification on every delivery.
// • Raw payloads + verification result logged to a separate audit collection
//   (WebhookEvent) for compliance traceability.
// • Credentials read env-first (production keys live in the host environment).

import express from "express";
import PaymentSettings from "../models/PaymentSettings.js";
import OnlinePayment from "../models/OnlinePayment.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { verifyPaymongoSignature, verifyXenditCallback } from "../utils/paymentProviders.js";
import { postOnlinePayment } from "../utils/postOnlinePayment.js";
import { pspCreds } from "../utils/pspCreds.js";

const router = express.Router();

async function getSettings() {
  let s = await PaymentSettings.findOne();
  if (!s) s = await PaymentSettings.create({});
  return s;
}
const clientIp = (req) => (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim();

async function logEvent(entry) {
  try { await WebhookEvent.create(entry); } catch (_) { /* never block webhook on audit */ }
}

// ---- PayMongo ----
router.post("/paymongo", async (req, res) => {
  const sigHeader = String(req.headers["paymongo-signature"] || req.headers["Paymongo-Signature"] || "");
  const raw = (req.rawBody && req.rawBody.toString("utf8")) || JSON.stringify(req.body || {});
  let eventType = "";
  let providerRef = "";
  try {
    const s = await getSettings();
    const creds = pspCreds(s);
    const sigOk = verifyPaymongoSignature(req.rawBody, sigHeader, creds.paymongoWebhookSecret);
    const event = req.body?.data?.attributes;
    eventType = event?.type || "";
    providerRef =
      event?.data?.attributes?.checkout_session_id ||
      event?.data?.attributes?.checkout_session?.id ||
      event?.data?.id || "";

    if (!sigOk) {
      await logEvent({ provider: "paymongo", eventType, providerRef, signatureValid: false, signatureHeader: sigHeader, rawPayload: raw, result: "bad_signature", ip: clientIp(req) });
      return res.status(401).send("bad signature");
    }

    const isPaid = /payment\.paid$/.test(eventType) || /checkout_session\.payment\.paid$/.test(eventType);
    if (!isPaid) {
      await logEvent({ provider: "paymongo", eventType, providerRef, signatureValid: true, signatureHeader: sigHeader, rawPayload: raw, result: "ignored", ip: clientIp(req) });
      return res.json({ ok: true, ignored: eventType });
    }

    const op = await OnlinePayment.findOne({ providerRef, provider: "paymongo" });
    if (!op) {
      await logEvent({ provider: "paymongo", eventType, providerRef, signatureValid: true, signatureHeader: sigHeader, rawPayload: raw, result: "missing", ip: clientIp(req) });
      return res.json({ ok: true, missing: true });
    }

    const wasVerified = op.status === "verified";
    const orNo = op.orNo || `PM-${String(providerRef).slice(-12).toUpperCase()}`;
    await postOnlinePayment(op, { orNo, receivedBy: "paymongo" });
    await logEvent({
      provider: "paymongo", eventType, providerRef, signatureValid: true, signatureHeader: sigHeader, rawPayload: raw,
      parsedSummary: { providerRef, eventType }, result: wasVerified ? "duplicate" : "posted", ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (e) {
    await logEvent({ provider: "paymongo", eventType, providerRef, signatureValid: false, signatureHeader: sigHeader, rawPayload: raw, result: "error", errorMessage: e?.message || "", ip: clientIp(req) });
    console.error("PayMongo webhook error:", e?.message);
    res.json({ ok: false, error: e?.message });
  }
});

// ---- Xendit ----
router.post("/xendit", async (req, res) => {
  const tokenHeader = String(req.headers["x-callback-token"] || "");
  const raw = (req.rawBody && req.rawBody.toString("utf8")) || JSON.stringify(req.body || {});
  let providerRef = "";
  let status = "";
  try {
    const s = await getSettings();
    const creds = pspCreds(s);
    const tokenOk = verifyXenditCallback(tokenHeader, creds.xenditCallbackToken);
    const inv = req.body || {};
    providerRef = inv.id || "";
    status = String(inv.status || "").toUpperCase();

    if (!tokenOk) {
      await logEvent({ provider: "xendit", eventType: status, providerRef, signatureValid: false, signatureHeader: tokenHeader, rawPayload: raw, result: "bad_signature", ip: clientIp(req) });
      return res.status(401).send("bad token");
    }

    if (status !== "PAID" && status !== "SETTLED") {
      await logEvent({ provider: "xendit", eventType: status, providerRef, signatureValid: true, signatureHeader: tokenHeader, rawPayload: raw, result: "ignored", ip: clientIp(req) });
      return res.json({ ok: true, ignored: status });
    }

    const op = await OnlinePayment.findOne({ providerRef, provider: "xendit" });
    if (!op) {
      await logEvent({ provider: "xendit", eventType: status, providerRef, signatureValid: true, signatureHeader: tokenHeader, rawPayload: raw, result: "missing", ip: clientIp(req) });
      return res.json({ ok: true, missing: true });
    }

    const wasVerified = op.status === "verified";
    const orNo = op.orNo || `XN-${String(providerRef).slice(-12).toUpperCase()}`;
    await postOnlinePayment(op, { orNo, receivedBy: "xendit" });
    await logEvent({
      provider: "xendit", eventType: status, providerRef, signatureValid: true, signatureHeader: tokenHeader, rawPayload: raw,
      parsedSummary: { providerRef, amount: inv.amount, paid_amount: inv.paid_amount }, result: wasVerified ? "duplicate" : "posted", ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (e) {
    await logEvent({ provider: "xendit", eventType: status, providerRef, signatureValid: false, signatureHeader: tokenHeader, rawPayload: raw, result: "error", errorMessage: e?.message || "", ip: clientIp(req) });
    console.error("Xendit webhook error:", e?.message);
    res.json({ ok: false, error: e?.message });
  }
});

export default router;
