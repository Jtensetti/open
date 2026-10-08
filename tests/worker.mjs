import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { facts } from "./helpers.mjs";
import { registry } from "../src/domain/catalog.mjs";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
const key = await generateKeyPair("ES256"),
  publicKey = {
    ...(await exportJWK(key.publicKey)),
    kid: "runtime",
    alg: "ES256",
  };
let identityNonce;
const identity = {
  issuer: "https://identity.test",
  clientId: "runtime",
  authorizationEndpoint: "https://identity.test/authorize",
  tokenEndpoint: "https://identity.test/token",
  jwksUri: "https://identity.test/keys",
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2026-10-08",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: {
      DEPLOYMENT_MODE: "pilot",
      LOCAL_DEV: "true",
      PUBLIC_ORIGIN: "https://oppna.test",
      OIDC_CITIZEN: JSON.stringify(identity),
    },
    serviceBindings: {
      OIDC_HTTP: async (request) => {
        const data = request.url.endsWith("/keys")
          ? { keys: [publicKey] }
          : {
              id_token: await new SignJWT({ nonce: identityNonce })
                .setProtectedHeader({ alg: "ES256", kid: "runtime" })
                .setIssuer(identity.issuer)
                .setAudience(identity.clientId)
                .setSubject("worker-citizen")
                .setIssuedAt()
                .setExpirationTime("5m")
                .sign(key.privateKey),
            };
        return Response.json(data);
      },
    },
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
  let s = (
    await request("/api/cases", "POST", { scenarioId: "restaurant.trelleborg" })
  ).case;
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
  const national = registry["restaurant.se"];
  s = (await request("/api/cases", "POST", { scenarioId: national.id })).case;
  s = (
    await request(`/api/cases/${s.id}/commands`, "POST", {
      commandId: crypto.randomUUID(),
      expectedRevision: s.revision,
      command: {
        type: "replace_facts",
        facts: facts({ ...national.demo, municipality: "Malmö" }),
        inputStatus: "supported",
      },
    })
  ).case;
  assert.ok(s.tasks.some((t) => t.authority === "municipality.1280.food"));
  assert.equal(
    (await request(`/api/cases/${s.id}/export`)).audit.verified,
    true,
  );
  const auth = await mf.dispatchFetch("https://oppna.test/api/auth/start", {
    method: "POST",
    headers: {
      Origin: "https://oppna.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ provider: "citizen" }),
  });
  assert.equal(auth.status, 200);
  const authURL = new URL((await auth.json()).authorizationUrl);
  identityNonce = authURL.searchParams.get("nonce");
  const callback = await mf.dispatchFetch(
    `https://oppna.test/api/auth/callback?state=${authURL.searchParams.get("state")}&code=worker-code`,
    {
      redirect: "manual",
      headers: { Cookie: auth.headers.get("set-cookie").split(";")[0] },
    },
  );
  assert.equal(
    callback.status,
    303,
    callback.status === 303 ? "" : await callback.text(),
  );
  const session = await mf.dispatchFetch("https://oppna.test/api/session", {
    headers: { Cookie: callback.headers.get("set-cookie").split(";")[0] },
  });
  assert.equal((await session.json()).authKind, "oidc");
  console.log(
    "PASS: built Worker + real workerd/D1: migrations, legacy/national state, municipal tasks, assessment, audit/export and signed OIDC login.",
  );
} finally {
  await mf.dispose();
}
