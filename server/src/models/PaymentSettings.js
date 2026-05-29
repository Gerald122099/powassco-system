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
    xenditApiKey: { type: String, default: "" },
    pspActive: { type: Boolean, default: false }, // admin must explicitly activate realtime

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("PaymentSettings", PaymentSettingsSchema);
