import test from "node:test";
import assert from "node:assert/strict";
import { harness, dispatch, facts, fixture } from "./helpers.mjs";
import { digest } from "../src/server/security.mjs";
test("unsubmitted drafts stay private from normal staff, pilot sessions are reused", async () => {
  const h = harness();
  try {
    let { c, state } = await h.ready();
    const key = "c".repeat(64);
    h.env.STAFF_KEY_HASHES = JSON.stringify([
      {
        subject: "food-officer",
        authority: "trelleborg.food",
        sha256: await digest(key),
      },
    ]);
    const officer = h.client();
    await officer.request("/api/staff/login", "POST", { key });
    assert.equal(
      (await officer.request("/api/staff/tasks")).data.tasks.length,
      0,
    );
    await c.request(`/api/cases/${state.id}/pilot-session`, "POST", {
      authority: "trelleborg.food",
    });
    const count = h.db.raw
      .prepare("SELECT COUNT(*) AS n FROM sessions")
      .get().n;
    await c.request(`/api/cases/${state.id}/pilot-session`, "POST", {
      authority: "trelleborg.food",
    });
    assert.equal(
      h.db.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      count,
    );
    state = (await dispatch(c, state, { type: "submit", confirmScope: true }))
      .data.case;
    assert.equal(
      (await officer.request("/api/staff/tasks")).data.tasks.length,
      1,
    );
  } finally {
    h.close();
  }
});
test("case, events and structured tasks survive reading from another request", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    const r = await c.request("/api/cases/" + state.id);
    assert.equal(r.status, 200);
    assert.equal(r.data.case.facts.capacity.value, 40);
    const e = await c.request(`/api/cases/${state.id}/events`);
    assert.equal(e.data.verified, true);
    assert.ok(e.data.events.length > 10);
    assert.equal(r.data.case.ownerId, undefined);
  } finally {
    h.close();
  }
});
test("anonymous and other citizens cannot read or mutate a case", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    assert.equal(
      (await h.client().request("/api/cases/" + state.id)).status,
      401,
    );
    const other = h.client();
    await other.request("/api/session", "POST", {});
    assert.equal((await other.request("/api/cases/" + state.id)).status, 404);
    assert.equal(
      (
        await other.request(`/api/cases/${state.id}/pilot-session`, "POST", {
          authority: "trelleborg.food",
        })
      ).status,
      404,
    );
    assert.equal(
      (await dispatch(c, state, { type: "assessment", taskId: "x" })).status,
      403,
    );
  } finally {
    h.close();
  }
});
test("staff packet and decisions are scoped on the server", async () => {
  const h = harness();
  try {
    let { c, state } = await h.ready();
    state = (await dispatch(c, state, { type: "submit", confirmScope: true }))
      .data.case;
    await c.request(`/api/cases/${state.id}/pilot-session`, "POST", {
      authority: "trelleborg.food",
    });
    const inbox = (await c.request("/api/staff/tasks")).data;
    assert.equal(inbox.tasks.length, 1);
    assert.equal(inbox.tasks[0].facts.alcohol, undefined);
    const alcohol = state.tasks.find((t) => t.key === "alcohol_assessment");
    const r = await c.request("/api/staff/assessment", "POST", {
      caseId: state.id,
      expectedRevision: state.revision,
      commandId: crypto.randomUUID(),
      command: {
        type: "assessment",
        taskId: alcohol.id,
        taskRevision: alcohol.revision,
        outcome: "accepted",
        note: "Otillåten korsbedömning",
      },
    });
    assert.equal(r.status, 403);
  } finally {
    h.close();
  }
});
test("real staff login uses hashed individual keys and HttpOnly sessions", async () => {
  const h = harness();
  try {
    const key = "a".repeat(64);
    h.env.STAFF_KEY_HASHES = JSON.stringify([
      {
        subject: "officer-1",
        authority: "trelleborg.food",
        sha256: await digest(key),
      },
    ]);
    const c = h.client();
    assert.equal(
      (await c.request("/api/staff/login", "POST", { key: "b".repeat(64) }))
        .status,
      401,
    );
    const r = await c.request("/api/staff/login", "POST", { key });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    assert.match(r.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal(
      (await c.request("/api/staff/tasks")).data.authority,
      "trelleborg.food",
    );
  } finally {
    h.close();
  }
});
test("idempotent retry does not duplicate events, different payload with same key is rejected", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready(),
      id = crypto.randomUUID(),
      cmd = { type: "submit", confirmScope: true };
    const first = await dispatch(c, state, cmd, id);
    const count = (await c.request(`/api/cases/${state.id}/events`)).data.events
      .length;
    const repeated = await dispatch(c, state, cmd, id);
    assert.equal(first.status, 200);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.replayed, true);
    assert.equal(
      (await c.request(`/api/cases/${state.id}/events`)).data.events.length,
      count,
    );
    assert.equal(
      (await dispatch(c, state, { type: "respond", answer: "not same" }, id))
        .status,
      409,
    );
  } finally {
    h.close();
  }
});
test("concurrent commands do not overwrite one another or leak orphan events", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    const outcomes = await Promise.all([
      dispatch(c, state, {
        type: "replace_facts",
        facts: facts({ ...fixture, capacity: 50 }),
        inputStatus: "supported",
      }),
      dispatch(c, state, {
        type: "replace_facts",
        facts: facts({ ...fixture, capacity: 80 }),
        inputStatus: "supported",
      }),
    ]);
    assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 409]);
    const current = (await c.request("/api/cases/" + state.id)).data.case;
    assert.equal(current.revision, state.revision + 1);
    assert.ok([50, 80].includes(current.facts.capacity.value));
    assert.equal(
      (await c.request(`/api/cases/${state.id}/events`)).data.verified,
      true,
    );
  } finally {
    h.close();
  }
});
test("end-to-end completion request returns to its own branch", async () => {
  const h = harness();
  try {
    let { c, state } = await h.ready();
    state = (await dispatch(c, state, { type: "submit", confirmScope: true }))
      .data.case;
    await c.request(`/api/cases/${state.id}/pilot-session`, "POST", {
      authority: "trelleborg.food",
    });
    let p = (await c.request("/api/staff/tasks")).data.tasks[0];
    let r = await c.request("/api/staff/assessment", "POST", {
      caseId: p.caseId,
      expectedRevision: p.caseRevision,
      commandId: crypto.randomUUID(),
      command: {
        type: "assessment",
        taskId: p.taskId,
        taskRevision: p.taskRevision,
        outcome: "request",
        note: "Hur hanteras nedkylning av maten?",
      },
    });
    assert.equal(r.status, 200);
    state = (await c.request("/api/cases/" + state.id)).data.case;
    const reply = await dispatch(c, state, {
      type: "respond",
      taskId: p.taskId,
      taskRevision: p.taskRevision,
      answer: "Vi kyler ned i särskilt anpassad utrustning.",
    });
    assert.equal(reply.status, 200);
    p = (await c.request("/api/staff/tasks")).data.tasks[0];
    assert.equal(p.status, "active");
    assert.match(p.response.answer, /anpassad/);
    const outbox = await c.request(`/api/cases/${state.id}/integration`);
    assert.equal(outbox.data.status, "not_connected");
    assert.ok(
      outbox.data.packets.every((x) => x.status === "awaiting_integration"),
    );
  } finally {
    h.close();
  }
});
test("CSRF, oversized input, prototype-like fields and forged status are rejected", async () => {
  const h = harness();
  try {
    const raw = new Request("https://oppna.test/api/session", {
      method: "POST",
      headers: {
        origin: "https://evil.test",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal((await h.app.fetch(raw, h.env, {})).status, 403);
    const { c, state } = await h.ready();
    assert.equal(
      (
        await dispatch(c, state, {
          type: "replace_facts",
          facts: facts(),
          inputStatus: "invented",
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await dispatch(c, state, {
          type: "replace_facts",
          facts: JSON.parse('{"__proto__":{"value":"x","status":"confirmed"}}'),
          inputStatus: "supported",
        })
      ).status,
      422,
    );
    const big = await c.request("/api/staff/login", "POST", {
      key: "x".repeat(60000),
    });
    assert.equal(big.status, 413);
  } finally {
    h.close();
  }
});
test("pilot credentials cannot access another case; production mode closes pilot intake", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    await c.request(`/api/cases/${state.id}/pilot-session`, "POST", {
      authority: "trelleborg.food",
    });
    const other = await h.ready();
    let s = (
      await dispatch(other.c, other.state, {
        type: "submit",
        confirmScope: true,
      })
    ).data.case;
    const t = s.tasks.find((x) => x.authority === "trelleborg.food");
    const r = await c.request("/api/staff/assessment", "POST", {
      caseId: s.id,
      expectedRevision: s.revision,
      commandId: crypto.randomUUID(),
      command: {
        type: "assessment",
        taskId: t.id,
        taskRevision: t.revision,
        outcome: "accepted",
        note: "Otillåten annan ägares uppgift",
      },
    });
    assert.equal(r.status, 403);
    h.env.DEPLOYMENT_MODE = "production";
    assert.equal((await c.request("/api/cases", "POST", {})).status, 503);
    assert.equal((await c.request("/api/staff/tasks")).status, 403);
    assert.equal(
      (
        await c.request(`/api/cases/${state.id}/pilot-session`, "POST", {
          authority: "trelleborg.food",
        })
      ).status,
      401,
    );
  } finally {
    h.close();
  }
});
test("modified audit payload is detected, and API responses are never publicly cached", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    const r = await c.request("/api/cases/" + state.id);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    h.db.raw
      .prepare(
        "UPDATE events SET payload_json=? WHERE case_id=? AND sequence=1",
      )
      .run("{}", state.id);
    const audit = await c.request(`/api/cases/${state.id}/events`);
    assert.equal(audit.status, 500);
    assert.equal(audit.data.error.code, "AUDIT_INTEGRITY");
  } finally {
    h.close();
  }
});
