// A bounded safeguard for the public pilot, not a general personal-data detector.
// Accept formatted number candidates even with a mistyped checksum. Compact
// ten-digit candidates need Luhn to avoid treating ordinary phone numbers as IDs.
export function containsPersonalNumber(text) {
  if (typeof text !== "string") return false;
  const candidates = text.matchAll(
    /(?<!\d)(?:(?:19|20))?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+\s\u2010-\u2015]?\d{4}(?!\d)/gu,
  );
  for (const [candidate] of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length === 12 || /\D/u.test(candidate)) return true;
    const sum = [...digits].reduce((total, digit, i) => {
      const n = Number(digit) * (i % 2 === 0 ? 2 : 1);
      return total + (n > 9 ? n - 9 : n);
    }, 0);
    if (sum % 10 === 0) return true;
  }
  return false;
}

export function containsPersonalNumberIn(value) {
  if (typeof value === "string") return containsPersonalNumber(value);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsPersonalNumberIn);
}

export const PILOT_DATA_MESSAGE =
  "Ta bort personnumret eller samordningsnumret. Testtjänsten ska bara användas med påhittade uppgifter utan sådana nummer. Ändringen har inte sparats.";
