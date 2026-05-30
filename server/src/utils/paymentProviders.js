// Adapters for PayMongo (Checkout Sessions) and Xendit (Invoices).
// These activate ONLY when admin saves valid keys and toggles "Activate realtime"
// in Payment Settings. Until then, manual QR + officer verify is the working mode.

import crypto from "crypto";

const PESO = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- PayMongo ----------
// https://developers.paymongo.com/docs/checkout-sessions
export async function createPaymongoCheckout({ secretKey, amountPhp, description, referenceNumber, successUrl }) {
  if (!secretKey) throw new Error("PayMongo secret key not configured.");
  const auth = "Basic " + Buffer.from(secretKey + ":").toString("base64");
  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: description, amount: Math.round(PESO(amountPhp) * 100), currency: "PHP", quantity: 1 }],
          payment_method_types: ["gcash", "paymaya", "qrph", "card"],
          reference_number: referenceNumber,
          success_url: successUrl,
          cancel_url: successUrl,
        },
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail || `PayMongo error (${res.status})`;
    throw new Error(msg);
  }
  return { url: json.data.attributes.checkout_url, providerRef: json.data.id };
}

// PayMongo signs webhooks: Paymongo-Signature: t=<ts>,te=<sig>,li=<live_sig>
// Compute HMAC-SHA256("t" + "." + rawBody) with the webhook secret.
export function verifyPaymongoSignature(rawBody, header, secret) {
  if (!secret || !header || !rawBody) return false;
  const parts = String(header).split(",").reduce((acc, kv) => {
    const [k, v] = kv.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const ts = parts.t;
  const expected = parts.te || parts.li;
  if (!ts || !expected) return false;
  const payload = `${ts}.${rawBody.toString("utf8")}`;
  const calc = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(calc, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ---------- Xendit ----------
// https://developers.xendit.co/api-reference/#create-invoice
export async function createXenditInvoice({ apiKey, amountPhp, description, externalId, successUrl }) {
  if (!apiKey) throw new Error("Xendit API key not configured.");
  const auth = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  const res = await fetch("https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      external_id: externalId,
      amount: Math.round(PESO(amountPhp)),
      description,
      currency: "PHP",
      success_redirect_url: successUrl,
      failure_redirect_url: successUrl,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || `Xendit error (${res.status})`;
    throw new Error(msg);
  }
  return { url: json.invoice_url, providerRef: json.id };
}

// Xendit sends a shared token in the X-CALLBACK-TOKEN header on every webhook.
export function verifyXenditCallback(headerToken, configuredToken) {
  if (!configuredToken || !headerToken) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(String(headerToken)), Buffer.from(String(configuredToken)));
  } catch {
    return false;
  }
}
