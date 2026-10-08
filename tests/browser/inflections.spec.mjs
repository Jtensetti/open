import { test, expect, ready, describeCase, savedCase } from "./helpers.mjs";

test("all four reported deck formulations keep the case and manually entered facts", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Bygga ut altan");
  const id = (await savedCase(page)).id;
  await page.locator("#answer").selectOption("Uppsala");
  await page.locator(".answer-form button").click();
  await ready(page);
  await page.locator("#answer").fill("Storgatan 12");
  await page.locator(".answer-form button").click();
  await ready(page);
  for (const text of [
    "Bygga ut altanen",
    "Hej, jag skulle vilja bygga ut altan",
    "Hej, jag skulle vilja bygga ut altanen",
  ]) {
    await describeCase(page, text);
    const saved = await savedCase(page);
    expect(saved.id).toBe(id);
    expect(saved.scenarioId).toBe("building.deck.se");
    expect(saved.inputStatus).toBe("supported");
    expect(saved.facts.municipality.value).toBe("Uppsala");
    expect(saved.facts.address.value).toBe("Storgatan 12");
    await expect(page.locator("#authority")).toContainText("Bygga altan");
    await expect(page.locator("#authority")).toContainText("Uppsala");
    await expect(page.locator("[data-confirm-goal]")).toHaveCount(0);
  }
  await page.reload();
  await ready(page);
  await expect(page.locator("#authority")).toContainText("Uppsala");
  expect((await savedCase(page)).inputStatus).toBe("supported");
});

test("changing sentence length does not undo a manual correction; changed numbers still update", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Bygga ut altan i Uppsala. Ytan blir 30 kvm.");
  const area = page.locator('[data-fact="area"]');
  await area.locator("summary").click();
  await area.getByRole("button", { name: "Ändra eller bekräfta" }).click();
  await page.locator("#answer").fill("35");
  await page.locator(".answer-form button").click();
  await ready(page);
  await describeCase(
    page,
    "Hej, jag skulle vilja bygga ut altanen i Uppsala. Ytan blir 30 kvm.",
  );
  expect((await savedCase(page)).facts.area.value).toBe(35);
  expect((await savedCase(page)).facts.area.method).toBe("explicit");
  await page.reload();
  await ready(page);
  expect((await savedCase(page)).facts.area.value).toBe(35);
  await describeCase(
    page,
    "Hej, jag skulle vilja bygga ut altanen i Uppsala. Ytan blir 40 kvm.",
  );
  expect((await savedCase(page)).facts.area.value).toBe(40);
});

test("temporary unmatched text keeps answers, while clearing or changing case type resets them", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Bygga ut altanen");
  await page.locator("#answer").selectOption("Uppsala");
  await page.locator(".answer-form button").click();
  await ready(page);
  await describeCase(page, "Bygga ut");
  expect((await savedCase(page)).inputStatus).toBe("uncertain");
  await expect(page.locator("#authority table")).toHaveCount(0);
  await describeCase(page, "Bygga ut altanen");
  expect((await savedCase(page)).facts.municipality.value).toBe("Uppsala");
  await describeCase(page, "Jag vill öppna en butik");
  expect((await savedCase(page)).facts.municipality).toBeUndefined();
  await describeCase(page, "");
  expect((await savedCase(page)).facts).toEqual({});
});
