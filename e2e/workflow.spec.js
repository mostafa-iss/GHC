import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
test("Arabic accounting workflow: center, balanced journal, reports, persistence and backup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await expect(
    page.getByRole("heading", { name: "نظرة عامة", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "مراكز التكلفة", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة مركز تكلفة" }).click();
  await page.getByLabel("الاسم", { exact: true }).fill("دورة الرياضيات");
  await page.getByLabel("الكود", { exact: true }).fill("C01");
  await page.getByRole("button", { name: "حفظ البيانات" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة قيد يومي" }).click();
  await page
    .getByLabel("بيان القيد", { exact: true })
    .fill("تحصيل رسوم دورة الرياضيات");
  const trs = page.locator(".entry-lines tbody tr");
  await trs.nth(0).locator("select").nth(0).selectOption("cash");
  await trs.nth(1).locator("select").nth(0).selectOption("courses");
  for (let i = 0; i < 2; i++)
    await trs
      .nth(i)
      .locator("select")
      .nth(1)
      .selectOption({ label: "دورة الرياضيات" });
  await trs.nth(0).getByLabel("مدين", { exact: true }).fill("1250.50");
  await trs.nth(1).getByLabel("دائن", { exact: true }).fill("1000");
  await page.getByRole("button", { name: "حفظ القيد", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "غير متوازن",
  );
  await trs.nth(1).getByLabel("دائن", { exact: true }).fill("1250.50");
  await page.getByRole("button", { name: "حفظ القيد", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "تحصيل رسوم دورة الرياضيات", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page.getByRole("button", { name: "حساب الأستاذ", exact: true }).click();
  await page.getByLabel("الحساب", { exact: true }).selectOption("cash");
  await expect(page.locator("tfoot")).toContainText("1,250.50");
  await page.getByRole("button", { name: "قائمة الدخل", exact: true }).click();
  await expect(page.locator(".net-income")).toContainText("1,250.50");
  await expect(page.locator(".report-title img")).toBeVisible();
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير Excel", exact: true }).click();
  const report = await reportDownload;
  expect(report.suggestedFilename()).toContain(".xlsx");
  const reportZip = unzipSync(readFileSync(await report.path()));
  expect(
    Object.keys(reportZip).some((k) => k.startsWith("xl/media/")),
  ).toBeTruthy();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".report-title img")).toBeVisible();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-income-print.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });

  await page
    .getByRole("button", { name: "ميزان المراجعة", exact: true })
    .click();
  await expect(page.locator("tfoot")).toContainText("1,250.50");
  await page.getByRole("button", { name: "نظرة عامة", exact: true }).click();
  await expect(page.getByText("العملة الأساسية", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator("footer")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/ghaith-desktop.png", fullPage: true });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل نسخة احتياطية" }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toContain(".zip");
  const contents = unzipSync(readFileSync(await backup.path()));
  expect(
    JSON.parse(strFromU8(contents["accounting.json"])).data.entries,
  ).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 210, 0)",
  );
  await page.screenshot({ path: "/tmp/ghaith-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
