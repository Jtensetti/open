import assert from "node:assert/strict";
import { RESTAURANT as s } from "../src/domain/restaurant.mjs";
assert.equal(s.lifecycle, "pilot");
assert.match(s.version, /^\d+\.\d+\.\d+$/);
const ids = new Set();
function condition(c) {
  if (c.always) return;
  if (c.all || c.any) return (c.all || c.any).forEach(condition);
  assert.ok(s.fields[c.field], `Unknown condition field ${c.field}`);
}
for (const [key, f] of Object.entries(s.fields)) {
  assert.ok(f.label);
  if (f.required) assert.ok(f.question, `${key} needs a question`);
  if (f.when) condition(f.when);
}
for (const r of s.rules) {
  assert.ok(!ids.has(r.id));
  ids.add(r.id);
  assert.ok(s.authorities[r.authority]);
  assert.ok(r.question && r.limits && r.reason);
  condition(r.when);
  r.fields.forEach((k) => assert.ok(s.fields[k], `Unknown packet field ${k}`));
  r.sources.forEach((k) => assert.ok(s.sources[k]));
  assert.ok(
    r.fields.length < Object.keys(s.fields).length,
    "Authority must not receive entire case",
  );
}
console.log(
  `${s.id}@${s.version}: ${Object.keys(s.fields).length} fields, ${s.rules.length} scoped rules verified.`,
);
