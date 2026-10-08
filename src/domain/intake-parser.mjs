import { SCENARIOS, registry } from "./catalog.mjs";
import { parseRestaurant } from "./parser.mjs";
import {
  candidate,
  context,
  normalize,
  editDistance,
  extractAddress,
  extractBoolean,
  extractDate,
  extractNumber,
  isUncertain,
} from "./extractors.mjs";
import { diagnose, validateValue } from "./core.mjs";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const action =
  /(?:öppna|starta|arrangera|anordna|bygga|ändra|byta|installera|riva|beställa|placera|ordna|spela|förvara|anlägga|avsluta|stänga|anmäla|fråga|förbereda|ansluta|rapportera|gräva|felanmäl\w*|planera|boka|registrera)(?![\p{L}])/iu;
const dangerous =
  /(?<![\p{L}])(?:kärnkraft|vapen|fyrverkeri\w*|sprängämne\w*|explosiv\w*|asyl|akutmottagning|vårdcentral)(?![\p{L}])/iu;
export function detectIntent(input) {
  const text = String(input).slice(0, 3000),
    hits = [];
  // Details of a chosen action are not a second goal. Never inspect private annotations for intent.
  const goalText = text.split(
    /(?:detaljer|åtgärd|beskrivning|egen anteckning)\s*:/iu,
  )[0];
  for (const s of SCENARIOS) {
    for (const alias of s.aliases) {
      const pattern = escapeRe(alias).replace(/ /g, "\\s+(?:(?:en|ett)\\s+)?");
      const re = new RegExp("(?<![\\p{L}])" + pattern + "(?![\\p{L}])", "giu");
      for (const m of goalText.matchAll(re)) {
        const c = context(goalText, m.index),
          before = goalText.slice(c.start, m.index);
        if (
          /(?:lokalen (?:är|används som)|nuvarande användning|tidigare var|blir|ska bli)\s+(?:en |ett )?$/iu.test(
            before,
          )
        )
          continue;
        hits.push({
          id: s.id,
          start: m.index,
          end: m.index + m[0].length,
          source: m[0],
          fuzzy: false,
          uncertain:
            !action.test(before + " " + m[0]) ||
            isUncertain(goalText.slice(c.start, c.end)) ||
            /(?<![\p{L}])(?:inte|ej)(?![\p{L}])/iu.test(before),
        });
      }
    }
  }
  // Prefer a more specific phrase over an overlapping general intent.
  const unique = hits.filter(
    (h) =>
      !hits.some(
        (x) =>
          x.id !== h.id &&
          x.start <= h.start &&
          x.end >= h.end &&
          x.end - x.start > h.end - h.start,
      ),
  );
  const hasFood = unique.some(
    (h) =>
      h.id === "restaurant.trelleborg" ||
      h.id === "food.cafe.trelleborg" ||
      h.id === "food.foodtruck.trelleborg",
  );
  const goals = [
    ...new Map(
      unique
        .filter(
          (h) =>
            !hasFood ||
            ![
              "publicspace.outdoorseating.trelleborg",
              "building.ventilation.trelleborg",
              "building.structure.trelleborg",
            ].includes(h.id),
        )
        .map((h) => [h.id, h]),
    ).values(),
  ];
  if (!goals.length) {
    for (const word of goalText.matchAll(/[\p{L}]+/gu)) {
      if (word[0].length < 6) continue;
      const alternatives = SCENARIOS.filter((s) =>
        s.aliases.some(
          (a) =>
            !a.includes(" ") &&
            Math.abs(a.length - word[0].length) <= 1 &&
            editDistance(normalize(a), normalize(word[0])) === 1,
        ),
      );
      if (alternatives.length === 1) {
        goals.push({
          id: alternatives[0].id,
          source: word[0],
          start: word.index,
          end: word.index + word[0].length,
          fuzzy: true,
          uncertain: true,
        });
        break;
      }
    }
  }
  return {
    goals,
    goal: goals.length === 1 ? goals[0].id : null,
    corrections: goals
      .filter((x) => x.fuzzy || normalize(x.source) === "resturang")
      .map((x) => ({ from: x.source, to: registry[x.id].title })),
  };
}
function genericFacts(text, s) {
  const facts = {},
    invalid = [];
  if (s.fields.address) {
    const f = extractAddress(text);
    if (f && validateValue(s.fields.address, f.value)) facts.address = f;
  }
  const city = text.match(/(?<![\p{L}])Trelleborg(?:s kommun)?(?![\p{L}])/iu);
  if (city)
    facts.municipality = candidate(
      text,
      "Trelleborg",
      city.index,
      city.index + city[0].length,
    );
  const dates = extractDate(text);
  invalid.push(...dates.invalid);
  for (const [key, d] of Object.entries(s.fields)) {
    if (d.type === "date" && key === "opening_date" && dates.fact) {
      facts[key] = dates.fact;
      continue;
    }
    if (d.parse?.label) {
      const re = new RegExp(
          "(?:^|[.\\n;]\\s*)(?:" + d.parse.label + ")\\s*:\\s*([^\\n;.!?]+)",
          "iu",
        ),
        m = text.match(re);
      if (m) {
        const start = m.index + m[0].indexOf(m[1]),
          end = start + m[1].length;
        let value = m[1].trim();
        if (d.type === "date") value = extractDate(value).fact?.value;
        if (validateValue(d, value))
          facts[key] = candidate(text, value, start, end, {
            uncertain: isUncertain(m[1]),
          });
      }
    }
    if (d.type === "boolean" && d.parse?.words) {
      const f = extractBoolean(text, d.parse.words);
      if (f) facts[key] = f;
    }
    if (d.type === "number") {
      const re =
        key === "capacity"
          ? /(\d[\d ]*)\s*(?:gäster|personer|deltagare|besökare|sittplatser)/giu
          : key === "portions"
            ? /(\d+)\s*portioner\s*(?:per|om|\/)\s*dag/giu
            : /(\d+)\s*(?:m²|kvm|kvadratmeter)/giu;
      const f = extractNumber(text, re, d);
      if (f) facts[key] = f;
    }
  }
  const property = text.match(
    /(?:fastighet(?:en|sbeteckning)?\s*(?:är|:)?\s+)([\p{L}][\p{L} \-]*\s+\d+:\d+)/iu,
  );
  if (property && s.fields.property_id) {
    const start = property.index + property[0].indexOf(property[1]);
    facts.property_id = candidate(
      text,
      property[1],
      start,
      start + property[1].length,
    );
  }
  const use = text.match(
    /lokalen (?:är|används som)\s+(?:en |ett )?(restaurang|butik|kontor|lager|bostad)/iu,
  );
  if (use && s.fields.current_use)
    facts.current_use = candidate(
      text,
      use[1].replace(/^./, (x) => x.toUpperCase()),
      use.index,
      use.index + use[0].length,
    );
  const food = text.match(
    /(?:lagar|tillagar) (?:maten|mat) på plats|värmer (?:färdig mat|upp maten)|serverar (?:endast |bara )?färdig mat/iu,
  );
  if (food && s.fields.food_preparation)
    facts.food_preparation = candidate(
      text,
      /^(lagar|tillagar)/iu.test(food[0])
        ? "Tillagning på plats"
        : /^värmer/iu.test(food[0])
          ? "Uppvärmning av färdig mat"
          : "Endast servering av färdig mat",
      food.index,
      food.index + food[0].length,
    );
  if (
    s.fields.public_land &&
    /privat mark/iu.test(text) &&
    !facts.public_land
  ) {
    const m = text.match(/privat mark/iu);
    facts.public_land = candidate(text, false, m.index, m.index + m[0].length);
  }
  if (s.fields.origin) {
    const m = text.match(/(?<![\p{L}])(hushåll|verksamhet)(?![\p{L}])/iu);
    if (m)
      facts.origin = candidate(
        text,
        m[0].replace(/^./, (x) => x.toUpperCase()),
        m.index,
        m.index + m[0].length,
        { uncertain: true },
      );
  }
  return { facts, invalid };
}
/** Local deterministic parsing. Explicit scenario selection is separate from fact confidence. */
export function parseIntake(input, scenario, { goalSelected = false } = {}) {
  const text = String(input).slice(0, 3000),
    intent = detectIntent(text),
    unsupported = [],
    uncertain = [];
  const result =
    scenario.id === "restaurant.trelleborg"
      ? parseRestaurant(text)
      : genericFacts(text, scenario);
  const facts = result.facts;
  if (dangerous.test(text))
    unsupported.push(
      "Målet innehåller en verksamhet som piloten inte stöder. Automatiseringen stoppas; frågan behöver tas om hand av en människa.",
    );
  if (intent.goals.length > 1)
    unsupported.push(
      "Texten innehåller flera ärendemål. Välj ett mål och skapa ett separat ärende för varje åtgärd.",
    );
  const outside = text.match(
    /(?<![\p{L}])(?:i |,\s*)(Malmö|Lund|Stockholm|Göteborg|Helsingborg|Ystad)(?![\p{L}])/iu,
  );
  if (outside)
    unsupported.push(
      "De kommunala pilotflödena gäller Trelleborg. En annan kommun kräver manuell hänvisning.",
    );
  const suggestedScenario =
    intent.goal && intent.goal !== scenario.id ? intent.goal : null;
  let goal = suggestedScenario
    ? null
    : intent.goal || (goalSelected ? scenario.id : null);
  if (
    !intent.goal &&
    !goalSelected &&
    text.trim().length > 25 &&
    !extractAddress(text) &&
    !/^\s*(jag|vi)\s+(vill|ska|tänker)\s+\p{L}+\s*$/iu.test(text)
  )
    unsupported.push(
      "Vi kunde inte säkert identifiera ett ärendemål. Välj en ärendetyp i katalogen eller lämna frågan till en människa.",
    );
  if (intent.goals[0]?.uncertain && !suggestedScenario)
    uncertain.push({
      key: "goal",
      message: `Bekräfta att ditt mål är: ${scenario.title.toLowerCase()}.`,
    });
  for (const [key, f] of Object.entries(facts))
    if (f.status === "uncertain")
      uncertain.push({
        key,
        message: "Tolkningen behöver bekräftas.",
        source: f.source,
      });
  // Keep the reviewed restaurant scope, but café/foodtruck/etc now have their own explicit flows.
  if (scenario.id === "restaurant.trelleborg" && !suggestedScenario) {
    unsupported.push(
      ...result.unsupported.filter(
        (x) => !x.startsWith("Första versionen stöder"),
      ),
    );
    uncertain.push(
      ...result.uncertain.filter(
        (x) => x.key !== "goal" && !uncertain.some((q) => q.key === x.key),
      ),
    );
  }
  if (result.invalid?.length)
    uncertain.push({
      key: "opening_date",
      message:
        "Ange ett giltigt kalenderdatum; textens datum gick inte att tolka.",
    });
  if (scenario.fields.end_date) {
    // An unlabeled pair of dates has no known roles: ask instead of assigning the first as start.
    if (facts.opening_date?.status === "uncertain" && !facts.end_date)
      uncertain.push({
        key: "end_date",
        message: "Bekräfta vilket datum som är slutdatum.",
      });
  }
  return {
    goal,
    facts,
    missing: diagnose(scenario, facts).missing,
    uncertain,
    unsupported: [...new Set(unsupported)],
    corrections: intent.corrections,
    suggestedScenario,
    method: "local.deterministic.sv.v3",
  };
}
