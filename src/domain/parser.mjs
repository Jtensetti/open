import { RESTAURANT } from "./restaurant.mjs";
import { validDate } from "./core.mjs";
export const EXAMPLE =
  "Jag vill öppna en italiensk restaurang i Trelleborg för 40 gäster. Vi vill servera vin och ha uteservering.";
const norm = (s) => s.toLocaleLowerCase("sv-SE").normalize("NFC");
function distance(a, b) {
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
function clause(text, i) {
  const a = [...text.slice(0, i).matchAll(/[.!?;\n]|\bmen\b/gi)].at(-1);
  const start = a ? a.index + a[0].length : 0;
  const next = text.slice(i).search(/[.!?;\n]|\bmen\b/i);
  return { start, end: next < 0 ? text.length : i + next };
}
const maybe = (s) =>
  /\b(kanske|eventuellt|möjligen|osäker|osäkert|antingen|vet inte)\b/i.test(s);
function fact(
  text,
  value,
  start,
  end,
  method = "deterministic",
  uncertain = false,
) {
  return {
    value,
    status: uncertain ? "uncertain" : "proposed",
    source: text.slice(start, end).trim().slice(0, 240),
    sourceSpan: { start, end },
    method,
    confidence: uncertain ? 0.55 : method === "fuzzy" ? 0.75 : 0.98,
  };
}
function boolean(text, re) {
  const evidence = [...text.matchAll(re)].map((m) => {
    const c = clause(text, m.index),
      before = text
        .slice(c.start, m.index)
        .trim()
        .split(/\s+/)
        .slice(-7)
        .join(" "),
      slice = text.slice(c.start, c.end);
    return {
      ...c,
      value: !(
        /\b(inte|ej|ingen|inget|inga|utan)\b/i.test(before) ||
        /alkoholfri/i.test(m[0])
      ),
      uncertain: maybe(slice) || /inte bara/i.test(slice),
    };
  });
  if (!evidence.length) return null;
  const first = evidence[0];
  const uncertain = evidence.some(
    (e) => e.uncertain || e.value !== first.value,
  );
  return fact(
    text,
    first.value,
    first.start,
    evidence.at(-1).end,
    "deterministic",
    uncertain,
  );
}
export function parseRestaurant(input) {
  const text = String(input).slice(0, 3000),
    t = norm(text),
    facts = {},
    corrections = [],
    unsupported = [],
    uncertain = [];
  let match = text.match(
      /(?<![\p{L}])(restaurang(?:en)?|resturang|pizzeria|bistro|café|kafé)(?![\p{L}])/iu,
    ),
    fuzzy = false;
  if (!match) {
    for (const m of text.matchAll(/[\p{L}]+/gu)) {
      if (m[0].length >= 8 && distance(norm(m[0]), "restaurang") <= 1) {
        match = m;
        fuzzy = true;
        corrections.push({ from: m[0], to: "restaurang" });
        break;
      }
    }
  }
  const goal = match ? "restaurant.trelleborg" : null;
  if (match && norm(match[0]) === "resturang")
    corrections.push({ from: match[0], to: "restaurang" });
  if (
    text.trim().length > 20 &&
    !goal &&
    !/^(jag|vi) (vill|ska|tänker) (öppna|starta)( en)?\s*\.{0,3}$/i.test(
      text.trim(),
    )
  )
    unsupported.push(
      "Första versionen stöder en ny restaurang. Beskriv det målet eller be om manuell hjälp.",
    );
  if (
    goal &&
    (!/(?<![\p{L}])(öppna|starta)(?![\p{L}])/iu.test(text) ||
      /\b(inte|ingen)\b/i.test(text.slice(0, match.index)) ||
      fuzzy)
  )
    uncertain.push({
      key: "goal",
      message: "Bekräfta att målet är att öppna en restaurang.",
    });
  if (
    /vårdcentral|akutmottagning|kärnkraft|fyrverkeri|vapen|asyl|nattklubb|foodtruck|mobila? restaurang|överlåta|övertagande|stänga|avveckla/i.test(
      text,
    )
  )
    unsupported.push(
      "Den här verksamheten eller åtgärden ligger utanför det första restaurangscenariot.",
    );
  if (
    goal &&
    /\b(?:och|plus|samt)\s+(?:en|ett)\s+(?!uteservering\b|restaurang\b|café\b)/i.test(
      text,
    )
  )
    unsupported.push(
      "Kombinationen innehåller ytterligare ett mål som behöver bedömas separat.",
    );
  if (
    goal &&
    /\b(?:och|samt|dessutom)\s+(?:bygga|öppna|starta|driva)\s+(?!uteservering\b)/i.test(
      text,
    )
  )
    unsupported.push(
      "Flera mål eller etableringar kan inte hanteras som ett enda restaurangärende.",
    );
  const city = text.match(/\bTrelleborg(?:s kommun)?\b/i);
  if (city)
    facts.municipality = fact(
      text,
      "Trelleborg",
      city.index,
      city.index + city[0].length,
    );
  if (
    /\bi\s+(Malmö|Lund|Stockholm|Göteborg|Helsingborg|Ystad)(?![\p{L}])/iu.test(
      text,
    )
  )
    unsupported.push("Scenariot stöder ännu bara Trelleborgs kommun.");
  const c = text.match(
    /italiensk\w*|indisk\w*|svensk\w*|japansk\w*|fransk\w*/i,
  );
  if (c)
    facts.cuisine = fact(
      text,
      c[0].replace(/a$/, "").replace(/^./, (x) => x.toUpperCase()),
      c.index,
      c.index + c[0].length,
    );
  for (const [key, re] of [
    [
      "alcohol",
      /(?<![\p{L}])(?:alkoholfri\w*|alkohol(?:servering)?|vin|öl|sprit)(?![\p{L}])/giu,
    ],
    ["outdoor", /uteservering(?:en)?/giu],
    ["public_land", /(?:offentlig|allmän) (?:plats|mark)/giu],
    [
      "building_changes",
      /(?:ändra|ändringar av|bygga om|förändra)\s+(?:(?:varken|vår|någon)\s+)?(?:ventilation|brandskydd|bärande)/giu,
    ],
  ]) {
    const f = boolean(text, re);
    if (f) facts[key] = f;
  }
  if (/privat mark/i.test(text) && !facts.public_land) {
    const m = text.match(/privat mark/i);
    facts.public_land = fact(text, false, m.index, m.index + m[0].length);
  }
  const caps = [
    ...text.matchAll(/(\d[\d ]*)\s*(gäster|personer|sittplatser)/gi),
  ];
  if (caps.length) {
    const m = caps[0],
      n = Number(m[1].replaceAll(" ", ""));
    if (n > 500 || n < 1)
      unsupported.push(
        "Den första versionen hanterar 1–500 gäster. Större eller oklara kapaciteter kräver manuell bedömning.",
      );
    else
      facts.capacity = fact(
        text,
        n,
        m.index,
        m.index + m[0].length,
        "deterministic",
        caps.some((x) => Number(x[1].replaceAll(" ", "")) !== n) ||
          maybe(
            text.slice(clause(text, m.index).start, clause(text, m.index).end),
          ) ||
          /\d+\s*[-–]\s*$/.test(text.slice(0, m.index)),
      );
  }
  const address = text.match(
    /(?:på|adress(?:en)?\s*:)\s+((?:[\p{L}]+\s+){0,2}[\p{L}]*(?:gatan|vägen|gränd|allén)\s+\d+[A-Za-z]?(?:,\s*[\p{L}]+)?)/iu,
  );
  if (address) {
    const start = address.index + address[0].indexOf(address[1]);
    facts.address = fact(
      text,
      address[1],
      start,
      start + address[1].length,
      "deterministic",
      maybe(text.slice(clause(text, start).start, clause(text, start).end)),
    );
  }
  const dates = [...text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)];
  if (dates.length) {
    const m = dates[0];
    if (validDate(m[0]))
      facts.opening_date = fact(
        text,
        m[0],
        m.index,
        m.index + m[0].length,
        "deterministic",
        dates.length > 1,
      );
    else
      uncertain.push({
        key: "opening_date",
        message: "Datumet är inte ett giltigt kalenderdatum.",
      });
  }
  const use = text.match(
    /(?:lokalen (?:är|används som)|tidigare (?:var lokalen|användning är))\s+(?:en |ett )?(restaurang|butik|kontor|lager|bostad)/i,
  );
  if (use)
    facts.current_use = fact(
      text,
      use[1].replace(/^./, (x) => x.toUpperCase()),
      use.index,
      use.index + use[0].length,
    );
  const portions = text.match(/(\d+)\s*portioner\s*(?:per|om|\/)\s*dag/i);
  if (portions && Number(portions[1]) >= 1 && Number(portions[1]) <= 10000)
    facts.portions = fact(
      text,
      Number(portions[1]),
      portions.index,
      portions.index + portions[0].length,
    );
  const area = text.match(/(\d+)\s*(?:m²|kvm|kvadratmeter)/i);
  if (area && Number(area[1]) >= 1 && Number(area[1]) <= 1000)
    facts.outdoor_area = fact(
      text,
      Number(area[1]),
      area.index,
      area.index + area[0].length,
    );
  const food = text.match(
    /(?:lagar|tillagar) (?:maten|mat) på plats|värmer (?:färdig mat|upp maten)|serverar (?:endast |bara )?färdig mat/i,
  );
  if (food)
    facts.food_preparation = fact(
      text,
      /^(lagar|tillagar)/i.test(food[0])
        ? "Tillagning på plats"
        : /^värmer/i.test(food[0])
          ? "Uppvärmning av färdig mat"
          : "Endast servering av färdig mat",
      food.index,
      food.index + food[0].length,
    );
  for (const [key, f] of Object.entries(facts))
    if (f.status === "uncertain")
      uncertain.push({
        key,
        message: "Tolkningen behöver bekräftas.",
        source: f.source,
      });
  return {
    goal,
    facts,
    missing: Object.entries(RESTAURANT.fields)
      .filter(([k, f]) => f.required && !f.when && !facts[k])
      .map(([k]) => k),
    uncertain,
    unsupported: [...new Set(unsupported)],
    corrections,
    method: "local.deterministic.sv.v2",
  };
}
