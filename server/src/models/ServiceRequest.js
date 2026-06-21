import mongoose from "mongoose";

const ServiceRequestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["new_connection", "reconnection", "concern"], required: true, index: true },
    status: { type: String, enum: ["pending", "in_progress", "resolved"], default: "pending", index: true },

    // Contact (required for all)
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true },

    // New connection
    address: { type: String, default: "", trim: true },
    installationType: { type: String, default: "", trim: true }, // residential / commercial / etc.

    // Reconnection / concern (account number optional for concerns)
    accountNumber: { type: String, default: "", trim: true },
    meterNumber: { type: String, default: "", trim: true },

    // Concern / feedback: the chosen category (Billing, No water, Reconnection, …)
    concernType: { type: String, default: "", trim: true },

    message: { type: String, default: "", trim: true },

    // Spam guard: identical open requests are blocked.
    dedupeKey: { type: String, index: true },

    adminNotes: { type: String, default: "" },
    handledBy: { type: String, default: "" },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

ServiceRequestSchema.index({ createdAt: -1 });

export default mongoose.model("ServiceRequest", ServiceRequestSchema);
