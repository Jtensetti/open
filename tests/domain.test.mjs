import test from "node:test";
import assert from "node:assert/strict";
import { parseRestaurant } from "../src/domain/parser.mjs";
import {
  newCase,
  applyCommand,
  packetFor,
  diagnose,
  validDate,
} from "../src/domain/core.mjs";
import { RESTAURANT } from "../src/domain/restaurant.mjs";
import { facts, fixture } from "./helpers.mjs";
const actor = { id: "owner", role: "citizen" },
  at = "2026-10-08T08:00:00Z";
const ready = () =>
  applyCommand(
    newCase("case1", "owner", at),
    { type: "replace_facts", facts: facts(), inputStatus: "supported" },
    actor,
    at,
  ).state;
test("parser handles known typo, negations, uncertain wine and source spans", () => {
  const p = parseRestaurant(
    "Jag vill öppna en resturang i Trelleborg för 40 gäster. Vi ska inte servera alkohol men vi vill ha uteservering.",
  );
  assert.equal(p.goal, RESTAURANT.id);
  assert.equal(p.facts.alcohol.value, false);
  assert.equal(p.facts.outdoor.value, true);
  assert.equal(p.corrections[0].from, "resturang");
  assert.equal(
    parseRestaurant("Jag vill öppna en restaurang. Vi kanske serverar vin.")
      .facts.alcohol.status,
    "uncertain",
  );
  for (const f of Object.values(p.facts))
    assert.ok(f.sourceSpan.end > f.sourceSpan.start);
});
test("contradictory alcohol, goals without intent and fuzzy spellings ask for confirmation", () => {
  assert.equal(
    parseRestaurant(
      "Jag vill öppna restaurang. Vi serverar vin. Vi serverar inte alkohol.",
    ).facts.alcohol.status,
    "uncertain",
  );
  assert.ok(
    parseRestaurant("Restaurang med 40 gäster").uncertain.some(
      (x) => x.key === "goal",
    ),
  );
  assert.ok(
    parseRestaurant("Jag vill öppna restaurangx").uncertain.some(
      (x) => x.key === "goal",
    ),
  );
});
test("unsupported operations and mixed goals are not admitted", () => {
  for (const text of [
    "Jag vill öppna en restaurang och en vårdcentral.",
    "Jag vill stänga en restaurang.",
    "Jag vill öppna en restaurang i Malmö.",
    "Jag vill öppna en restaurang för 900 gäster.",
    "Jag vill öppna en restaurang och bygga ett hotell.",
  ])
    assert.ok(parseRestaurant(text).unsupported.length, text);
});
test("invalid dates remain uncertain instead of normalizing to a different day", () => {
  assert.equal(validDate("2027-02-30"), false);
  assert.ok(
    parseRestaurant("Jag vill öppna restaurang den 2027-13-01.").uncertain.some(
      (x) => x.key === "opening_date",
    ),
  );
});
test("conditional questions are activated only by relevant answers", () => {
  const noOutdoor = facts({ ...fixture, outdoor: false });
  delete noOutdoor.public_land;
  delete noOutdoor.outdoor_area;
  assert.equal(diagnose(RESTAURANT, noOutdoor).ready, true);
  const yesOutdoor = {
    ...noOutdoor,
    outdoor: { ...noOutdoor.outdoor, value: true },
  };
  assert.ok(diagnose(RESTAURANT, yesOutdoor).missing.includes("public_land"));
  assert.equal(diagnose(RESTAURANT, {}).questions[0].key, "municipality");
});
test("rules route to responsible organisations and avoid automatic legal conclusions", () => {
  const state = ready();
  assert.ok(state.tasks.some((t) => t.authority === "trelleborg.alcohol"));
  assert.ok(state.tasks.some((t) => t.authority === "police.public_space"));
  assert.ok(!state.tasks.some((t) => t.key === "building_assessment"));
  const updated = applyCommand(
    state,
    {
      type: "replace_facts",
      facts: facts({ ...fixture, current_use: "Butik" }),
      inputStatus: "supported",
    },
    actor,
    at,
  ).state;
  assert.ok(updated.tasks.some((t) => t.key === "building_assessment"));
});
test("submission is blocked for missing, uncertain and unsupported input", () => {
  assert.throws(() =>
    applyCommand(
      newCase("x", "owner", at),
      { type: "submit", confirmScope: true },
      actor,
      at,
    ),
  );
  for (const status of ["uncertain", "unsupported"]) {
    const s = applyCommand(
      ready(),
      { type: "replace_facts", facts: facts(), inputStatus: status },
      actor,
      at,
    ).state;
    assert.throws(() =>
      applyCommand(s, { type: "submit", confirmScope: true }, actor, at),
    );
    if (status === "unsupported") assert.equal(s.tasks.length, 0);
  }
});
test("parallel tasks support completion loops and only relevant decisions are invalidated", () => {
  let s = applyCommand(
    ready(),
    { type: "submit", confirmScope: true },
    actor,
    at,
  ).state;
  const food = s.tasks.find((t) => t.key === "food_registration");
  const land = s.tasks.find((t) => t.key === "land_consultation");
  s = applyCommand(
    s,
    {
      type: "assessment",
      taskId: food.id,
      taskRevision: food.revision,
      outcome: "accepted",
      note: "Tillräckligt underlag för nästa steg.",
    },
    { id: "food-officer", role: "staff", authority: food.authority },
    at,
  ).state;
  s = applyCommand(
    s,
    {
      type: "assessment",
      taskId: land.id,
      taskRevision: land.revision,
      outcome: "request",
      note: "Hur ska fri passage säkerställas?",
    },
    { id: "land-officer", role: "staff", authority: land.authority },
    at,
  ).state;
  assert.equal(s.tasks.find((t) => t.id === food.id).status, "accepted");
  s = applyCommand(
    s,
    {
      type: "respond",
      taskId: land.id,
      taskRevision: land.revision,
      answer: "Vi säkerställer fri passage på två meter.",
    },
    actor,
    at,
  ).state;
  assert.equal(s.tasks.find((t) => t.id === land.id).status, "active");
  s = applyCommand(
    s,
    {
      type: "replace_facts",
      facts: facts({ ...fixture, capacity: 80 }),
      inputStatus: "supported",
    },
    actor,
    at,
  ).state;
  assert.equal(s.tasks.find((t) => t.id === food.id).status, "accepted");
  assert.equal(s.tasks.find((t) => t.id === land.id).response, null);
});
test("authority packet is minimal and never includes other tasks or raw intent", () => {
  const s = ready(),
    t = s.tasks.find((x) => x.key === "food_registration"),
    p = packetFor(s, t);
  assert.equal(p.facts.alcohol, undefined);
  assert.equal(p.facts.capacity, undefined);
  assert.equal(p.tasks, undefined);
  assert.equal(p.ownerId, undefined);
  assert.equal(p.text, undefined);
  assert.ok(p.facts.portions);
});
test("invalid facts, cross-owner changes and cross-authority decisions fail closed", () => {
  assert.throws(() =>
    applyCommand(
      ready(),
      {
        type: "replace_facts",
        facts: { unknown: { value: 1 } },
        inputStatus: "supported",
      },
      actor,
      at,
    ),
  );
  assert.throws(() =>
    applyCommand(
      ready(),
      { type: "replace_facts", facts: facts(), inputStatus: "supported" },
      { id: "stranger", role: "citizen" },
      at,
    ),
  );
  let s = applyCommand(
    ready(),
    { type: "submit", confirmScope: true },
    actor,
    at,
  ).state;
  assert.throws(() =>
    applyCommand(
      s,
      {
        type: "assessment",
        taskId: s.tasks[0].id,
        taskRevision: s.tasks[0].revision,
        outcome: "accepted",
        note: "Testbedömning",
      },
      { id: "x", role: "staff", authority: "police.public_space" },
      at,
    ),
  );
});
