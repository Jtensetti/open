import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { facts } from "./helpers.mjs";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2026-10-08",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: { DEPLOYMENT_MODE: "pilot", LOCAL_DEV: "true" },
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const f of (await readdir("drizzle"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("drizzle/" + f, "utf8");
    await db.batch(
      sql
        .split("--> statement-breakpoint")
        .filter((s) => s.trim())
        .map((s) => db.prepare(s)),
    );
  }
  const origin = (await mf.ready).origin,
    jar = {};
  async function request(path, method = "GET", body) {
    const r = await mf.dispatchFetch(origin + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) {
      const [k, v] = cookie.split(";")[0].split("=");
      jar[k] = v;
    }
    const data = await r.json();
    assert.ok(r.ok, JSON.stringify(data));
    return data;
  }
  await request("/api/session", "POST", {});
  let s = (await request("/api/cases", "POST", {})).case;
  s = (
    await request(`/api/cases/${s.id}/commands`, "POST", {
      commandId: crypto.randomUUID(),
      expectedRevision: s.revision,
      command: {
        type: "replace_facts",
        facts: facts(),
        inputStatus: "supported",
      },
    })
  ).case;
  s = (
    await request(`/api/cases/${s.id}/commands`, "POST", {
      commandId: crypto.randomUUID(),
      expectedRevision: s.revision,
      command: { type: "submit", confirmScope: true },
    })
  ).case;
  await request(`/api/cases/${s.id}/pilot-session`, "POST", {
    authority: "trelleborg.food",
  });
  const p = (await request("/api/staff/tasks")).tasks[0];
  assert.equal(p.facts.alcohol, undefined);
  assert.equal(p.status, "active");
  await request("/api/staff/assessment", "POST", {
    caseId: s.id,
    commandId: crypto.randomUUID(),
    expectedRevision: s.revision,
    command: {
      type: "assessment",
      taskId: p.taskId,
      taskRevision: p.taskRevision,
      outcome: "accepted",
      note: "Underlaget räcker i runtime-testet.",
    },
  });
  assert.equal((await request(`/api/cases/${s.id}/events`)).verified, true);
  assert.equal(
    (await request(`/api/cases/${s.id}`)).case.tasks.find(
      (t) => t.id === p.taskId,
    ).status,
    "accepted",
  );
  console.log(
    "PASS: built Worker + real workerd/D1: migration, sessions, state, scoped task, assessment, audit.",
  );
} finally {
  await mf.dispose();
}
