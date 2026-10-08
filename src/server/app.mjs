import { RESTAURANT } from "../domain/restaurant.mjs";
import {
  DomainError,
  citizenView,
  packetFor,
  scenarioFor,
} from "../domain/core.mjs";
import { AUTHORITIES, catalogSummary } from "../domain/catalog.mjs";
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
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
async function citizen(request, env) {
  const a = await sessionFor(request, env);
  if (!a)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Öppna en ny session för att fortsätta.",
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
        "cache-control":
          file === "/index.html" ? "no-cache" : "public, max-age=300",
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
      version: "0.3.0",
      mode: env.DEPLOYMENT_MODE || "closed",
      scenario: RESTAURANT,
      scenarios: catalogSummary(),
      integrations: "not_connected",
      staffConfigured: !!env.STAFF_KEY_HASHES,
      pilotEnabled: env.DEPLOYMENT_MODE === "pilot",
    });
  if (path === "/api/health" && request.method === "GET") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ status: "ok", version: "0.3.0" });
  }
  if (path === "/api/session" && request.method === "POST") {
    const existing = await sessionFor(request, env);
    if (existing) return json({ authenticated: true });
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
          await createCase(env.DB, a.id, "pilot", body.scenarioId),
        ),
      },
      201,
    );
  }
  const caseMatch = path.match(
    /^\/api\/cases\/([a-f0-9-]+)(?:\/(commands|events|pilot-session|integration))?$/i,
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
      if (!uuid(body.commandId) || !Number.isInteger(body.expectedRevision))
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
          scenarioFor(state.scenarioId, state.scenarioVersion).authorities,
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
      !Object.hasOwn(AUTHORITIES, entry.authority)
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
    const sql =
      a.role === "pilot_staff"
        ? "SELECT packet_json FROM tasks WHERE authority=? AND case_id=? ORDER BY updated_at DESC LIMIT 100"
        : "SELECT packet_json FROM tasks WHERE authority=? AND status != 'prepared' ORDER BY updated_at DESC LIMIT 100";
    const p = env.DB.prepare(sql);
    const { results } = await (
      a.role === "pilot_staff"
        ? p.bind(a.authority, a.caseId)
        : p.bind(a.authority)
    ).all();
    return json({
      authority: a.authority,
      mode: a.role === "pilot_staff" ? "pilot" : "staff",
      tasks: results.map((r) => JSON.parse(r.packet_json)),
    });
  }
  if (path === "/api/staff/assessment" && request.method === "POST") {
    const actor = await staff(request, env);
    await rateLimit(env, request, "staff_command", 300);
    const body = await jsonBody(request);
    if (
      !uuid(body.caseId) ||
      !uuid(body.commandId) ||
      !Number.isInteger(body.expectedRevision) ||
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
