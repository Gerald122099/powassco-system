// Env-var first, DB fallback. Production keys belong in the host's environment
// (Render env vars) per security best-practice; the DB values let admins
// configure sandbox/test from the UI without redeploys.

const ENV = {
  paymongoSecretKey: "PAYMONGO_SECRET_KEY",
  paymongoPublicKey: "PAYMONGO_PUBLIC_KEY",
  paymongoWebhookSecret: "PAYMONGO_WEBHOOK_SECRET",
  xenditApiKey: "XENDIT_API_KEY",
  xenditCallbackToken: "XENDIT_CALLBACK_TOKEN",
};

export function envOverrides() {
  const out = {};
  for (const k of Object.keys(ENV)) out[k] = !!process.env[ENV[k]];
  return out;
}

export function pspCreds(settingsDoc) {
  const s = settingsDoc || {};
  return {
    mode: s.mode || "manual",
    pspActive: !!s.pspActive,
    paymongoSecretKey: process.env[ENV.paymongoSecretKey] || s.paymongoSecretKey || "",
    paymongoPublicKey: process.env[ENV.paymongoPublicKey] || s.paymongoPublicKey || "",
    paymongoWebhookSecret: process.env[ENV.paymongoWebhookSecret] || s.paymongoWebhookSecret || "",
    xenditApiKey: process.env[ENV.xenditApiKey] || s.xenditApiKey || "",
    xenditCallbackToken: process.env[ENV.xenditCallbackToken] || s.xenditCallbackToken || "",
  };
}
