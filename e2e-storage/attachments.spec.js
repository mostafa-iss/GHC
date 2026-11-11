import { test, expect } from "@playwright/test";
import { seed } from "../src/accounting.js";
const pdf = {
  name: "تجديد اقامة 3 أشهر.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\nexample"),
};
async function mockStorage(page) {
  const data = seed();
  data.journalWorkflowVersion = 2;
  data.draftEntries = [
    {
      id: "draft-attachment",
      draftNumber: 1,
      date: "2026-11-01",
      description: "مسودة اختبار المرفقات",
      attachments: [
        {
          path: "old/receipt.pdf",
          name: "إيصال قديم.pdf",
          mimeType: "application/pdf",
          size: 12,
        },
      ],
      lines: [
        { accountId: "cash", debit: 10000, credit: 0 },
        { accountId: "courses", debit: 0, credit: 10000 },
      ],
    },
  ];
  const server = {
    data,
    version: 1,
    objects: new Set(["old/receipt.pdf"]),
    events: [],
    failUpload: false,
    failSave: false,
  };
  const now = Math.floor(Date.now() / 1000),
    user = {
      id: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.test",
      app_metadata: { provider: "email" },
      user_metadata: {},
    };
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      exp: now + 3600,
      iat: now,
    },
    "fixture-signature",
  ]
    .map((v) =>
      Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString(
        "base64url",
      ),
    )
    .join(".");
  await page.route("https://ghaith-attachments.test/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = decodeURIComponent(url.pathname),
      method = req.method();
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        json: body,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    if (path === "/auth/v1/token")
      return reply({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "fixture-refresh",
        user,
      });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/accounting_state")
      return reply({ data: server.data, version: server.version });
    if (path === "/rest/v1/rpc/save_accounting_state") {
      const payload = req.postDataJSON();
      server.events.push("save-attempt");
      if (server.failSave) {
        server.failSave = false;
        return reply(
          { message: "تعذر حفظ القيد للاختبار", code: "40001" },
          409,
        );
      }
      if (payload.expected_version !== server.version)
        return reply({ message: "conflict" }, 409);
      server.data = payload.new_data;
      server.version++;
      server.events.push("saved");
      return reply(server.version);
    }
    if (path.startsWith("/storage/v1/object/sign/attachments/"))
      return reply({
        signedURL:
          "/object/sign/attachments/" +
          path.split("/attachments/")[1] +
          "?token=fixture",
      });
    if (
      path.startsWith("/storage/v1/object/attachments/") &&
      method === "POST"
    ) {
      const key = path.split("/attachments/")[1];
      server.events.push("upload:" + key);
      if (/[^\x00-\x7F]/.test(key))
        return reply(
          { error: "InvalidKey", message: "Invalid key: " + key },
          400,
        );
      if (server.failUpload) {
        server.failUpload = false;
        return reply(
          { error: "StorageError", message: "تعذر رفع الملف للاختبار" },
          500,
        );
      }
      server.objects.add(key);
      return reply({ Id: "fixture-object", Key: "attachments/" + key });
    }
    if (path === "/storage/v1/object/attachments" && method === "DELETE") {
      const keys = req.postDataJSON().prefixes;
      for (const key of keys) {
        server.objects.delete(key);
        server.events.push("delete:" + key);
      }
      return reply(keys.map((name) => ({ name })));
    }
    return reply(
      { message: "Unexpected fixture route: " + method + " " + path },
      404,
    );
  });
  await page.goto("/");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("fixture-password");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "القيود اليومية", exact: true })
    .click();
  await page
    .locator(".journal-title")
    .filter({ hasText: "مسودة اختبار المرفقات" })
    .click();
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  return server;
}
test("Arabic PDF replacement, cancel, remove and re-open preserve original filename and draft accounting", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const server = await mockStorage(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".attachment-name")).toHaveText("إيصال قديم.pdf");
  await dialog
    .getByLabel("استبدال المرفق إيصال قديم.pdf", { exact: true })
    .setInputFiles(pdf);
  await expect(dialog.locator(".pending-file .attachment-name")).toHaveText(
    pdf.name,
  );
  expect(server.objects.has("old/receipt.pdf")).toBe(true);
  await dialog
    .getByRole("button", { name: "إغلاق النافذة", exact: true })
    .click();
  expect(server.data.draftEntries[0].attachments[0].path).toBe(
    "old/receipt.pdf",
  );
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  await dialog
    .getByLabel("استبدال المرفق إيصال قديم.pdf", { exact: true })
    .setInputFiles(pdf);
  await dialog.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const attachment = server.data.draftEntries[0].attachments[0];
  expect(attachment.name).toBe(pdf.name);
  expect(attachment.path).toMatch(/^[a-f0-9-]+\/attachment\.pdf$/);
  expect(server.objects.has(attachment.path)).toBe(true);
  expect(server.objects.has("old/receipt.pdf")).toBe(false);
  expect(server.events.indexOf("saved")).toBeLessThan(
    server.events.indexOf("delete:old/receipt.pdf"),
  );
  expect(server.data.entries).toHaveLength(0);
  await expect(
    page.locator(".journal-attachments .attachment-name"),
  ).toHaveText(pdf.name);
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(dialog.locator(".attachment-name")).toHaveText(pdf.name);
  await expect(
    dialog.getByRole("heading", { name: "تعديل قيد يومي", exact: true }),
  ).toBeVisible();
  await dialog.locator(".attachment-edit-actions").scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "حذف المرفق " + pdf.name, exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "فتح " + pdf.name, exact: true }),
  ).toHaveAttribute("href", /storage\/v1\/object\/sign/);
  await page.screenshot({
    path: "/workspace/artifacts/ghaith-edit-attachments.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog
    .getByLabel("إضافة مرفقات القيد", { exact: true })
    .setInputFiles({ ...pdf, name: "ملف إضافي.pdf" });
  await dialog
    .getByRole("button", {
      name: "إزالة الملف الجديد ملف إضافي.pdf",
      exact: true,
    })
    .click();
  await expect(dialog.locator(".pending-file")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "حذف المرفق " + pdf.name, exact: true })
    .click();
  await dialog.getByRole("button", { name: "تراجع", exact: true }).click();
  await expect(dialog.locator(".attachment-name")).toHaveText(pdf.name);
  await dialog
    .getByRole("button", { name: "حذف المرفق " + pdf.name, exact: true })
    .click();
  await dialog.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.data.draftEntries[0].attachments).toHaveLength(0);
  expect(server.objects.size).toBe(0);
  expect(errors).toEqual([]);
});
test("upload and save failures retain the old attachment and allow retry without duplicate files", async ({
  page,
}) => {
  const server = await mockStorage(page),
    dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("استبدال المرفق إيصال قديم.pdf", { exact: true })
    .setInputFiles(pdf);
  server.failUpload = true;
  await dialog.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("تعذر رفع الملف");
  expect(server.objects.has("old/receipt.pdf")).toBe(true);
  expect(server.data.draftEntries[0].attachments[0].path).toBe(
    "old/receipt.pdf",
  );
  server.failSave = true;
  await dialog.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("تعذر حفظ القيد");
  expect([...server.objects]).toEqual(["old/receipt.pdf"]);
  await dialog.getByRole("button", { name: "حفظ مسودة", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.objects.size).toBe(1);
  expect(server.data.draftEntries[0].attachments).toHaveLength(1);
  expect(server.data.draftEntries[0].attachments[0].name).toBe(pdf.name);
});
