import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { NATIONAL_SCENARIOS, registry } from "../src/domain/catalog.mjs";
import { detectIntent, parseIntake } from "../src/domain/intake-parser.mjs";
import { extractBoolean, extractAddress } from "../src/domain/extractors.mjs";
import {
  swedishNumber,
  extractQuantity,
} from "../src/domain/swedish-numbers.mjs";
const detect = (text) => detectIntent(text, NATIONAL_SCENARIOS);
// Written as citizen utterances, independently of catalog aliases. The corpus
// covers all service families, suffixes, compounds, colloquialisms and grammar.
const clear = [
  ["Skulle gärna vilja utvidga altanen", "building.deck"],
  ["Vi tänker renovera våra altaner", "building.deck"],
  ["Jag behöver hjälp med altanbygget", "building.deck"],
  ["Garaget ska byggas", "building.garage"],
  ["Vi vill bygga carportarna", "building.carport"],
  ["Jag vill bygga en trädgårdsbod", "building.outbuilding"],
  ["Jag vill ha bygglov för gäststugan", "building.guesthouse"],
  ["Jag behöver förstora uterummet", "building.conservatory"],
  ["Balkongens utbyggnad ska planeras", "building.balcony"],
  ["Vi vill bygga fler takkupor", "building.dormer"],
  ["Vi vill lägga om vårt gamla tak", "building.roof"],
  ["Jag behöver hjälp med fasadbytet", "building.facade"],
  ["Jag skulle behöva göra ett fönsterbyte", "building.windows"],
  ["Vi vill installera solpanelerna", "building.solar"],
  ["Jag behöver installera en vedspis", "building.chimney"],
  ["Vi vill installera ventilationssystemet", "building.ventilation"],
  ["Jag vill ta bort en bärande vägg", "building.structure"],
  ["Jag vill göra om garaget till bostad", "building.changeuse"],
  ["Vi ska inreda ytterligare en bostad", "building.splitdwelling"],
  ["Jag behöver rivningslov", "building.demolition"],
  ["Vi ska höja marken", "building.earthworks"],
  ["Jag vill bygga stödmuren", "building.wall"],
  ["Jag vill söka skyltlov", "building.buildsign"],
  ["Vi vill bygga växthuset", "building.greenhouse"],
  ["Jag behöver en nybyggnads karta", "building.buildingmap"],
  ["Vi vill bygga en villa", "building.newhouse"],
  ["Jag vill bygga ut villan", "building.extension"],
  ["Jag skulle vilja starta en krog", "restaurant"],
  ["Vi vill öppna ett matställe", "restaurant"],
  ["Vi ska starta fiket", "food.cafe"],
  ["Jag vill driva en food truck", "food.foodtruck"],
  ["Vi vill starta konditoriet", "food.bakery"],
  ["Jag ska öppna en cateringfirma", "food.catering"],
  ["Vi vill öppna ett gatukök", "food.kiosk"],
  ["Jag vill sälja glass", "food.icecream"],
  ["Jag skulle vilja öppna en mataffär", "food.foodshop"],
  ["Vi ska tillverka livsmedel", "food.foodproduction"],
  ["Vi behöver ändra matverksamheten", "food.foodchange"],
  ["Vi vill lägga ner livsmedelsverksamheten", "food.foodclose"],
  ["Jag vill öppna en affär", "business.shop"],
  ["Vi ska öppna en återbruksbutik", "business.secondhand"],
  ["Jag vill starta nätbutiken", "business.ecommerce"],
  ["Vi ska öppna pensionatet", "business.hotel"],
  ["Jag vill öppna en frisör", "business.hairdresser"],
  ["Vi ska starta tatueringssalongen", "business.tattoo"],
  ["Jag vill öppna nagelsalongen", "business.beauty"],
  ["Jag vill öppna en träningslokal", "business.gym"],
  ["Vi vill registrera företaget", "business.companyregistration"],
  ["Vi vill anordna musikfestivalen", "events.festival"],
  ["Jag vill arrangera spelningen", "events.concert"],
  ["Vi vill anordna julmarknaden", "events.market"],
  ["Jag vill ordna en bakluckeloppis", "events.fleamarket"],
  ["Vi ska arrangera löpningstävlingen", "events.race"],
  ["Vi ska anordna manifestationen", "events.demonstration"],
  ["Jag vill ordna ett karnevalståg", "events.parade"],
  ["Vi ska arrangera en idrottstävling", "events.sportsevent"],
  ["Jag vill ordna en konstutställning", "events.exhibition"],
  ["Vi tänker arrangera ett event", "events.event"],
  ["Jag vill ha bord på trottoaren", "publicspace.outdoorseating"],
  ["Vi behöver en byggcontainer", "publicspace.container"],
  ["Jag behöver ställa upp byggställningen", "publicspace.scaffolding"],
  ["Jag vill ställa upp en trottoarpratare", "publicspace.pavementsign"],
  ["Vi vill placera ett marknadsstånd", "publicspace.stall"],
  ["Vi ska filma på gatan", "publicspace.filming"],
  [
    "Vi vill placera ett tillfälligt konstverk",
    "publicspace.temporaryinstallation",
  ],
  ["Vi vill placera ett informationsstånd", "publicspace.promotional"],
  ["Vi behöver upplag på gatan", "publicspace.constructionstorage"],
  ["Jag vill börja med ambulerande försäljning", "publicspace.mobilevending"],
  ["Jag vill borra för bergvärme", "environment.heatpump"],
  ["Vi behöver ett minireningsverk", "environment.smallsewage"],
  ["Jag vill bygga om avloppet", "environment.sewagechange"],
  ["Vi vill installera en oljetank", "environment.oiltank"],
  ["Jag vill anmäla oljud", "environment.noise"],
  ["Vi vill anmäla dålig lukt", "environment.odour"],
  ["Jag vill anmäla skräp", "environment.litter"],
  ["Vi behöver hantera miljöfarligt avfall", "environment.hazardouswaste"],
  ["Jag behöver hjälp med företagsavfallet", "environment.businesswaste"],
  [
    "Jag vill fråga om en miljöfråga för verksamheten",
    "environment.environmentalbusiness",
  ],
  ["Jag vill ansluta kommunalt vatten", "waterwaste.waterconnection"],
  ["Vi behöver ändra vattenanslutningen", "waterwaste.waterchange"],
  ["Jag vill byta vatten mätaren", "waterwaste.watermeter"],
  ["Jag vill anmäla en vatten läcka", "waterwaste.waterleak"],
  ["Jag vill anmäla brunt kranvatten", "waterwaste.waterquality"],
  ["Vi behöver hjälp med regnvatten på tomten", "waterwaste.stormwater"],
  ["Jag behöver ett sopabonnemang", "waterwaste.wastesubscription"],
  ["Soporna blev inte hämtade", "waterwaste.missedcollection"],
  ["Jag vill byta soptunnan", "waterwaste.wastecontainer"],
  ["Jag vill kompostera hemma", "waterwaste.compost"],
  ["Jag vill gräva i gatan", "traffic.excavation"],
  ["Vi behöver en TA plan", "traffic.trafficplan"],
  ["Vi vill söka dispens för en bred transport", "traffic.transport"],
  ["Jag vill felanmäla gatlampan", "traffic.lighting"],
  ["Jag vill anmäla ett hål i vägen", "traffic.pothole"],
  ["Vi vill anmäla en skada på cykelvägen", "traffic.cycling"],
  ["Jag vill söka vägbidrag", "traffic.roadgrant"],
  ["Jag vill söka grundläggande komvux", "education.adultbasic"],
  ["Vi vill söka yrkesutbildning på komvux", "education.adultvocational"],
  ["Jag behöver en studievägledare", "education.counselling"],
  ["Vi behöver skolbuss", "education.schooltransport"],
  ["Jag vill bilda en förening", "associations.association"],
  ["Vi vill boka gympasalen", "associations.facility"],
  ["Jag vill söka bidrag till föreningen", "associations.associationgrant"],
  ["Vi vill söka kulturbidrag", "associations.culturegrant"],
  ["Jag vill söka dagisplats", "education.preschool"],
  ["Mitt barn ska börja på dagis", "education.preschool"],
  ["Vi skulle vilja byta förskola", "education.preschool"],
  ["Jag behöver en förskoleplats", "education.preschool"],
  ["Jag vill ställa mitt barn i förskolekön", "education.preschool"],
  ["Barnet ska börja i nollan", "education.school"],
  ["Vi vill ansöka om plats i grundskolan", "education.school"],
  ["Jag vill välja skola", "education.school"],
  ["Vi söker skolplatsen", "education.school"],
];
for (const [text, id] of clear)
  test(`Swedish corpus: ${text}`, () => {
    const d = detect(text);
    assert.equal(d.goal, id + ".se");
    assert.equal(d.goals[0].uncertain, false);
    assert.equal(d.goals[0].fuzzy, false);
    assert.equal(
      text.slice(d.goals[0].start, d.goals[0].end),
      d.goals[0].source,
    );
    assert.deepEqual(parseIntake(text, registry[id + ".se"]).unsupported, []);
  });
test("catalog-wide polite/modal, case and Unicode variants retain their interpretation", () => {
  for (const s of NATIONAL_SCENARIOS)
    for (const transform of [
      (t) => "Hej! " + t,
      (t) => t.toUpperCase(),
      (t) => t.normalize("NFD"),
      (t) => t.replaceAll(" vill ", " skulle gärna vilja "),
    ]) {
      const t = transform(s.example);
      assert.equal(detect(t).goal, s.id, t);
    }
});
test("spelling, transposition and missing diacritics are suggestions, never certain goals", () => {
  for (const [text, id] of [
    ["Jag vill bygga galaget", "building.garage"],
    ["Jag vill bygga garagge", "building.garage"],
    ["Jag vill bygga blatong", "building.balcony"],
    ["Jag vill bygga balknog", "building.balcony"],
    ["Jag vill öppna resturangen", "restaurant"],
    ["Jag vill söka daggisplats", "education.preschool"],
    ["Jag vill söka forskoleplats", "education.preschool"],
    ["Vi vill installera solpanler", "building.solar"],
    ["Vi vill bygga altann", "building.deck"],
  ]) {
    if (text.includes("blatong")) {
      assert.equal(detect(text).goal, null);
      continue;
    } // two edits, no guess
    const d = detect(text);
    assert.equal(d.goal, id + ".se", text);
    assert.equal(d.goals[0].uncertain, true, text);
    assert.ok(d.corrections.length, text);
  }
});
test("background, employment and unrelated compounds do not create applications", () => {
  for (const t of [
    "Jag vill öppna dagis",
    "Vi ska bygga en skola",
    "Jag vill söka jobb på förskolan",
    "Jag arbetar i skolan",
    "Mitt barn går redan på dagis",
    "Vi har ett garage",
    "Jag vill köpa en balkongdörr",
    "Jag vill lyssna på garagemusik",
    "Jag behöver en förskolelärare",
    "Jag vill spela skolbussimulator",
    "Jag vill byta taktik",
    "Jag vill resa till Spanien",
    "Jag vill ha dagisavgiften",
  ])
    assert.equal(detect(t).goal, null, t);
  assert.equal(
    detect("Vi vill byta fönster i garaget").goal,
    "building.windows.se",
  );
});
test("negation, modal conditions, history and correction have separate meanings", () => {
  for (const [t, prop, v] of [
    ["Jag vill inte bygga garage", "polarity", "negative"],
    ["Vi har redan byggt altanen", "tense", "past"],
    ["Om jag skulle bygga altanen", "modality", "conditional"],
    ["Får jag bygga garage?", "modality", "question"],
    ["Jag kanske vill bygga altanen", "modality", "possible"],
  ]) {
    const d = detect(t);
    assert.equal(d.goals.length, 1, t);
    assert.equal(d.goals[0][prop], v, t);
    assert.equal(d.goals[0].uncertain, true, t);
  }
  for (const t of [
    "Jag vill inte bygga garage utan altan",
    "Jag har byggt garage. Nu vill jag bygga altanen",
    "Jag vill bygga garage. Nej, jag menar altan",
    "Jag vill bygga garage och altan istället",
  ])
    assert.equal(detect(t).goal, "building.deck.se", t);
  assert.equal(
    detect("Jag vill inte bygga garage och jag vill söka dagisplats").goal,
    "education.preschool.se",
  );
});
test("multiple versus alternative goals retain source evidence and never share facts", () => {
  for (const [t, ids, relation] of [
    [
      "Jag vill bygga ett garage på 30 kvm i Uppsala och söka dagisplats i Lund",
      ["building.garage.se", "education.preschool.se"],
      "multiple",
    ],
    [
      "Jag vill inte bara bygga garage utan också altan",
      ["building.garage.se", "building.deck.se"],
      "multiple",
    ],
    [
      "Vi vill bygga garage eller altan",
      ["building.garage.se", "building.deck.se"],
      "alternative",
    ],
    [
      "Jag vill bygga garage och söka daggisplats",
      ["building.garage.se", "education.preschool.se"],
      "multiple",
    ],
  ]) {
    const d = detect(t);
    assert.deepEqual(
      d.goals.map((g) => g.id),
      ids,
      t,
    );
    assert.equal(d.relation, relation);
    for (const g of d.goals) assert.equal(t.slice(g.start, g.end), g.source);
    const p = parseIntake(t, registry[ids[0]]);
    assert.deepEqual(p.facts, {});
    assert.deepEqual(p.goals, d.goals);
  }
});
test("Swedish quantities retain units, ranges, uncertainty and original spans", () => {
  for (const [word, n] of [
    ["trettiofem", 35],
    ["två hundra fyrtio", 240],
    ["etthundratjugo", 120],
    ["ett tusen tvåhundra", 1200],
    ["sjuttiosju", 77],
  ]) {
    assert.equal(swedishNumber(word), n);
    const t = `Jag vill bygga altanen på ${word} kvadratmeter.`;
    const f = parseIntake(t, registry["building.deck.se"]).facts.area;
    assert.equal(f.value, n);
    assert.equal(t.slice(f.sourceSpan.start, f.sourceSpan.end), f.source);
  }
  for (const t of [
    "cirka trettio kvm",
    "drygt 40 kvm",
    "30–40 kvm",
    "trettio eller fyrtio kvm",
  ])
    assert.equal(extractQuantity(t, "kvm")?.status, "uncertain", t);
  assert.equal(extractQuantity("2,5 kvm", "kvm"), null);
  assert.equal(
    extractQuantity("trettioett tusen gäster", "gäster", { max: 1000 }),
    null,
  );
  const p = parseIntake(
    "Jag vill öppna restaurang för fyrtio gäster. Vi lagar etthundratjugo portioner per dag.",
    registry["restaurant.se"],
  );
  assert.equal(p.facts.capacity.value, 40);
  assert.equal(p.facts.portions.value, 120);
});
test("education fields preserve natural dates and omit names/identities", () => {
  const t =
    "Jag vill söka dagisplats i Uppsala till hösten 2027. Barnet är tre år. Önskad förskola: Solrosen.";
  const p = parseIntake(t, registry["education.preschool.se"]);
  assert.equal(p.facts.child_age.value, 3);
  assert.equal(p.facts.start_period.value, "hösten 2027");
  assert.equal(p.facts.preferred_school.value, "Solrosen");
  assert.equal(p.facts.municipality.value, "Uppsala");
  for (const f of Object.values(p.facts))
    assert.equal(
      t.slice(f.sourceSpan.start, f.sourceSpan.end).trim(),
      f.source,
    );
  for (const [text, year] of [
    ["årskurs två", "Årskurs 2"],
    ["åk 3", "Årskurs 3"],
    ["förskoleklassen", "Förskoleklass"],
    ["nollan", "Förskoleklass"],
  ])
    assert.equal(
      parseIntake(
        "Vi söker skolplats i Lund till hösten 2027. " + text,
        registry["education.school.se"],
      ).facts.school_year.value,
      year,
    );
  assert.equal(
    parseIntake(
      "Vi söker dagisplats. Barnet är 3 år och vårt andra barn är 5 år.",
      registry["education.preschool.se"],
    ).facts.child_age.status,
    "uncertain",
  );
});
test("sentence boundaries keep municipality out of street addresses", () => {
  assert.equal(
    extractAddress("Vi vill bygga altan i Uppsala. Storgatan 12.").value,
    "Storgatan 12",
  );
});
test("bounded matching remains interactive on maximum input and repeated unknown words", () => {
  const t =
    "ordutanmening ".repeat(215).slice(0, 2950) + " Jag vill bygga altanen";
  const start = performance.now();
  assert.equal(detect(t).goal, "building.deck.se");
  assert.ok(performance.now() - start < 1500);
});

test("repeated nouns cannot undo intent but an explicit retraction can", () => {
  assert.equal(
    detect("Jag vill söka dagisplats. Önskad förskola: Solrosen.").goals[0]
      .uncertain,
    false,
  );
  assert.equal(
    detect("Jag vill bygga garage. Jag vill inte bygga garage.").goals[0]
      .polarity,
    "negative",
  );
  for (const text of [
    "Jag vill bytta fönster",
    "Jag vill instalera ventilation",
  ])
    assert.equal(detect(text).goals[0].uncertain, true);
});
test("negated facts after the noun and inflected fact vocabulary retain polarity", () => {
  assert.equal(
    extractBoolean("Alkohol vill vi inte servera.", "alkohol").value,
    false,
  );
  assert.equal(
    extractBoolean(
      "Vi ska inte servera alkohol och vi vill ha uteservering.",
      "uteservering",
    ).value,
    true,
  );
  assert.equal(
    extractBoolean("Vi vill inte bara servera vin utan också öl.", "vin|öl")
      .value,
    true,
  );
  assert.equal(
    extractBoolean("Vi ska använda den offentliga platsen.", "offentlig plats")
      .value,
    true,
  );
});

test("postposed negation and passive past do not become new positive plans", () => {
  assert.equal(
    detect("Garaget vill jag inte bygga").goals[0].polarity,
    "negative",
  );
  assert.equal(detect("Altanen har byggts").goals[0].tense, "past");
  assert.equal(
    detect("Jag önskar bygga altanen").goals[0].tense,
    "prospective",
  );
  assert.equal(detect("Jag tänkte bygga altanen").goals[0].uncertain, false);
  assert.equal(
    detect("Vi vill öppna restaurang. Vi vill installera ventilation i huset.")
      .goals.length,
    2,
  );
});
