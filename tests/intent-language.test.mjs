import test from "node:test";
import assert from "node:assert/strict";
import {
  NATIONAL_SCENARIOS,
  SCENARIOS,
  registry,
} from "../src/domain/catalog.mjs";
import { detectIntent, parseIntake } from "../src/domain/intake-parser.mjs";

// Real formulations, independent of the matching vocabulary. In particular,
// adding a definite article ending must not turn a supported goal into null.
const examples = [
  ["Bygga ut altan", "building.deck.se"],
  ["Bygga ut altanen", "building.deck.se"],
  ["Hej, jag skulle vilja bygga ut altan", "building.deck.se"],
  ["Hej, jag skulle vilja bygga ut altanen", "building.deck.se"],
  ["Jag bygger ut min befintliga altan", "building.deck.se"],
  ["Vi vill förlänga altanen", "building.deck.se"],
  ["Vi planerar två altaner", "building.deck.se"],
  ["Vi ska bygga om altanerna", "building.deck.se"],
  ["Jag vill bygga garaget", "building.garage.se"],
  ["Vi bygger balkongen", "building.balcony.se"],
  ["Jag ska byta ut mina fönster", "building.windows.se"],
  ["Hej, vi byter fönstren", "building.windows.se"],
  ["Vi ska byta det befintliga taket", "building.roof.se"],
  ["Jag vill ändra fasaden", "building.facade.se"],
  ["Jag ska bygga en takkupa", "building.dormer.se"],
  ["Vi bygger takkuporna", "building.dormer.se"],
  ["Jag vill bygga till mitt hus", "building.extension.se"],
  ["Vi vill bygga uterummet", "building.conservatory.se"],
  ["Vi bygger murarna", "building.wall.se"],
  ["Jag vill riva den gamla byggnaden", "building.demolition.se"],
  ["Jag river byggnaden", "building.demolition.se"],
  ["Vi installerar solcellerna", "building.solar.se"],
  ["Jag ska ändra den bärande väggen", "building.structure.se"],
  ["Jag vill installera braskaminen", "building.chimney.se"],
  ["Vi öppnar restaurangen", "restaurant.se"],
  ["Jag öppnar den nya butiken", "business.shop.se"],
  ["Vi skulle vilja öppna ett litet kafé", "food.cafe.se"],
  ["Vi ska starta bageriet", "food.bakery.se"],
  ["Jag vill öppna frisörsalongen", "business.hairdresser.se"],
  ["Vi startar gymmet", "business.gym.se"],
  ["Jag ska avsluta livsmedelsverksamheten", "food.foodclose.se"],
  ["Vi arrangerar festivalen", "events.festival.se"],
  ["Jag vill anordna konserten", "events.concert.se"],
  ["Vi planerar evenemanget", "events.event.se"],
  ["Vi ska ordna marknaden", "events.market.se"],
  ["Jag vill placera containern", "publicspace.container.se"],
  ["Vi placerar byggställningen", "publicspace.scaffolding.se"],
  ["Jag ska förbereda uteserveringen", "publicspace.outdoorseating.se"],
  ["Vi ska installera värmepumpen", "environment.heatpump.se"],
  ["Jag vill installera värmepumparna", "environment.heatpump.se"],
  ["Jag vill ändra avloppsanläggningen", "environment.sewagechange.se"],
  ["Vi förbereder ett enskilt avlopp", "environment.smallsewage.se"],
  ["Jag vill anmäla bullerstörningen", "environment.noise.se"],
  ["Jag vill byta vattenmätaren", "waterwaste.watermeter.se"],
  ["Vi vill ansluta fastigheten till VA", "waterwaste.waterconnection.se"],
  ["Jag felanmäler vattenläckan", "waterwaste.waterleak.se"],
  ["Jag vill rapportera potthålen", "traffic.pothole.se"],
  ["Vi förbereder trafikanordningsplanen", "traffic.trafficplan.se"],
  ["Vi ska boka sporthallen", "associations.facility.se"],
  ["Jag vill starta föreningen", "associations.association.se"],
  ["Vi frågar om föreningsbidraget", "associations.associationgrant.se"],
  [
    "Jag vill planera yrkesutbildningen för vuxna",
    "education.adultvocational.se",
  ],
];
for (const [text, id] of examples) {
  test(`ordinary Swedish: ${text}`, () => {
    const intent = detectIntent(text, NATIONAL_SCENARIOS);
    assert.equal(intent.goal, id);
    assert.equal(intent.goals[0].uncertain, false);
    assert.equal(intent.goals[0].fuzzy, false);
    assert.equal(
      text.slice(intent.goals[0].start, intent.goals[0].end),
      intent.goals[0].source,
    );
    const parsed = parseIntake(text, registry[id]);
    assert.equal(parsed.goal, id);
    assert.deepEqual(parsed.unsupported, []);
    assert.equal(
      parsed.uncertain.some((x) => x.key === "goal"),
      false,
    );
  });
}

test("ordinary inflections work in preserved legacy scenarios too", () => {
  const text = "Jag vill bygga ut altanen i Trelleborg.";
  assert.equal(detectIntent(text, SCENARIOS).goal, "building.deck.trelleborg");
});
test("noun endings do not consume arbitrary compounds or unrelated words", () => {
  for (const text of [
    "Jag vill bygga altanprojektet",
    "Jag vill diskutera balkongdörren",
    "Jag vill planera garagemusik",
    "Jag vill planera murgröna",
    "Jag vill byta taktik",
    "Jag vill öppna butiksprogrammet",
    "Jag vill planera festivalbesöket",
  ]) {
    assert.equal(detectIntent(text, NATIONAL_SCENARIOS).goal, null, text);
  }
});
test("negation, uncertainty, spelling mistakes and competing goals stay explicit", () => {
  for (const text of [
    "Jag vill inte bygga ut altanen",
    "Vi kanske bygger altaner",
    "Jag skulle eventuellt vilja öppna butiken",
    "Jag vill bygga altann",
  ]) {
    const intent = detectIntent(text, NATIONAL_SCENARIOS);
    assert.ok(intent.goal, text);
    assert.equal(intent.goals[0].uncertain, true, text);
  }
  const text = "Jag vill bygga ut altanen och bygga garaget";
  assert.equal(detectIntent(text, NATIONAL_SCENARIOS).goal, null);
  assert.ok(
    parseIntake(text, registry["building.deck.se"]).unsupported.some((s) =>
      s.includes("flera ärendemål"),
    ),
  );
  assert.equal(
    detectIntent("Jag vill byta absolut inte taket", NATIONAL_SCENARIOS).goal,
    null,
  );
  assert.equal(
    detectIntent(
      "Jag öppnar restaurangen. Lokalen är en butik.",
      NATIONAL_SCENARIOS,
    ).goal,
    "restaurant.se",
  );
});
test("rewording a goal preserves factual values and exact original source spans", () => {
  for (const goal of [
    "Bygga ut altan",
    "Bygga ut altanen",
    "Hej, jag skulle vilja bygga ut altanen",
  ]) {
    const text =
      goal + " i Uppsala. Ytan blir 30 kvm. Fastighet: Luthagen 1:2.";
    const parsed = parseIntake(text, registry["building.deck.se"]);
    assert.equal(parsed.facts.municipality.value, "Uppsala");
    assert.equal(parsed.facts.area.value, 30);
    assert.equal(parsed.facts.property_id.value, "Luthagen 1:2");
    for (const fact of Object.values(parsed.facts)) {
      assert.equal(
        text
          .slice(fact.sourceSpan.start, fact.sourceSpan.end)
          .trim()
          .slice(0, 240),
        fact.source,
      );
    }
  }
});
