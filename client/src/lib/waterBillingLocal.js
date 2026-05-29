// Client-side mirror of server/src/utils/waterBilling.js so the field app can
// compute a bill OFFLINE for the thermal receipt. Keep in sync with the server.

function activeBillingMeters(member) {
  return (member?.meters || []).filter((m) => m?.meterStatus === "active" && m?.isBillingActive === true);
}
function discountAppliesToMeter(member, meterNumber) {
  if (!meterNumber) return true;
  const meters = activeBillingMeters(member);
  if (meters.length <= 1) return true;
  const target = meters.find((m) => m?.isDiscountMeter) || meters[0];
  const norm = (v) => String(v || "").toUpperCase().trim();
  return norm(target?.meterNumber) === norm(meterNumber);
}

export function calculateWaterBillLocal(consumption, classification, member, meterNumber, settings) {
  if (!settings?.tariffs) return null;
  const tariffArray = classification === "residential" ? settings.tariffs.residential || [] : settings.tariffs.commercial || [];
  const tariff = tariffArray.find((t) => t.isActive && consumption >= t.minConsumption && consumption <= t.maxConsumption);
  if (!tariff) return null;

  let baseAmount = 0;
  const breakdown = { minimumCharge: 0, excessConsumption: 0, excessRate: tariff.ratePerCubic, excessAmount: 0 };

  if (classification === "residential") {
    if (consumption <= 5) {
      baseAmount = 74.0;
      breakdown.minimumCharge = 74.0;
    } else {
      const excess = consumption - 5;
      const excessAmount = excess * tariff.ratePerCubic;
      baseAmount = 74.0 + excessAmount;
      breakdown.minimumCharge = 74.0;
      breakdown.excessConsumption = excess;
      breakdown.excessAmount = excessAmount;
    }
  } else if (classification === "commercial") {
    if (consumption <= 15) {
      baseAmount = 442.5;
      breakdown.minimumCharge = 442.5;
    } else {
      const excess = consumption - 15;
      const excessAmount = excess * tariff.ratePerCubic;
      baseAmount = 442.5 + excessAmount;
      breakdown.minimumCharge = 442.5;
      breakdown.excessConsumption = excess;
      breakdown.excessAmount = excessAmount;
    }
  } else {
    baseAmount = consumption * tariff.ratePerCubic;
    breakdown.excessConsumption = consumption;
    breakdown.excessAmount = baseAmount;
  }

  let discountAmount = 0;
  let discountReason = "";
  const allowDiscount = discountAppliesToMeter(member, meterNumber);

  if (allowDiscount && member?.personal?.isSeniorCitizen) {
    const eligibleTiers =
      member.billing?.discountApplicableTiers || settings.seniorDiscount?.applicableTiers || ["31-40", "41+"];
    if (eligibleTiers.includes(tariff.tier)) {
      const rate = member.personal?.seniorDiscountRate || settings.seniorDiscount?.discountRate || 5;
      discountAmount = baseAmount * (rate / 100);
      discountReason = `Senior Citizen (${rate}%)`;
    }
  }
  if (allowDiscount && member?.billing?.hasPWD && discountAmount === 0) {
    const rate = member.billing?.pwdDiscountRate || 0;
    if (rate > 0) {
      discountAmount = baseAmount * (rate / 100);
      discountReason = `PWD (${rate}%)`;
    }
  }

  const netAmount = Math.max(0, baseAmount - discountAmount);
  return {
    amount: Number(netAmount.toFixed(2)),
    baseAmount: Number(baseAmount.toFixed(2)),
    discount: Number(discountAmount.toFixed(2)),
    discountReason,
    tariffUsed: { tier: tariff.tier, ratePerCubic: tariff.ratePerCubic },
    breakdown,
  };
}
