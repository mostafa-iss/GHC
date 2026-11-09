import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
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
  await page.getByText("شجرة الحسابات والأكواد المقترحة").click();
  await expect(page.locator(".import-details")).toContainText("111001");
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "تنزيل شجرة الحسابات المكودة" })
    .click();
  const downloaded = await dl;
  expect(downloaded.suggestedFilename()).toContain(".xlsx");
  const zip = unzipSync(readFileSync(await downloaded.path()));
  expect(
    Object.keys(zip).some(
      (k) => k.startsWith("xl/media/") && k.endsWith(".png"),
    ),
  ).toBeTruthy();
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
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem("ghaith-demo-v1")).entries,
  );
  await page.getByRole("button", { name: "إضافة أو تعديل الروابط" }).click();
  await page
    .getByLabel("روابط مستندات Drive")
    .fill(
      "https://drive.google.com/file/d/EXAMPLE_E2E/view\nhttps://drive.google.com/file/d/SECOND_FILE/view",
    );
  await page.getByRole("button", { name: "حفظ الروابط", exact: true }).click();
  await expect(page.locator(".drive-card")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghaith-demo-v1")).entries,
    ),
  ).toEqual(before);
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
