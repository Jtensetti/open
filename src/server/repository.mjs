import {
  DomainError,
  newCase,
  applyCommand,
  packetFor,
} from "../domain/core.mjs";
import { canonical, digest, now } from "./security.mjs";
export async function readCase(db, id) {
  const row = await db
    .prepare("SELECT state_json FROM cases WHERE id = ?")
    .bind(id)
    .first();
  if (!row)
    throw new DomainError("NOT_FOUND", "Ärendet kunde inte hittas.", 404);
  return JSON.parse(row.state_json);
}
export async function createCase(db, ownerId, mode) {
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM cases WHERE owner_id = ?")
    .bind(ownerId)
    .first();
  if (count.count >= 25)
    throw new DomainError(
      "CASE_LIMIT",
      "Du har nått pilotens gräns på 25 ärenden.",
      429,
    );
  const state = newCase(crypto.randomUUID(), ownerId, now(), mode);
  const e = {
    type: "case.created",
    data: {
      scenarioId: state.scenarioId,
      scenarioVersion: state.scenarioVersion,
      mode,
    },
    actor: { id: ownerId, role: "citizen" },
    at: state.createdAt,
  };
  const payload = canonical(e),
    hash = await digest("ROOT\n" + payload);
  await db.batch([
    db
      .prepare(
        "INSERT INTO cases (id,owner_id,revision,state_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        state.id,
        ownerId,
        0,
        JSON.stringify(state),
        state.createdAt,
        state.updatedAt,
      ),
    db
      .prepare(
        "INSERT INTO events (case_id,sequence,type,payload_json,previous_hash,hash,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(state.id, 1, e.type, payload, "ROOT", hash, state.createdAt),
  ]);
  return state;
}
export async function commitCommand(
  db,
  id,
  commandId,
  expectedRevision,
  command,
  actor,
) {
  const bodyHash = await digest(
    canonical({
      command,
      actor: {
        id: actor.id,
        role: actor.role,
        authority: actor.authority || null,
      },
    }),
  );
  const prior = await db
    .prepare(
      "SELECT body_hash,result_revision FROM commands WHERE case_id = ? AND command_id = ?",
    )
    .bind(id, commandId)
    .first();
  if (prior) {
    if (prior.body_hash !== bodyHash)
      throw new DomainError(
        "IDEMPOTENCY_REUSE",
        "Åtgärdens nyckel har redan använts för annat innehåll.",
        409,
      );
    return { state: await readCase(db, id), replayed: true };
  }
  const previous = await readCase(db, id);
  if (previous.revision !== expectedRevision)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Ärendet har uppdaterats i en annan vy. Läs in den senaste versionen och försök igen.",
      409,
    );
  const at = now(),
    { state, events } = applyCommand(previous, command, actor, at);
  let last = await db
    .prepare(
      "SELECT sequence,hash FROM events WHERE case_id = ? ORDER BY sequence DESC LIMIT 1",
    )
    .bind(id)
    .first();
  const journal = [];
  for (const event of events) {
    const payload = canonical(event),
      hash = await digest(last.hash + "\n" + payload);
    journal.push({
      sequence: last.sequence + 1,
      payload,
      hash,
      previousHash: last.hash,
      type: event.type,
    });
    last = { sequence: last.sequence + 1, hash };
  }
  const statements = [
    db
      .prepare(
        "INSERT INTO commands (case_id,command_id,body_hash,result_revision,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM cases WHERE id = ? AND revision = ?)",
      )
      .bind(id, commandId, bodyHash, state.revision, at, id, expectedRevision),
    db
      .prepare(
        "UPDATE cases SET state_json=?,revision=?,last_command_id=?,updated_at=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM commands WHERE case_id=? AND command_id=?)",
      )
      .bind(
        JSON.stringify(state),
        state.revision,
        commandId,
        at,
        id,
        expectedRevision,
        id,
        commandId,
      ),
  ];
  const gate =
    "EXISTS (SELECT 1 FROM cases WHERE id = ? AND last_command_id = ?)";
  for (const e of journal)
    statements.push(
      db
        .prepare(
          `INSERT INTO events (case_id,sequence,type,payload_json,previous_hash,hash,created_at) SELECT ?,?,?,?,?,?,? WHERE ${gate}`,
        )
        .bind(
          id,
          e.sequence,
          e.type,
          e.payload,
          e.previousHash,
          e.hash,
          at,
          id,
          commandId,
        ),
    );
  statements.push(
    db
      .prepare(`DELETE FROM tasks WHERE case_id = ? AND ${gate}`)
      .bind(id, id, commandId),
  );
  for (const task of state.tasks) {
    const packet = packetFor(state, task);
    statements.push(
      db
        .prepare(
          `INSERT INTO tasks (id,case_id,authority,status,packet_json,updated_at) SELECT ?,?,?,?,?,? WHERE ${gate}`,
        )
        .bind(
          task.id,
          id,
          task.authority,
          task.status,
          JSON.stringify(packet),
          at,
          id,
          commandId,
        ),
    );
  }
  // Outbox is an explicit integration boundary. No worker sends these packets yet.
  statements.push(
    db
      .prepare(
        `UPDATE outbox SET status = 'superseded' WHERE case_id = ? AND status = 'awaiting_integration' AND ${gate}`,
      )
      .bind(id, id, commandId),
  );
  if (state.submitted)
    for (const task of state.tasks)
      statements.push(
        db
          .prepare(
            `INSERT INTO outbox (id,case_id,authority,task_id,status,payload_json,created_at) SELECT ?,?,?,?,'awaiting_integration',?,? WHERE ${gate}`,
          )
          .bind(
            `${id}:${state.revision}:${task.key}`,
            id,
            task.authority,
            task.id,
            JSON.stringify(packetFor(state, task)),
            at,
            id,
            commandId,
          ),
      );
  try {
    const result = await db.batch(statements);
    if (!result[0].meta.changes)
      throw new DomainError(
        "REVISION_CONFLICT",
        "Någon hann uppdatera ärendet. Läs in den senaste versionen.",
        409,
      );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const concurrent = await db
      .prepare(
        "SELECT body_hash FROM commands WHERE case_id=? AND command_id=?",
      )
      .bind(id, commandId)
      .first();
    if (concurrent?.body_hash === bodyHash)
      return { state: await readCase(db, id), replayed: true };
    throw error;
  }
  return { state, replayed: false };
}
export async function auditTrail(db, id) {
  const { results } = await db
    .prepare(
      "SELECT sequence,payload_json,previous_hash,hash FROM events WHERE case_id=? ORDER BY sequence",
    )
    .bind(id)
    .all();
  let previous = "ROOT";
  const events = [];
  for (const row of results) {
    const expected = await digest(previous + "\n" + row.payload_json);
    if (expected !== row.hash || previous !== row.previous_hash)
      throw new DomainError(
        "AUDIT_INTEGRITY",
        "Händelsekedjans integritet kunde inte verifieras.",
        500,
      );
    events.push({
      sequence: row.sequence,
      ...JSON.parse(row.payload_json),
      hash: row.hash,
      previousHash: row.previous_hash,
    });
    previous = row.hash;
  }
  return { events, headHash: previous, verified: true };
}
