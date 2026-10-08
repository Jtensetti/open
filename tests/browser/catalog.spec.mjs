import { test, expect, ready, describeCase, savedCase } from "./helpers.mjs";
import { registry } from "../../src/domain/catalog.mjs";
const representatives = [
  ["restaurant.se", "Öppna restaurang"],
  ["business.shop.se", "Öppna butik"],
  ["building.changeuse.se", "Ändra användning av lokal"],
  ["events.event.se", "Arrangera evenemang"],
  ["publicspace.container.se", "Placera container"],
  ["environment.heatpump.se", "Installera värmepump"],
  ["waterwaste.waterconnection.se", "Ansluta fastighet till VA"],
  ["traffic.trafficplan.se", "Förbereda trafikanordningsplan"],
  ["education.adultvocational.se", "Planera yrkesutbildning för vuxna"],
  ["associations.associationgrant.se", "Förbereda fråga om föreningsbidrag"],
];

for (const [id, title] of representatives) {
  test(`free text to persisted data and read-only staff view: ${id}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await ready(page);
    const text = registry[id].example;
    await describeCase(page, text);
    const saved = await savedCase(page);
    expect(saved.scenarioId).toBe(id);
    expect(Object.keys(saved.facts).length).toBeGreaterThan(0);
    expect(saved.submitted).toBe(false);
    await expect(page.locator("#authority")).toContainText(title);
    expect(JSON.parse(await page.locator(".code").innerText()).scenario).toBe(
      id,
    );
    await expect(
      page.locator(
        "#authority button, [data-outcome], [data-submit-case], [data-authority]",
      ),
    ).toHaveCount(0);
    await page.reload();
    await ready(page);
    await expect(page.locator("#authority")).toContainText(title);
    await expect(page.locator("#intent")).toHaveValue(text);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
