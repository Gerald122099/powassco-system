import mongoose from "mongoose";

// Separate audit/compliance collection — every PSP webhook delivery is
// recorded here (raw payload + verification result + outcome), so duplicate
// callbacks, replays, or signature failures are traceable.
const WebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true }, // "paymongo" | "xendit"
    eventType: { type: String, default: "" },
    providerRef: { type: String, default: "", index: true },
    signatureValid: { type: Boolean, default: false },
    signatureHeader: { type: String, default: "" }, // the proof value as received
    rawPayload: { type: String, default: "" }, // exact bytes the gateway sent
    parsedSummary: { type: Object }, // a small extract (status, id, amount)
    result: { type: String, default: "" }, // posted | ignored | missing | error | bad_signature | duplicate
    errorMessage: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

WebhookEventSchema.index({ createdAt: -1 });

export default mongoose.model("WebhookEvent", WebhookEventSchema);
