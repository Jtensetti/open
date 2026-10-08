import { test, expect, ready, describeCase, savedCase } from "./helpers.mjs";
test("municipality changes are reflected in all three views", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(
    page,
    "Jag vill öppna en restaurang för 40 gäster i Kiruna. Adress: Storgatan 12B, 981 32 Kiruna. Vi ska inte servera alkohol.",
  );
  await expect(page.locator("#authority")).toContainText("Kiruna");
  await expect(page.locator("#facts")).toContainText("Storgatan 12B");
  await describeCase(
    page,
    "Jag vill öppna en restaurang för 40 gäster i Malmö. Adress: Storgatan 12B, 211 20 Malmö. Vi ska inte servera alkohol.",
  );
  for (const s of ["#authority", "#facts", ".code"]) {
    await expect(page.locator(s)).toContainText("Malmö");
    await expect(page.locator(s)).not.toContainText("Kiruna");
  }
  expect((await savedCase(page)).facts.municipality.value).toBe("Malmö");
});
test("unknown municipality and ambiguous addresses still need an answer", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(
    page,
    "Jag vill öppna en butik. Smyge Strandväg 25B, 231 78 Smygehamn.",
  );
  await expect(page.locator("#question")).toContainText(
    "Vilken kommun gäller ärendet?",
  );
  expect((await savedCase(page)).facts.municipality).toBeUndefined();
  await describeCase(
    page,
    "Jag vill öppna en butik i Trelleborg. Storgatan 12 eller Hamngatan 18.",
  );
  await expect(page.locator("#question")).toContainText("Bekräfta tolkningen");
  await expect(page.locator('#authority [data-field="address"]')).toContainText(
    "Osäker tolkning",
  );
});
