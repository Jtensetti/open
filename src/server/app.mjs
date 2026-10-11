import { RESTAURANT } from "../domain/restaurant.mjs";
import {
  DomainError,
  citizenView,
  packetFor,
  scenarioFor,
} from "../domain/core.mjs";
import {
  AUTHORITIES,
  catalogSummary,
  DEFAULT_SCENARIO_ID,
  registry,
} from "../domain/catalog.mjs";
import {
  authoritiesFor,
  knownAuthority,
} from "../domain/authority-routing.mjs";
import {
  startIdentity,
  completeIdentity,
  endSessions,
  identityProviders,
  requireStaffGrant,
} from "./identity.mjs";
import { readiness, maintenance } from "./operations.mjs";
import {
  containsPersonalNumberIn,
  PILOT_DATA_MESSAGE,
} from "../domain/pilot-data.mjs";
import { pageRequest, nextCursor } from "./pagination.mjs";
import {
  readCase,
  createCase,
  commitCommand,
  auditTrail,
} from "./repository.mjs";
import {
  jsonBody,
  requireOrigin,
  sessionFor,
  createSession,
  rateLimit,
  digest,
  equalHash,
  securityHeaders,
} from "./security.mjs";
const uuid = (s) =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const json = (body, status = 200, extraHeaders = {}) => {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
};
async function citizen(request, env) {
  const a = await sessionFor(request, env);
  if (!a)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Öppna en ny session för att fortsätta.",
      401,
    );
  if (
    env.DEPLOYMENT_MODE !== "pilot" &&
    (env.DEPLOYMENT_MODE !== "production" || a.authKind !== "oidc")
  )
    throw new DomainError(
      "AUTH_REQUIRED",
      "Logga in med verifierad identitet.",
      401,
    );
  return a;
}
async function staff(request, env) {
  const a = await sessionFor(request, env, "staff");
  if (!a)
    throw new DomainError("STAFF_LOGIN", "Logga in till handläggarvyn.", 401);
  if (a.role === "pilot_staff" && env.DEPLOYMENT_MODE !== "pilot")
    throw new DomainError(
      "PILOT_DISABLED",
      "Pilotbehörighet är avstängd.",
      403,
    );
  if (
    env.DEPLOYMENT_MODE !== "pilot" &&
    (env.DEPLOYMENT_MODE !== "production" || a.authKind !== "oidc")
  )
    throw new DomainError(
      "AUTH_REQUIRED",
      "Logga in med organisationens identitetsleverantör.",
      401,
    );
  await requireStaffGrant(env, a);
  return a;
}
async function owned(request, env, id) {
  const actor = await citizen(request, env),
    state = await readCase(env.DB, id);
  if (state.ownerId !== actor.id)
    throw new DomainError("NOT_FOUND", "Ärendet kunde inte hittas.", 404);
  return { actor, state };
}
export function createApp(assets = {}) {
  return {
    async fetch(request, env, ctx) {
      const requestId = crypto.randomUUID();
      const started = Date.now();
      let response;
      try {
        response = await handle(request, env, ctx, assets);
      } catch (error) {
        if (!(error instanceof DomainError))
          console.error(
            JSON.stringify({
              event: "request_failed",
              requestId,
              errorClass: error?.name || "Error",
            }),
          );
        response = json(
          {
            error: {
              code:
                error instanceof DomainError ? error.code : "INTERNAL_ERROR",
              message:
                error instanceof DomainError
                  ? error.message
                  : "Tjänsten kunde inte slutföra åtgärden. Dina lokala uppgifter finns kvar.",
              requestId,
            },
          },
          error instanceof DomainError ? error.status : 503,
        );
      }
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(securityHeaders)) headers.set(k, v);
      headers.set("X-Request-Id", requestId);
      if (response.status === 429) headers.set("Retry-After", "3600");
      if (env.LOG_REQUESTS === "true")
        console.log(
          JSON.stringify({
            event: "request_completed",
            requestId,
            method: request.method,
            status: response.status,
            durationMs: Date.now() - started,
          }),
        );
      return new Response(response.body, { status: response.status, headers });
    },
  };
}
async function handle(request, env, ctx, assets) {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/")) {
    const file =
      path === "/" || path === "/handlaggning" ? "/index.html" : path;
    const asset = assets[file];
    if (!asset) return new Response("Sidan finns inte.", { status: 404 });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Metoden stöds inte.", { status: 405 });
    return new Response(request.method === "HEAD" ? null : asset.body, {
      headers: {
        "content-type": asset.type,
        "cache-control": ["/index.html", "/app.js", "/app.css"].includes(file)
          ? "no-cache"
          : "public, max-age=300",
      },
    });
  }
  if (!env.DB)
    throw new DomainError(
      "DATABASE_UNAVAILABLE",
      "Tjänstens databas är inte tillgänglig.",
      503,
    );
  if (!["GET", "HEAD"].includes(request.method)) requireOrigin(request);
  if (path === "/api/config" && request.method === "GET")
    return json({
      version: "0.5.1",
      mode: env.DEPLOYMENT_MODE || "closed",
      scenario: registry[DEFAULT_SCENARIO_ID],
      scenarios: catalogSummary(),
      integrations: "not_connected",
      staffConfigured:
        env.DEPLOYMENT_MODE === "pilot"
          ? !!env.STAFF_KEY_HASHES
          : identityProviders(env).staff,
      pilotEnabled: env.DEPLOYMENT_MODE === "pilot",
      identityProviders: identityProviders(env),
      readiness: readiness(env),
    });
  if (path === "/api/health" && request.method === "GET") {
    await env.DB.prepare(
      "SELECT token_hash,auth_kind FROM sessions LIMIT 1",
    ).first();
    await env.DB.prepare(
      "SELECT state_hash FROM auth_transactions LIMIT 1",
    ).first();
    return json({ status: "ok", version: "0.5.1" });
  }
  if (path === "/api/readiness" && request.method === "GET")
    return json(readiness(env), env.DEPLOYMENT_MODE === "pilot" ? 200 : 503);
  if (path === "/api/maintenance" && request.method === "POST")
    return json(await maintenance(request, env));
  if (path === "/api/auth/start" && request.method === "POST") {
    await rateLimit(env, request, "identity", 30);
    const body = await jsonBody(request),
      result = await startIdentity(env, body.provider);
    return json({ authorizationUrl: result.url }, 200, {
      "set-cookie": result.cookie,
    });
  }
  if (path === "/api/auth/callback" && request.method === "GET") {
    const result = await completeIdentity(request, env),
      headers = new Headers({
        location: result.location,
        "cache-control": "no-store",
      });
    headers.append("set-cookie", result.cookie);
    headers.append("set-cookie", result.clearCookie);
    return new Response(null, { status: 303, headers });
  }
  if (path === "/api/logout" && request.method === "POST") {
    const headers = new Headers();
    for (const cookie of await endSessions(request, env))
      headers.append("set-cookie", cookie);
    return json({ authenticated: false }, 200, headers);
  }
  if (path === "/api/session" && request.method === "GET") {
    const a = await sessionFor(
      request,
      env,
      url.searchParams.get("provider") === "staff" ? "staff" : "citizen",
    );
    return json({
      authenticated:
        !!a &&
        (env.DEPLOYMENT_MODE === "pilot" ||
          (env.DEPLOYMENT_MODE === "production" && a.authKind === "oidc")),
      authKind: a?.authKind || null,
    });
  }
  if (path === "/api/session" && request.method === "POST") {
    const existing = await sessionFor(request, env);
    if (
      existing &&
      (env.DEPLOYMENT_MODE === "pilot" ||
        (env.DEPLOYMENT_MODE === "production" && existing.authKind === "oidc"))
    )
      return json({ authenticated: true });
    if (env.DEPLOYMENT_MODE !== "pilot")
      throw new DomainError(
        "AUTH_REQUIRED",
        "Logga in med verifierad identitet.",
        401,
      );
    await rateLimit(env, request, "session", 60);
    const actor = { id: crypto.randomUUID(), role: "citizen" };
    return json({ authenticated: true }, 201, {
      "set-cookie": await createSession(env, actor),
    });
  }
  if (path === "/api/cases" && request.method === "GET") {
    const a = await citizen(request, env);
    const { results } = await env.DB.prepare(
      "SELECT state_json FROM cases WHERE owner_id=? ORDER BY updated_at DESC LIMIT 25",
    )
      .bind(a.id)
      .all();
    return json({
      cases: results.map((r) => {
        const s = JSON.parse(r.state_json);
        return {
          id: s.id,
          revision: s.revision,
          status: s.status,
          updatedAt: s.updatedAt,
          address: s.facts.address?.value || null,
          scenarioId: s.scenarioId,
          title: scenarioFor(s.scenarioId, s.scenarioVersion).title,
        };
      }),
    });
  }
  if (path === "/api/cases" && request.method === "POST") {
    if (env.DEPLOYMENT_MODE !== "pilot")
      throw new DomainError(
        "INTAKE_CLOSED",
        "Nyregistrering är stängd tills myndighetsanslutning och ansvarig operatör är godkända.",
        503,
      );
    const a = await citizen(request, env);
    await rateLimit(env, request, "new_case", 30);
    const body = await jsonBody(request);
    return json(
      {
        case: citizenView(
          await createCase(
            env.DB,
            a.id,
            "pilot",
            body.scenarioId || DEFAULT_SCENARIO_ID,
          ),
        ),
      },
      201,
    );
  }
  const caseMatch = path.match(
    /^\/api\/cases\/([a-f0-9-]+)(?:\/(commands|events|pilot-session|integration|export))?$/i,
  );
  if (caseMatch) {
    const [, id, action] = caseMatch;
    if (!uuid(id))
      throw new DomainError("NOT_FOUND", "Ärendet finns inte.", 404);
    const { actor, state } = await owned(request, env, id);
    if (!action && request.method === "GET")
      return json({ case: citizenView(state) });
    if (action === "events" && request.method === "GET")
      return json(await auditTrail(env.DB, id));
    if (action === "export" && request.method === "GET") {
      const trail = await auditTrail(env.DB, id);
      return json(
        { schemaVersion: "1.0.0", case: citizenView(state), audit: trail },
        200,
        { "content-disposition": `attachment; filename="oppna-${id}.json"` },
      );
    }
    if (action === "integration" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT authority,status,created_at FROM outbox WHERE case_id=? AND status=? ORDER BY created_at DESC",
      )
        .bind(id, "awaiting_integration")
        .all();
      return json({ status: "not_connected", packets: results });
    }
    if (action === "commands" && request.method === "POST") {
      await rateLimit(env, request, "command", 1000);
      const body = await jsonBody(request);
      if (
        !uuid(body.commandId) ||
        !Number.isSafeInteger(body.expectedRevision) ||
        body.expectedRevision < 0
      )
        throw new DomainError(
          "COMMAND_VERSION_REQUIRED",
          "Åtgärden måste ha ett unikt id och aktuell version.",
          400,
        );
      if (
        !["select_scenario", "replace_facts", "submit", "respond"].includes(
          body.command?.type,
        )
      )
        throw new DomainError(
          "FORBIDDEN",
          "Åtgärden hör inte till medborgarvyn.",
          403,
        );
      if (
        env.DEPLOYMENT_MODE === "pilot" &&
        containsPersonalNumberIn(body.command)
      )
        throw new DomainError("PILOT_PERSONAL_NUMBER", PILOT_DATA_MESSAGE);
      const result = await commitCommand(
        env.DB,
        id,
        body.commandId,
        body.expectedRevision,
        body.command,
        actor,
      );
      return json({
        case: citizenView(result.state),
        replayed: result.replayed,
      });
    }
    if (action === "pilot-session" && request.method === "POST") {
      if (env.DEPLOYMENT_MODE !== "pilot" || state.mode !== "pilot")
        throw new DomainError(
          "PILOT_DISABLED",
          "Pilotinloggning är avstängd.",
          403,
        );
      const body = await jsonBody(request);
      if (
        !Object.hasOwn(
          authoritiesFor(
            scenarioFor(state.scenarioId, state.scenarioVersion),
            state.facts,
          ),
          body.authority,
        ) ||
        !state.tasks.some((t) => t.authority === body.authority)
      )
        throw new DomainError(
          "INVALID_AUTHORITY",
          "Aktören har ingen uppgift i ärendet.",
        );
      const previous = await sessionFor(request, env, "staff");
      if (
        previous?.role === "pilot_staff" &&
        previous.id === actor.id &&
        previous.authority === body.authority &&
        previous.caseId === id
      )
        return json({ authority: body.authority, scope: id, mode: "pilot" });
      await rateLimit(env, request, "pilot_session", 300);
      const a = {
        id: actor.id,
        role: "pilot_staff",
        authority: body.authority,
        caseId: id,
      };
      return json({ authority: a.authority, scope: id, mode: "pilot" }, 200, {
        "set-cookie": await createSession(env, a),
      });
    }
  }
  if (path === "/api/staff/login" && request.method === "POST") {
    if (env.DEPLOYMENT_MODE !== "pilot")
      throw new DomainError(
        "AUTH_REQUIRED",
        "Använd organisationens identitetsleverantör.",
        401,
      );
    await rateLimit(env, request, "staff_login", 15);
    const body = await jsonBody(request);
    if (
      typeof body.key !== "string" ||
      body.key.length < 32 ||
      body.key.length > 256
    )
      throw new DomainError("LOGIN_FAILED", "Inloggningen misslyckades.", 401);
    let keys = [];
    try {
      keys = JSON.parse(env.STAFF_KEY_HASHES || "[]");
    } catch {}
    const hash = await digest(body.key);
    const entry = Array.isArray(keys)
      ? keys.find(
          (k) => typeof k.sha256 === "string" && equalHash(hash, k.sha256),
        )
      : null;
    if (
      !entry ||
      !entry.subject ||
      !knownAuthority(entry.authority, AUTHORITIES)
    )
      throw new DomainError("LOGIN_FAILED", "Inloggningen misslyckades.", 401);
    return json({ authority: entry.authority }, 200, {
      "set-cookie": await createSession(env, {
        id: entry.subject,
        role: "staff",
        authority: entry.authority,
      }),
    });
  }
  if (path === "/api/staff/tasks" && request.method === "GET") {
    const a = await staff(request, env);
    const { limit, after } = pageRequest(url),
      values = [a.authority];
    let scope =
      a.role === "pilot_staff" ? " AND case_id=?" : " AND status != 'prepared'";
    if (a.role === "pilot_staff") values.push(a.caseId);
    if (after) {
      scope += " AND (updated_at,id)<(?,?)";
      values.push(...after);
    }
    const { results } = await env.DB.prepare(
      "SELECT id,updated_at,packet_json FROM tasks WHERE authority=?" +
        scope +
        " ORDER BY updated_at DESC,id DESC LIMIT ?",
    )
      .bind(...values, limit + 1)
      .all();
    const rows = results.slice(0, limit);
    return json({
      authority: a.authority,
      mode: a.role === "pilot_staff" ? "pilot" : "staff",
      tasks: rows.map((r) => JSON.parse(r.packet_json)),
      nextCursor: results.length > limit ? nextCursor(rows.at(-1)) : null,
    });
  }
  if (path === "/api/staff/assessment" && request.method === "POST") {
    const actor = await staff(request, env);
    await rateLimit(env, request, "staff_command", 300);
    const body = await jsonBody(request);
    if (
      !uuid(body.caseId) ||
      !uuid(body.commandId) ||
      !Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision < 0 ||
      body.command?.type !== "assessment"
    )
      throw new DomainError(
        "INVALID_COMMAND",
        "Bedömningen saknar giltig version eller id.",
        400,
      );
    const state = await readCase(env.DB, body.caseId);
    const task = state.tasks.find((t) => t.id === body.command.taskId);
    if (
      !task ||
      task.authority !== actor.authority ||
      (actor.role === "pilot_staff" && actor.caseId !== state.id)
    )
      throw new DomainError(
        "FORBIDDEN",
        "Du saknar åtkomst till uppgiften.",
        403,
      );
    const result = await commitCommand(
      env.DB,
      state.id,
      body.commandId,
      body.expectedRevision,
      body.command,
      actor,
    );
    return json({
      packet: packetFor(
        result.state,
        result.state.tasks.find((t) => t.id === task.id),
      ),
      replayed: result.replayed,
    });
  }
  throw new DomainError("NOT_FOUND", "Sidan eller åtgärden finns inte.", 404);
}
