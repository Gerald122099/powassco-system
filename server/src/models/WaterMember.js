import mongoose from "mongoose";

const PersonalSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },
    birthdate: { type: String, required: true, trim: true }, 
    dateRegistered: { type: Date },
    
    // Senior Citizen Fields
    isSeniorCitizen: { type: Boolean, default: false },
    seniorId: { type: String, trim: true, default: "" },
    seniorDiscountRate: { 
      type: Number, 
      default: 5, // Default 5% discount
      min: 0,
      max: 100 
    },
    
    // Optional: Add spouse details if needed
    spouseName: { type: String, trim: true, default: "" },
    spouseIsSenior: { type: Boolean, default: false },
    spouseSeniorId: { type: String, trim: true, default: "" },
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
    
    // Additional address details for billing
    zone: { type: String, trim: true, default: "" },
    subdivision: { type: String, trim: true, default: "" },
    landmark: { type: String, trim: true, default: "" },
    
    // FIXED: GPS coordinates - only store if available
    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null }
    }
  },
  { _id: false }
);

const ContactSchema = new mongoose.Schema(
  {
    mobileNumber: { type: String, required: true, trim: true },
    mobileNumber2: { type: String, trim: true, default: "" },
    email: { type: String, trim: true },
    email2: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const BillingSchema = new mongoose.Schema(
  {
    // Tariff & Discount Settings
    classification: {
      type: String,
      enum: ["residential", "commercial", "institutional", "government"],
      default: "residential",
    },
    
    // Discount eligibility
    hasSeniorDiscount: { type: Boolean, default: false },
    hasPWD: { type: Boolean, default: false },
    pwdId: { type: String, trim: true, default: "" },
    pwdDiscountRate: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    
    // Discount applicable tiers
    discountApplicableTiers: {
      type: [String],
      default: ["31-40", "41+"],
      validate: {
        validator: function(tiers) {
          return tiers.every(tier => /^[\d+-]+$/.test(tier));
        },
        message: "Tier format should be like '31-40' or '41+'"
      }
    },
    
    // Custom discount rates for specific tiers (optional)
    tierSpecificDiscounts: [{
      tier: { type: String, required: true },
      discountRate: { 
        type: Number, 
        required: true,
        min: 0,
        max: 100 
      },
      isActive: { type: Boolean, default: true }
    }],
    
    // Billing preferences
    billingCycle: { 
      type: String, 
      enum: ["monthly", "bi-monthly", "quarterly"], 
      default: "monthly" 
    },
    paperlessBilling: { type: Boolean, default: false },
    autoDeduct: { type: Boolean, default: false },
    
    // Payment history summary (for quick reference)
    lastPaymentDate: { type: Date },
    lastPaymentAmount: { type: Number, default: 0 },
    averageMonthlyConsumption: { type: Number, default: 0 },
    
    // Connection details
    connectionType: { 
      type: String, 
      enum: ["standard", "industrial", "temporary", "fire_service"], 
      default: "standard" 
    },
    
    // Primary meter size (kept for backward compatibility)
    meterSize: { 
      type: String, 
      enum: ["5/8", "3/4", "1", "1.5", "2", "3", "4", "6"], 
      default: "5/8" 
    },
    
    // Water source & usage type
    waterSource: { 
      type: String, 
      enum: ["main_line", "deep_well", "spring", "other"], 
      default: "main_line" 
    },
    usageType: { 
      type: String, 
      enum: ["domestic", "commercial", "industrial", "institutional", "mixed"], 
      default: "domestic" 
    },
  },
  { _id: false }
);

// FIXED: Enhanced Meter Schema with location and status
const MeterSchema = new mongoose.Schema(
  {
    meterNumber: { 
      type: String, 
      required: true, 
      trim: true,
      uppercase: true 
    },
    meterBrand: { type: String, trim: true, default: "" },
    meterModel: { type: String, trim: true, default: "" },
    meterSize: { 
      type: String, 
      enum: ["5/8", "3/4", "1", "1.5", "2", "3", "4", "6", "8", "10", "12"], 
      default: "5/8" 
    },
    
    // Installation & Maintenance
    installationDate: { type: Date },
    lastCalibration: { type: Date },
    nextCalibration: { type: Date },
    lastMaintenance: { type: Date },
    
    // Meter Status
    meterCondition: { 
      type: String, 
      enum: ["good", "needs_repair", "replaced", "defective", "tampered", "locked"], 
      default: "good" 
    },
    meterStatus: {
      type: String,
      enum: ["active", "inactive", "removed", "under_maintenance"],
      default: "active"
    },
    
    // FIXED: Detailed location information
    location: {
      // Physical location description
      description: { type: String, trim: true, default: "" },
      // Specific placement
      placement: {
        type: String,
        enum: ["front_yard", "backyard", "side_yard", "garage", "basement", "sidewalk", "street", "other"],
        default: "front_yard"
      },
      // GPS coordinates - only store if available
      coordinates: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        accuracy: { type: Number, default: null }
      },
      // Access information
      accessNotes: { type: String, trim: true, default: "" },
      // Visibility/obstacles
      visibility: {
        type: String,
        enum: ["excellent", "good", "poor", "obstructed", "hidden"],
        default: "good"
      },
      // Safety notes
      safetyNotes: { type: String, trim: true, default: "" }
    },
    
    // Meter reader notes specific to this meter
    meterReaderNotes: { type: String, trim: true, default: "" },
    
    // Meter specifications
    serialNumber: { type: String, trim: true, default: "" },
    initialReading: { type: Number, default: 0 },
    lastReading: { type: Number, default: 0 },
    lastReadingDate: { type: Date },
    
    // Photos/documents
    photoUrl: { type: String, default: "" },
    documents: [{
      type: { type: String }, // installation_cert, calibration_cert, photo
      url: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }],
    
    // Billing settings for this specific meter
    isBillingActive: { type: Boolean, default: true },
    billingSequence: { type: Number, default: 0 }, // Order for multiple meters
    consumptionMultiplier: { type: Number, default: 1 }, // For industrial meters
    
    // Audit trail
    createdBy: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: true } // Each meter gets its own _id
);

const EmergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    relationship: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const WaterMemberSchema = new mongoose.Schema(
  {
    // Primary Account Information
    pnNo: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true,
      uppercase: true 
    },
    accountName: { 
      type: String, 
      required: true, 
      trim: true 
    },
    accountType: { 
      type: String, 
      enum: ["individual", "business", "government", "institution"],
      default: "individual"
    },
    
    // Business/Organization Details (if applicable)
    businessName: { type: String, trim: true, default: "" },
    businessType: { type: String, trim: true, default: "" },
    businessRegNumber: { type: String, trim: true, default: "" },
    businessTIN: { type: String, trim: true, default: "" },
    
    // Account Status
    accountStatus: {
      type: String,
      enum: ["active", "inactive", "disconnected", "suspended", "pending"],
      default: "active",
    },
    statusReason: { type: String, trim: true, default: "" },
    statusDate: { type: Date },
    
    // Account Dates
    connectionDate: { type: Date, default: Date.now },
    disconnectionDate: { type: Date },
    
    // Nested Schemas
    personal: { type: PersonalSchema, required: true },
    address: { type: AddressSchema, default: {} },
    contact: { type: ContactSchema, required: true },
    billing: { type: BillingSchema, default: {} },
    
    // UPDATED: Multiple meters array (instead of single meter)
    meters: { 
      type: [MeterSchema], 
      default: [],
      validate: {
        validator: function(meters) {
          // Ensure at least one active meter if account is active
          if (this.accountStatus === "active") {
            return meters.length > 0 && meters.some(m => m.meterStatus === "active");
          }
          return true;
        },
        message: "Active accounts must have at least one active meter"
      }
    },
    
    // Emergency Contacts (can have multiple)
    emergencyContacts: { type: [EmergencyContactSchema], default: [] },
    
    // Documents & Verification
    documents: [{
      documentType: { type: String },
      documentNumber: { type: String },
      issueDate: { type: Date },
      expiryDate: { type: Date },
      filePath: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }],
    
    // Notes & History
    notes: { type: String, trim: true, default: "" },
    history: [{
      date: { type: Date, default: Date.now },
      action: { type: String },
      description: { type: String },
      performedBy: { type: String }
    }],
    
    // Flags for special processing
    isExempted: { type: Boolean, default: false },
    exemptionReason: { type: String, trim: true, default: "" },
    hasArrears: { type: Boolean, default: false },
    arrearsAmount: { type: Number, default: 0 },
    
    // System tracking
    createdBy: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
    
    // Virtual for age calculation
    age: {
      type: Number,
      get: function() {
        if (!this.personal?.birthdate) return null;
        const birthDate = new Date(this.personal.birthdate);
        const ageDiff = Date.now() - birthDate.getTime();
        const ageDate = new Date(ageDiff);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
      }
    }
  },
  { 
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true }
  }
);

// Virtual for full address
WaterMemberSchema.virtual("fullAddress").get(function() {
  const addr = this.address;
  if (!addr) return "";
  
  const parts = [
    addr.houseLotNo,
    addr.streetSitioPurok,
    addr.barangay,
    addr.municipalityCity,
    addr.province
  ].filter(part => part && part.trim() !== "");
  
  return parts.join(", ");
});

// NEW: Virtual for primary (active) meter
WaterMemberSchema.virtual("primaryMeter").get(function() {
  if (!this.meters || this.meters.length === 0) return null;
  
  // Try to find active meter with billing active
  const activeMeter = this.meters.find(m => 
    m.meterStatus === "active" && m.isBillingActive === true
  );
  
  if (activeMeter) return activeMeter;
  
  // Fallback to first meter
  return this.meters[0];
});

// NEW: Virtual for all active meters
WaterMemberSchema.virtual("activeMeters").get(function() {
  if (!this.meters) return [];
  return this.meters.filter(m => m.meterStatus === "active");
});

// NEW: Virtual for billing meters
WaterMemberSchema.virtual("billingMeters").get(function() {
  if (!this.meters) return [];
  return this.meters.filter(m => 
    m.meterStatus === "active" && m.isBillingActive === true
  );
});

// Virtual for senior citizen eligibility
WaterMemberSchema.virtual("isEligibleForSeniorDiscount").get(function() {
  return (
    this.personal?.isSeniorCitizen === true && 
    this.personal?.seniorId && 
    this.personal?.seniorId.trim() !== "" &&
    this.age >= 60
  );
});

// Virtual for total discount rate
WaterMemberSchema.virtual("totalDiscountRate").get(function() {
  let total = 0;
  
  // Senior discount
  if (this.isEligibleForSeniorDiscount) {
    total += this.personal?.seniorDiscountRate || 0;
  }
  
  // PWD discount
  if (this.billing?.hasPWD) {
    total += this.billing?.pwdDiscountRate || 0;
  }
  
  // Cap at 100%
  return Math.min(total, 100);
});

// Compound indexes for efficient queries
WaterMemberSchema.index({ pnNo: 1 });
WaterMemberSchema.index({ accountName: 1 });
WaterMemberSchema.index({ "personal.fullName": 1 });
WaterMemberSchema.index({ "meters.meterNumber": 1 });
WaterMemberSchema.index({ "personal.isSeniorCitizen": 1 });
WaterMemberSchema.index({ "billing.classification": 1 });
WaterMemberSchema.index({ accountStatus: 1 });
WaterMemberSchema.index({ "personal.birthdate": 1 });
// NEW: Index for meter status queries
WaterMemberSchema.index({ "meters.meterStatus": 1 });

// REMOVED: Comment out or remove the 2dsphere index to fix the error
// WaterMemberSchema.index({ "meters.location.coordinates": "2dsphere" });

// Text index for search
WaterMemberSchema.index(
  { 
    pnNo: "text",
    accountName: "text",
    "personal.fullName": "text",
    "address.barangay": "text",
    "address.streetSitioPurok": "text",
    "meters.meterNumber": "text"
  },
  {
    weights: {
      pnNo: 10,
      accountName: 5,
      "personal.fullName": 5,
      "meters.meterNumber": 3
    }
  }
);

// Pre-save middleware to clean coordinates
WaterMemberSchema.pre("save", function(next) {
  // Clean up coordinates before saving
  if (this.address?.coordinates) {
    if (this.address.coordinates.latitude === null || this.address.coordinates.longitude === null) {
      // Remove coordinates object if latitude or longitude is null
      this.address.coordinates = undefined;
    }
  }
  
  // Clean up coordinates for each meter
  if (this.meters && this.meters.length > 0) {
    this.meters.forEach(meter => {
      if (meter.location?.coordinates) {
        if (meter.location.coordinates.latitude === null || meter.location.coordinates.longitude === null) {
          // Remove coordinates object if latitude or longitude is null
          meter.location.coordinates = undefined;
        }
      }
    });
  }
  
  // Update hasSeniorDiscount based on eligibility
  if (this.billing) {
    this.billing.hasSeniorDiscount = this.isEligibleForSeniorDiscount;
  }
  
  // Format PN number to uppercase
  if (this.pnNo) {
    this.pnNo = this.pnNo.toUpperCase().trim();
  }
  
  // Format meter numbers to uppercase
  if (this.meters && this.meters.length > 0) {
    this.meters.forEach(meter => {
      if (meter.meterNumber) {
        meter.meterNumber = meter.meterNumber.toUpperCase().trim();
      }
    });
  }
  
  // Update age field
  if (this.personal?.birthdate && !this.isModified("personal.birthdate")) {
    // Trigger age calculation
    this.markModified("personal");
  }
  
  // Update timestamps for meters
  if (this.meters && this.isModified("meters")) {
    const now = new Date();
    this.meters.forEach(meter => {
      if (!meter.createdAt) meter.createdAt = now;
      meter.updatedAt = now;
    });
  }
  
  next();
});

// Static method to find by classification and consumption tier
WaterMemberSchema.statics.findByClassification = function(classification) {
  return this.find({ "billing.classification": classification });
};

// Static method to find senior citizens
WaterMemberSchema.statics.findSeniorCitizens = function() {
  return this.find({ 
    "personal.isSeniorCitizen": true,
    accountStatus: "active"
  });
};

// NEW: Static method to find by meter number
WaterMemberSchema.statics.findByMeterNumber = function(meterNumber) {
  const normalizedMeter = meterNumber.toUpperCase().trim();
  return this.find({ "meters.meterNumber": normalizedMeter });
};

// NEW: Static method to find accounts with multiple meters
WaterMemberSchema.statics.findWithMultipleMeters = function() {
  return this.find({
    "meters.1": { $exists: true } // At least 2 meters
  });
};

// Instance method to check if discount applies to specific tier
WaterMemberSchema.methods.isDiscountApplicableToTier = function(tier) {
  if (!this.billing?.discountApplicableTiers) return false;
  return this.billing.discountApplicableTiers.includes(tier);
};

// Instance method to get discount rate for specific tier
WaterMemberSchema.methods.getDiscountRateForTier = function(tier) {
  if (!this.isDiscountApplicableToTier(tier)) return 0;
  
  // Check for tier-specific discount
  if (this.billing?.tierSpecificDiscounts) {
    const tierDiscount = this.billing.tierSpecificDiscounts.find(
      d => d.tier === tier && d.isActive
    );
    if (tierDiscount) return tierDiscount.discountRate;
  }
  
  // Return default senior discount rate
  return this.personal?.seniorDiscountRate || 0;
};

// NEW: Instance method to add a new meter
WaterMemberSchema.methods.addMeter = function(meterData) {
  const newMeter = {
    ...meterData,
    meterNumber: meterData.meterNumber?.toUpperCase().trim(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  // Clean coordinates
  if (newMeter.location?.coordinates) {
    if (newMeter.location.coordinates.latitude === null || newMeter.location.coordinates.longitude === null) {
      newMeter.location.coordinates = undefined;
    }
  }
  
  // Set billing sequence if not provided
  if (!newMeter.billingSequence && this.meters.length > 0) {
    const maxSequence = Math.max(...this.meters.map(m => m.billingSequence || 0));
    newMeter.billingSequence = maxSequence + 1;
  }
  
  this.meters.push(newMeter);
  return newMeter;
};

// NEW: Instance method to get meter by meter number
WaterMemberSchema.methods.getMeter = function(meterNumber) {
  const normalizedMeter = meterNumber.toUpperCase().trim();
  return this.meters.find(m => m.meterNumber === normalizedMeter);
};

// NEW: Instance method to update meter
WaterMemberSchema.methods.updateMeter = function(meterNumber, updates) {
  const meter = this.getMeter(meterNumber);
  if (meter) {
    // Clean coordinates in updates
    if (updates.location?.coordinates) {
      if (updates.location.coordinates.latitude === null || updates.location.coordinates.longitude === null) {
        updates.location.coordinates = undefined;
      }
    }
    
    Object.assign(meter, updates, { updatedAt: new Date() });
    return meter;
  }
  return null;
};

// NEW: Instance method to deactivate meter
WaterMemberSchema.methods.deactivateMeter = function(meterNumber, reason = "") {
  const meter = this.getMeter(meterNumber);
  if (meter) {
    meter.meterStatus = "inactive";
    meter.meterReaderNotes = reason ? `Deactivated: ${reason}` : "Deactivated";
    meter.updatedAt = new Date();
    return meter;
  }
  return null;
};

// NEW: Instance method to get total consumption from all active meters
WaterMemberSchema.methods.getTotalConsumption = function() {
  if (!this.meters || this.meters.length === 0) return 0;
  
  return this.meters
    .filter(m => m.meterStatus === "active" && m.isBillingActive)
    .reduce((total, meter) => {
      const lastReading = meter.lastReading || 0;
      const initialReading = meter.initialReading || 0;
      return total + (lastReading - initialReading) * (meter.consumptionMultiplier || 1);
    }, 0);
};

export default mongoose.model("WaterMember", WaterMemberSchema);