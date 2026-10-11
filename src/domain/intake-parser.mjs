import { SCENARIOS, NATIONAL_SCENARIOS } from "./catalog.mjs";
import { extractMunicipality } from "./municipalities.mjs";
import { educationFacts } from "./education-extractors.mjs";
import { extractQuantity } from "./swedish-numbers.mjs";
import { parseRestaurant } from "./parser.mjs";
import {
  candidate,
  context,
  extractAddress,
  extractBoolean,
  extractDate,
  isUncertain,
} from "./extractors.mjs";
import { diagnose, validateValue } from "./core.mjs";
import { detectSwedishIntent } from "./intent-detection.mjs";
export const detectIntent = (text, scenarios = SCENARIOS) =>
  detectSwedishIntent(text, scenarios);
const dangerous =
  /(?<![\p{L}])(?:kärnkraft|vapen|fyrverkeri\w*|sprängämne\w*|explosiv\w*|asyl|akutmottagning|vårdcentral)(?![\p{L}])/iu;
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
    intent = detectIntent(
      text,
      scenario.jurisdiction === "SE" ? NATIONAL_SCENARIOS : SCENARIOS,
    ),
    unsupported = [],
    uncertain = [];
  const result =
    scenario.id === "restaurant.trelleborg" ||
    scenario.templateId === "restaurant.trelleborg"
      ? parseRestaurant(text, {
          jurisdictionAgnostic: scenario.jurisdiction === "SE",
          maxCapacity: scenario.fields.capacity.max,
        })
      : genericFacts(text, scenario);
  const facts = { ...result.facts, ...educationFacts(text, scenario) };
  for (const [key, units] of Object.entries({
    capacity: "gäster|personer|deltagare|besökare|sittplatser",
    portions: "portioner\\s*(?:per|om|/)\\s*dag",
    area: "m²|kvm|kvadratmeter",
    outdoor_area: "m²|kvm|kvadratmeter",
  })) {
    if (scenario.fields[key]) {
      const f = extractQuantity(text, units, scenario.fields[key]);
      if (f) facts[key] = f;
    }
  }
  if (scenario.jurisdiction === "SE") {
    delete facts.municipality;
    const m = extractMunicipality(text);
    if (m) facts.municipality = m;
  }
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
  if (outside && scenario.jurisdiction !== "SE")
    unsupported.push(
      "De kommunala pilotflödena gäller Trelleborg. En annan kommun kräver manuell hänvisning.",
    );
  const suggestedScenario =
    intent.goal && intent.goal !== scenario.id ? intent.goal : null;
  const goal = suggestedScenario
    ? null
    : intent.goal || (goalSelected ? scenario.id : null);
  if (
    !intent.goal &&
    !intent.goals.length &&
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
  if (
    (scenario.id === "restaurant.trelleborg" ||
      scenario.templateId === "restaurant.trelleborg") &&
    !suggestedScenario
  ) {
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
  // A multi-goal input has no shared fact bag: numbers, addresses and dates
  // must not silently cross from one intended service into another.
  if (intent.goals.length > 1)
    for (const key of Object.keys(facts)) delete facts[key];
  return {
    goals: intent.goals,
    mentions: intent.mentions,
    goalRelation: intent.relation,
    goal,
    facts,
    missing: diagnose(scenario, facts).missing,
    uncertain,
    unsupported: [...new Set(unsupported)],
    corrections: intent.corrections,
    suggestedScenario,
    method: "local.deterministic.sv.v5",
  };
}
