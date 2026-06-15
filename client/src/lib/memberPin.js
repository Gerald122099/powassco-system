// Device-local PIN for the member app (the "saved on device + PIN" model).
//
// This is privacy on a shared phone, NOT server authentication — it gates
// the on-device view of saved accounts/bills. The PIN is hashed with a
// random per-device salt (SHA-256 via Web Crypto) and kept in localStorage;
// the cleartext PIN is never stored. "Unlocked" is tracked in sessionStorage
// so navigating within the app doesn't re-prompt, but fully closing the app
// re-locks it.

const KEY = "pow_member_pin_v1"; // { salt, hash }
const SESS = "pow_member_unlocked";

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hasMemberPin() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export async function setMemberPin(pin) {
  const salt = randSalt();
  const hash = await hashPin(pin, salt);
  localStorage.setItem(KEY, JSON.stringify({ salt, hash }));
  setUnlocked();
}

export async function verifyMemberPin(pin) {
  try {
    const rec = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!rec.salt || !rec.hash) return false;
    return (await hashPin(pin, rec.salt)) === rec.hash;
  } catch {
    return false;
  }
}

export function clearMemberPin() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(SESS);
  } catch { /* ignore */ }
}

export function isUnlocked() {
  try { return sessionStorage.getItem(SESS) === "1"; } catch { return true; }
}
export function setUnlocked() {
  try { sessionStorage.setItem(SESS, "1"); } catch { /* ignore */ }
}
export function lockNow() {
  try { sessionStorage.removeItem(SESS); } catch { /* ignore */ }
}
