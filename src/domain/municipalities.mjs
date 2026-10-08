import { MUNICIPALITIES, MUNICIPALITY_SOURCE } from "./municipality-data.mjs";
import {
  candidate,
  normalize,
  context,
  isUncertain,
  editDistance,
} from "./extractors.mjs";
export { MUNICIPALITIES, MUNICIPALITY_SOURCE };
export const municipalityByName = (name) =>
  MUNICIPALITIES.find((m) => normalize(m.name) === normalize(name));
export const municipalityByCode = (code) =>
  MUNICIPALITIES.find((m) => m.code === code);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = MUNICIPALITIES.map((m) => ({
  m,
  re: new RegExp(
    "(?<![\\p{L}])" +
      escape(m.name).replace(/ /g, "\\s+") +
      "(?:s(?=\\s+kommun))?(?![\\p{L}])",
    "giu",
  ),
}));
export function extractMunicipality(text) {
  const found = [];
  for (const { m, re } of patterns)
    for (const hit of text.matchAll(re)) {
      const start = hit.index,
        end = start + hit[0].length,
        c = context(text, start),
        before = text.slice(c.start, start),
        after = text.slice(end, c.end);
      const explicit =
        /^(?:s)?\s+kommun(?![\p{L}])/iu.test(after) ||
        /(?:kommun(?:en)?\s*(?:är|:|=)|i)\s*$/iu.test(before) ||
        normalize(text) === normalize(m.name);
      const alternatives = /\b(?:eller|alternativt|och)\s*$/iu.test(before);
      if (!explicit && !alternatives) continue;
      if (
        /(?:bor|bott|kommer|flyttar från)\s+(?:jag |vi )?i\s*$/iu.test(before)
      )
        continue;
      if (/(?:inte|ej)\s+(?:i\s*)?$/iu.test(before)) continue;
      const f = candidate(text, m.name, start, end, {
        uncertain: isUncertain(text.slice(c.start, c.end)),
      });
      found.push({ ...f, municipalityCode: m.code });
    }
  const unique = [...new Map(found.map((x) => [x.value, x])).values()];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) {
    const start = Math.min(...unique.map((f) => f.sourceSpan.start)),
      end = Math.max(...unique.map((f) => f.sourceSpan.end));
    return {
      ...candidate(text, unique[0].value, start, end, { uncertain: true }),
      alternatives: unique.map((f) => f.value),
    };
  }
  const label = text.match(
    /kommun(?:en)?\s*(?:är|:|=)\s*([\p{L}][\p{L} \-]{2,35})(?=[.;\n]|$)/iu,
  );
  if (label) {
    const name = label[1].trim(),
      matches = MUNICIPALITIES.filter(
        (m) =>
          name.length >= 5 &&
          editDistance(normalize(m.name), normalize(name)) <= 1,
      );
    if (matches.length === 1) {
      const start = label.index + label[0].indexOf(label[1]);
      return candidate(text, matches[0].name, start, start + label[1].length, {
        method: "fuzzy",
        uncertain: true,
      });
    }
  }
  return null;
}
