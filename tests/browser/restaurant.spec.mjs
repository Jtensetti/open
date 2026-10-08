import { test, expect } from "@playwright/test";
test("restaurant, scoped authority, completion, persistence and changed facts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.postData() || "");
  });
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  const raw =
    "Jag vill öppna en italiensk resturang i Trelleborg för 40 gäster. Vi kanske serverar vin. Min privata anteckning ska inte skickas med.";
  await page.getByLabel("Beskriv ditt mål").fill(raw);
  await page.getByRole("button", { name: "Fyll med testuppgifter" }).click();
  await page
    .getByLabel("Uppgifterna stämmer och jag använder testuppgifter.")
    .check();
  await page.getByRole("button", { name: "Starta pilotärende" }).click();
  await expect(page.locator("#question")).toContainText("Ärendet är igång");
  await page.locator('[data-authority="trelleborg.food"]').click();
  await expect(page.locator(".work-card")).toContainText(
    "Registrering av livsmedelsverksamhet",
  );
  await expect(page.locator(".work-card table")).not.toContainText(
    "Alkoholservering",
  );
  await page
    .getByLabel("Motivering eller kompletteringsfråga")
    .fill("Hur ska den tillagade maten kylas ned?");
  await page.getByRole("button", { name: "Begär komplettering" }).click();
  await expect(page.locator("#question")).toContainText(
    "Hur ska den tillagade maten kylas ned?",
  );
  await page
    .getByLabel("Ditt svar")
    .fill("I ett separat snabbkylningsskåp i köket.");
  await page.getByRole("button", { name: "Lämna komplettering" }).click();
  await expect(page.locator(".work-card")).toContainText("snabbkylningsskåp");
  await page
    .getByLabel("Motivering eller kompletteringsfråga")
    .fill("Beskrivningen räcker för nästa steg i piloten.");
  await page
    .getByRole("button", { name: "Underlag klart", exact: true })
    .click();
  await expect(page.locator(".decision")).toContainText("Underlag granskat");
  await page.reload();
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await page.locator('[data-authority="trelleborg.food"]').click();
  await expect(page.locator(".decision")).toContainText("Beskrivningen räcker");
  await page.getByRole("tab", { name: "Händelser" }).click();
  await expect(page.locator(".audit-status")).toContainText("verifierad");
  expect(requests.some((r) => r.includes(raw))).toBe(false);
  expect(requests.some((r) => r.includes("Min privata anteckning"))).toBe(
    false,
  );
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("unsupported scope stops submission", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#save-status")).toHaveText("Sparat");
  await page
    .getByLabel("Beskriv ditt mål")
    .fill("Jag vill öppna en restaurang och sälja vapen i Trelleborg.");
  await expect(page.locator("#question")).toContainText(
    "Automatiseringen stoppas",
  );
  await expect(
    page.getByRole("button", { name: "Starta pilotärende" }),
  ).toHaveCount(0);
});
