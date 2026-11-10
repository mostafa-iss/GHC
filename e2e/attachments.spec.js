import { test, expect } from "@playwright/test";
import { seed } from "../src/accounting.js";
test("uploaded file and supplied Google Drive logo share one attachment gallery without duplicate link controls", async ({
  page,
}) => {
  const data = seed();
  data.entries = [
    {
      id: "mixed-attachments",
      number: 1,
      date: "2026-01-01",
      description: "اختبار مرفقات القيد",
      attachments: [{ path: "example/receipt.pdf", name: "receipt.pdf" }],
      documentLinks: [
        {
          url: "https://drive.google.com/file/d/EXAMPLE_MIXED/view",
          label: "مستند Drive",
        },
      ],
      lines: [
        { accountId: "cash", debit: 10000, credit: 0 },
        { accountId: "courses", debit: 0, credit: 10000 },
      ],
    },
  ];
  await page.addInitScript(
    (d) => localStorage.setItem("ghaith-demo-v1", JSON.stringify(d)),
    data,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "شجرة الحسابات", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "استيراد Excel", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page.locator(".journal-title").click();
  await expect(
    page.getByRole("heading", { name: "مرفقات القيد", exact: true }),
  ).toHaveCount(1);
  const gallery = page.locator(".journal-attachments .attachment-grid");
  await expect(gallery).toHaveCount(1);
  await expect(gallery.locator(".attachment-card")).toHaveCount(1);
  await expect(gallery.locator(".drive-card")).toHaveCount(1);
  await expect(page.locator(".journal-detail > .documents-field")).toHaveCount(
    0,
  );
  await expect(
    page.getByText("مستندات Drive — القيود المستوردة", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".drive-mark")).toHaveCount(0);
  const logo = page.getByRole("img", { name: "Google Drive", exact: true });
  await expect(logo).toBeVisible();
  await logo.evaluate((img) => img.decode());
  expect(await logo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  const file = await gallery.locator(".attachment-card").boundingBox(),
    drive = await gallery.locator(".drive-card").boundingBox();
  expect(Math.abs(file.y - drive.y)).toBeLessThan(1);
  expect(Math.abs(file.x - drive.x)).toBeGreaterThan(100);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-merged-attachments.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 210, 0)",
  );
  const mFile = await gallery.locator(".attachment-card").boundingBox(),
    mDrive = await gallery.locator(".drive-card").boundingBox();
  expect(Math.abs(mFile.y - mDrive.y)).toBeLessThan(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
