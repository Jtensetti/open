import { candidate, extractDate, isUncertain } from "./extractors.mjs";
import { swedishNumber } from "./swedish-numbers.mjs";
export function educationFacts(text, scenario) {
  if (!/^education\.(?:preschool|school)\.se$/u.test(scenario.id)) return {};
  const facts = {};
  function add(key, m, value = m?.[0]) {
    if (m && scenario.fields[key])
      facts[key] = candidate(text, value, m.index, m.index + m[0].length, {
        uncertain: isUncertain(m[0]),
      });
  }
  const periods = [
    ...text.matchAll(
      /(?<![\p{L}])(?:(?:vår|höst)(?:en|terminen)?\s*(?:20\d{2})?|(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+20\d{2}|(?:efter|före)\s+(?:sommaren|jul|nyår)|så snart som möjligt|snarast)(?![\p{L}\d])/giu,
    ),
  ];
  if (periods.length) {
    add("start_period", periods[0]);
    if (periods.some((p) => p[0] !== periods[0][0]) || isUncertain(text)) {
      facts.start_period.status = "uncertain";
      facts.start_period.confidence = 0.55;
    }
  } else {
    const date = extractDate(text).fact;
    if (date) facts.start_period = date;
  }
  const ages = [
    ...text.matchAll(
      /(?:barn(?:et)?|son(?:en)?|dotter(?:n)?)\s+(?:är|på|har fyllt|fyller)\s+([\p{L}\d]+)\s*år(?![\p{L}])/giu,
    ),
  ];
  if (ages.length && scenario.fields.child_age) {
    const n = swedishNumber(ages[0][1]);
    if (n !== null && n >= 0 && n <= 18) {
      add("child_age", ages[0], n);
      if (ages.length > 1) {
        facts.child_age.status = "uncertain";
        facts.child_age.confidence = 0.55;
      }
    }
  }
  const year = text.match(
    /(?<![\p{L}])(?:årskurs\s*(?:[1-9]|ett|en|två|tre|fyra|fem|sex|sju|åtta|nio)|åk\.?\s*[1-9]|förskoleklass(?:en)?|nollan|sexårsverksamhet(?:en)?)(?![\p{L}\d])/iu,
  );
  if (year) {
    const digit = year[0].match(/[1-9]/u);
    const word = year[0].match(/\s+(\p{L}+)$/u)?.[1];
    add(
      "school_year",
      year,
      /förskoleklass|nollan|sexårs/iu.test(year[0])
        ? "Förskoleklass"
        : `Årskurs ${digit?.[0] || swedishNumber(word || "")}`,
    );
  }
  const preferred = text.match(
    /(?:önskad (?:förskola|skola)\s*:\s*|(?:önskar|helst|väljer)\s+(?:plats\s+)?(?:på\s+)?)([\p{L}][\p{L} \-]{1,65})(?=[.;\n]|$)/iu,
  );
  if (preferred) {
    const start = preferred.index + preferred[0].indexOf(preferred[1]);
    facts.preferred_school = candidate(
      text,
      preferred[1].trim(),
      start,
      start + preferred[1].length,
    );
  }
  return facts;
}
