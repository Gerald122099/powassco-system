import mongoose from "mongoose";

// Singleton settings for the public store (manager / water officer managed).
// Currently just the store announcement shown on the Products page.
const StoreSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },
    announcement: { type: String, default: "" },
    announcementActive: { type: Boolean, default: false },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("StoreSettings", StoreSettingsSchema);
