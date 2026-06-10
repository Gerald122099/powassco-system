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
  const tariffArray = classification === "residential"
    ? settings.tariffs.residential || []
    : classification === "commercial"
    ? settings.tariffs.commercial || []
    : [];

  // Same logic as the server's calculateWaterBill — the first tier is
  // the minimum-charge bracket (flatAmount), subsequent tiers carry
  // per-cubic rates for the excess. Reads from the admin-configured
  // tariff data; no hardcoded ₱74 / ₱442.50 anymore.
  const activeTiers = tariffArray
    .filter((t) => t.isActive)
    .sort((a, b) => Number(a.minConsumption) - Number(b.minConsumption));
  if (activeTiers.length === 0) return null;
  const minTier = activeTiers[0];
  const tariff = activeTiers.find((t) => consumption >= t.minConsumption && consumption <= t.maxConsumption);
  if (!tariff) return null;

  // Honor each tier's chargeType: "flat" → flatAmount; "per_cubic" →
  // m³ × ratePerCubic. Same logic as the server's calculateWaterBill.
  const minMax = Number(minTier.maxConsumption) || 0;
  let baseAmount = 0;
  const breakdown = {
    minimumCharge: 0,
    excessConsumption: 0,
    excessRate: Number(tariff.ratePerCubic) || 0,
    excessAmount: 0,
  };

  if (consumption <= minMax) {
    baseAmount = minTier.chargeType === "flat"
      ? (Number(minTier.flatAmount) || 0)
      : consumption * (Number(minTier.ratePerCubic) || 0);
    breakdown.minimumCharge = baseAmount;
  } else {
    const firstTierBase = minTier.chargeType === "flat"
      ? (Number(minTier.flatAmount) || 0)
      : minMax * (Number(minTier.ratePerCubic) || 0);
    const excess = consumption - minMax;
    const excessRate = Number(tariff.ratePerCubic) || 0;
    const excessAmount = excess * excessRate;
    baseAmount = firstTierBase + excessAmount;
    breakdown.minimumCharge = firstTierBase;
    breakdown.excessConsumption = excess;
    breakdown.excessAmount = excessAmount;
    breakdown.excessRate = excessRate;
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
