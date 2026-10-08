import { test, expect, describeCase } from "./helpers.mjs";
test("northern municipality, local address, scoped authority and changed municipality share the same state", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await describeCase(
    page,
    "Jag vill öppna en resturang för 40 gäster i Kiruna. Storgatan 12B, 981 32 Kiruna. Vi ska inte servera alkohol.",
  );
  await expect(page.locator("#facts")).toContainText(
    "Storgatan 12B, 981 32 Kiruna",
  );
  await expect(page.locator("#municipality-label")).toHaveText("Kiruna");
  await page.locator("#demo-tools > summary").click();
  await page.getByRole("button", { name: "Fyll med testuppgifter" }).click();
  await page
    .getByLabel("Uppgifterna stämmer och jag använder testuppgifter.")
    .check();
  await page.getByRole("button", { name: "Starta pilotärende" }).click();
  await page.locator("#authority-details > summary").click();
  await expect(
    page.locator('[data-authority="municipality.2584.food"]'),
  ).toBeVisible();
  await page.locator('[data-authority="municipality.2584.food"]').click();
  await expect(page.locator(".work-card")).toContainText("Kiruna");
  await describeCase(
    page,
    "Jag vill öppna en restaurang för 40 gäster i Malmö. Storgatan 12B, 211 20 Malmö. Vi ska inte servera alkohol.",
  );
  await expect(page.locator("#municipality-label")).toHaveText("Malmö");
  await expect(
    page.locator('[data-authority="municipality.1280.food"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-authority="municipality.2584.food"]'),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("postal town does not silently choose a municipality and alternatives require confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await describeCase(
    page,
    "Jag vill öppna en restaurang. Smyge Strandväg 25B, 231 78 Smygehamn.",
  );
  await expect(page.locator("#facts")).toContainText("Smyge Strandväg 25B");
  await expect(page.locator("#question")).toContainText(
    "Vilken kommun gäller ärendet?",
  );
  await expect(page.locator("#municipality-label")).toHaveText("HELA SVERIGE");
  await describeCase(
    page,
    "Jag vill öppna en restaurang i Uppsala eller Malmö. Storgatan 12.",
  );
  await expect(page.locator("#question")).toContainText("Bekräfta tolkningen");
  await expect(page.locator("[data-authority]")).toHaveCount(0);
});
