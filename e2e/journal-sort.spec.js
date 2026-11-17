import { test, expect } from "../tests/support/browser.js";
import { seed } from "../src/accounting.js";
import ExcelJS from "exceljs";
test("journal ordering works independently of filters, resets pagination and matches Excel on desktop and mobile", async ({
  page,
}) => {
  const data = seed();
  data.entries = Array.from({ length: 26 }, (_, i) => ({
    id: `order-${i + 1}`,
    number: i + 1,
    date: `2026-01-${String(i === 25 ? 26 : ((i + 1) % 25) + 1).padStart(2, "0")}`,
    createdAt:
      i === 25
        ? undefined
        : `2026-02-${String(25 - i).padStart(2, "0")}T12:00:00Z`,
    description: i === 25 ? "قيد قديم" : "قيد ترتيب " + (i + 1),
    lines: [
      { accountId: "cash", debit: 100, credit: 0 },
      { accountId: "courses", debit: 0, credit: 100 },
    ],
  }));
  await page.addInitScript(
    (d) => localStorage.setItem("ghc-demo-v1", JSON.stringify(d)),
    data,
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  const titles = page.locator(".journal-title strong");
  await expect(titles.first()).toHaveText("قيد قديم");
  await page
    .getByLabel("ترتيب القيود حسب", { exact: true })
    .selectOption("number");
  await page
    .getByLabel("اتجاه ترتيب القيود", { exact: true })
    .selectOption("asc");
  await expect(titles.first()).toHaveText("قيد ترتيب 1");
  await page
    .getByRole("button", { name: "الصفحة التالية", exact: true })
    .click();
  await expect(titles.first()).toHaveText("قيد ترتيب 21");
  await page
    .getByLabel("ترتيب القيود حسب", { exact: true })
    .selectOption("createdAt");
  await expect(titles.first()).toHaveText("قيد ترتيب 25");
  await expect(
    page.getByRole("button", { name: "الصفحة السابقة", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "الصفحة التالية", exact: true })
    .click();
  await expect(
    page.locator(".journal-row").last().locator(".journal-created-at"),
  ).toContainText("غير مسجل");
  await page
    .getByLabel("اتجاه ترتيب القيود", { exact: true })
    .selectOption("desc");
  await expect(titles.first()).toHaveText("قيد ترتيب 1");
  await page
    .getByRole("button", { name: "الصفحة التالية", exact: true })
    .click();
  await expect(
    page.locator(".journal-row").last().locator(".journal-created-at"),
  ).toContainText("غير مسجل");
  await page
    .getByLabel("ترتيب القيود حسب", { exact: true })
    .selectOption("date");
  await expect(titles.first()).toHaveText("قيد قديم");
  await page
    .getByLabel("اتجاه ترتيب القيود", { exact: true })
    .selectOption("asc");
  await expect(titles.first()).toHaveText("قيد ترتيب 25");
  await page
    .getByLabel("ترتيب القيود حسب", { exact: true })
    .selectOption("number");
  await page
    .getByLabel("اتجاه ترتيب القيود", { exact: true })
    .selectOption("desc");
  await page
    .getByLabel("بحث بعنوان القيد", { exact: true })
    .fill("قيد ترتيب 2");
  await expect(titles).toHaveCount(7);
  await expect(titles.first()).toHaveText("قيد ترتيب 25");
  await page.screenshot({
    path: "/workspace/artifacts/ghc-journal-sorting.png",
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "تصدير نتائج البحث", exact: true })
    .click();
  const file = await download;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await file.path());
  const numbers = [];
  book.getWorksheet("اليومية").eachRow((row, i) => {
    if (i > 10 && typeof row.getCell(7).value === "number")
      numbers.push(row.getCell(7).value);
  });
  expect(numbers.filter((_, i) => i % 2 === 0)).toEqual([
    25, 24, 23, 22, 21, 20, 2,
  ]);
  const allDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "تحميل كل القيود — Excel", exact: true })
    .click();
  const all = await allDownload;
  await book.xlsx.readFile(await all.path());
  expect(book.getWorksheet("اليومية").getCell("G11").value).toBe(26);
  await page.getByRole("button", { name: "إلغاء الفلتر", exact: true }).click();
  await expect(titles.first()).toHaveText("قيد قديم");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel("ترتيب القيود حسب", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("اتجاه ترتيب القيود", { exact: true })
    .selectOption("asc");
  await expect(titles.first()).toHaveText("قيد ترتيب 1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ghc-demo-v1")),
  );
  expect(persisted.entries.map((e) => e.id)).toEqual(
    data.entries.map((e) => e.id),
  );
  expect(persisted.entries[25].createdAt).toBeUndefined();
  expect(errors).toEqual([]);
});
