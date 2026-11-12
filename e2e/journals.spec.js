import { test, expect } from "../tests/support/browser.js";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
test("Daftra journal workspace: draft, post, Arabic title/account search, full detail, Excel and permanent delete", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "أضف قيد", exact: true }).click();
  await page
    .getByLabel("بيان القيد", { exact: true })
    .fill("إيرادات دورة التجويد");
  const rows = page.locator(".entry-lines tbody tr");
  await page.getByRole("combobox", { name: "حساب السطر 1" }).click();
  await expect(
    page.getByRole("listbox").getByRole("option", { name: /الالتزامات/ }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "حساب السطر 1" }).fill("1101");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /الصندوق/ })
    .click();
  await page.getByRole("combobox", { name: "حساب السطر 2" }).fill("4101");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /إيرادات الدورات/ })
    .click();
  await rows.nth(0).getByLabel("مدين", { exact: true }).fill("500");
  await rows.nth(1).getByLabel("دائن", { exact: true }).fill("500");
  await page.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".journal-row")).toHaveCount(1);
  await expect(page.locator(".journal-row")).toContainText("مسودة");
  await page.getByRole("button", { name: "قائمة الدخل", exact: true }).click();
  await expect(page.locator(".income-table tfoot")).toContainText("0.00");
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByLabel("بحث بعنوان القيد").fill("ايراد");
  await expect(page.locator(".journal-row")).toHaveCount(1);
  await page.getByLabel("بحث بعنوان القيد").fill("xyz");
  await expect(page.locator(".journal-row")).toHaveCount(0);
  await page.getByLabel("بحث بعنوان القيد").fill("تجو");
  await page.getByLabel("تصفية القيود بالحساب").selectOption("bank");
  await expect(page.locator(".journal-row")).toHaveCount(0);
  await page.getByLabel("تصفية القيود بالحساب").selectOption("courses");
  await expect(page.locator(".journal-row")).toHaveCount(1);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-journal-list-new.png",
    fullPage: true,
  });
  await page.locator(".journal-title").click();
  await expect(page.locator(".journal-paper-table")).toContainText("500.00");
  await expect(
    page.getByRole("heading", { name: "مرفقات القيد", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ترحيل القيد", exact: true }).click();
  await expect(page.locator(".journal-detail-heading")).toContainText("مرحّل");
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-journal-detail-new.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "قائمة الدخل", exact: true }).click();
  await expect(page.locator(".income-table tfoot")).toContainText("500.00");
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "تحميل كل القيود — Excel" }).click();
  const file = await dl;
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(readFileSync(await file.path()));
  const s = w.getWorksheet("اليومية");
  expect(s.getRow(10).getCell(2).value).toBe("مدين");
  expect(s.getRow(11).getCell(5).value).toBe("الصندوق");
  expect(w.getWorksheet("دليل الحسابات")).toBeTruthy();
  await page.locator(".journal-title").click();
  await page
    .getByRole("button", { name: "تحويل إلى مسودة", exact: true })
    .click();
  await expect(page.locator(".journal-detail-heading")).toContainText("مسودة");
  await page.getByRole("button", { name: "قائمة الدخل", exact: true }).click();
  await expect(page.locator(".income-table tfoot")).toContainText("0.00");
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.locator(".journal-title").click();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.locator(".journal-row")).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ghc-demo-v1")),
  );
  expect(stored.entries).toHaveLength(0);
  expect(stored.draftEntries).toHaveLength(0);
  expect(errors).toEqual([]);
});
