import { test, expect } from "../tests/support/browser.js";
import { seed } from "../src/accounting.js";

test("account chips open the complete posted ledger from home, filtered journals and journal detail; navigation header stays uniform", async ({
  page,
}) => {
  const data = seed();
  data.centers = [
    { id: "first", code: "C01", name: "المركز الأول" },
    { id: "second", code: "C02", name: "المركز الثاني" },
  ];
  const entry = (
    id,
    number,
    date,
    description,
    debitId,
    creditId,
    amount,
    centerId,
  ) => ({
    id,
    number,
    date,
    description,
    attachments: [],
    lines: [
      { accountId: debitId, debit: amount, credit: 0, centerId },
      { accountId: creditId, debit: 0, credit: amount, centerId },
    ],
  });
  data.entries = [
    entry(
      "old",
      1,
      "2024-01-01",
      "عملية قديمة",
      "cash",
      "courses",
      10000,
      "first",
    ),
    entry(
      "second",
      2,
      "2025-02-01",
      "حركة ثانية",
      "teachers",
      "cash",
      2500,
      "second",
    ),
    entry(
      "future",
      3,
      "2099-01-01",
      "حركة مستقبلية",
      "cash",
      "courses",
      5000,
      "second",
    ),
  ];
  data.draftEntries = [
    {
      ...entry(
        "draft",
        undefined,
        "2026-01-01",
        "مسودة مستبعدة",
        "cash",
        "courses",
        99900,
        "first",
      ),
      draftNumber: 1,
    },
  ];
  await page.addInitScript(
    (d) => localStorage.setItem("ghc-demo-v1", JSON.stringify(d)),
    data,
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const nav = (name) =>
    page.getByRole("navigation").getByRole("button", { name, exact: true });
  const header = page.locator(".main > header");
  const checkHeader = async () => {
    await expect(header).toHaveCSS("background-color", "rgb(16, 45, 84)");
    await expect(header).toHaveCSS("height", "52px");
    await expect(header.locator(".breadcrumb")).toContainText("GHC Academy");
    await expect(header).not.toContainText("المساحة المحاسبية");
    await expect(header).not.toContainText("متصل بالسحابة");
  };
  const checkCashLedger = async () => {
    await expect(page.locator(".page-heading h1")).toHaveText("حساب الأستاذ");
    await expect(page.getByLabel("الحساب", { exact: true })).toHaveValue(
      "cash",
    );
    await expect(page.getByLabel("من تاريخ", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("إلى تاريخ", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("مركز التكلفة", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.locator(".report-title")).toContainText("جميع الفترات");
    await expect(page.locator(".ledger-line")).toHaveCount(3);
    for (const description of ["عملية قديمة", "حركة ثانية", "حركة مستقبلية"])
      await expect(page.locator("tbody")).toContainText(description);
    await expect(page.locator("tbody")).not.toContainText("مسودة مستبعدة");
    await expect(page.locator("tfoot td")).toHaveText([
      "الإجمالي (SAR)",
      "150.00",
      "25.00",
      "125.00",
      "0.00",
    ]);
    await checkHeader();
  };

  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await checkHeader();
  await page
    .locator(".dashboard-account-chips")
    .getByRole("button", { name: "حساب الأستاذ: الصندوق", exact: true })
    .first()
    .click();
  await checkCashLedger();

  // Stale date/center/search filters from the journal list must not limit the ledger.
  await nav("القيود اليومية").click();
  await checkHeader();
  await page.getByLabel("بحث بعنوان القيد").fill("عملية قديمة");
  await page.getByLabel("القيود من تاريخ").fill("2024-01-01");
  await page.getByLabel("القيود إلى تاريخ").fill("2024-01-01");
  await page.getByRole("button", { name: "بحث متقدم" }).click();
  await page.getByLabel("مركز تكلفة القيود").selectOption("first");
  await expect(page.locator(".journal-row")).toHaveCount(1);
  const cashChip = page
    .locator(".journal-accounts")
    .getByRole("button", { name: "حساب الأستاذ: الصندوق", exact: true });
  await cashChip.focus();
  await cashChip.press("Enter");
  await checkCashLedger();

  await nav("القيود اليومية").click();
  await page
    .locator(".journal-row")
    .filter({ hasText: "عملية قديمة" })
    .locator(".journal-title")
    .click();
  await checkHeader();
  await page
    .locator(".journal-detail-flow")
    .getByRole("button", {
      name: "حساب الأستاذ: إيرادات الدورات التعليمية",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("الحساب", { exact: true })).toHaveValue(
    "courses",
  );
  await expect(page.locator(".ledger-line")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("عملية قديمة");
  await expect(page.locator("tbody")).toContainText("حركة مستقبلية");
  await expect(page.locator("tbody")).not.toContainText("مسودة مستبعدة");
  await expect(page.locator("tfoot td")).toHaveText([
    "الإجمالي (SAR)",
    "0.00",
    "150.00",
    "0.00",
    "150.00",
  ]);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-account-ledger.png",
    fullPage: true,
  });

  for (const title of [
    "شجرة الحسابات",
    "مراكز التكلفة",
    "ميزان المراجعة",
    "قائمة الدخل",
    "سجل التعديلات",
  ]) {
    await nav(title).click();
    await checkHeader();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header).toHaveCSS("background-color", "rgb(16, 45, 84)");
  await expect(header).toHaveCSS("height", "54px");
  expect(errors).toEqual([]);
});
