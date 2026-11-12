import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const accounts = JSON.parse(
  readFileSync(new URL("../supabase/ghc-chart-accounts.json", import.meta.url)),
);
test("GHC empty fixed assets remain a folder and expense leaves support posting", async ({
  page,
}) => {
  await page.addInitScript(
    (accounts) =>
      localStorage.setItem(
        "ghc-demo-v1",
        JSON.stringify({
          accounts,
          centers: [],
          entries: [],
          draftEntries: [],
          journalWorkflowVersion: 2,
        }),
      ),
    accounts,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("button", { name: "شجرة الحسابات", exact: true })
    .click();
  await page
    .locator(".chart-tree")
    .getByRole("treeitem", { name: /الأصول الثابتة/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "الأصول الثابتة", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "أضف حساب", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "قيد جديد", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "أضف قيد", exact: true }).click();
  const account = page.getByRole("combobox", { name: "حساب السطر 1" });
  await account.fill("الأصول الثابتة");
  await expect(
    page.getByRole("option", { name: /الأصول الثابتة/ }),
  ).toHaveCount(0);
  await account.fill("رواتب");
  await expect(page.getByRole("listbox").getByRole("option", { name: /رواتب/ })).toBeVisible();
});
