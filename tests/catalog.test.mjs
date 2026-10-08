import test from "node:test";
import assert from "node:assert/strict";
import {
  SCENARIOS,
  NATIONAL_SCENARIOS,
  registry,
} from "../src/domain/catalog.mjs";
import { parseIntake, detectIntent } from "../src/domain/intake-parser.mjs";
import {
  extractAddress,
  extractBoolean,
  extractDate,
} from "../src/domain/extractors.mjs";
import { scenarioFor } from "../src/domain/core.mjs";
import { harness, facts, dispatch } from "./helpers.mjs";
test("standalone Swedish addresses, entrances, postal codes, punctuation and original source spans", () => {
  for (const [text, expected] of [
    ["Storgatan 12", "Storgatan 12"],
    [
      "Jag vill öppna en restaurang på Storgatan 12 i Trelleborg",
      "Storgatan 12",
    ],
    [
      "Restaurangen ska ligga på Hamngatan 18b, Trelleborg",
      "Hamngatan 18B, Trelleborg",
    ],
    [
      "Smyge Strandväg 25 B, 231 78 Smygehamn",
      "Smyge Strandväg 25B, 231 78 Smygehamn",
    ],
    ["Jag vill öppna en butik vid S:t Nicolai gränd 4", "S:t Nicolai gränd 4"],
    [
      "Västra Vallgatan 2, 23142 Trelleborg",
      "Västra Vallgatan 2, 23142 Trelleborg",
    ],
    ["Adressen är Byavägen 4.", "Byavägen 4"],
    ["Vi startar på Lilla torg 2", "Lilla torg 2"],
  ]) {
    const f = extractAddress(text);
    assert.equal(f?.value, expected, text);
    assert.equal(f.status, "proposed", text);
    assert.equal(
      text.slice(f.sourceSpan.start, f.sourceSpan.end).trim(),
      f.source,
    );
  }
  for (const text of [
    "40 gäster och 120 portioner per dag",
    "Öppnar den 2027-05-01",
    "Telefon 0410 73 30 00",
    "231 42 Trelleborg",
    "ÖPPNA version 0.3.0",
  ])
    assert.equal(extractAddress(text), null, text);
});
test("multiple addresses, ranges and unknown road names require confirmation", () => {
  for (const text of [
    "Vi kanske väljer Storgatan 12",
    "Storgatan 12 eller Hamngatan 18",
    "Storgatan 12–14",
    "Adress: Norra Åby 3",
  ])
    assert.equal(extractAddress(text)?.status, "uncertain", text);
  const text = "Storgatan 12 eller Hamngatan 18",
    f = extractAddress(text);
  assert.equal(f.alternatives.length, 2);
  assert.equal(text.slice(f.sourceSpan.start, f.sourceSpan.end), f.source);
});
test("negation is scoped to its statement, contradictions and uncertainty never become certainty", () => {
  const s = registry["restaurant.trelleborg"];
  let p = parseIntake(
    "Jag vill öppna en restaurang. Vi ska inte servera alkohol och vi vill ha uteservering.",
    s,
  );
  assert.equal(p.facts.alcohol.value, false);
  assert.equal(p.facts.outdoor.value, true);
  p = parseIntake("Jag vill öppna en restaurang. Vi kanske serverar vin.", s);
  assert.equal(p.facts.alcohol.status, "uncertain");
  assert.equal(
    extractBoolean("Ingen alkohol. Vi serverar vin.", "alkohol|vin")?.status,
    "uncertain",
  );
  assert.equal(
    extractBoolean("Vi kanske använder offentlig plats.", "offentlig plats")
      ?.status,
    "uncertain",
  );
  assert.equal(
    parseIntake(
      "Jag vill inte öppna en butik.",
      registry["business.shop.trelleborg"],
    ).uncertain.some((x) => x.key === "goal"),
    true,
  );
});
test("strict date parsing includes Swedish dates and does not silently repair invalid dates", () => {
  for (const text of ["1 maj 2027", "2027-5-1", "1/5/2027", "1.5.2027"])
    assert.equal(extractDate(text).fact?.value, "2027-05-01");
  assert.equal(extractDate("31 februari 2027").fact, null);
  assert.ok(extractDate("2027-02-31").invalid.length);
  assert.equal(
    extractDate("2027-05-01 eller 2027-05-03").fact?.status,
    "uncertain",
  );
});
test("intent classification is fail closed, detects typos and excludes background usage", () => {
  assert.equal(detectIntent("Jag vill öppna en butk.").goal, null);
  assert.equal(
    detectIntent("Jag vill bygga en garagge.").goal,
    "building.garage.trelleborg",
  );
  assert.equal(
    detectIntent("Jag vill bygga en garagge.").goals[0].uncertain,
    true,
  );
  assert.equal(
    detectIntent("Jag vill öppna en resturang.").goal,
    "restaurant.trelleborg",
  );
  assert.equal(
    detectIntent("Jag vill öppna en restaurang. Lokalen är en butik.").goal,
    "restaurant.trelleborg",
  );
  const s = registry["restaurant.trelleborg"];
  for (const text of [
    "Jag vill öppna en restaurang och sälja vapen.",
    "Jag vill bygga kärnkraft.",
    "Jag vill öppna en restaurang och starta ett hotell.",
  ])
    assert.ok(parseIntake(text, s).unsupported.length, text);
  assert.equal(
    parseIntake("Jag vill öppna en butik på Storgatan 12.", s)
      .suggestedScenario,
    "business.shop.trelleborg",
  );
  assert.equal(
    parseIntake(
      "Jag vill bygga garage i Malmö.",
      registry["building.garage.trelleborg"],
    ).unsupported.length,
    1,
  );
});
test("catalog configuration and draft selection preserve versions and reject unsafe changes", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    const config = await c.request("/api/config");
    assert.equal(config.data.scenarios.length, 100);
    let r = await dispatch(c, state, {
      type: "select_scenario",
      scenarioId: "building.garage.trelleborg",
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.case.scenarioVersion, "0.1.0");
    assert.deepEqual(r.data.case.facts, {});
    const audit = await c.request(`/api/cases/${state.id}/events`);
    assert.equal(audit.data.verified, true);
    assert.ok(audit.data.events.some((e) => e.type === "scenario.selected"));
    r = await dispatch(c, r.data.case, {
      type: "select_scenario",
      scenarioId: "__proto__",
    });
    assert.equal(r.status, 409);
    assert.equal(
      scenarioFor("restaurant.trelleborg", "1.0.0").version,
      "1.0.0",
    );
    assert.throws(() => scenarioFor("restaurant.trelleborg", "0.1.0"));
  } finally {
    h.close();
  }
});
for (const spec of [...SCENARIOS, ...NATIONAL_SCENARIOS]) {
  test(`persisted intake → scoped task → supplement → human assessment → reload: ${spec.id}`, async () => {
    const h = harness();
    try {
      const c = h.client();
      await c.request("/api/session", "POST", {});
      let r = await c.request("/api/cases", "POST", { scenarioId: spec.id });
      assert.equal(r.status, 201);
      let state = r.data.case;
      const parsed = parseIntake(spec.example, spec);
      assert.equal(parsed.goal, spec.id);
      assert.deepEqual(parsed.unsupported, []);
      const vals = {
        ...spec.demo,
        ...(spec.fields.citizen_note
          ? {
              citizen_note: "Egen planering som inte hör till aktörens uppgift",
            }
          : {}),
      };
      r = await dispatch(c, state, {
        type: "replace_facts",
        facts: facts(vals),
        inputStatus: "supported",
      });
      assert.equal(r.status, 200);
      state = r.data.case;
      assert.equal(state.diagnosis.ready, true);
      r = await dispatch(c, state, { type: "submit", confirmScope: true });
      assert.equal(r.status, 200);
      state = r.data.case;
      assert.ok(state.tasks.length);
      r = await dispatch(c, state, {
        type: "select_scenario",
        scenarioId: "restaurant.trelleborg",
      });
      assert.equal(r.status, 409);
      for (const task of state.tasks) {
        const login = await c.request(
          `/api/cases/${state.id}/pilot-session`,
          "POST",
          { authority: task.authority },
        );
        assert.equal(login.status, 200);
        let inbox = await c.request("/api/staff/tasks");
        assert.equal(inbox.status, 200);
        assert.ok(
          inbox.data.tasks.every((x) => x.authority === task.authority),
        );
        let p = inbox.data.tasks.find((x) => x.taskId === task.id);
        assert.ok(p);
        assert.ok(
          Object.keys(p.facts).length < Object.keys(state.facts).length,
        );
        assert.ok(!p.facts.citizen_note);
        assert.equal(p.scenarioId, spec.id);
        const assessment = async (outcome, note) =>
          c.request("/api/staff/assessment", "POST", {
            caseId: state.id,
            expectedRevision: state.revision,
            commandId: crypto.randomUUID(),
            command: {
              type: "assessment",
              taskId: p.taskId,
              taskRevision: p.taskRevision,
              outcome,
              note,
            },
          });
        r = await assessment(
          "request",
          "Beskriv de praktiska förutsättningarna mer exakt.",
        );
        assert.equal(r.status, 200);
        state = (await c.request(`/api/cases/${state.id}`)).data.case;
        const current = state.tasks.find((t) => t.id === task.id);
        r = await dispatch(c, state, {
          type: "respond",
          taskId: task.id,
          taskRevision: current.revision,
          answer: "Ett preciserat testunderlag för just denna aktör.",
        });
        assert.equal(r.status, 200);
        state = r.data.case;
        p = (await c.request("/api/staff/tasks")).data.tasks.find(
          (x) => x.taskId === task.id,
        );
        assert.match(p.response.answer, /preciserat/);
        r = await assessment(
          "accepted",
          "Underlaget räcker för nästa steg i piloten.",
        );
        assert.equal(r.status, 200);
        state = (await c.request(`/api/cases/${state.id}`)).data.case;
      }
      assert.equal(state.status, "completed");
      assert.equal(state.scenarioVersion, spec.version);
      const audit = await c.request(`/api/cases/${state.id}/events`);
      assert.equal(audit.data.verified, true);
      assert.ok(audit.data.events.some((e) => e.type === "human.assessment"));
      const list = await c.request("/api/cases");
      assert.equal(list.data.cases[0].title, spec.title);
    } finally {
      h.close();
    }
  });
}
