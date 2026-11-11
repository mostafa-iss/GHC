import { test, expect } from "@playwright/test";
import { seed } from "../src/accounting.js";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
function fixture() {
  const d = seed();
  d.centers = [
    { id: "one", code: "1", name: "مركز أول" },
    { id: "two", code: "2", name: "مركز ثان" },
  ];
  const e = (
    number,
    date,
    debit,
    credit,
    amount,
    centerId = "one",
    description = "حركة",
  ) => ({
    id: "entry" + number,
    number,
    date,
    description,
    attachments: [],
    lines: [
      { accountId: debit, debit: amount, credit: 0, centerId },
      { accountId: credit, debit: 0, credit: amount, centerId },
    ],
  });
  d.entries = [
    e(1, "2026-01-01", "cash", "courses", 10000),
    e(2, "2026-01-01", "bank", "capital", 20000),
    e(3, "2026-02-01", "bank", "cash", 3000),
    e(4, "2026-02-02", "teachers", "cash", 2500),
    e(5, "2026-02-03", "cash", "courses", 4000, "two", "تحصيل إيرادات المركز"),
  ];
  d.draftEntries = [e(6, "2026-02-04", "cash", "courses", 99999)];
  return d;
}
test("parent ledger isolates each child account, opening and running balances; filters, export and print agree", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (d) => localStorage.setItem("ghaith-demo-v1", JSON.stringify(d)),
    fixture(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "حساب الأستاذ", exact: true })
    .click();
  await page.getByLabel("نوع الحساب", { exact: true }).selectOption("main");
  await page.getByLabel("الحساب", { exact: true }).selectOption("asset");
  await page.getByLabel("من تاريخ", { exact: true }).fill("2026-02-01");
  await page.getByLabel("إلى تاريخ", { exact: true }).fill("2026-02-28");
  await expect(page.locator(".ledger-account-heading")).toHaveCount(2);
  await expect(page.locator(".ledger-account-heading")).toHaveText([
    "الصندوق1101",
    "البنك1102",
  ]);
  const cash = page.locator('.ledger-account-group[data-account-id="cash"]'),
    bank = page.locator('.ledger-account-group[data-account-id="bank"]');
  await expect(cash.locator(".ledger-opening")).toContainText("100.00");
  await expect(bank.locator(".ledger-opening")).toContainText("200.00");
  await expect(cash.locator(".ledger-line")).toHaveCount(3);
  await expect(bank.locator(".ledger-line")).toHaveCount(1);
  await expect(cash.locator(".ledger-line").last()).toContainText(
    "تحصيل إيرادات المركز",
  );
  await expect(bank.locator(".ledger-account-total")).toContainText("230.00");
  await expect(cash.locator(".ledger-account-total")).toContainText("85.00");
  await expect(page.locator(".ledger-account-heading")).not.toContainText([
    "إيرادات الدورات التعليمية",
    "أجور المعلمين",
  ]);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
  const file = await dl,
    book = new ExcelJS.Workbook();
  await book.xlsx.load(readFileSync(await file.path()));
  const sheet = book.getWorksheet(1);
  expect(sheet.getImages().length).toBeGreaterThan(0);
  expect(sheet.getRow(11).getCell(8).value).toBe(100);
  const final = sheet.lastRow.values;
  expect(final.slice(6)).toEqual([70, 55, 315, 0]);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-grouped-ledger.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("مركز التكلفة", { exact: true }).selectOption("one");
  await expect(cash.locator(".ledger-account-total")).toContainText("45.00");
  await page.getByLabel("نوع الحساب", { exact: true }).selectOption("sub");
  await page.getByLabel("الحساب", { exact: true }).selectOption("courses");
  await expect(page.locator(".ledger-account-heading")).toHaveCount(1);
  await expect(page.locator("tfoot td")).toHaveText([
    "الإجمالي (SAR)",
    "0.00",
    "0.00",
    "0.00",
    "100.00",
  ]);
  await page.getByLabel("من تاريخ", { exact: true }).fill("20261-01-01");
  await expect(page.getByRole("alert")).toContainText("تاريخًا صحيحًا");
  await expect(page.locator(".ledger-table")).toHaveCount(0);
  await page.getByLabel("من تاريخ", { exact: true }).fill("2026-01-01");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".report-title img")).toBeVisible();
  await expect(page.locator(".ledger-line .link").first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
