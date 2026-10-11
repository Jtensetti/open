import {
  test,
  expect,
  ready,
  describeCase,
  savedCase,
  resumeDraft,
} from "./helpers.mjs";

test("open workspace has no default restaurant or extra navigation", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "Vad vill du göra?" }),
  ).toBeVisible();
  await expect(page.locator(".terminal")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Handläggare", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#question")).toBeHidden();
  expect(JSON.parse(await page.locator(".code").innerText()).scenario).toBe(
    null,
  );
  await expect(page.locator("body")).not.toContainText(
    /restaurang|DITT PERSPEKTIV|Parsning i din webbläsare|Samma ärende|Rätt fråga|Beständigt tillstånd/,
  );
  await expect(
    page.locator(
      ".servicebar, .header-right, #open-catalog, #continue-intake, .example-row, .terminal-footer",
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      ".authority-panel button, .authority-panel select, .authority-panel textarea",
    ),
  ).toHaveCount(0);
});

test("typing changes the type automatically and clearing text removes stale data", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(
    page,
    "Jag vill bygga ett garage i Uppsala. Garaget blir 40 kvm.",
  );
  await expect(page.locator("#authority")).toContainText("Bygga garage");
  expect((await savedCase(page)).scenarioId).toBe("building.garage.se");
  await describeCase(
    page,
    "Jag vill arrangera ett evenemang i Malmö för 80 deltagare.",
  );
  await expect(page.locator("#authority")).toContainText("Arrangera evenemang");
  await expect(page.locator("#authority")).not.toContainText("Uppsala");
  expect((await savedCase(page)).facts.area).toBeUndefined();
  await describeCase(page, "");
  expect(JSON.parse(await page.locator(".code").innerText()).scenario).toBe(
    null,
  );
  expect((await savedCase(page)).facts).toEqual({});
  await expect(page.locator("#authority")).toHaveText("Inga uppgifter ännu.");
});

test("uncertain and competing goals remain visible as uncertainty", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Jag kanske vill bygga ett garage i Uppsala.");
  await expect(page.locator("#question")).toContainText(
    "Har vi förstått rätt?",
  );
  expect((await savedCase(page)).inputStatus).toBe("uncertain");
  await page.getByRole("button", { name: "Ja, det stämmer" }).click();
  await ready(page);
  expect((await savedCase(page)).inputStatus).toBe("supported");
  await page.reload();
  await ready(page);
  await resumeDraft(page);
  await expect(page.locator("[data-confirm-goal]")).toHaveCount(0);
  await describeCase(
    page,
    "Jag vill bygga ett garage och öppna en butik i Uppsala.",
  );
  expect((await savedCase(page)).inputStatus).toBe("unsupported");
  await expect(page.locator("#authority")).toHaveText("Inga uppgifter ännu.");
  await expect(page.locator("#question")).toBeVisible();
});

test("slow saves cannot replace more recent input or facts", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  let intercepted;
  const started = new Promise((resolve) => {
    intercepted = resolve;
  });
  let first = true;
  await page.route("**/api/cases/*/commands", async (route) => {
    if (first) {
      first = false;
      intercepted();
      await delayed;
    }
    await route.continue();
  });
  await page
    .getByLabel("Beskriv ditt mål")
    .fill("Jag vill bygga ett garage i Uppsala.");
  await started;
  const text = "Jag vill installera en värmepump i Kiruna.";
  await page.getByLabel("Beskriv ditt mål").fill(text);
  release();
  await ready(page);
  await expect(page.locator("#intent")).toHaveValue(text);
  expect((await savedCase(page)).scenarioId).toBe("environment.heatpump.se");
  expect((await savedCase(page)).facts.municipality.value).toBe("Kiruna");
  await page.reload();
  await ready(page);
  await resumeDraft(page);
  await expect(page.locator("#intent")).toHaveValue(text);
  await expect(page.locator("#authority")).toContainText(
    "Installera värmepump",
  );
});
