import { DomainError } from "../domain/core.mjs";
import { digest, equalHash } from "./security.mjs";
import { identityProviders } from "./identity.mjs";
export function readiness(env) {
  const providers = identityProviders(env);
  let privacy = false;
  try {
    privacy = new URL(env.PRIVACY_URL).protocol === "https:";
  } catch {}
  const checks = {
    identity: providers.citizen && providers.staff,
    operator:
      typeof env.OPERATOR_NAME === "string" &&
      env.OPERATOR_NAME.trim().length >= 2,
    privacy,
    productionIntake: false,
    authorityIntegrations: false,
  };
  // Production intake stays closed until reviewed local profiles and actual receivers exist.
  return {
    status:
      env.DEPLOYMENT_MODE === "pilot"
        ? "pilot"
        : Object.values(checks).every(Boolean)
          ? "ready"
          : "closed",
    checks,
  };
}
export async function maintenance(request, env) {
  const key = request.headers
    .get("authorization")
    ?.match(/^Bearer ([\x21-\x7e]{32,256})$/)?.[1];
  if (!key || !equalHash(await digest(key), env.MAINTENANCE_KEY_HASH || ""))
    throw new DomainError("FORBIDDEN", "Åtkomst saknas.", 403);
  const at = Date.now(),
    results = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 500)",
      ).bind(at),
      env.DB.prepare(
        "DELETE FROM auth_transactions WHERE state_hash IN (SELECT state_hash FROM auth_transactions WHERE expires_at<? LIMIT 500)",
      ).bind(at),
      env.DB.prepare(
        "DELETE FROM throttle WHERE key IN (SELECT key FROM throttle WHERE expires_at<? LIMIT 500)",
      ).bind(at),
    ]);
  return {
    deleted: {
      sessions: results[0].meta.changes,
      authTransactions: results[1].meta.changes,
      rateLimits: results[2].meta.changes,
    },
    moreMayRemain: true,
  };
}
