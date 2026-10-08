import { createLocalJWKSet, jwtVerify } from "jose";
import { DomainError } from "../domain/core.mjs";
import { AUTHORITIES } from "../domain/catalog.mjs";
import { knownAuthority } from "../domain/authority-routing.mjs";
import {
  cookieName,
  createSession,
  digest,
  equalHash,
  now,
  token,
} from "./security.mjs";

const failure = () =>
  new DomainError(
    "LOGIN_FAILED",
    "Inloggningen kunde inte verifieras. Försök igen.",
    401,
  );
const configured = () =>
  new DomainError(
    "IDENTITY_NOT_CONFIGURED",
    "Identitetsleverantören är inte konfigurerad.",
    503,
  );
export function identityConfig(env, provider) {
  if (!["citizen", "staff"].includes(provider)) throw configured();
  let c;
  try {
    c = JSON.parse(env["OIDC_" + provider.toUpperCase()] || "null");
  } catch {
    throw configured();
  }
  if (
    !c ||
    typeof c.clientId !== "string" ||
    !c.clientId ||
    c.clientId.length > 256
  )
    throw configured();
  try {
    const origin = new URL(env.PUBLIC_ORIGIN),
      issuer = new URL(c.issuer);
    if (
      origin.protocol !== "https:" ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password
    )
      throw configured();
    if (
      issuer.protocol !== "https:" ||
      issuer.search ||
      issuer.hash ||
      issuer.username ||
      issuer.password
    )
      throw configured();
    for (const key of ["authorizationEndpoint", "tokenEndpoint", "jwksUri"]) {
      const endpoint = new URL(c[key]);
      // Fixed, operator-controlled endpoints. Never discover an endpoint from a token or request.
      if (
        endpoint.protocol !== "https:" ||
        endpoint.origin !== issuer.origin ||
        endpoint.username ||
        endpoint.password ||
        endpoint.hash ||
        endpoint.search
      )
        throw configured();
    }
    if (c.requiredAcr !== undefined && typeof c.requiredAcr !== "string")
      throw configured();
    return {
      ...c,
      origin: origin.origin,
      redirectUri: origin.origin + "/api/auth/callback",
      secret: env["OIDC_" + provider.toUpperCase() + "_CLIENT_SECRET"],
    };
  } catch {
    throw configured();
  }
}
export function identityProviders(env) {
  return Object.fromEntries(
    ["citizen", "staff"].map((p) => {
      try {
        identityConfig(env, p);
        return [p, true];
      } catch {
        return [p, false];
      }
    }),
  );
}
export async function requireStaffGrant(env, actor) {
  if (actor.authKind !== "oidc") return;
  try {
    const c = identityConfig(env, "staff"),
      grants = JSON.parse(env.OIDC_STAFF_GRANTS || "[]");
    if (!Array.isArray(grants)) throw failure();
    const valid = [];
    for (const g of grants) {
      if (
        g.issuer === c.issuer &&
        typeof g.subject === "string" &&
        knownAuthority(g.authority, AUTHORITIES) &&
        actor.id === "oidc:" + (await digest(g.issuer + "\n" + g.subject))
      )
        valid.push(g);
    }
    if (valid.length === 1 && valid[0].authority === actor.authority) return;
  } catch {}
  throw new DomainError(
    "STAFF_REVOKED",
    "Behörigheten är inte längre giltig. Kontakta organisationens administratör.",
    403,
  );
}
function transactionCookie(env, value, maxAge = 600) {
  return `${cookieName(env, "oidc")}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.LOCAL_DEV === "true" ? "" : "; Secure"}`;
}
export async function startIdentity(env, provider) {
  const c = identityConfig(env, provider),
    state = token(),
    nonce = token(),
    verifier = token();
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await env.DB.prepare(
    "INSERT INTO auth_transactions(state_hash,provider,nonce,verifier,expires_at,created_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      await digest(state),
      provider,
      nonce,
      verifier,
      Date.now() + 600000,
      now(),
    )
    .run();
  const url = new URL(c.authorizationEndpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    scope: "openid",
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(c.requiredAcr ? { acr_values: c.requiredAcr } : {}),
  }))
    url.searchParams.set(k, v);
  return { url: url.href, cookie: transactionCookie(env, state) };
}
async function fetchJSON(env, url, init = {}) {
  const fetcher = env.OIDC_HTTP
    ? env.OIDC_HTTP.fetch.bind(env.OIDC_HTTP)
    : fetch;
  const response = await fetcher(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw failure();
  const reader = response.body.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw failure();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
export async function completeIdentity(request, env) {
  try {
    const url = new URL(request.url),
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    const cookie = (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName(env, "oidc") + "="))
      ?.split("=")[1];
    if (
      !state ||
      !cookie ||
      !equalHash(state, cookie) ||
      typeof code !== "string" ||
      !code ||
      code.length > 4096 ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("code").length !== 1 ||
      url.searchParams.has("error")
    )
      throw failure();
    const tx = await env.DB.prepare(
      "DELETE FROM auth_transactions WHERE state_hash=? AND expires_at>? RETURNING provider,nonce,verifier",
    )
      .bind(await digest(state), Date.now())
      .first();
    if (!tx) throw failure();
    const c = identityConfig(env, tx.provider);
    if (url.origin !== c.origin) throw failure();
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      code,
      code_verifier: tx.verifier,
    });
    if (c.secret) form.set("client_secret", c.secret);
    const tokens = await fetchJSON(env, c.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: form.toString(),
    });
    if (typeof tokens.id_token !== "string" || tokens.id_token.length > 16384)
      throw failure();
    const jwks = await fetchJSON(env, c.jwksUri, {
      headers: { accept: "application/json" },
    });
    if (
      !Array.isArray(jwks.keys) ||
      jwks.keys.length < 1 ||
      jwks.keys.length > 20
    )
      throw failure();
    const { payload } = await jwtVerify(
      tokens.id_token,
      createLocalJWKSet(jwks),
      {
        issuer: c.issuer,
        audience: c.clientId,
        algorithms: ["RS256", "ES256"],
        requiredClaims: ["sub", "exp", "iat", "nonce"],
        maxTokenAge: "10m",
        clockTolerance: 30,
      },
    );
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      payload.sub.length > 512 ||
      !equalHash(payload.nonce, tx.nonce) ||
      (payload.azp !== undefined && payload.azp !== c.clientId) ||
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp !== c.clientId) ||
      (c.requiredAcr && payload.acr !== c.requiredAcr)
    )
      throw failure();
    const actor = {
      id: "oidc:" + (await digest(c.issuer + "\n" + payload.sub)),
      role: tx.provider === "citizen" ? "citizen" : "staff",
      authKind: "oidc",
    };
    if (tx.provider === "staff") {
      const grants = JSON.parse(env.OIDC_STAFF_GRANTS || "[]");
      const valid = Array.isArray(grants)
        ? grants.filter(
            (g) =>
              g.issuer === c.issuer &&
              g.subject === payload.sub &&
              knownAuthority(g.authority, AUTHORITIES),
          )
        : [];
      if (valid.length !== 1) throw failure();
      actor.authority = valid[0].authority;
    }
    return {
      actor,
      cookie: await createSession(env, actor),
      clearCookie: transactionCookie(env, "", 0),
      location: tx.provider === "staff" ? "/handlaggning" : "/",
    };
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.code === "IDENTITY_NOT_CONFIGURED"
    )
      throw error;
    throw failure();
  }
}
export async function endSessions(request, env) {
  const cookies = [];
  for (const role of ["citizen", "staff", "oidc"]) {
    const name = cookieName(env, role),
      value = (request.headers.get("cookie") || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(name + "="))
        ?.split("=")[1];
    if (value && /^[a-f0-9]{64}$/.test(value))
      await env.DB.prepare(
        role === "oidc"
          ? "DELETE FROM auth_transactions WHERE state_hash=?"
          : "DELETE FROM sessions WHERE token_hash=?",
      )
        .bind(await digest(value))
        .run();
    cookies.push(
      `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${env.LOCAL_DEV === "true" ? "" : "; Secure"}`,
    );
  }
  return cookies;
}
