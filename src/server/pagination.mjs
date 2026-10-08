import { DomainError } from "../domain/core.mjs";
export function pageRequest(url) {
  const rawLimit = url.searchParams.get("limit"),
    limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new DomainError(
      "INVALID_PAGE",
      "Ange en sidstorlek mellan 1 och 100.",
      400,
    );
  let after = null;
  const raw = url.searchParams.get("cursor");
  if (raw !== null) {
    try {
      if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
      const tuple = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
      if (
        !Array.isArray(tuple) ||
        tuple.length !== 2 ||
        typeof tuple[0] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(tuple[0]) ||
        !Number.isFinite(Date.parse(tuple[0])) ||
        typeof tuple[1] !== "string" ||
        tuple[1].length > 200 ||
        !tuple[1]
      )
        throw new Error();
      after = tuple;
    } catch {
      throw new DomainError("INVALID_PAGE", "Sidlänken är inte giltig.", 400);
    }
  }
  return { limit, after };
}
export const nextCursor = (row) =>
  btoa(JSON.stringify([row.updated_at, row.id]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
