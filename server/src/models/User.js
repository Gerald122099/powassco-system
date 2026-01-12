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
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
