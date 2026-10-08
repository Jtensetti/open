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
export async function ready(page) {
  await expect(page.locator("body")).toHaveAttribute(
    "data-save-state",
    "saved",
  );
  await expect(page.locator("#error-banner")).toBeHidden();
}
export async function describeCase(page, text) {
  await page.getByLabel("Beskriv ditt mål").fill(text);
  await ready(page);
}
export async function savedCase(page) {
  const { cases } = await (await page.request.get("/api/cases")).json();
  return (await (await page.request.get("/api/cases/" + cases[0].id)).json())
    .case;
}
