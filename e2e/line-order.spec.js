import { test, expect } from "../tests/support/browser.js";
import ExcelJS from "exceljs";
test("reordering journal rows preserves complete line data, totals, draft persistence, posting and Excel order", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("ghc-demo-v1"));
    d.centers = [
      { id: "order-center", code: "C1", name: "مركز اختبار الترتيب" },
    ];
    localStorage.setItem("ghc-demo-v1", JSON.stringify(d));
  });
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "أضف قيد", exact: true }).click();
  await page
    .getByLabel("بيان القيد", { exact: true })
    .fill("اختبار ترتيب أطراف القيد");
  await page.getByRole("button", { name: "إضافة سطر", exact: true }).click();
  const rows = page.locator(".entry-lines tbody tr");
  for (const [i, code, amount, side, description] of [
    [0, "1101", "60", "مدين", "سطر الصندوق"],
    [1, "4101", "100", "دائن", "سطر الإيراد"],
    [2, "5102", "40", "مدين", "سطر الإيجار"],
  ]) {
    const account = page.getByRole("combobox", {
      name: `حساب السطر ${i + 1}`,
      exact: true,
    });
    await account.scrollIntoViewIfNeeded();
    await account.fill(code);
    await expect(
      page.getByRole("listbox").getByRole("option").first(),
    ).toBeVisible();
    await account.press("Enter");
    await rows.nth(i).getByPlaceholder("وصف السطر").fill(description);
    await rows.nth(i).getByLabel(side, { exact: true }).fill(amount);
  }
  await rows.nth(2).locator("select").selectOption("order-center");
  await expect(
    page.getByRole("button", { name: "نقل السطر 1 لأعلى", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "نقل السطر 3 لأسفل", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "نقل السطر 3 لأعلى", exact: true })
    .click();
  await page
    .getByRole("button", { name: "نقل السطر 1 لأسفل", exact: true })
    .click();
  await expect(rows.nth(0).getByPlaceholder("وصف السطر")).toHaveValue(
    "سطر الإيجار",
  );
  await expect(rows.nth(0).getByLabel("مدين", { exact: true })).toHaveValue(
    "40",
  );
  await expect(rows.nth(1).getByPlaceholder("وصف السطر")).toHaveValue(
    "سطر الصندوق",
  );
  await expect(page.locator(".entry-tools .balanced")).toContainText(
    "القيد متوازن",
  );
  await page.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ghc-demo-v1")),
  );
  expect(stored.draftEntries[0].lines.map((l) => l.accountId)).toEqual([
    "rent",
    "cash",
    "courses",
  ]);
  expect(stored.draftEntries[0].lines[0].centerId).toBe("order-center");
  expect(stored.draftEntries[0].lines.map((l) => l.debit)).toEqual([
    4000, 6000, 0,
  ]);
  expect(stored.draftEntries[0].lines.some((l) => "_rowKey" in l)).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page
    .locator(".journal-title")
    .filter({ hasText: "اختبار ترتيب أطراف القيد" })
    .click();
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await rows.nth(0).getByPlaceholder("وصف السطر").press("Alt+ArrowDown");
  await expect(rows.nth(0).getByPlaceholder("وصف السطر")).toHaveValue(
    "سطر الصندوق",
  );
  await expect(rows.nth(1).getByPlaceholder("وصف السطر")).toHaveValue(
    "سطر الإيجار",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "حذف السطر 3", exact: true }).click();
  await page.getByRole("button", { name: "إضافة سطر", exact: true }).click();
  await page
    .getByRole("combobox", { name: "حساب السطر 3", exact: true })
    .fill("4101");
  await page
    .getByRole("combobox", { name: "حساب السطر 3", exact: true })
    .press("Enter");
  await rows.nth(2).getByLabel("دائن", { exact: true }).fill("100");
  await page.getByRole("button", { name: "حفظ وترحيل", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posted = await page.evaluate(
    () => JSON.parse(localStorage.getItem("ghc-demo-v1")).entries[0],
  );
  expect(posted.lines.map((l) => l.accountId)).toEqual([
    "cash",
    "rent",
    "courses",
  ]);
  await expect(
    page.locator(".journal-paper-table tbody tr").nth(0),
  ).toContainText("الصندوق");
  await expect(page.getByRole("button", { name: /نقل السطر/ })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const file = await download;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await file.path());
  const values = [];
  book.worksheets[0].eachRow((row) => {
    if (
      ["الصندوق", "الإيجار", "إيرادات الدورات التعليمية"].includes(
        row.getCell(5).value,
      )
    )
      values.push(row.getCell(5).value);
  });
  expect(values).toEqual(["الصندوق", "الإيجار", "إيرادات الدورات التعليمية"]);
  expect(errors).toEqual([]);
});
