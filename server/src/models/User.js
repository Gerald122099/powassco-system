import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["admin", "manager", "water_bill_officer", "loan_officer", "meter_reader", "plumber", "cashier", "bookkeeper"],
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
    // Plumber app re-entry PIN (admin-set, 4 digits). Stored bcrypt-hashed
    // so the raw value never sits on disk. When set, the installed PWA
    // demands this PIN every time the user returns to the field role
    // dashboard after closing the tab — prevents an unattended phone
    // from being used to read meters under the plumber's identity.
    appPinHash: { type: String, default: "" },
    appPinSetAt: { type: Date, default: null },
    appPinSetBy: { type: String, default: "" },

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
