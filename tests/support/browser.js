import { test as base, expect } from "@playwright/test";
import { seed } from "../../src/accounting.js";
// Explicit accounting fixtures for legacy workflow tests. Production starts empty.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((data) => {
      if (!localStorage.getItem("ghc-demo-v1"))
        localStorage.setItem("ghc-demo-v1", JSON.stringify(data));
    }, seed());
    await use(page);
  },
});
export { expect };
