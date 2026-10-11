import test from "node:test";
import assert from "node:assert/strict";
import {
  containsPersonalNumber,
  containsPersonalNumberIn,
} from "../src/domain/pilot-data.mjs";
import { harness, dispatch, facts } from "./helpers.mjs";

for (const text of [
  "19800101-1234",
  "800101-1234",
  "800101+1234",
  "198001011234",
  "8001011231",
  "800161-1234",
  "19800101 1234",
  "800101–1234",
]) {
  test(`pilot flags an identifier candidate: ${text}`, () =>
    assert.equal(containsPersonalNumber(`Test ${text}.`), true));
}
for (const text of [
  "0701234567",
  "2027-05-01",
  "120 kvadratmeter",
  "Storgatan 12",
  "1234567890123456",
  "19801301-1234",
  "19800132-1234",
]) {
  test(`pilot allows ordinary data: ${text}`, () =>
    assert.equal(containsPersonalNumber(text), false));
}
test("nested excerpts and alternatives are covered", () => {
  assert.equal(
    containsPersonalNumberIn({
      facts: { address: { source: "19800101-1234" } },
    }),
    true,
  );
  assert.equal(
    containsPersonalNumberIn({ facts: { capacity: { value: 40 } } }),
    false,
  );
});
test("pilot rejects identifiers in value, provenance and reasons before state or audit writes", async () => {
  const h = harness();
  try {
    const { c, state } = await h.ready();
    const before = (await c.request(`/api/cases/${state.id}/events`)).data;
    for (const command of [
      {
        type: "replace_facts",
        facts: facts({ address: "19800101-1234" }),
        inputStatus: "supported",
      },
      {
        type: "replace_facts",
        facts: {
          address: {
            ...facts({ address: "Storgatan 12" }).address,
            source: "Fritext 800101-1234",
          },
        },
        inputStatus: "supported",
      },
      {
        type: "replace_facts",
        facts: {},
        inputReasons: ["198001011234"],
        inputStatus: "uncertain",
      },
    ]) {
      const result = await dispatch(c, state, command);
      assert.equal(result.status, 422);
      assert.equal(result.data.error.code, "PILOT_PERSONAL_NUMBER");
      assert.equal(JSON.stringify(result.data).includes("19800101"), false);
    }
    assert.equal(
      (await c.request(`/api/cases/${state.id}`)).data.case.revision,
      state.revision,
    );
    assert.deepEqual(
      (await c.request(`/api/cases/${state.id}/events`)).data,
      before,
    );
  } finally {
    h.close();
  }
});
