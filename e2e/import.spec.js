import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { seed } from "../src/accounting.js";
async function fixture() {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("اليومية");
  s.addRow(["", "اليومية"]);
  s.addRow([
    "",
    "مدين",
    "دائن",
    "نوع العملة",
    "اسم الحساب",
    "بيـــــــــان",
    "رقم القيد",
    "مرجع/فاتورة",
    "تاريخ",
    "ملاحظات",
  ]);
  s.addRow([
    "",
    1250.5,
    null,
    "ريال سعودي",
    "الصندوق",
    "رسوم دورة تجريبية",
    null,
    {
      text: "REF-1",
      hyperlink: "https://drive.google.com/file/d/EXAMPLE_E2E/view",
    },
    "2026-01-01",
    "ملاحظة",
  ]);
  s.addRow([
    "",
    null,
    1250.5,
    "ريال سعودي",
    "إيرادات الدورات التعليمية",
    "رسوم دورة تجريبية",
    null,
    "REF-1",
    "2026-01-01",
    "ملاحظة",
  ]);
  s.addRow([]);
  s.addRow([
    "",
    10,
    null,
    "ريال سعودي",
    "الصندوق",
    "قيد غير متوازن",
    null,
    "",
    "2026-01-02",
  ]);
  s.addRow([
    "",
    null,
    9,
    "ريال سعودي",
    "إيرادات الدورات التعليمية",
    "قيد غير متوازن",
    null,
    "",
    "2026-01-02",
  ]);
  return {
    name: "import-test.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await w.xlsx.writeBuffer()),
  };
}
test("Journal-only Excel import preserves the existing chart, requires partial consent and prevents replay", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "استيراد", exact: true }).click();
  const file = await fixture();
  await page.getByLabel("ملف Excel").setInputFiles(file);
  await page.getByLabel("حالة القيود بعد الاستيراد").selectOption("posted");
  await expect(
    page.getByRole("button", { name: "تأكيد استيراد 1 قيد" }),
  ).toBeDisabled();
  await expect(page.locator(".import-preview")).toContainText("غير متوازن");
  await expect(
    page.getByRole("dialog").locator("input[type=file]"),
  ).toHaveCount(1);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "تنزيل شجرة الحسابات المكودة" }),
  ).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "تأكيد استيراد 1 قيد" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .locator(".journal-row")
      .getByText("رسوم دورة تجريبية", { exact: true }),
  ).toBeVisible();
  await page.locator(".journal-title").click();
  await expect(page.locator(".drive-card")).toHaveCount(1);
  await expect(page.locator(".drive-card")).toHaveAttribute(
    "href",
    "https://drive.google.com/file/d/EXAMPLE_E2E/view",
  );
  await expect(page.locator(".journal-detail > .documents-field")).toHaveCount(
    0,
  );
  await expect(page.getByRole("img", { name: "Google Drive" })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghaith-demo-v1")).accounts,
    ),
  ).toEqual(seed().accounts);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "استيراد", exact: true }).click();
  await page.getByLabel("ملف Excel").setInputFiles(file);
  await expect(
    page.getByRole("button", { name: "مستوردة مسبقًا (1)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تأكيد استيراد 0 قيد" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-import-preview.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
