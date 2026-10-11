import {
  test,
  expect,
  ready,
  describeCase,
  savedCase,
  resumeDraft,
} from "./helpers.mjs";
const text = "Jag vill söka dagisplats i Uppsala till hösten 2027.";
async function expectBlank(page) {
  await expect(page.locator("#intent")).toHaveValue("");
  await expect(page.locator("#authority")).toHaveText("Inga uppgifter ännu.");
  const graph = JSON.parse(await page.locator(".code").innerText());
  expect(graph.case_id).toBeNull();
  expect(graph.scenario).toBeNull();
  expect(graph.facts).toEqual({});
  await expect(page.locator("#question")).toBeHidden();
  await expect(page.locator("#save-status")).toHaveText("Redo");
}

test("fresh visits create no case and never automatically reopen prior data", async ({
  page,
  context,
}) => {
  const writes = [];
  const reads = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/cases"))
      writes.push(r.url());
    if (/\/api\/cases\/[a-f0-9-]+(?:\/events)?$/.test(r.url()))
      reads.push(r.url());
  });
  await page.goto("/");
  await ready(page);
  await expectBlank(page);
  expect(writes).toHaveLength(0);
  expect((await (await page.request.get("/api/cases")).json()).cases).toEqual(
    [],
  );
  await describeCase(page, text);
  const original = await savedCase(page);
  writes.length = 0;
  reads.length = 0;
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await ready(page);
    await expectBlank(page);
  }
  expect(writes).toHaveLength(0);
  expect(reads).toHaveLength(0);
  expect(
    (await (await page.request.get("/api/cases")).json()).cases,
  ).toHaveLength(1);
  const other = await context.newPage();
  await other.goto("/");
  await ready(other);
  await expectBlank(other);
  await expect(
    other.getByRole("button", { name: "Återuppta utkast" }),
  ).toBeVisible();
  await other.close();
  expect((await savedCase(page)).facts).toEqual(original.facts);
});

test("resuming a draft requires an explicit choice, including after reload", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, text);
  const original = await savedCase(page);
  await page.reload();
  await ready(page);
  await expectBlank(page);
  await resumeDraft(page);
  await expect(page.locator("#intent")).toHaveValue(text);
  await expect(page.locator("#authority")).toContainText("Uppsala");
  expect((await savedCase(page)).id).toBe(original.id);
});

test("new input after a fresh visit gets a separate draft and preserves the old one", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, text);
  const original = await savedCase(page);
  await page.reload();
  await ready(page);
  await describeCase(page, "Jag vill bygga garage i Lund på 40 kvm.");
  await expect(
    page.getByRole("button", { name: "Återuppta utkast" }),
  ).toBeHidden();
  const created = await savedCase(page);
  expect(created.id).not.toBe(original.id);
  expect(created.scenarioId).toBe("building.garage.se");
  const previous = (
    await (await page.request.get("/api/cases/" + original.id)).json()
  ).case;
  expect(previous.facts).toEqual(original.facts);
  expect(
    (await (await page.request.get("/api/cases")).json()).cases,
  ).toHaveLength(2);
});

test("input before the first successful save is recoverable only on request", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.route("**/api/cases", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await page.locator("#intent").fill(text);
  await expect(page.locator("#save-status")).toHaveText("Inte sparat");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await ready(page);
  await expectBlank(page);
  await page.unroute("**/api/cases");
  await resumeDraft(page);
  await expect(page.locator("#intent")).toHaveValue(text);
  expect((await savedCase(page)).facts.municipality.value).toBe("Uppsala");
});
