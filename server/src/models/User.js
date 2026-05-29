import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["admin", "water_bill_officer", "loan_officer", "meter_reader"],
      default: "water_bill_officer"
    },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },

    // Two-factor authentication (TOTP / authenticator app)
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: "" }, // confirmed base32 secret
    twoFactorPendingSecret: { type: String, default: "" }, // during setup, before confirm
    // Remembered devices that have passed 2FA — skip the challenge on these.
    knownDevices: {
      type: [
        {
          tokenHash: { type: String }, // sha256 of the device token
          ip: { type: String, default: "" },
          label: { type: String, default: "" },
          lastSeen: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // Single-use backup/recovery codes (hashed) — used if the authenticator is lost.
    recoveryCodes: {
      type: [
        {
          codeHash: { type: String },
          used: { type: Boolean, default: false },
          usedAt: { type: Date },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
