import assert from "node:assert/strict";
import { SCENARIOS, NATIONAL_SCENARIOS } from "../src/domain/catalog.mjs";
import { parseIntake } from "../src/domain/intake-parser.mjs";
import { validateValue, diagnose } from "../src/domain/core.mjs";
assert.equal(SCENARIOS.length, 100);
assert.equal(NATIONAL_SCENARIOS.length, 100);
const scenarioIds = new Set();
let count = 0;
for (const s of [...SCENARIOS, ...NATIONAL_SCENARIOS]) {
  assert.ok(!scenarioIds.has(s.id), "Duplicate scenario id");
  scenarioIds.add(s.id);
  assert.equal(s.lifecycle, "pilot");
  assert.match(s.version, /^\d+\.\d+\.\d+$/);
  const ids = new Set();
  function condition(c) {
    if (c.always) return;
    if (c.all || c.any) return (c.all || c.any).forEach(condition);
    assert.ok(s.fields[c.field], `${s.id}: unknown condition field ${c.field}`);
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
    r.fields.forEach((k) =>
      assert.ok(s.fields[k], `Unknown packet field ${k}`),
    );
    r.sources.forEach((k) => assert.ok(s.sources[k]));
    assert.ok(
      r.fields.length < Object.keys(s.fields).length,
      "Authority must not receive entire case",
    );
    assert.ok(!r.fields.includes("citizen_note"));
    count++;
  }
  for (const [k, v] of Object.entries(s.demo))
    assert.ok(validateValue(s.fields[k], v), `${s.id} invalid demo ${k}`);
  const sample = Object.fromEntries(
    Object.entries(s.demo).map(([k, value]) => [
      k,
      { value, status: "confirmed" },
    ]),
  );
  assert.ok(
    diagnose(s, sample).ready,
    `${s.id}: demo must complete all conditional questions`,
  );
  const parsed = parseIntake(s.example, s);
  assert.equal(
    parsed.goal,
    s.id,
    `${s.id}: example must identify its own goal`,
  );
  assert.deepEqual(
    parsed.unsupported,
    [],
    `${s.id}: example must be supported`,
  );
}
console.log(
  `${NATIONAL_SCENARIOS.length} national and ${SCENARIOS.length} preserved legacy scenarios, ${count} scoped rules, questions, example parsing and complete demo inputs verified.`,
);
