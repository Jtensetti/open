import test from "node:test";
import assert from "node:assert/strict";
import {
  MUNICIPALITIES,
  extractMunicipality,
} from "../src/domain/municipalities.mjs";
import { registry } from "../src/domain/catalog.mjs";
import { parseIntake } from "../src/domain/intake-parser.mjs";
import { extractAddress } from "../src/domain/extractors.mjs";
import { sanitizeFacts, diagnose } from "../src/domain/core.mjs";
import { harness, facts, dispatch } from "./helpers.mjs";
import { digest } from "../src/server/security.mjs";
const scenario = registry["restaurant.se"];
test("all 290 SCB municipalities parse locally with canonical name, code and original source span", () => {
  assert.equal(MUNICIPALITIES.length, 290);
  assert.equal(new Set(MUNICIPALITIES.map((m) => m.code)).size, 290);
  for (const m of MUNICIPALITIES) {
    const text = `Jag vill öppna en restaurang på Storgatan 12 i ${m.name}.`,
      p = parseIntake(text, scenario);
    assert.equal(p.goal, scenario.id);
    assert.deepEqual(p.unsupported, []);
    assert.equal(p.facts.municipality.value, m.name);
    assert.equal(p.facts.municipality.municipalityCode, m.code);
    assert.equal(
      text.slice(
        p.facts.municipality.sourceSpan.start,
        p.facts.municipality.sourceSpan.end,
      ),
      m.name,
    );
    assert.equal(p.facts.municipality.status, "proposed");
    assert.equal(p.facts.address.value, "Storgatan 12");
  }
});
test("postal locality is not a municipal boundary; ambiguity, home address and typo fail closed", () => {
  for (const text of [
    "Storgatan 12, Malmö",
    "Smyge Strandväg 25B, 231 78 Smygehamn",
    "Göteborgsvägen 12",
    "Jag bor i Malmö. Restaurangen ska ligga på Storgatan 12.",
  ])
    assert.equal(extractMunicipality(text), null, text);
  for (const text of [
    "Restaurangen ligger i Uppsala eller Malmö.",
    "Restaurangen ligger i Malmö eller Uppsala.",
    "Restaurangen ligger i Malmö och Lund.",
    "Restaurangen kanske ligger i Kiruna.",
    "Kommun: Upppsala",
  ])
    assert.equal(extractMunicipality(text)?.status, "uncertain", text);
  assert.equal(extractMunicipality("Inte i Malmö utan i Lund.").value, "Lund");
  assert.equal(extractMunicipality("Malmö kommun").municipalityCode, "1280");
  assert.equal(
    extractMunicipality("Kommun: Upplands Väsby").value,
    "Upplands Väsby",
  );
  for (const city of [
    "Kiruna",
    "Örnsköldsvik",
    "Upplands Väsby",
    "Arvidsjaur",
    "Åmål",
  ]) {
    const text = `Storgatan 12B, ${city}`;
    assert.equal(extractAddress(text)?.value, text, text);
  }
  const rural = extractAddress("Björkudden 3, 761 97 Norrtälje");
  assert.equal(rural.value, "Björkudden 3, 761 97 Norrtälje");
  assert.equal(rural.status, "uncertain");
});
test("server rejects invalid provenance and keeps low confidence or fuzzy input uncertain", () => {
  const base = {
    value: "Uppsala",
    status: "confirmed",
    method: "deterministic",
    confidence: 0.2,
    source: "Uppsala",
  };
  assert.equal(
    sanitizeFacts(scenario, { municipality: base }, "now").municipality.status,
    "uncertain",
  );
  assert.equal(
    sanitizeFacts(
      scenario,
      { municipality: { ...base, method: "fuzzy", confidence: 0.99 } },
      "now",
    ).municipality.status,
    "uncertain",
  );
  assert.equal(
    sanitizeFacts(
      scenario,
      { municipality: { ...base, confidence: 0.97 } },
      "now",
    ).municipality.verification,
    "unverified",
  );
  for (const f of [
    { ...base, confidence: undefined },
    { ...base, confidence: 1.1 },
    { ...base, method: "model" },
    { ...base, value: "Påhittad kommun" },
  ])
    assert.throws(() => sanitizeFacts(scenario, { municipality: f }, "now"));
  const s = registry["publicspace.outdoorseating.se"];
  const dates = facts({ ...s.demo, end_date: "2027-04-01" });
  assert.ok(diagnose(s, dates).uncertain.includes("end_date"));
  assert.equal(diagnose(s, dates).ready, false);
});
test("municipal tenant isolation and changed municipality invalidate tasks and old decisions", async () => {
  const h = harness();
  try {
    const c = h.client();
    await c.request("/api/session", "POST", {});
    let state = (
      await c.request("/api/cases", "POST", { scenarioId: "restaurant.se" })
    ).data.case;
    state = (
      await dispatch(c, state, {
        type: "replace_facts",
        facts: facts(scenario.demo),
        inputStatus: "supported",
      })
    ).data.case;
    state = (await dispatch(c, state, { type: "submit", confirmScope: true }))
      .data.case;
    const key = "u".repeat(64),
      malmoKey = "m".repeat(64);
    h.env.STAFF_KEY_HASHES = JSON.stringify([
      {
        subject: "uppsala",
        authority: "municipality.0380.food",
        sha256: await digest(key),
      },
      {
        subject: "malmo",
        authority: "municipality.1280.food",
        sha256: await digest(malmoKey),
      },
    ]);
    const u = h.client(),
      m = h.client();
    await u.request("/api/staff/login", "POST", { key });
    await m.request("/api/staff/login", "POST", { key: malmoKey });
    let p = (await u.request("/api/staff/tasks")).data.tasks[0];
    assert.equal(p.jurisdiction.name, "Uppsala");
    assert.equal(p.jurisdiction.localRulesVerified, false);
    assert.equal((await m.request("/api/staff/tasks")).data.tasks.length, 0);
    const assess = (client) =>
      client.request("/api/staff/assessment", "POST", {
        caseId: state.id,
        expectedRevision: state.revision,
        commandId: crypto.randomUUID(),
        command: {
          type: "assessment",
          taskId: p.taskId,
          taskRevision: p.taskRevision,
          outcome: "accepted",
          note: "Underlaget är bedömt för förberedelse.",
        },
      });
    assert.equal((await assess(m)).status, 403);
    assert.equal((await assess(u)).status, 200);
    state = (await c.request("/api/cases/" + state.id)).data.case;
    const previousTasks = structuredClone(state.tasks);
    state = (
      await dispatch(c, state, {
        type: "replace_facts",
        facts: facts({ ...scenario.demo, municipality: "Malmö" }),
        inputStatus: "supported",
      })
    ).data.case;
    assert.ok(
      state.tasks
        .filter((t) => t.authority.startsWith("municipality."))
        .every((t) => t.authority.startsWith("municipality.1280.")),
    );
    for (const t of state.tasks) {
      assert.ok(
        t.revision > previousTasks.find((old) => old.id === t.id).revision,
      );
      assert.equal(t.decision, null);
    }
    assert.equal((await u.request("/api/staff/tasks")).data.tasks.length, 0);
    assert.equal((await m.request("/api/staff/tasks")).data.tasks.length, 1);
    assert.equal((await assess(u)).status, 403);
    assert.equal(
      (await c.request(`/api/cases/${state.id}/events`)).data.verified,
      true,
    );
    state = (
      await dispatch(c, state, {
        type: "replace_facts",
        facts: {
          ...facts(scenario.demo),
          municipality: {
            ...facts(scenario.demo).municipality,
            status: "uncertain",
            confidence: 0.5,
          },
        },
        inputStatus: "supported",
      })
    ).data.case;
    assert.equal(state.tasks.length, 0);
    assert.equal(state.diagnosis.ready, false);
  } finally {
    h.close();
  }
});
test("case limit is atomic under concurrent creation, owned exports include verified journal", async () => {
  const h = harness();
  try {
    const c = h.client();
    await c.request("/api/session", "POST", {});
    const rs = await Promise.all(
      Array.from({ length: 30 }, () =>
        c.request("/api/cases", "POST", { scenarioId: "restaurant.se" }),
      ),
    );
    assert.equal(rs.filter((r) => r.status === 201).length, 25);
    assert.equal(rs.filter((r) => r.status === 429).length, 5);
    assert.equal(
      h.db.raw.prepare("SELECT COUNT(*) AS n FROM events").get().n,
      25,
    );
    const id = rs.find((r) => r.status === 201).data.case.id;
    const exp = await c.request(`/api/cases/${id}/export`);
    assert.equal(exp.data.audit.verified, true);
    assert.equal(exp.data.case.ownerId, undefined);
    const other = h.client();
    await other.request("/api/session", "POST", {});
    assert.equal((await other.request(`/api/cases/${id}/export`)).status, 404);
  } finally {
    h.close();
  }
});
test("staff inbox keyset pagination is bounded and does not expose another municipal actor", async () => {
  const h = harness();
  try {
    const { state } = await h.ready();
    const key = "p".repeat(64);
    h.env.STAFF_KEY_HASHES = JSON.stringify([
      {
        subject: "officer",
        authority: "municipality.0380.food",
        sha256: await digest(key),
      },
    ]);
    for (let i = 0; i < 125; i++)
      h.db.raw
        .prepare(
          "INSERT INTO tasks(id,case_id,authority,status,packet_json,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          "pagination:" + String(i).padStart(3, "0"),
          state.id,
          i < 120 ? "municipality.0380.food" : "municipality.1280.food",
          "active",
          JSON.stringify({
            taskId: "pagination:" + i,
            authority:
              i < 120 ? "municipality.0380.food" : "municipality.1280.food",
          }),
          "2026-10-08T10:00:00.000Z",
        );
    const staff = h.client();
    await staff.request("/api/staff/login", "POST", { key });
    let cursor = null;
    const packets = [];
    do {
      const response = await staff.request(
        "/api/staff/tasks?limit=50" + (cursor ? "&cursor=" + cursor : ""),
      );
      assert.equal(response.status, 200);
      assert.ok(response.data.tasks.length <= 50);
      packets.push(...response.data.tasks);
      cursor = response.data.nextCursor;
    } while (cursor);
    assert.equal(packets.length, 120);
    assert.equal(new Set(packets.map((p) => p.taskId)).size, 120);
    assert.ok(packets.every((p) => p.authority === "municipality.0380.food"));
    for (const query of [
      "limit=101",
      "limit=-1",
      "limit=abc",
      "cursor=bad",
      "cursor=__proto__",
    ])
      assert.equal(
        (await staff.request("/api/staff/tasks?" + query)).status,
        400,
      );
  } finally {
    h.close();
  }
});
