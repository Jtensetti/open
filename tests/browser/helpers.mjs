import { test as base, expect } from "@playwright/test";
export { expect };
// Each browser context represents an independent client, including rate limits.
export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({
      "CF-Connecting-IP": `test-${testInfo.testId}-${Date.now()}`,
    });
    await use(context);
  },
});
export async function describeCase(page, text) {
  if (
    !(await page.locator("#description-panel").getAttribute("open")) &&
    (await page.locator("#description-summary").isVisible())
  ) {
    if (
      (await page.locator("#description-panel").getAttribute("open")) === null
    )
      await page.locator("#description-summary").click();
  }
  await page.getByLabel("Beskriv ditt mål").fill(text);
  await page.locator("#continue-intake").click();
  await expect(page.locator("#continue-intake")).toBeEnabled();
  await expect(page.locator("#save-status")).toHaveText("Sparat");
}
