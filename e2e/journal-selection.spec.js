import { test, expect } from "../tests/support/browser.js";
import { seed } from "../src/accounting.js";
import ExcelJS from "exceljs";
function fixture() {
  const d = seed();
  d.journalWorkflowVersion = 2;
  d.entries = Array.from({ length: 23 }, (_, i) => ({
    id: "batch-" + (i + 1),
    number: i + 1,
    date: "2026-11-01",
    description: "قيد تحديد " + (i + 1),
    lines: [
      { accountId: "cash", debit: 100, credit: 0 },
      { accountId: "courses", debit: 0, credit: 100 },
    ],
  }));
  d.draftEntries = [
    {
      id: "draft-good",
      draftNumber: 1,
      date: "2026-11-01",
      description: "مسودة سليمة",
      lines: [
        { accountId: "cash", debit: 200, credit: 0 },
        { accountId: "courses", debit: 0, credit: 200 },
      ],
    },
    {
      id: "draft-bad",
      draftNumber: 2,
      date: "2026-11-01",
      description: "مسودة غير متوازنة",
      lines: [
        { accountId: "cash", debit: 300, credit: 0 },
        { accountId: "courses", debit: 0, credit: 200 },
      ],
    },
  ];
  return d;
}
test("select across pages, retain on sorting, clear on filtering, export and print only selected, batch deletion", async ({
  page,
}) => {
  const data = fixture();
  await page.addInitScript(
    (d) => localStorage.setItem("ghc-demo-v1", JSON.stringify(d)),
    data,
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "تحديد #0023", exact: true })
    .check();
  await page
    .getByRole("button", { name: "الصفحة التالية", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "تحديد #0001", exact: true })
    .check();
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "2 محدد",
  );
  await page
    .getByLabel("اتجاه ترتيب القيود", { exact: true })
    .selectOption("asc");
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "2 محدد",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByLabel("إجراءات القيود المحددة", { exact: true })
    .selectOption("export");
  const file = await pending;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await file.path());
  const ids = [];
  book.worksheets[0].eachRow((r, i) => {
    if (i > 10) ids.push(r.getCell(7).value);
  });
  expect(ids).toEqual([1, 1, 23, 23]);
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "0 محدد",
  );
  await page
    .getByLabel("نطاق تحديد القيود", { exact: true })
    .selectOption("page");
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "20 محدد",
  );
  await page
    .getByLabel("نطاق تحديد القيود", { exact: true })
    .selectOption("all");
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "25 محدد",
  );
  await page
    .getByLabel("بحث بعنوان القيد", { exact: true })
    .fill("قيد تحديد 23");
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "0 محدد",
  );
  await page
    .getByRole("checkbox", { name: "تحديد الصفحة الحالية", exact: true })
    .check();
  await page.evaluate(() => {
    window.print = () => {
      window.__printed = true;
    };
  });
  await page
    .getByLabel("إجراءات القيود المحددة", { exact: true })
    .selectOption("print");
  await expect(page.locator(".batch-print-entry")).toHaveCount(1);
  await page.waitForFunction(() => window.__printed === true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".batch-print-entry")).toBeVisible();
  await expect(page.locator("#root")).toBeHidden();
  await page.pdf({
    path: "/workspace/artifacts/ghc-selected-journals.pdf",
    format: "A4",
  });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".batch-print-entry")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "تحديد الصفحة الحالية", exact: true })
    .check();
  await page
    .getByLabel("إجراءات القيود المحددة", { exact: true })
    .selectOption("delete");
  await expect(page.locator(".journal-row")).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ghc-demo-v1")),
  );
  expect(stored.entries).toHaveLength(22);
  expect(stored.entries.some((e) => e.id === "batch-23")).toBe(false);
  expect(errors).toEqual([]);
});
test("invalid draft aborts entire batch; selecting one valid draft posts it and keeps unrelated records", async ({
  page,
}) => {
  await page.addInitScript(
    (d) => localStorage.setItem("ghc-demo-v1", JSON.stringify(d)),
    fixture(),
  );
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByLabel("حالة القيد", { exact: true }).selectOption("draft");
  await page
    .getByLabel("نطاق تحديد القيود", { exact: true })
    .selectOption("all");
  await page
    .getByLabel("إجراءات القيود المحددة", { exact: true })
    .selectOption("post");
  await expect(page.getByRole("alert")).toContainText("غير متوازن");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghc-demo-v1")).entries.length,
    ),
  ).toBe(23);
  await expect(page.locator(".journal-selection-toolbar strong")).toHaveText(
    "2 محدد",
  );
  await page
    .getByLabel("نطاق تحديد القيود", { exact: true })
    .selectOption("none");
  await page.getByRole("checkbox", { name: /تحديد مسودة D-0001/ }).check();
  await page
    .getByLabel("إجراءات القيود المحددة", { exact: true })
    .selectOption("post");
  await expect(page.locator(".journal-row")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghc-demo-v1")).entries.length,
    ),
  ).toBe(24);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel("نطاق تحديد القيود", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
