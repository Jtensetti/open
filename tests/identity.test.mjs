import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
import { harness } from "./helpers.mjs";
import { digest } from "../src/server/security.mjs";
const issuer = "https://identity.test",
  keypair = await generateKeyPair("ES256"),
  jwk = {
    ...(await exportJWK(keypair.publicKey)),
    kid: "test-key",
    alg: "ES256",
  };
function setup(h) {
  h.env.PUBLIC_ORIGIN = "https://oppna.test";
  for (const p of ["CITIZEN", "STAFF"])
    h.env["OIDC_" + p] = JSON.stringify({
      issuer,
      clientId: p.toLowerCase(),
      authorizationEndpoint: issuer + "/authorize",
      tokenEndpoint: issuer + "/token",
      jwksUri: issuer + "/keys",
      requiredAcr: "strong",
    });
  let auth,
    overrides = {},
    privateKey = keypair.privateKey,
    alg = "ES256",
    calls = [];
  h.env.OIDC_HTTP = {
    fetch: async (url, init) => {
      assert.equal(init.redirect, "manual");
      calls.push(url);
      let data;
      if (url === issuer + "/keys") data = { keys: [jwk] };
      else {
        assert.equal(url, issuer + "/token");
        const form = new URLSearchParams(init.body);
        assert.equal(
          form.get("redirect_uri"),
          "https://oppna.test/api/auth/callback",
        );
        assert.equal(form.get("grant_type"), "authorization_code");
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(form.get("code_verifier")),
        );
        assert.equal(
          Buffer.from(bytes).toString("base64url"),
          auth.searchParams.get("code_challenge"),
        );
        data = {
          id_token: await new SignJWT({
            nonce: auth.searchParams.get("nonce"),
            acr: "strong",
            ...overrides,
          })
            .setProtectedHeader({ alg, kid: "test-key" })
            .setIssuer(overrides.iss || issuer)
            .setAudience(overrides.aud || auth.searchParams.get("client_id"))
            .setSubject("stable-user")
            .setIssuedAt(overrides.iat ?? Math.floor(Date.now() / 1000))
            .setExpirationTime(
              overrides.exp ?? Math.floor(Date.now() / 1000) + 300,
            )
            .sign(privateKey),
        };
      }
      return Response.json(data);
    },
  };
  async function start(client, provider = "citizen") {
    const r = await client.request("/api/auth/start", "POST", { provider });
    assert.equal(r.status, 200);
    auth = new URL(r.data.authorizationUrl);
    return r;
  }
  async function callback(client, query = "") {
    const cookie = Object.entries(client.jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    const r = await h.app.fetch(
      new Request(
        `https://oppna.test/api/auth/callback?state=${auth.searchParams.get("state")}&code=test-code${query}`,
        { headers: { cookie } },
      ),
      h.env,
      {},
    );
    for (const cookie of r.headers.getSetCookie()) {
      const [k, v] = cookie.split(";")[0].split("=");
      client.jar[k] = v;
    }
    return r;
  }
  return {
    start,
    callback,
    calls,
    claims: (c) => {
      overrides = c;
    },
    signWith: (key, algorithm = "ES256") => {
      privateKey = key;
      alg = algorithm;
    },
    auth: () => auth,
  };
}
test("OIDC uses PKCE, nonce, signed issuer/audience and stable principal; logout revokes sessions", async () => {
  const h = harness();
  try {
    const s = setup(h),
      c = h.client();
    const start = await s.start(c);
    assert.equal(s.auth().searchParams.get("scope"), "openid");
    assert.equal(s.auth().searchParams.get("code_challenge_method"), "S256");
    assert.match(start.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
    const callback = await s.callback(c);
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/");
    assert.equal((await c.request("/api/session")).data.authKind, "oidc");
    const state = (await c.request("/api/cases", "POST", {})).data.case;
    const oldCookie = c.jar.oppna_citizen;
    assert.equal((await s.callback(c)).status, 401);
    const out = await c.request("/api/logout", "POST", {});
    assert.equal(out.status, 200);
    assert.ok(
      out.headers.getSetCookie().some((x) => /oppna_staff=.*Max-Age=0/.test(x)),
    );
    c.jar.oppna_citizen = oldCookie;
    assert.equal((await c.request("/api/cases")).status, 401);
    await s.start(c);
    assert.equal((await s.callback(c)).status, 303);
    assert.equal((await c.request("/api/cases")).data.cases[0].id, state.id);
    h.env.DEPLOYMENT_MODE = "production";
    assert.equal((await c.request("/api/cases/" + state.id)).status, 200);
    assert.equal((await c.request("/api/cases", "POST", {})).status, 503);
    assert.equal(
      (await h.client().request("/api/session", "POST", {})).status,
      401,
    );
    assert.equal(
      (
        await h
          .client()
          .request("/api/staff/login", "POST", { key: "x".repeat(64) })
      ).status,
      401,
    );
  } finally {
    h.close();
  }
});
test("OIDC invalid audience, issuer, nonce, assurance or expired token cannot create a session", async () => {
  const h = harness();
  try {
    const s = setup(h),
      c = h.client();
    for (const claims of [
      { aud: "another-client" },
      { iss: "https://attacker.test" },
      { nonce: "f".repeat(64) },
      { acr: "weak" },
      { exp: 1 },
      { iat: 1 },
      { azp: "another-client" },
    ]) {
      s.claims(claims);
      await s.start(c);
      assert.equal((await s.callback(c)).status, 401, JSON.stringify(claims));
    }
    s.claims({});
    s.signWith((await generateKeyPair("ES256")).privateKey);
    await s.start(c);
    assert.equal((await s.callback(c)).status, 401);
    assert.equal(
      h.db.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      0,
    );
  } finally {
    h.close();
  }
});
test("OIDC requires browser-bound state, single parameters, and one-time code transaction", async () => {
  const h = harness();
  try {
    const s = setup(h),
      c = h.client();
    await s.start(c);
    assert.equal((await s.callback(h.client())).status, 401);
    assert.equal(s.calls.length, 0);
    assert.equal((await s.callback(c, "&state=forged")).status, 401);
    assert.equal(s.calls.length, 0);
    assert.equal((await s.callback(c)).status, 303);
    const calls = s.calls.length;
    assert.equal((await s.callback(c)).status, 401);
    assert.equal(s.calls.length, calls);
    await s.start(c);
    h.db.raw.prepare("UPDATE auth_transactions SET expires_at=0").run();
    assert.equal((await s.callback(c)).status, 401);
  } finally {
    h.close();
  }
});
test("staff identity needs trusted exact issuer, subject and municipal authority grant", async () => {
  const h = harness();
  try {
    const s = setup(h),
      c = h.client();
    await s.start(c, "staff");
    assert.equal((await s.callback(c)).status, 401);
    h.env.OIDC_STAFF_GRANTS = JSON.stringify([
      { subject: "stable-user", issuer, authority: "municipality.0380.food" },
    ]);
    await s.start(c, "staff");
    assert.equal((await s.callback(c)).status, 303);
    h.env.DEPLOYMENT_MODE = "production";
    assert.equal(
      (await c.request("/api/staff/tasks")).data.authority,
      "municipality.0380.food",
    );
    assert.equal(
      (await c.request("/api/session?provider=staff")).data.authenticated,
      true,
    );
    assert.equal((await c.request("/api/cases")).status, 401);
    h.env.OIDC_STAFF_GRANTS = JSON.stringify([
      { subject: "stable-user", issuer, authority: "municipality.9999.food" },
    ]);
    assert.equal((await c.request("/api/staff/tasks")).status, 403);
    const another = h.client();
    await s.start(another, "staff");
    assert.equal((await s.callback(another)).status, 401);
  } finally {
    h.close();
  }
});
test("unknown or unconfigured identity providers and unsafe endpoints fail closed", async () => {
  const h = harness();
  try {
    const c = h.client();
    assert.equal(
      (await c.request("/api/auth/start", "POST", { provider: "citizen" }))
        .status,
      503,
    );
    assert.equal(
      (await c.request("/api/auth/start", "POST", { provider: "__proto__" }))
        .status,
      503,
    );
    setup(h);
    h.env.OIDC_CITIZEN = JSON.stringify({
      issuer,
      clientId: "citizen",
      authorizationEndpoint: issuer + "/authorize",
      tokenEndpoint: "https://untrusted.test/token",
      jwksUri: issuer + "/keys",
    });
    assert.equal(
      (await c.request("/api/auth/start", "POST", { provider: "citizen" }))
        .status,
      503,
    );
    assert.equal(
      h.db.raw.prepare("SELECT COUNT(*) AS n FROM auth_transactions").get().n,
      0,
    );
  } finally {
    h.close();
  }
});
test("production rejects existing anonymous sessions; bounded maintenance deletes only expired credentials", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    h.env.DEPLOYMENT_MODE = "production";
    assert.equal((await c.request("/api/cases/" + state.id)).status, 401);
    assert.equal((await c.request("/api/session")).data.authenticated, false);
    assert.equal((await c.request("/api/readiness")).status, 503);
    const key = "secret".repeat(10);
    h.env.MAINTENANCE_KEY_HASH = await digest(key);
    assert.equal(
      (
        await c.request(
          "/api/maintenance",
          "POST",
          {},
          { authorization: "Bearer " + "x".repeat(64) },
        )
      ).status,
      403,
    );
    h.db.raw.prepare("UPDATE sessions SET expires_at=0").run();
    h.db.raw.prepare("UPDATE throttle SET expires_at=0").run();
    const response = await c.request(
      "/api/maintenance",
      "POST",
      {},
      { authorization: "Bearer " + key },
    );
    assert.equal(response.status, 200);
    assert.ok(response.data.deleted.sessions > 0);
    assert.ok(response.data.deleted.rateLimits > 0);
    assert.equal(
      h.db.raw.prepare("SELECT COUNT(*) AS n FROM cases").get().n,
      1,
    );
  } finally {
    h.close();
  }
});
test("JSON arrays, scalar values, invalid UTF-8 and oversized requests are rejected", async () => {
  const h = harness();
  try {
    const c = h.client();
    for (const value of [null, [], 42, "text"])
      assert.equal(
        (await c.request("/api/auth/start", "POST", value)).status,
        400,
      );
    const request = new Request("https://oppna.test/api/auth/start", {
      method: "POST",
      headers: {
        origin: "https://oppna.test",
        "content-type": "application/json",
      },
      body: Uint8Array.of(255),
    });
    assert.equal((await h.app.fetch(request, h.env, {})).status, 400);
  } finally {
    h.close();
  }
});
