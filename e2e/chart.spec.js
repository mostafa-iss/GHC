import { test, expect } from "@playwright/test";
import { seed } from "../src/accounting.js";
import { curatedChart } from "../src/curatedChart.js";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
function fixture() {
  const d = curatedChart(seed(), [
    "سيستم تعليمي",
    "بنك تجريبي",
    "بنك تجريبي - البطاقة",
    "اشتراك أنظمة",
    "رأس المال",
    "رواتب مستحقة الدفع",
    "إيرادات",
  ]).data;
  const id = (n) =>
    d.accounts.find(
      (a) => a.name === n && !d.accounts.some((c) => c.parentId === a.id),
    ).id;
  d.entries = [
    {
      id: "first",
      number: 1,
      date: "2026-01-01",
      description: "تمويل حساب البنك",
      attachments: [],
      lines: [
        { accountId: id("بنك تجريبي"), debit: 10000, credit: 0 },
        { accountId: id("رأس المال"), debit: 0, credit: 10000 },
      ],
    },
    {
      id: "second",
      number: 2,
      date: "2026-02-01",
      description: "اشتراك فبراير",
      attachments: [],
      lines: [
        { accountId: id("اشتراك أنظمة"), debit: 2500, credit: 0 },
        { accountId: id("بنك تجريبي"), debit: 0, credit: 2500 },
      ],
    },
  ];
  d.draftEntries = [
    {
      id: "draft",
      draftNumber: 1,
      date: "2026-02-02",
      description: "مسودة التمويل",
      attachments: [],
      lines: [
        { accountId: id("بنك تجريبي"), debit: 99999, credit: 0 },
        { accountId: id("رأس المال"), debit: 0, credit: 99999 },
      ],
    },
  ];
  return d;
}
test("chart folders, search, running ledger, linked journals, export, account editing and mobile navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(
    (d) => localStorage.setItem("ghaith-demo-v1", JSON.stringify(d)),
    fixture(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  const nav = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "شجرة الحسابات", exact: true })
      .click();
  await nav();
  await expect(page.locator(".chart-account-row")).toHaveCount(5);
  const asset = page.locator(".chart-account-row").filter({
    has: page.getByRole("button", { name: "فتح حساب الأصول", exact: true }),
  });
  await expect(asset.locator(".chart-balance")).toContainText("75.00");
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-chart-home.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "فتح حساب الأصول", exact: true })
    .click();
  await expect(page.locator(".chart-content-heading h2")).toHaveText("الأصول");
  await expect(page.locator(".chart-account-row")).toHaveCount(2);
  await page.getByLabel("بحث في شجرة الحسابات").fill("بنك تجريبي");
  await expect(page.locator(".chart-account-row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "فتح حساب بنك تجريبي", exact: true })
    .click();
  await expect(page.locator(".chart-ledger tbody tr")).toHaveCount(3);
  await expect(
    page.locator(".chart-content-heading .chart-balance"),
  ).toContainText("75.00");
  await page.getByLabel("حركات الحساب من تاريخ").fill("2026-02-01");
  await expect(page.locator(".chart-ledger tbody tr").first()).toContainText(
    "100.00",
  );
  await expect(page.locator(".chart-ledger tbody tr")).toHaveCount(2);
  await expect(page.locator(".chart-ledger tfoot")).toContainText("75.00");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
  const file = await dl,
    book = new ExcelJS.Workbook();
  await book.xlsx.load(readFileSync(await file.path()));
  expect(book.getWorksheet(1).getImages().length).toBeGreaterThan(0);
  expect(book.getWorksheet(1).getRow(11).getCell(6).value).toBe(100);
  await page.getByLabel("حركات الحساب من تاريخ").fill("2026-03-01");
  await expect(page.locator(".chart-empty")).toContainText("لا توجد حركات");
  await expect(page.locator(".chart-ledger tfoot")).toContainText("75.00");
  await page.getByRole("button", { name: "كل الفترات", exact: true }).click();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-chart-ledger.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "قيد جديد", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "حساب السطر 1" }),
  ).toHaveValue(/بنك تجريبي/);
  await page.getByRole("dialog").getByRole("button", { name: "إغلاق" }).click();
  await page
    .locator(".chart-ledger")
    .getByRole("button", { name: "#2", exact: true })
    .click();
  await expect(page.locator(".journal-paper")).toContainText("اشتراك فبراير");
  await nav();
  await page
    .getByRole("button", { name: "فتح حساب المصروفات", exact: true })
    .click();
  await page
    .getByRole("button", { name: "أضف حساب", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("الحساب الرئيسي", { exact: true }),
  ).toHaveValue("expense");
  await page
    .getByRole("dialog")
    .getByLabel("الاسم", { exact: true })
    .fill("مصروف اختباري");
  await page.getByRole("button", { name: "حفظ البيانات", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "إجراءات مصروف اختباري", exact: true })
    .click();
  await page
    .locator(".chart-menu")
    .getByRole("button", { name: "تعديل الحساب", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("الاسم", { exact: true })
    .fill("مصروف معدل");
  await page.getByRole("button", { name: "حفظ البيانات", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "إجراءات مصروف معدل", exact: true })
    .click();
  await page
    .locator(".chart-menu")
    .getByRole("button", { name: "حذف الحساب", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "فتح حساب مصروف معدل", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "تصفح شجرة الحسابات", exact: true })
    .click();
  await page.getByLabel("بحث في شجرة الحسابات").fill("111001");
  await page.getByRole("treeitem", { name: /بنك تجريبي 111001/ }).click();
  await expect(page.locator(".chart-content-heading h2")).toHaveText(
    "بنك تجريبي",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-chart-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
