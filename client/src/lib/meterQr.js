// Meter QR payload helpers. A meter QR encodes the account + meter so a field
// reader can resolve it even offline against a cached batch.
// Format: "POW|<PN>|<METER>"  e.g. "POW|PN123|MTR456"

const PREFIX = "POW";

export function encodeMeterQR(pnNo, meterNumber) {
  return `${PREFIX}|${String(pnNo || "").toUpperCase().trim()}|${String(meterNumber || "").toUpperCase().trim()}`;
}

// Returns { pnNo, meterNumber } or null. Tolerant of a bare "PN|METER" too.
export function parseMeterQR(text) {
  if (!text) return null;
  const parts = String(text).trim().split("|").map((s) => s.trim());
  let pnNo;
  let meterNumber;
  if (parts[0]?.toUpperCase() === PREFIX) {
    pnNo = parts[1];
    meterNumber = parts[2];
  } else if (parts.length >= 2) {
    [pnNo, meterNumber] = parts;
  } else {
    return null;
  }
  if (!pnNo) return null;
  return { pnNo: pnNo.toUpperCase(), meterNumber: (meterNumber || "").toUpperCase() };
}
