import {
  test,
  expect,
  ready,
  describeCase,
  savedCase,
  resumeDraft,
} from "./helpers.mjs";
test("parser provenance, explicit answers, event history and privacy remain intact", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/"))
      requests.push({ url: r.url(), body: r.postData() || "" });
  });
  await page.goto("/");
  await ready(page);
  const raw =
    "Jag vill öppna en italiensk resturang i Trelleborg för 40 gäster. Vi kanske serverar vin. Min privata anteckning ska inte skickas med.";
  await describeCase(page, raw);
  const capacity = page.locator('[data-fact="capacity"]');
  await capacity.locator("summary").click();
  await expect(capacity).toContainText("40 gäster");
  await expect(
    page.locator('#authority [data-field="capacity"]'),
  ).toContainText("40");
  await capacity.getByRole("button", { name: "Ändra eller bekräfta" }).click();
  await page.locator("#answer").fill("55");
  await page.locator(".answer-form button").click();
  await ready(page);
  expect((await savedCase(page)).facts.capacity.value).toBe(55);
  await expect(
    page.locator('#authority [data-field="capacity"]'),
  ).toContainText("55");
  await page.reload();
  await ready(page);
  await resumeDraft(page);
  await expect(
    page.locator('#authority [data-field="capacity"]'),
  ).toContainText("55");
  await describeCase(page, raw.replace("40 gäster", "60 gäster"));
  expect((await savedCase(page)).facts.capacity.value).toBe(60);
  await page.getByRole("tab", { name: "Händelser" }).click();
  await expect(page.locator(".audit-status")).toContainText("verifierad");
  expect(
    requests.some(
      (r) => r.body.includes(raw) || r.body.includes("Min privata anteckning"),
    ),
  ).toBe(false);
  expect(
    requests.some((r) => /staff|pilot-session|assessment/.test(r.url)),
  ).toBe(false);
});
test("unsupported scope clears projected data instead of showing a supported case", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await describeCase(
    page,
    "Jag vill öppna en restaurang i Uppsala för 40 gäster.",
  );
  await describeCase(
    page,
    "Jag vill öppna en restaurang och sälja vapen i Trelleborg.",
  );
  expect((await savedCase(page)).inputStatus).toBe("unsupported");
  await expect(page.locator("#question")).toBeVisible();
  await expect(page.locator("#authority table")).toHaveCount(0);
  await describeCase(page, "Jag vill öppna en restaurang i Trelleborg.");
  expect((await savedCase(page)).facts.municipality.value).toBe("Trelleborg");
});
