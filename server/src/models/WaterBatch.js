// server/src/models/WaterBatch.js
import mongoose from "mongoose";

const WaterBatchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, required: true, unique: true }, // BATCH-001, BATCH-002
    batchName: { type: String, required: true }, // "North Area - Juan"
    readerName: { type: String, required: true },
    readerId: { type: String, required: true },
    area: { type: String, default: "" }, // Geographical area description
    members: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "WaterMember" 
    }],
    meterNumbers: [{ type: String }], // For quick lookup
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
    lastExportedAt: { type: Date },
    lastExportFile: { type: String }, // filename of last export
  },
  { timestamps: true }
);

// Ensure member is only in one active batch
WaterBatchSchema.index({ members: 1 }, { unique: true, sparse: true });

export default mongoose.model("WaterBatch", WaterBatchSchema);