import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    principalId: text("principal_id").notNull(),
    role: text("role").notNull(),
    authKind: text("auth_kind").notNull().default("anonymous"),
    authority: text("authority"),
    caseScope: text("case_scope"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("sessions_expiry").on(t.expiresAt)],
);
export const cases = sqliteTable(
  "cases",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    revision: integer("revision").notNull(),
    stateJson: text("state_json").notNull(),
    lastCommandId: text("last_command_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("cases_owner_updated").on(t.ownerId, t.updatedAt)],
);
export const events = sqliteTable(
  "events",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    previousHash: text("previous_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.sequence] })],
);
export const commands = sqliteTable(
  "commands",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    commandId: text("command_id").notNull(),
    bodyHash: text("body_hash").notNull(),
    resultRevision: integer("result_revision").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.commandId] })],
);
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    authority: text("authority").notNull(),
    status: text("status").notNull(),
    packetJson: text("packet_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("tasks_authority_status").on(t.authority, t.status),
    index("tasks_case").on(t.caseId),
    index("tasks_authority_updated_id").on(t.authority, t.updatedAt, t.id),
  ],
);
export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    authority: text("authority").notNull(),
    taskId: text("task_id").notNull(),
    status: text("status").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("outbox_case").on(t.caseId),
    index("outbox_status_authority").on(t.status, t.authority),
  ],
);
export const throttle = sqliteTable("throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const authTransactions = sqliteTable(
  "auth_transactions",
  {
    stateHash: text("state_hash").primaryKey(),
    provider: text("provider").notNull(),
    nonce: text("nonce").notNull(),
    verifier: text("verifier").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("auth_transactions_expiry").on(t.expiresAt)],
);
