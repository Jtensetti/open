import { timingSafeEqual } from "node:crypto";
import { DomainError } from "../domain/core.mjs";
export const now = () => new Date().toISOString();
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const digest = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function equalHash(a, b) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(
    Uint8Array.from(a.match(/../g), (x) => parseInt(x, 16)),
    Uint8Array.from(b.match(/../g), (x) => parseInt(x, 16)),
  );
}
export async function jsonBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError("CONTENT_TYPE", "Skicka uppgifterna som JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("EMPTY_BODY", "Uppgifterna saknas.", 400);
  let length = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 49152) {
      await reader.cancel();
      throw new DomainError(
        "TOO_LARGE",
        "För mycket information i en åtgärd.",
        413,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let i = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, i);
    i += chunk.length;
  }
  try {
    const body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Object required");
    return body;
  } catch {
    throw new DomainError("INVALID_JSON", "Uppgifterna har fel format.", 400);
  }
}
export function requireOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    throw new DomainError(
      "ORIGIN",
      "Förfrågan måste komma från ÖPPNA:s egen sida.",
      403,
    );
}
export function cookieName(env, role) {
  return `${env.LOCAL_DEV === "true" ? "" : "__Host-"}oppna_${role}`;
}
export async function sessionFor(request, env, role = "citizen") {
  const name = cookieName(env, role);
  const value = (request.headers.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const s = await env.DB.prepare(
    "SELECT principal_id, role, authority, case_scope, auth_kind, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?",
  )
    .bind(await digest(value), Date.now())
    .first();
  return s
    ? {
        id: s.principal_id,
        role: s.role,
        authority: s.authority,
        caseId: s.case_scope,
        authKind: s.auth_kind,
      }
    : null;
}
export async function createSession(env, actor) {
  const value = token(),
    maxAge = actor.role === "citizen" ? 60 * 60 * 24 * 7 : 60 * 60 * 8;
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash,principal_id,role,authority,case_scope,auth_kind,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      await digest(value),
      actor.id,
      actor.role,
      actor.authority || null,
      actor.caseId || null,
      actor.authKind || "anonymous",
      Date.now() + maxAge * 1000,
      now(),
    )
    .run();
  return `${cookieName(env, actor.role === "citizen" ? "citizen" : "staff")}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${env.LOCAL_DEV === "true" ? "" : "; Secure"}`;
}
export async function rateLimit(env, request, bucket, limit) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const window = Math.floor(Date.now() / 3600000);
  const key = await digest(`${bucket}:${window}:${ip}`);
  const row = await env.DB.prepare(
    "INSERT INTO throttle (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, (window + 2) * 3600000)
    .first();
  if (row.count > limit)
    throw new DomainError(
      "RATE_LIMIT",
      "För många försök. Vänta en stund och försök igen.",
      429,
    );
}
export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000",
};
