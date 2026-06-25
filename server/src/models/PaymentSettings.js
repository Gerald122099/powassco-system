import mongoose from "mongoose";

// Singleton: payment mode + the cooperative's QR PH image + online fee.
const PaymentSettingsSchema = new mongoose.Schema(
  {
    // Master switch — admin can turn off all online payment (walk-in only).
    onlineEnabled: { type: Boolean, default: true },

    // Switchable: manual QR + verify, or a PSP for realtime auto-confirm.
    mode: { type: String, enum: ["manual", "paymongo", "xendit"], default: "manual" },

    // Manual mode
    qrImage: { type: String, default: "" }, // base64 coop QR PH (admin-uploaded/replaceable)
    onlineFee: { type: Number, default: 10 }, // flat ₱ shouldered by the payer
    payeeName: { type: String, default: "" }, // e.g. "POWASSCO MPC — GCash"
    instructions: { type: String, default: "" },

    // PSP credentials (used once the realtime integration is wired + activated)
    paymongoSecretKey: { type: String, default: "" },
    paymongoPublicKey: { type: String, default: "" },
    paymongoWebhookSecret: { type: String, default: "" }, // for HMAC verification of incoming events
    xenditApiKey: { type: String, default: "" },
    xenditCallbackToken: { type: String, default: "" }, // sent as X-CALLBACK-TOKEN on each event
    pspActive: { type: Boolean, default: false }, // admin must explicitly activate realtime

    // Receipt printing — system-wide (admin-set), synced to every terminal.
    //   "classic"   — original compact Courier receipt
    //   "dotmatrix" — embedded bitArray-A2 dot-matrix font, larger
    receiptStyle: { type: String, enum: ["classic", "dotmatrix"], default: "classic" },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("PaymentSettings", PaymentSettingsSchema);
