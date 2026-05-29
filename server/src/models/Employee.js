import mongoose from "mongoose";

// Common positions for the cooperative (seed the UI dropdown; field is free text).
export const EMPLOYEE_POSITIONS = [
  "Manager",
  "Book Keeper",
  "Cashier",
  "Loan Officer",
  "Water Bill Officer",
  "Field Water Reader",
  "Maintenance / Plumber",
  "Office Staff",
  "Utility / Janitor",
];

const EmployeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, trim: true, index: true }, // HR code e.g. EMP-0001
    fullName: { type: String, required: true, trim: true },
    position: { type: String, default: "", trim: true },
    department: { type: String, default: "", trim: true },

    // Basic profile
    sex: { type: String, enum: ["", "male", "female"], default: "" },
    civilStatus: { type: String, default: "" },
    birthDate: { type: Date },
    contactNo: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },

    // Government IDs
    tin: { type: String, default: "" },
    sssNo: { type: String, default: "" },
    philhealthNo: { type: String, default: "" },
    pagibigNo: { type: String, default: "" },

    // Employment
    dateHired: { type: Date },
    employmentType: {
      type: String,
      enum: ["regular", "probationary", "contractual", "casual", "part_time"],
      default: "regular",
    },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },

    // Compensation
    rateType: { type: String, enum: ["monthly", "daily", "hourly"], default: "monthly" },
    rate: { type: Number, default: 0, min: 0 },

    // Optional link to a login account (for staff who can sign in)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

EmployeeSchema.index({ fullName: "text", position: "text", employeeCode: "text" });

export default mongoose.model("Employee", EmployeeSchema);
