import { test, expect, ready, describeCase, savedCase } from "./helpers.mjs";

const garage = "Jag vill bygga garage i Uppsala på 40 kvm.";

test("a lost save response is replayed with the same key, without losing newer input", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, garage);
  const bodies = [];
  let fail = true;
  await page.route("**/api/cases/*/commands", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (fail) {
      fail = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.locator("#intent").fill(garage.replace("40", "50"));
  await expect(page.locator("#save-status")).toHaveText("Inte sparat");
  await expect(page.locator("#system-status")).toHaveText("Lokalt");
  expect((await savedCase(page)).facts.area.value).toBe(50);
  await page.locator("#intent").fill(garage.replace("40", "60"));
  await ready(page);
  expect(bodies[0].commandId).toBe(bodies[1].commandId);
  expect((await savedCase(page)).facts.area.value).toBe(60);
  await expect(page.locator("#save-status")).toHaveText("Utkast sparat");
});

test("an unsaved explicit answer survives a reload and can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Jag vill söka dagisplats i Uppsala.");
  await page.route("**/api/cases/*/commands", (route) => route.abort("failed"));
  await page.locator("#answer").fill("hösten 2028");
  await page.getByRole("button", { name: "Bekräfta", exact: true }).click();
  await expect(page.locator("#save-status")).toHaveText("Inte sparat");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Inte sparat");
  await expect(page.locator("#authority")).toContainText("hösten 2028");
  await page.unroute("**/api/cases/*/commands");
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await ready(page);
  expect((await savedCase(page)).facts.start_period.value).toBe("hösten 2028");
  expect((await savedCase(page)).facts.start_period.status).toBe("confirmed");
});

test("concurrent tabs preserve both versions by saving a separate copy", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, garage);
  const original = await savedCase(page);
  const other = await context.newPage();
  await other.goto("/");
  await ready(other);
  await describeCase(page, garage.replace("40", "50"));
  await other.locator("#intent").fill(garage.replace("40", "60"));
  await expect(other.locator("#error-banner")).toContainText("annan vy");
  expect((await savedCase(page)).facts.area.value).toBe(50);
  await other.getByRole("button", { name: "Spara en egen kopia" }).click();
  await ready(other);
  const cases = (await (await other.request.get("/api/cases")).json()).cases;
  expect(cases).toHaveLength(2);
  const originalAfter = (
    await (await page.request.get("/api/cases/" + original.id)).json()
  ).case;
  expect(originalAfter.facts.area.value).toBe(50);
  const copy = cases.find((c) => c.id !== original.id);
  expect(
    (await (await other.request.get("/api/cases/" + copy.id)).json()).case.facts
      .area.value,
  ).toBe(60);
  await other.close();
});

test("history failure does not claim that committed facts are unsaved", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.route("**/api/cases/*/events", (route) => route.abort("failed"));
  await describeCase(page, garage);
  await page.getByRole("tab", { name: "Händelser" }).click();
  await expect(page.locator("#system-content")).toContainText(
    "Historiken kunde inte hämtas",
  );
  await expect(page.locator("#save-status")).toHaveText("Utkast sparat");
  expect((await savedCase(page)).facts.area.value).toBe(40);
  await page.unroute("**/api/cases/*/events");
  await page
    .getByRole("button", { name: "Försök hämta historiken igen" })
    .click();
  await expect(page.locator("#system-content")).toContainText(
    "Händelsekedjan är verifierad",
  );
});

test("identifier guard stops network and storage, then resumes when corrected", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, garage);
  let commands = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/commands")) commands++;
  });
  await page
    .locator("#intent")
    .fill(garage + " Mitt personnummer är 19800101-1234.");
  await expect(page.locator("#save-status")).toHaveText("Sparandet pausat");
  await expect(page.locator("#intent")).toHaveAttribute("aria-invalid", "true");
  await page.waitForTimeout(700);
  expect(commands).toBe(0);
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain("19800101");
  await describeCase(page, garage.replace("40", "30"));
  expect((await savedCase(page)).facts.area.value).toBe(30);
});

test("invalid answers are described beside the field and keyboard focus follows completion", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Jag vill söka dagisplats i Uppsala.");
  await page.locator("#answer").fill(" ");
  await page.getByRole("button", { name: "Bekräfta", exact: true }).click();
  await expect(page.locator("#answer-error")).toContainText("2–160 tecken");
  await expect(page.locator("#answer")).toBeFocused();
  await expect(page.locator("#answer")).toHaveAttribute("aria-invalid", "true");
  expect((await savedCase(page)).facts.start_period).toBeUndefined();
  await page.locator("#answer").fill("  hösten 2027  ");
  await page.getByRole("button", { name: "Bekräfta", exact: true }).click();
  await ready(page);
  await expect(page.locator("#question h3")).toBeFocused();
  await expect(page.locator("#question")).toContainText(
    "Inget har skickats in",
  );
  await expect(
    page.locator("#authority [data-field=municipality]"),
  ).toContainText("Tolkat · ej bekräftat");
  await expect(
    page.locator("#authority [data-field=start_period]"),
  ).toContainText("Bekräftat av dig");
  expect((await savedCase(page)).facts.start_period.value).toBe("hösten 2027");
});

test("failed startup can be retried and support remains usable", async ({
  page,
}) => {
  await page.route("**/api/config", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.locator("#error-banner")).toContainText(
    "Kunde inte nå tjänsten",
  );
  await page.getByText("Om testtjänsten", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Rapportera tekniskt fel på GitHub" }),
  ).toBeVisible();
  await page.unroute("**/api/config");
  await page.getByRole("button", { name: "Försök igen", exact: true }).click();
  await ready(page);
});

test("small screens reflow, local draft download is explicit, and no-JS gives an alternative", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await ready(page);
  await describeCase(page, garage);
  await page.getByText("Om testtjänsten", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".service-info [data-download-draft]").click();
  expect((await downloadPromise).suggestedFilename()).toBe("oppna-utkast.json");
  const nojs = await context.browser().newContext({ javaScriptEnabled: false });
  const alternative = await nojs.newPage();
  await alternative.goto("http://localhost:8787");
  await expect(alternative.locator("noscript p")).toContainText(
    "Kontakta din kommun",
  );
  await nojs.close();
});
