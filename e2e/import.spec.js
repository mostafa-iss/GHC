import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
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
    "بنك تجريبي",
    "رسوم دورة تجريبية",
    null,
    "REF-1",
    "2026-01-01",
    "ملاحظة",
  ]);
  s.addRow([
    "",
    null,
    1250.5,
    "ريال سعودي",
    "إيرادات",
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
    "بنك تجريبي",
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
    "إيرادات",
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
test("Excel preview requires explicit partial consent, exports chart, preserves source data and prevents replay", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "استيراد Excel" }).click();
  const file = await fixture();
  await page.getByLabel("ملف Excel").setInputFiles(file);
  await expect(
    page.getByRole("button", { name: "تأكيد استيراد 1 قيد" }),
  ).toBeDisabled();
  await expect(page.locator(".import-preview")).toContainText("غير متوازن");
  await page.getByText("شجرة الحسابات والأكواد المقترحة").click();
  await expect(page.locator(".import-details")).toContainText("111001");
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "تنزيل شجرة الحسابات المكودة" })
    .click();
  expect((await dl).suggestedFilename()).toContain(".xlsx");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "تأكيد استيراد 1 قيد" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "رسوم دورة تجريبية", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "#0001" }).click();
  await page.getByText("تفاصيل الاستيراد من Excel").click();
  await expect(page.getByRole("dialog")).toContainText("REF-1");
  await page.getByRole("dialog").getByRole("button").first().click();
  await page.getByRole("button", { name: "استيراد Excel" }).click();
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
