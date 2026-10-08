import { test, expect, describeCase } from "./helpers.mjs";

test("neutral start keeps questions and technical views out of the way", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await expect(
    page.getByRole("heading", { name: "Vad vill du göra?" }),
  ).toBeVisible();
  await expect(page.locator("#facts-panel")).toBeHidden();
  await expect(page.locator("#demo-perspectives")).toBeHidden();
  await expect(page.locator("#question")).toBeHidden();
  await page
    .getByLabel("Beskriv ditt mål")
    .fill("Jag vill bygga ett garage i Uppsala.");
  await expect(page.locator("#question")).toBeHidden();
  await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bygga garage", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#question")).toContainText(
    "Vilken adress eller plats",
  );
  await expect(page.locator("#authority-details")).toBeHidden();
  await expect(page.locator(".terminal")).toBeHidden();
});

for (const [text, title] of [
  ["Jag vill arrangera ett evenemang i Malmö.", "Arrangera evenemang"],
  ["Jag vill installera en värmepump i Kiruna.", "Installera värmepump"],
  ["Jag vill öppna en butik i Uppsala. Storgatan 12.", "Öppna butik"],
]) {
  test(`free text determines the questions: ${title}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#save-status")).toHaveText("Sparat");
    await describeCase(page, text);
    await expect(page.locator("#intake-title")).toHaveText(title);
    await expect(page.locator("#intent")).toHaveValue(text);
    await page.reload();
    await expect(page.locator("#intake-title")).toHaveText(title);
    await expect(page.locator("#intent")).toHaveValue(text);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}

test("uncertain intent asks for confirmation and multiple goals are not silently chosen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await describeCase(page, "Jag kanske vill bygga ett garage i Uppsala.");
  await expect(page.locator("#question")).toContainText(
    "Har vi förstått rätt?",
  );
  await expect(page.locator("[data-submit-case]")).toHaveCount(0);
  await page.getByRole("button", { name: "Ja, det stämmer" }).click();
  await expect(page.locator("#question")).toContainText(
    "Vilken kommun gäller ärendet?",
  );
  await expect(page.locator("[data-confirm-goal]")).toHaveCount(0);
  await describeCase(
    page,
    "Jag vill bygga ett garage och öppna en butik i Uppsala.",
  );
  await expect(page.locator("#question")).toContainText("flera ärendemål");
  await expect(page.locator("[data-submit-case]")).toHaveCount(0);
});

test("new case starts neutral after another type was selected", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await describeCase(page, "Jag vill bygga ett garage i Uppsala.");
  await page.getByRole("button", { name: "Nytt ärende", exact: true }).click();
  await expect(page.locator("#intake-title")).toHaveText("Vad vill du göra?");
  await expect(page.locator("#intent")).toHaveValue("");
  await expect(page.locator("#question")).toBeHidden();
});
