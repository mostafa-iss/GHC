import { test, expect } from "@playwright/test";
import { seed } from "../src/accounting.js";
import ExcelJS from "exceljs";
test("GHC starts empty and allows manually adding the first root account", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page.getByRole("button", { name: "قائمة الدخل", exact: true }).click();
  await expect(page.locator(".income-empty")).toContainText(
    "ابدأ بإضافة شجرة حساباتك",
  );
  await expect(page.locator(".income-table tfoot")).toContainText("0.00");
  await page
    .getByRole("button", { name: "شجرة الحسابات", exact: true })
    .click();
  await page.getByRole("button", { name: "أضف حساب", exact: true }).first().click();
  await page.getByLabel("الاسم", { exact: true }).fill("أصول GHC");
  await page.getByLabel("الكود", { exact: true }).fill("1");
  await page.getByRole("button", { name: "حفظ البيانات" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".chart-tree")).toContainText("أصول GHC");
});
test("monthly income matches numeric Excel export, validates periods and works on mobile and print", async ({
  page,
}) => {
  const data = seed();
  data.entries = [
    {
      id: "jan",
      number: 1,
      date: "2026-01-10",
      description: "رسوم يناير",
      lines: [
        { accountId: "cash", debit: 120000, credit: 0 },
        { accountId: "courses", credit: 120000, debit: 0 },
      ],
    },
    {
      id: "feb",
      number: 2,
      date: "2026-02-10",
      description: "إيجار فبراير",
      lines: [
        { accountId: "rent", debit: 30000, credit: 0 },
        { accountId: "cash", credit: 30000, debit: 0 },
      ],
    },
  ];
  await page.addInitScript(
    (d) => localStorage.setItem("ghc-demo-v1", JSON.stringify(d)),
    data,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page.getByRole("button", { name: "قائمة الدخل", exact: true }).click();
  await page.getByLabel("من شهر", { exact: true }).fill("2026-01");
  await page.getByLabel("إلى شهر", { exact: true }).fill("2026-02");
  await expect(page.locator(".income-table thead th")).toHaveCount(4);
  await expect(page.locator(".income-table tfoot")).toContainText("900.00");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
  const d = await downloadPromise;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await d.path());
  const sheet = book.worksheets[0];
  expect(sheet.getRow(sheet.rowCount).getCell(5).value).toBe(900);
  await page.getByRole("button", { name: "عرض مجمّع", exact: true }).click();
  await expect(page.locator(".income-table thead th")).toHaveCount(2);
  await page.getByRole("button", { name: "أعمدة شهرية", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".income-scroll")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/workspace/artifacts/ghc-income-monthly.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /الإيرادات \d/ }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".income-collapsed").first()).toBeVisible();
  await page.pdf({
    path: "/workspace/artifacts/ghc-income.pdf",
    format: "A3",
    landscape: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("من شهر", { exact: true }).fill("2026-03");
  await expect(page.getByRole("alert")).toContainText("شهر البداية");
  await expect(
    page.getByRole("button", { name: "تصدير Excel", exact: true }),
  ).toBeDisabled();
});
