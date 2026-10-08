import { test, expect } from "@playwright/test";
const representatives = [
  ["restaurant.trelleborg", "Öppna restaurang i Trelleborg"],
  ["business.shop.trelleborg", "Öppna butik"],
  ["building.changeuse.trelleborg", "Ändra användning av lokal"],
  ["events.event.trelleborg", "Arrangera evenemang"],
  ["publicspace.container.trelleborg", "Placera container"],
  ["environment.heatpump.trelleborg", "Installera värmepump"],
  ["waterwaste.waterconnection.trelleborg", "Ansluta fastighet till VA"],
  ["traffic.trafficplan.trelleborg", "Förbereda trafikanordningsplan"],
  ["education.adultvocational.trelleborg", "Planera yrkesutbildning för vuxna"],
  [
    "associations.associationgrant.trelleborg",
    "Förbereda fråga om föreningsbidrag",
  ],
];
for (const [id, title] of representatives) {
  test(`catalogue, real questions, decision and persistence: ${id}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("#save-status")).toHaveText("Sparat");
    await page.getByRole("button", { name: "Välj ärendetyp · 100" }).click();
    await expect(page.locator(".scenario-card")).toHaveCount(100);
    await page.getByLabel("Sök ärendetyp").fill(title);
    await page
      .locator(`#catalog-dialog [data-select-scenario="${id}"]`)
      .click();
    await expect(page.locator("#catalog-dialog")).not.toBeVisible();
    await expect(page.locator("#scenario-title")).toHaveText(title);
    await page.getByRole("button", { name: "Fyll med testuppgifter" }).click();
    await page
      .getByLabel("Uppgifterna stämmer och jag använder testuppgifter.")
      .check();
    await page.getByRole("button", { name: "Starta pilotärende" }).click();
    await expect(page.locator("#question")).toContainText("Ärendet är igång");
    await expect(page.locator(".work-card")).toBeVisible();
    await page
      .getByLabel("Motivering eller kompletteringsfråga")
      .fill("Beskriv tillträde till platsen eller aktiviteten mer exakt.");
    await page.getByRole("button", { name: "Begär komplettering" }).click();
    await expect(page.locator("#question")).toContainText("Beskriv tillträde");
    await page
      .getByLabel("Ditt svar")
      .fill("Tillträdet ordnas med tydlig skyltning och en ansvarig värd.");
    await page.getByRole("button", { name: "Lämna komplettering" }).click();
    await expect(page.locator(".work-card")).toContainText("ansvarig värd");
    await page
      .getByLabel("Motivering eller kompletteringsfråga")
      .fill("Underlaget är granskat i detta pilotfall.");
    await page
      .getByRole("button", { name: "Underlag klart", exact: true })
      .click();
    await expect(page.locator(".decision")).toContainText(
      "Underlaget är granskat",
    );
    await page.reload();
    await expect(page.locator("#save-status")).toHaveText("Sparat");
    await expect(page.locator("#scenario-title")).toHaveText(title);
    await expect(page.locator(".decision")).toContainText(
      "Underlaget är granskat",
    );
    await expect(page.locator("#tracking")).toContainText(title);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}
test("free text selects a different scenario and recognizes standalone addresses live", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await page
    .getByLabel("Beskriv ditt mål")
    .fill("Jag vill öppna en butik i Trelleborg. Storgatan 12.");
  await page.getByRole("button", { name: "Välj denna ärendetyp" }).click();
  await expect(page.locator("#scenario-title")).toHaveText("Öppna butik");
  await expect(page.locator("#facts")).toContainText("Storgatan 12");
  await page
    .getByLabel("Beskriv ditt mål")
    .fill(
      "Jag vill öppna en butik i Trelleborg. Smyge Strandväg 25 B, 231 78 Smygehamn.",
    );
  await expect(page.locator("#facts")).toContainText(
    "Smyge Strandväg 25B, 231 78 Smygehamn",
  );
  await expect(page.locator("#system-content")).toContainText(
    "Smyge Strandväg 25B",
  );
  await page
    .getByLabel("Beskriv ditt mål")
    .fill(
      "Jag vill öppna en butik i Trelleborg. Storgatan 12 eller Hamngatan 18.",
    );
  await expect(page.locator("#question")).toContainText("Bekräfta tolkningen");
  await expect(
    page.getByRole("button", { name: "Starta pilotärende" }),
  ).toHaveCount(0);
});
