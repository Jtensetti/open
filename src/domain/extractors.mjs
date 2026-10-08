/** Pure browser-safe slot extractors. Offsets always refer to the original input. */
export const normalize = (s) =>
  String(s)
    .toLocaleLowerCase("sv-SE")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
export function candidate(
  text,
  value,
  start,
  end,
  { method = "deterministic", uncertain = false, confidence = 0.97 } = {},
) {
  return {
    value,
    status: uncertain ? "uncertain" : "proposed",
    source: text.slice(start, end).trim().slice(0, 240),
    sourceSpan: { start, end },
    method,
    confidence: uncertain ? 0.55 : confidence,
  };
}
export function context(text, index) {
  const before = [
    ...text.slice(0, index).matchAll(/[.!?;\n]|(?<![\p{L}])men(?![\p{L}])/giu),
  ].at(-1);
  const start = before ? before.index + before[0].length : 0;
  const after = text
    .slice(index)
    .search(/[.!?;\n]|(?<![\p{L}])men(?![\p{L}])/iu);
  return { start, end: after < 0 ? text.length : index + after };
}
export const isUncertain = (s) =>
  /(?<![\p{L}])(?:kanske|eventuellt|möjligen|osäker\w*|antingen|vet inte|ungefär)(?![\p{L}])/iu.test(
    s,
  );
export function editDistance(a, b) {
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const q = [i];
    for (let j = 1; j <= b.length; j++)
      q[j] = Math.min(
        q[j - 1] + 1,
        p[j] + 1,
        p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    p = q;
  }
  return p[b.length];
}
const places =
  "Trelleborg|Smygehamn|Beddingestrand|Anderslöv|Klagstorp|Skegrie|Alstad|Gislöv|Höllviken|Malmö|Lund|Ystad|Stockholm|Göteborg|Helsingborg";
export function extractAddress(text) {
  const found = [];
  // House number belongs to a street token, never a capacity or personal number.
  const re =
    /(?<![\p{L}\d])((?:[\p{L}][\p{L}.'’\-]*)?(?:gatan|vägen|väg|gränden|gränd|allén|allen|allé|torg|torget|stigen|backen|gången|plan|kajen|strand|vallen|gården|gård|hamnen))\s*(\d{1,4})(?!\d)/giu;
  for (const m of text.matchAll(re)) {
    let start = m.index,
      end = m.index + m[0].length;
    const before = text.slice(Math.max(0, start - 90), start),
      base = Math.max(0, start - 90);
    const cue = [
      ...before.matchAll(
        /(?:\b(?:på|vid)\s+|adress(?:en)?\s*(?:är|:)\s*)([\p{L}:.'’\-]+(?:[ \t]+[\p{L}:.'’\-]+){0,2})[ \t]+$/giu,
      ),
    ].at(-1);
    if (cue) start = base + cue.index + cue[0].lastIndexOf(cue[1]);
    else {
      const previous = [...before.matchAll(/[\p{L}][\p{L}:.'’\-]*[ \t]+/gu)];
      let cursor = m.index;
      for (const w of previous.reverse().slice(0, 3)) {
        if (
          base + w.index + w[0].length !== cursor ||
          !/^\p{Lu}/u.test(w[0]) ||
          /^(Jag|Vi|På|Vid|Adress|Adressen)\s/.test(w[0])
        )
          break;
        start = base + w.index;
        cursor = start;
      }
    }
    // Attached letters or a separate uppercase entrance letter, never the preposition "i".
    const entrance = text
      .slice(end)
      .match(/^(?:([A-Za-z])(?=[,\s.;]|$)|[ \t]+([A-Z])(?=[,.;\n]|$))/);
    if (entrance) end += entrance[0].length;
    else if (/^\p{L}/u.test(text.slice(end))) continue;
    const tail = text.slice(end);
    const postal = tail.match(
      /^[, \t]*(\d{3}[ \t]?\d{2})(?:[ \t]+([\p{Lu}][\p{L}\-]*(?:[ \t]+[\p{Lu}][\p{L}\-]*)?))?/u,
    );
    const city = tail.match(
      new RegExp("^[, \\t]+(" + places + ")(?![\\p{L}])", "iu"),
    );
    if (postal) end += postal[0].length;
    else if (city) end += city[0].length;
    const c = context(text, m.index);
    const raw = text.slice(start, end).trim();
    const value = entrance
      ? raw.replace(
          new RegExp(m[2] + entrance[0] + "(?=,|\\s|$)"),
          m[2] + (entrance[1] || entrance[2]).toUpperCase(),
        )
      : raw;
    found.push(
      candidate(text, value, start, end, {
        uncertain:
          isUncertain(text.slice(c.start, c.end)) ||
          /^\s*[-–/]\s*\d/.test(text.slice(m.index + m[0].length)),
        confidence: 0.96,
      }),
    );
  }
  // Explicitly labelled addresses also accept less regular village/road names.
  for (const m of text.matchAll(
    /(?:adress(?:en)?\s*(?:är|:)|ligger\s+(?:på|vid))\s+([\p{L}][\p{L}.'’\-]*(?:[ \t]+[\p{L}][\p{L}.'’\-]*){0,3}[ \t]+\d{1,4}(?:[ \t]*[a-z])?)(?![\p{L}\d])/giu,
  )) {
    const start = m.index + m[0].indexOf(m[1]),
      end = start + m[1].length;
    if (
      !found.some(
        (f) => start >= f.sourceSpan.start && start <= f.sourceSpan.end,
      )
    )
      found.push(
        candidate(text, m[1], start, end, { uncertain: true, confidence: 0.8 }),
      );
  }
  const unique = [
    ...new Map(found.map((f) => [normalize(f.value), f])).values(),
  ];
  if (!unique.length) return null;
  if (unique.length === 1) return unique[0];
  const start = Math.min(...unique.map((x) => x.sourceSpan.start)),
    end = Math.max(...unique.map((x) => x.sourceSpan.end));
  return {
    ...candidate(text, unique[0].value, start, end, { uncertain: true }),
    alternatives: unique.map((x) => x.value),
  };
}
const months = {
  januari: 1,
  februari: 2,
  mars: 3,
  april: 4,
  maj: 5,
  juni: 6,
  juli: 7,
  augusti: 8,
  september: 9,
  oktober: 10,
  november: 11,
  december: 12,
};
const calendar = (s) => {
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
};
export function extractDate(text) {
  const found = [],
    invalid = [];
  for (const re of [
    /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
    /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g,
    /\b(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(20\d{2})\b/gi,
  ]) {
    for (const m of text.matchAll(re)) {
      const y = re.source.startsWith("\\b(20") ? m[1] : m[3],
        mon = re.source.includes("januari")
          ? months[normalize(m[2])]
          : Number(m[2]),
        day = re.source.startsWith("\\b(20") ? m[3] : m[1];
      const v = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (calendar(v)) {
        const c = context(text, m.index);
        found.push(
          candidate(text, v, m.index, m.index + m[0].length, {
            uncertain: isUncertain(text.slice(c.start, c.end)),
          }),
        );
      } else invalid.push(m[0]);
    }
  }
  if (!found.length) return { fact: null, invalid };
  const f = found[0];
  if (found.some((x) => x.value !== f.value))
    return { fact: { ...f, status: "uncertain", confidence: 0.5 }, invalid };
  return { fact: f, invalid };
}
export function extractBoolean(text, words) {
  const re = new RegExp("(?<![\\p{L}])(?:" + words + ")(?![\\p{L}])", "giu"),
    evidence = [];
  for (const m of text.matchAll(re)) {
    const c = context(text, m.index);
    let before = text.slice(c.start, m.index);
    const conjunction = [...before.matchAll(/\b(?:och|samt)\b/gi)].at(-1);
    if (conjunction)
      before = before.slice(conjunction.index + conjunction[0].length);
    const preceding = before.trim().split(/\s+/).slice(-7).join(" ");
    evidence.push(
      candidate(
        text,
        !/\b(?:inte|ej|ingen|inget|inga|utan|varken)\b/i.test(preceding),
        c.start,
        c.end,
        {
          uncertain:
            isUncertain(text.slice(c.start, c.end)) ||
            /inte bara/i.test(before),
        },
      ),
    );
  }
  if (!evidence.length) return null;
  const f = evidence[0];
  return evidence.some((x) => x.status === "uncertain" || x.value !== f.value)
    ? { ...f, status: "uncertain", confidence: 0.55 }
    : f;
}
export function extractNumber(text, re, { min = 1, max = 100000 } = {}) {
  const found = [...text.matchAll(re)];
  if (!found.length) return null;
  const m = found[0],
    n = Number(m[1].replace(/[ \u00a0]/g, ""));
  if (n < min || n > max) return null;
  const c = context(text, m.index);
  return candidate(text, n, m.index, m.index + m[0].length, {
    uncertain:
      found.some((x) => Number(x[1].replace(/ /g, "")) !== n) ||
      isUncertain(text.slice(c.start, c.end)) ||
      /\d+\s*[-–/]\s*$/.test(text.slice(0, m.index)),
  });
}
