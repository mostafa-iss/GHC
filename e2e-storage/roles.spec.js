import { test, expect } from "@playwright/test";
import { seed } from "../src/accounting.js";
async function setup(page, role) {
  const sid = "10000000-0000-4000-8000-000000000001",
    other = "20000000-0000-4000-8000-000000000002";
  const user = {
    id:
      role === "admin"
        ? "526918f2-5859-4b08-a1d4-97a44fb783a7"
        : "23a39f9a-a293-4500-ae73-8c826b984356",
    email: `${role}@example.test`,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const now = Math.floor(Date.now() / 1000);
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      role: "authenticated",
      session_id: sid,
      exp: now + 3600,
      iat: now,
    },
    "signature",
  ]
    .map((v) =>
      Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString(
        "base64url",
      ),
    )
    .join(".");
  const server = {
    data: {
      ...seed(),
      journalWorkflowVersion: 2,
      draftEntries: [
        {
          id: "draft",
          draftNumber: 1,
          date: "2026-11-14",
          description: "مسودة الصلاحيات",
          lines: [
            { accountId: "cash", debit: 500, credit: 0 },
            { accountId: "courses", debit: 0, credit: 500 },
          ],
        },
      ],
    },
    version: 1,
    revoked: false,
    ended: [],
    blocked: false,
  };
  await page.route("https://ghaith-attachments.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (json, status = 200) =>
      route.fulfill({
        status,
        json,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    if (route.request().method() === "OPTIONS") return reply({});
    if (path === "/auth/v1/token")
      return reply({
        access_token: token,
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/auth/v1/logout") return reply({});
    if (path === "/rest/v1/rpc/app_access")
      return server.revoked || server.blocked
        ? reply({ message: "جلسة منتهية أو الترقية غير متاحة" }, 403)
        : reply({ role, sessionId: sid });
    if (path === "/rest/v1/accounting_state")
      return reply({ data: server.data, version: server.version });
    if (path === "/rest/v1/rpc/save_accounting_state") {
      server.data = route.request().postDataJSON().new_data;
      return reply(++server.version);
    }
    if (path === "/rest/v1/rpc/app_list_sessions")
      return reply([
        {
          session_id: sid,
          user_id: user.id,
          email: user.email,
          role,
          device: { os: "Windows", browser: "Chrome", kind: "كمبيوتر" },
          signed_in_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
        {
          session_id: other,
          user_id: "staff",
          email: "staff@example.test",
          role: "accountant",
          device: { os: "Android", browser: "Chrome", kind: "هاتف" },
          signed_in_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          ended_at: server.ended.includes(other)
            ? new Date().toISOString()
            : null,
        },
      ]);
    if (path === "/rest/v1/rpc/app_end_session") {
      server.ended.push(route.request().postDataJSON().target_session);
      return reply(null);
    }
    return reply([]);
  });
  await page.goto("/");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(user.email);
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("fixture-password");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  return server;
}
test("accountant can post and return to draft but has no delete/reset/restore or device management", async ({
  page,
}) => {
  const server = await setup(page, "accountant");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "الأجهزة والجلسات", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "حذف جميع القيود والبدء من جديد" }),
  ).toHaveCount(0);
  await page
    .locator(".journal-title")
    .filter({ hasText: "مسودة الصلاحيات" })
    .click();
  await expect(
    page.getByRole("button", { name: "حذف", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "ترحيل القيد", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "تحويل إلى مسودة", exact: true }),
  ).toBeVisible();
  expect(server.data.entries).toHaveLength(1);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "تحويل إلى مسودة", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ترحيل القيد", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "النسخ الاحتياطية", exact: true })
    .click();
  await expect(page.getByLabel("ملف النسخة الاحتياطية")).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true })
      .last(),
  ).toBeVisible();
});
test("admin sees device metadata and can end another session; heartbeat fails closed after revocation", async ({
  page,
}) => {
  const server = await setup(page, "admin");
  await page
    .getByRole("button", { name: "الأجهزة والجلسات", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: /staff@example.test/ }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "إنهاء الجلسة", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "منتهية", exact: true }),
  ).toBeVisible();
  expect(server.ended).toHaveLength(1);
  await page.screenshot({
    path: "/workspace/artifacts/ghc-devices.png",
    fullPage: true,
  });
  server.revoked = true;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByRole("alert")).toContainText("جلسة منتهية");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
