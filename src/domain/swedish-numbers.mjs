import { candidate, context, isUncertain, normalize } from "./extractors.mjs";
const units = {
  noll: 0,
  en: 1,
  ett: 1,
  två: 2,
  tre: 3,
  fyra: 4,
  fem: 5,
  sex: 6,
  sju: 7,
  åtta: 8,
  nio: 9,
  tio: 10,
  elva: 11,
  tolv: 12,
  tretton: 13,
  fjorton: 14,
  femton: 15,
  sexton: 16,
  sjutton: 17,
  arton: 18,
  nitton: 19,
};
const tens = {
  tjugo: 20,
  trettio: 30,
  fyrtio: 40,
  femtio: 50,
  sextio: 60,
  sjuttio: 70,
  åttio: 80,
  nittio: 90,
};
export function swedishNumber(input) {
  const word = normalize(input).replace(/[\s-]/gu, "");
  if (/^\d+$/u.test(word)) return Number(word);
  if (Object.hasOwn(units, word)) return units[word];
  for (const [prefix, n] of Object.entries(tens))
    if (word.startsWith(prefix)) {
      const tail = word.slice(prefix.length);
      if (!tail) return n;
      if (Object.hasOwn(units, tail) && units[tail] < 10)
        return n + units[tail];
    }
  for (const [scale, n] of [
    ["tusen", 1000],
    ["hundra", 100],
  ]) {
    const at = word.indexOf(scale);
    if (at < 0) continue;
    const left = at ? swedishNumber(word.slice(0, at)) : 1;
    const rest = word.slice(at + scale.length).replace(/^och/u, "");
    const right = rest ? swedishNumber(rest) : 0;
    if (
      Number.isInteger(left) &&
      left > 0 &&
      left < n &&
      Number.isInteger(right) &&
      right >= 0 &&
      right < n
    )
      return left * n + right;
  }
  return null;
}
export function extractQuantity(
  text,
  unitPattern,
  { min = 1, max = 100000 } = {},
) {
  const found = [];
  for (const unit of text.matchAll(
    new RegExp(`(?<![\\p{L}])(?:${unitPattern})(?![\\p{L}])`, "giu"),
  )) {
    const end = unit.index + unit[0].length;
    const before = text.slice(Math.max(0, unit.index - 90), unit.index),
      base = Math.max(0, unit.index - 90);
    const tokens = [...before.matchAll(/[\p{L}\p{M}\d]+/gu)].slice(-6);
    if (
      !tokens.length ||
      !/^\s*$/u.test(
        before.slice(tokens.at(-1).index + tokens.at(-1)[0].length),
      )
    )
      continue;
    let best = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const raw = before.slice(tokens[i].index).trim();
      if (!/^[\p{L}\p{M}\d\s-]+$/u.test(raw)) break;
      const n = swedishNumber(raw);
      if (n === null) continue;
      best = { n, start: base + tokens[i].index };
    }
    if (!best || best.n < min || best.n > max) continue;
    const prefix = text.slice(0, best.start);
    // Reject fractional fragments ("2,5 kvm" must never become "5 kvm").
    if (/\d[,.]\s*$/u.test(prefix)) continue;
    const c = context(text, best.start);
    found.push(
      candidate(text, best.n, best.start, end, {
        uncertain:
          isUncertain(text.slice(c.start, c.end)) ||
          /(?:\d|\p{L})\s*[-–/]\s*$/u.test(prefix) ||
          /\b(?:cirka|ca|drygt|knappt|minst|högst|omkring)\.?\s*$/iu.test(
            prefix,
          ),
      }),
    );
  }
  if (!found.length) return null;
  return found.some(
    (f) => f.value !== found[0].value || f.status === "uncertain",
  )
    ? { ...found[0], status: "uncertain", confidence: 0.55 }
    : found[0];
}
