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

// Robust tier match (mirror of server). Tolerates dash/m³/space/case label
// differences; empty list (or "all"/"*") = applies to every tier.
const normTierLabel = (s) =>
  String(s || "").toLowerCase().replace(/m³|m3|cu\.?\s*m|cubic/g, "").replace(/[–—−]/g, "-").replace(/\s+/g, "").trim();
function tierEligibleForDiscount(eligibleTiers, tierLabel) {
  const list = (Array.isArray(eligibleTiers) ? eligibleTiers : []).map(normTierLabel).filter(Boolean);
  if (list.length === 0 || list.includes("all") || list.includes("*")) return true;
  return list.includes(normTierLabel(tierLabel));
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
  // Open-ended last tier — anything above the highest configured
  // maxConsumption bills at the last tier's rate. Mirrors the
  // server's behaviour so an offline thermal receipt for >500 m³
  // still renders instead of going blank.
  const lastTier = activeTiers[activeTiers.length - 1];
  let tariff = activeTiers.find((t) => consumption >= t.minConsumption && consumption <= t.maxConsumption);
  if (!tariff && consumption > lastTier.maxConsumption) tariff = lastTier;
  if (!tariff) return null;

  // PROGRESSIVE (marginal) tiering — each bracket billed at its OWN rate.
  // MUST stay identical to the server's calculateWaterBill so an offline
  // thermal bill matches the official bill to the centavo.
  const minMax = Number(minTier.maxConsumption) || 0;
  const minimumCharge = minTier.chargeType === "flat"
    ? (Number(minTier.flatAmount) || 0)
    : Math.min(consumption, minMax) * (Number(minTier.ratePerCubic) || 0);
  let baseAmount = minimumCharge;

  const tierBreakdown = [{
    tier: minTier.tier,
    chargeType: minTier.chargeType,
    rate: minTier.chargeType === "flat" ? 0 : (Number(minTier.ratePerCubic) || 0),
    from: Number(minTier.minConsumption) || 0,
    to: minMax,
    units: Math.min(consumption, minMax),
    amount: Number(minimumCharge.toFixed(2)),
    isMinimum: minTier.chargeType === "flat",
  }];

  if (consumption > minMax) {
    let prevMax = minMax; // m³ already billed by lower brackets
    for (let i = 1; i < activeTiers.length; i++) {
      const t = activeTiers[i];
      if (consumption <= prevMax) break;
      const isLast = i === activeTiers.length - 1;
      const cap = isLast && consumption > Number(t.maxConsumption)
        ? consumption // open-ended top tier
        : Number(t.maxConsumption);
      const units = Math.max(0, Math.min(consumption, cap) - prevMax);
      if (units > 0) {
        const amt = t.chargeType === "flat"
          ? (Number(t.flatAmount) || 0)
          : units * (Number(t.ratePerCubic) || 0);
        baseAmount += amt;
        tierBreakdown.push({
          tier: t.tier,
          chargeType: t.chargeType,
          rate: t.chargeType === "flat" ? 0 : (Number(t.ratePerCubic) || 0),
          from: prevMax + 1,
          to: prevMax + units,
          units,
          amount: Number(amt.toFixed(2)),
          isMinimum: false,
        });
      }
      prevMax = Number(t.maxConsumption);
    }
  }

  const breakdown = {
    minimumCharge: Number(minimumCharge.toFixed(2)),
    excessConsumption: Math.max(0, consumption - minMax),
    excessRate: Number(tariff.ratePerCubic) || 0,
    excessAmount: Number((baseAmount - minimumCharge).toFixed(2)),
  };

  let discountAmount = 0;
  let discountReason = "";
  const allowDiscount = discountAppliesToMeter(member, meterNumber);

  if (allowDiscount && member?.personal?.isSeniorCitizen) {
    const eligibleTiers =
      member.billing?.discountApplicableTiers || settings.seniorDiscount?.applicableTiers || ["31-40", "41+"];
    if (tierEligibleForDiscount(eligibleTiers, tariff.tier)) {
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
    tierBreakdown,
  };
}
