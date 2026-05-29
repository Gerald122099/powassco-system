import mongoose from "mongoose";

// Singleton auth/security settings controlled by admins.
const AuthSettingsSchema = new mongoose.Schema(
  {
    // When true, every active user must use 2FA: enrolled users are challenged
    // on new devices; users without 2FA are prompted to set it up at login.
    enforce2FA: { type: Boolean, default: false },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("AuthSettings", AuthSettingsSchema);
