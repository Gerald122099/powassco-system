import mongoose from "mongoose";

const PersonalSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },
    birthdate: { type: String, required: true, trim: true }, 
    dateRegistered: { type: Date },
  },
  { _id: false }
);

const AddressSchema = new mongoose.Schema(
  {
    houseLotNo: { type: String, trim: true },
    streetSitioPurok: { type: String, trim: true },
    barangay: { type: String, trim: true },
    municipalityCity: { type: String, trim: true },
    province: { type: String, trim: true },
  },
  { _id: false }
);

const ContactSchema = new mongoose.Schema(
  {
    mobileNumber: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
  },
  { _id: false }
);

const WaterMemberSchema = new mongoose.Schema(
  {
    pnNo: { type: String, required: true, unique: true, trim: true }, // account number
    accountName: { type: String, required: true, trim: true },
    classification: {
      type: String,
      enum: ["residential", "commercial", "other"],
      default: "residential",
    },
    meterNumber: { type: String, required: true, trim: true },
    accountStatus: {
      type: String,
      enum: ["active", "inactive", "disconnected"],
      default: "active",
    },

    personal: { type: PersonalSchema, required: true },
    address: { type: AddressSchema, default: {} },
    contact: { type: ContactSchema, required: true },
  },
  { timestamps: true }
);

// Helpful indexes for search
WaterMemberSchema.index({ pnNo: 1 });
WaterMemberSchema.index({ accountName: 1 });

export default mongoose.model("WaterMember", WaterMemberSchema);
