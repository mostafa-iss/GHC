import { test, expect } from "../tests/support/browser.js";
import { seed } from "../src/accounting.js";

test("responsive interface keeps focus in dialogs, dismisses menus and drawers, and preserves live journal search", async ({
  page,
}) => {
  const data = seed();
  const titles = [
    "تحصيل رسوم دورة القرآن الكريم",
    "سداد أجور المعلمين",
    "تحصيل رسوم دورة اللغة العربية",
  ];
  data.entries = titles.map((description, i) => ({
    id: `visual-${i}`,
    number: i + 1,
    date: `2026-01-0${i + 1}`,
    description,
    attachments: [],
    lines: [
      {
        accountId: i === 1 ? "teachers" : "cash",
        debit: (i + 1) * 125000,
        credit: 0,
      },
      {
        accountId: i === 1 ? "cash" : "courses",
        debit: 0,
        credit: (i + 1) * 125000,
      },
    ],
  }));
  data.draftEntries = [
    {
      ...data.entries[0],
      id: "draft",
      number: undefined,
      draftNumber: 1,
      description: "مسودة رسوم دورة جديدة",
    },
  ];
  await page.addInitScript(
    (d) => localStorage.setItem("ghc-demo-v1", JSON.stringify(d)),
    data,
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "استكشاف النسخة التجريبية" }).click();
  await expect(page.locator(".info-card")).toContainText("لديك 1 مسودة");
  const draft = page
    .locator("tbody tr")
    .filter({ hasText: "مسودة رسوم دورة جديدة" });
  await expect(draft).toContainText("مسودة D-0001");
  await expect(draft.locator(".journal-state")).toHaveText("مسودة");
  await expect(page.locator("main")).not.toContainText("undefined");
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-refined-dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "مراجعة المسودات" }).click();
  await expect(page.getByLabel("حالة القيد", { exact: true })).toHaveValue(
    "draft",
  );
  await expect(page.locator(".journal-row")).toHaveCount(1);
  await page.getByRole("button", { name: "إلغاء الفلتر" }).click();
  const search = page.getByLabel("بحث بعنوان القيد");
  await search.pressSequentially("تحصيل");
  await expect(search).toBeFocused();
  await expect(page.locator(".journal-row")).toHaveCount(2);
  await page.getByRole("button", { name: "إلغاء الفلتر" }).click();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-refined-journals.png",
    fullPage: true,
    animations: "disabled",
  });
  const more = page.getByRole("button", { name: "إجراءات #0003", exact: true });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".journal-menu")).toHaveCount(0);
  await more.click();
  await search.click();
  await expect(page.locator(".journal-menu")).toHaveCount(0);
  const add = page.getByRole("button", { name: "أضف قيد", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", {
    name: "إضافة قيد يومي",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("تاريخ القيد", { exact: true })).toBeFocused();
  await expect(page.locator(".main")).toHaveAttribute("inert", "");
  await dialog.getByRole("button", { name: "حفظ وترحيل", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "إغلاق النافذة" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "حفظ وترحيل", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-refined-entry-form.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "إغلاق النافذة" }).click();
  await expect(add).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page
    .locator(".journal-row")
    .filter({ hasText: titles[2] })
    .locator(".journal-title")
    .click();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "القيود اليومية", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-refined-journal-detail.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside")).toBeHidden();
  const menu = page.getByRole("button", { name: "فتح قائمة التنقل" });
  await menu.click();
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator(".main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.locator("aside")).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .getByRole("button", { name: "إغلاق القائمة", exact: true })
    .click({ position: { x: 20, y: 300 } });
  await expect(page.locator("aside")).toBeHidden();
  await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await expect(page.locator("aside")).toBeHidden();
  const filters = page.getByRole("button", {
    name: "بحث وتصفية القيود",
    exact: true,
  });
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await filters.click();
  await search.fill("تحصيل");
  await expect(page.locator(".journal-row")).toHaveCount(2);
  await page.getByRole("button", { name: "إلغاء الفلتر" }).click();
  await filters.click();
  await expect(search).toBeHidden();
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-refined-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("main")).toHaveCSS("animation-name", "none");
  expect(errors).toEqual([]);
});
