import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function openDatabase(path = ":memory:") {
  const sql = new DatabaseSync(path);
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec("PRAGMA journal_mode=WAL");
  sql.exec(
    "CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)",
  );
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (
      sql.prepare("SELECT name FROM __local_migrations WHERE name=?").get(name)
    )
      continue;
    sql.exec("BEGIN");
    try {
      sql.exec(
        readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
      );
      sql.prepare("INSERT INTO __local_migrations(name) VALUES (?)").run(name);
      sql.exec("COMMIT");
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  }
  const wrap = (query, args = []) => ({
    bind(...values) {
      return wrap(query, values);
    },
    async first(column) {
      const result = sql.prepare(query).get(...args) || null;
      return column && result ? result[column] : result;
    },
    async all() {
      const results = sql.prepare(query).all(...args);
      return { results, success: true, meta: { changes: 0 } };
    },
    _run() {
      const r = sql.prepare(query).run(...args);
      return {
        success: true,
        meta: {
          changes: Number(r.changes),
          last_row_id: Number(r.lastInsertRowid),
        },
      };
    },
    async run() {
      return this._run();
    },
  });
  return {
    prepare: wrap,
    async batch(statements) {
      sql.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => s._run());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => sql.close(),
    raw: sql,
  };
}
