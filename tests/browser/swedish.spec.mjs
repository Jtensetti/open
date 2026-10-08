import {
  test,
  expect,
  ready,
  describeCase,
  savedCase,
  resumeDraft,
} from "./helpers.mjs";
test("colloquial preschool and school applications show structured fields and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(
    page,
    "Jag vill söka dagisplats i Uppsala till hösten 2027. Barnet är tre år. Önskad förskola: Solrosen.",
  );
  let c = await savedCase(page);
  expect(c.scenarioId).toBe("education.preschool.se");
  expect(c.facts.child_age.value).toBe(3);
  expect(c.facts.start_period.value).toBe("hösten 2027");
  await expect(page.locator("#authority")).toContainText("Solrosen");
  await page.reload();
  await ready(page);
  await resumeDraft(page);
  await expect(page.locator("#authority")).toContainText("3 år");
  await describeCase(
    page,
    "Barnet ska börja i nollan i Lund till höstterminen 2027.",
  );
  c = await savedCase(page);
  expect(c.scenarioId).toBe("education.school.se");
  expect(c.facts.school_year.value).toBe("Förskoleklass");
  expect(c.facts.child_age).toBeUndefined();
  await expect(page.locator("#authority")).toContainText("Förskoleklass");
});
test("multiple goals appear separately in JSON without mixing fields, and resolve after editing", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(
    page,
    "Jag vill bygga garage på trettio kvadratmeter i Uppsala och söka dagisplats i Lund.",
  );
  await expect(page.locator("#question")).toContainText("Flera ärenden");
  const data = JSON.parse(await page.locator(".code").innerText());
  expect(data.identified_goals.map((g) => g.scenario)).toEqual([
    "building.garage.se",
    "education.preschool.se",
  ]);
  expect(data.facts).toEqual({});
  expect((await savedCase(page)).facts).toEqual({});
  await describeCase(
    page,
    "Jag vill bygga garaget på trettiofem kvadratmeter i Uppsala.",
  );
  expect((await savedCase(page)).facts.area.value).toBe(35);
  await expect(page.locator("#authority")).toContainText("35");
});
test("a negated request cannot be confirmed as a positive application, history stays uncertain", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(page, "Jag vill inte bygga altanen i Uppsala.");
  await expect(page.locator("[data-confirm-goal]")).toHaveCount(0);
  await expect(page.locator("#authority")).toHaveText("Inga uppgifter ännu.");
  expect((await savedCase(page)).inputStatus).toBe("uncertain");
  await describeCase(page, "Jag har redan byggt altanen i Uppsala.");
  await expect(page.locator("#question")).toContainText("redan är gjort");
  expect((await savedCase(page)).inputStatus).toBe("uncertain");
});
