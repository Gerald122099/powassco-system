import mongoose from "mongoose";

export const ASSET_CATEGORIES = [
  "Computer",
  "Laptop",
  "System Unit",
  "Monitor",
  "Printer / Scanner",
  "Cellphone",
  "Tablet",
  "Networking (router/switch)",
  "UPS / AVR",
  "Furniture / Fixture",
  "Other",
];

const AuditEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    present: { type: Boolean, default: true },
    condition: { type: String, default: "good" }, // good / fair / poor / damaged
    notes: { type: String, default: "" },
    auditedBy: { type: String, default: "" },
  },
  { _id: false }
);

const AssetSchema = new mongoose.Schema(
  {
    assetTag: { type: String, trim: true, index: true }, // e.g. PW-ASSET-0001
    category: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: "", trim: true },
    model: { type: String, default: "", trim: true },
    serialNumber: { type: String, default: "", trim: true, index: true },
    specs: { type: String, default: "", trim: true }, // full specifications

    assignedTo: { type: String, default: "", trim: true }, // person/role using it
    location: { type: String, default: "", trim: true },

    status: { type: String, enum: ["in_use", "in_storage", "for_repair", "disposed"], default: "in_use", index: true },
    condition: { type: String, enum: ["good", "fair", "poor", "damaged"], default: "good" },

    acquisitionDate: { type: Date },
    value: { type: Number, default: 0 },
    notes: { type: String, default: "" },

    // 6-month audit cycle
    lastAuditedAt: { type: Date },
    nextAuditDue: { type: Date },
    auditHistory: { type: [AuditEntrySchema], default: [] },
  },
  { timestamps: true }
);

AssetSchema.index({ name: "text", brand: "text", model: "text", serialNumber: "text", assignedTo: "text" });

export default mongoose.model("Asset", AssetSchema);
