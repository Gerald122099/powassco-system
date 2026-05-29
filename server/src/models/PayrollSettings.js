import mongoose from "mongoose";
import { DEFAULT_PAYROLL_SETTINGS } from "../utils/payrollCompute.js";

const BracketSchema = new mongoose.Schema(
  { over: { type: Number, default: 0 }, base: { type: Number, default: 0 }, rate: { type: Number, default: 0 } },
  { _id: false }
);

const PayrollSettingsSchema = new mongoose.Schema(
  {
    sss: {
      employeeRate: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.sss.employeeRate },
      minBase: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.sss.minBase },
      maxBase: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.sss.maxBase },
    },
    philhealth: {
      employeeRate: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.philhealth.employeeRate },
      minBase: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.philhealth.minBase },
      maxBase: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.philhealth.maxBase },
    },
    pagibig: {
      employeeRate: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.pagibig.employeeRate },
      maxBase: { type: Number, default: DEFAULT_PAYROLL_SETTINGS.pagibig.maxBase },
    },
    withholding: { type: [BracketSchema], default: () => DEFAULT_PAYROLL_SETTINGS.withholding },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("PayrollSettings", PayrollSettingsSchema);
