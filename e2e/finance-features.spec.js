import { test, expect } from "../tests/support/browser.js";
import { seed } from "../src/accounting.js";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
function fixture() {
  const d = seed();
  d.accounts.push({
    id: "card",
    code: "1103",
    name: "البنك - البطاقة",
    type: "asset",
    parentId: "asset",
  });
  const e = (number, date, description, debit, credit, amount) => ({
    id: "entry-" + number,
    number,
    date,
    description,
    attachments: [],
    lines: [
      { accountId: debit, debit: amount, credit: 0, description: "" },
      { accountId: credit, debit: 0, credit: amount, description: "" },
    ],
  });
  d.entries = [
    e(1, "2025-01-01", "رأس المال", "cash", "capital", 100000),
    e(2, "2025-12-01", "رسوم ديسمبر", "cash", "courses", 5000),
    e(3, "2026-01-01", "رسوم يناير", "cash", "courses", 10000),
    e(4, "2026-01-02", "إيداع البنك", "bank", "cash", 20000),
  ];
  d.financeAccounts = [
    {
      id: "bank-config",
      name: "بنك تجريبي",
      bankName: "بنك تجريبي",
      kind: "bank",
      accountId: "bank",
      statementLinks: [
        {
          label: "كشوف البنك",
          url: "https://drive.google.com/open?id=EXAMPLE_BANK",
        },
      ],
    },
    {
      id: "card-config",
      name: "البطاقة البنكية",
      kind: "card",
      accountId: "card",
      statementLinks: [
        {
          label: "كشوف البطاقة",
          url: "https://drive.google.com/open?id=EXAMPLE_CARD",
        },
      ],
    },
  ];
  return d;
}
test("monthly comparison survives clearing and temporarily invalid years in either month field", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (data) => localStorage.setItem("ghc-demo-v1", JSON.stringify(data)),
    fixture(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "المقارنة الشهرية", exact: true })
    .click();
  const first = page.getByLabel("الشهر الأساسي"),
    second = page.getByLabel("شهر المقارنة"),
    revenue = page.locator("tr.group-row").filter({ hasText: "الإيرادات" });
  await first.fill("2026-01");
  await second.fill("2025-12");
  for (const [field, validValue] of [
    [first, "2026-01"],
    [second, "2025-12"],
  ]) {
    // Native month inputs can emit years longer than four digits while editing.
    await field.fill("20261-01");
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText(
      "اختر شهرًا وسنة صحيحين",
    );
    await expect(
      page.getByRole("button", { name: "تصدير Excel", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "طباعة / PDF", exact: true }),
    ).toBeDisabled();
    await expect(page.locator(".financial-report-view table")).toHaveCount(0);
    await field.fill("");
    await expect(field).toHaveValue("");
    await field.fill(validValue);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(revenue.locator("td").nth(1)).toHaveText("100.00");
    await expect(revenue.locator("td").nth(2)).toHaveText("50.00");
    await expect(revenue.locator("td").nth(4)).toHaveText("100.0%");
    await expect(
      page.getByRole("button", { name: "تصدير Excel", exact: true }),
    ).toBeEnabled();
  }
  await first.fill("2025-12");
  await second.fill("2026-01");
  await expect(revenue.locator("td").nth(1)).toHaveText("50.00");
  await expect(revenue.locator("td").nth(2)).toHaveText("100.00");
  await expect(revenue.locator("td").nth(4)).toHaveText("-50.0%");
  expect(errors).toEqual([]);
});
test("searchable accounts, journal copy/templates, financial reports, bank statements and reviewed backup restore", async ({
  page,
}) => {
  test.setTimeout(90000);
  const d = fixture(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (data) => localStorage.setItem("ghc-demo-v1", JSON.stringify(data)),
    d,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  const nav = (title) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: title, exact: true })
      .click();
  await nav("النسخ الاحتياطية");
  let dl = page.waitForEvent("download");
  await page
    .locator(".backup-download")
    .getByRole("button", { name: "تنزيل نسخة احتياطية" })
    .click();
  const archive = await dl;
  const archiveBytes = readFileSync(await archive.path());
  await nav("القيود اليومية");
  const row = page.locator(".journal-row").filter({ hasText: "رسوم يناير" });
  await row.locator(".journal-more > button").click();
  await page.getByRole("button", { name: "نسخ القيد", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "حساب السطر 1" }),
  ).toHaveValue("1101 — الصندوق");
  const account = page.getByRole("combobox", { name: "حساب السطر 1" });
  await account.fill("بنك");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
  await account.press("Escape");
  await expect(account).toHaveValue("1101 — الصندوق");
  await account.fill("1101");
  await account.press("Enter");
  await page.getByLabel("بيان القيد", { exact: true }).fill("نسخة رسوم يناير");
  await page.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".journal-row")
    .filter({ hasText: "نسخة رسوم يناير" })
    .locator(".journal-title")
    .click();
  await page.getByRole("button", { name: "حفظ كقالب", exact: true }).click();
  await page.getByLabel("اسم القالب", { exact: true }).fill("قالب الرسوم");
  await page.getByRole("button", { name: "حفظ القالب", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav("قوالب القيود");
  await expect(page.locator(".template-card")).toContainText("قالب الرسوم");
  await page.getByRole("button", { name: "استخدام القالب" }).click();
  await page.getByLabel("بيان القيد", { exact: true }).fill("مسودة من القالب");
  await page.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ghc-demo-v1")),
  );
  expect(stored.entries).toHaveLength(4);
  expect(stored.draftEntries).toHaveLength(2);
  expect(stored.journalTemplates).toHaveLength(1);
  expect(new Set(stored.draftEntries.map((e) => e.id)).size).toBe(2);
  expect(stored.draftEntries[0].number).toBeUndefined();
  await nav("المقارنة الشهرية");
  await page.getByLabel("الشهر الأساسي").fill("2026-01");
  await page.getByLabel("شهر المقارنة").fill("2025-12");
  const revenue = page.locator("tr.group-row").filter({ hasText: "الإيرادات" });
  await expect(revenue).toContainText("100.00");
  await expect(revenue).toContainText("50.00");
  await expect(revenue).toContainText("100.0%");
  dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
  const exportFile = await dl;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(readFileSync(await exportFile.path()));
  expect(book.getWorksheet(1).getRow(11).getCell(3).value).toBe(100);
  expect(book.getWorksheet(1).getImages().length).toBeGreaterThan(0);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-monthly-comparison.png",
    fullPage: true,
    animations: "disabled",
  });
  await nav("قائمة المركز المالي");
  await page.getByLabel("تاريخ المركز المالي").fill("2026-01-31");
  await expect(page.locator(".balance-check")).toContainText(
    "الأصول = الالتزامات + حقوق الملكية",
  );
  await expect(page.locator(".net-income")).toContainText("1,150.00");
  await nav("خزائن وحسابات بنكية");
  await page.getByRole("button", { name: "بنك تجريبي", exact: true }).click();
  await expect(page.locator(".finance-balance")).toHaveText("200.00");
  await expect(page.locator(".statement-card")).toHaveAttribute(
    "href",
    "https://drive.google.com/open?id=EXAMPLE_BANK",
  );
  await page
    .getByRole("button", { name: "معاملات النظام", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("إيداع البنك");
  await page
    .getByRole("button", { name: "كشف حساب البنك", exact: true })
    .click();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-bank-statements.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "خزائن وحسابات بنكية", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "البطاقة البنكية", exact: true })
    .click();
  await expect(page.locator(".statement-card")).toHaveAttribute(
    "href",
    "https://drive.google.com/open?id=EXAMPLE_CARD",
  );
  await nav("النسخ الاحتياطية");
  await page
    .getByLabel("ملف النسخة الاحتياطية", { exact: true })
    .setInputFiles({
      name: "backup.zip",
      mimeType: "application/zip",
      buffer: archiveBytes,
    });
  const restore = page.getByRole("button", {
    name: "استرجاع النسخة المختارة",
    exact: true,
  });
  await expect(restore).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByLabel("تأكيد الاسترجاع").fill("استرجاع");
  await expect(restore).toBeEnabled();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-restore-preview.png",
    fullPage: true,
    animations: "disabled",
  });
  dl = page.waitForEvent("download");
  await restore.click();
  await dl;
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "تم استرجاع النسخة الاحتياطية بنجاح" }),
  ).toBeVisible();
  stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ghc-demo-v1")),
  );
  expect(stored.entries).toHaveLength(4);
  expect(stored.draftEntries || []).toHaveLength(0);
  expect(stored.entries[0].id).not.toBe(d.entries[0].id);
  expect(stored.financeAccounts[0].accountId).toBe(
    stored.accounts.find((a) => a.code === "1102").id,
  );
  await nav("خزائن وحسابات بنكية");
  await page.getByRole("button", { name: "بنك تجريبي", exact: true }).click();
  await expect(page.locator(".finance-balance")).toHaveText("200.00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
