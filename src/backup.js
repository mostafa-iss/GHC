import { unzip, strFromU8, strToU8, zipSync } from "fflate";
import { validateEntry } from "./accounting.js";
import { validateDraft } from "./journals.js";
import { documentLink } from "./documents.js";
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024,
  MAX_FILE = 5 * 1024 * 1024;
export const backupEntries = (data) => [
  ...(data.entries || []),
  ...(data.draftEntries || []),
];
const fail = (message) => {
  throw Error(message);
};
const validDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s || "") &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const safePath = (path) =>
  typeof path === "string" &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  path.split("/").every((p) => p && p !== "." && p !== "..");
export function attachmentType(bytes) {
  if (bytes[0] === 0x89 && strFromU8(bytes.subarray(1, 4)) === "PNG")
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    strFromU8(bytes.subarray(0, 4)) === "RIFF" &&
    strFromU8(bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (strFromU8(bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
  fail("نوع ملف مرفق غير مدعوم داخل النسخة");
}
export function validateSnapshot(data) {
  if (
    !data ||
    !Array.isArray(data.accounts) ||
    !data.accounts.length ||
    !Array.isArray(data.centers) ||
    !Array.isArray(data.entries)
  )
    fail("بنية النسخة الاحتياطية غير صالحة");
  const unique = (items, key) => {
    const values = items.map((x) => x?.[key]);
    if (
      values.some((x) => typeof x !== "string" || !x.trim()) ||
      new Set(values).size !== values.length
    )
      fail("معرفات أو أكواد مكررة أو غير صالحة");
  };
  for (const list of [data.accounts, data.centers]) {
    unique(list, "id");
    unique(list, "code");
    for (const item of list) {
      if (typeof item.name !== "string" || !item.name.trim())
        fail("اسم حساب أو مركز تكلفة مفقود");
      const seen = new Set([item.id]);
      let parent = item.parentId;
      while (parent) {
        const p = list.find((x) => x.id === parent);
        if (!p || seen.has(parent))
          fail("تسلسل الحسابات أو مراكز التكلفة غير صالح");
        if (list === data.accounts && p.type !== item.type)
          fail("تصنيف الحساب الرئيسي لا يطابق الفرعي");
        seen.add(parent);
        parent = p.parentId;
      }
    }
  }
  if (
    data.accounts.some(
      (a) =>
        !["asset", "liability", "equity", "revenue", "expense"].includes(
          a.type,
        ),
    )
  )
    fail("تصنيف حساب غير صالح");
  if (data.draftEntries != null && !Array.isArray(data.draftEntries))
    fail("قائمة المسودات غير صالحة");
  const entries = backupEntries(data);
  unique(entries, "id");
  const numbers = data.entries.map((e) => e.number);
  if (
    numbers.some((n) => !Number.isSafeInteger(n) || n <= 0) ||
    new Set(numbers).size !== numbers.length
  )
    fail("أرقام قيود مكررة أو غير صالحة");
  for (const e of entries) {
    if (!validDate(e.date) || !Array.isArray(e.lines))
      fail("تاريخ أو أسطر قيد غير صالحة");
    const draft = (data.draftEntries || []).includes(e);
    (draft ? validateDraft : validateEntry)(e, data.accounts, data.centers);
    if (
      !draft &&
      ((e.status && e.status !== "posted") ||
        (data.entryLifecycle?.[e.id]?.status &&
          data.entryLifecycle[e.id].status !== "posted"))
    )
      fail("حالة قيد مرحّل غير متسقة في النسخة");
    for (const key of ["debit", "credit"])
      if (!Number.isSafeInteger(e.lines.reduce((s, l) => s + l[key], 0)))
        fail("مجموع مبالغ القيد يتجاوز الحد المدعوم");
    if (e.attachments != null && !Array.isArray(e.attachments))
      fail("قائمة مرفقات غير صالحة");
    for (const a of e.attachments || [])
      if (!safePath(a.path) || !a.name) fail("مسار مرفق غير صالح");
  }
  for (const t of data.journalTemplates || [])
    validateDraft({ ...t, date: "2026-01-01" }, data.accounts, data.centers);
  for (const f of data.financeAccounts || []) {
    if (
      !f.id ||
      !f.name ||
      !["bank", "cash", "card"].includes(f.kind) ||
      (f.accountId && !data.accounts.some((a) => a.id === f.accountId))
    )
      fail("حساب مالي غير صالح");
    for (const link of f.statementLinks || []) documentLink(link);
  }
  return data;
}
export async function readBackup(file) {
  if (file.size > MAX_BACKUP_BYTES)
    fail("الحد الأقصى للنسخة المضغوطة 64 ميجابايت");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let expanded = 0,
    rejected = false;
  const files = await new Promise((resolve, reject) => {
    unzip(
      bytes,
      {
        filter: (entry) => {
          expanded += entry.originalSize;
          if (
            expanded > MAX_EXPANDED ||
            entry.originalSize > 20 * 1024 * 1024
          ) {
            rejected = true;
            return false;
          }
          return (
            entry.name === "accounting.json" ||
            entry.name.startsWith("attachments/")
          );
        },
      },
      (error, result) =>
        error
          ? reject(Error("تعذر قراءة ملف ZIP؛ الملف تالف أو غير مدعوم"))
          : resolve(result),
    );
  });
  if (rejected) fail("حجم النسخة بعد فك الضغط يتجاوز الحد المدعوم");
  if (!files["accounting.json"]) fail("الملف ليس نسخة احتياطية من غيث");
  let snapshot;
  try {
    snapshot = JSON.parse(strFromU8(files["accounting.json"]));
  } catch {
    fail("ملف بيانات النسخة غير صالح");
  }
  if (snapshot.format !== "ghaith-backup-v1")
    fail("صيغة النسخة الاحتياطية غير مدعومة");
  validateSnapshot(snapshot.data);
  const paths = new Map();
  for (const e of backupEntries(snapshot.data))
    for (const a of e.attachments || []) {
      const fileBytes = files["attachments/" + a.path];
      if (!fileBytes) fail("النسخة ناقصة: المرفق " + a.name + " غير موجود");
      if (fileBytes.length > MAX_FILE) fail("مرفق يتجاوز 5 ميجابايت");
      paths.set(a.path, {
        ...a,
        bytes: fileBytes,
        mimeType: attachmentType(fileBytes),
      });
    }
  return {
    snapshot,
    files: [...paths.values()],
    summary: {
      accounts: snapshot.data.accounts.length,
      centers: snapshot.data.centers.length,
      entries: snapshot.data.entries.length,
      drafts: snapshot.data.draftEntries?.length || 0,
      attachments: paths.size,
    },
  };
}
export function restoredState(source, attachments = new Map()) {
  validateSnapshot(source);
  const data = structuredClone(source),
    ids = new Map();
  for (const item of [
    ...data.accounts,
    ...data.centers,
    ...backupEntries(data),
  ])
    ids.set(item.id, crypto.randomUUID());
  const ref = (id) => ids.get(id) || id || "";
  for (const item of [...data.accounts, ...data.centers]) {
    item.id = ref(item.id);
    item.parentId = ref(item.parentId);
  }
  const lines = (items) =>
    items.map((l) => ({
      ...l,
      accountId: ref(l.accountId),
      centerId: ref(l.centerId),
    }));
  for (const e of backupEntries(data)) {
    e.id = ref(e.id);
    e.lines = lines(e.lines);
    e.attachments = (e.attachments || []).map((a) => {
      if (!attachments.has(a.path)) fail("لم يُسترجع أحد المرفقات");
      return attachments.get(a.path);
    });
    delete e.status;
  }
  data.entryDocuments = Object.fromEntries(
    Object.entries(data.entryDocuments || {}).map(([id, links]) => [
      ref(id),
      links,
    ]),
  );
  data.entryLifecycle = Object.fromEntries(
    backupEntries(data).map((e) => [
      e.id,
      {
        status: (data.draftEntries || []).includes(e) ? "draft" : "posted",
        updatedAt: new Date().toISOString(),
      },
    ]),
  );
  data.journalEvents = (data.journalEvents || []).map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    entryId: ref(e.entryId),
  }));
  data.journalTemplates = (data.journalTemplates || []).map((t) => ({
    ...t,
    lines: lines(t.lines),
  }));
  data.financeAccounts = (data.financeAccounts || []).map((f) => ({
    ...f,
    accountId: ref(f.accountId),
  }));
  data.journalWorkflowVersion = 2;
  data.entryNumberSequence = Math.max(
    data.entryNumberSequence || 0,
    0,
    ...data.entries.map((e) => e.number),
  );
  data.draftNumberSequence = Math.max(
    data.draftNumberSequence || 0,
    0,
    ...(data.draftEntries || []).map((e) => e.draftNumber || 0),
  );
  data.restoreToken = crypto.randomUUID();
  data.journalEvents.push({
    id: crypto.randomUUID(),
    entryId: "*",
    action: "استرجاع نسخة احتياطية",
    at: new Date().toISOString(),
    actor: "ghaith",
  });
  return data;
}
export async function createBackupArchive(fresh, downloadAttachment, logo) {
  const files = {
    "accounting.json": strToU8(
      JSON.stringify({
        format: "ghaith-backup-v1",
        exportedAt: new Date().toISOString(),
        ...fresh,
      }),
    ),
  };
  for (const e of backupEntries(fresh.data))
    for (const a of e.attachments || []) {
      const name = "attachments/" + a.path;
      if (!files[name])
        files[name] = new Uint8Array(await downloadAttachment(a));
    }
  if (logo) files["ghaith-logo.png"] = logo;
  return new Blob([zipSync(files)], { type: "application/zip" });
}
export function downloadBackup(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
// Stage files first; commit the entire state once. Retain staged files on an
// ambiguous network result so a successful commit can never lose its files.
export async function executeRestore(plan, expectedVersion, io) {
  const fresh = await io.read();
  if (fresh.version !== expectedVersion)
    fail(
      "البيانات تغيرت بعد المعاينة. أعد اختيار النسخة لمراجعة الاسترجاع من جديد.",
    );
  await io.backup(fresh);
  const uploaded = new Map();
  let next,
    committed = false;
  try {
    for (const file of plan.files)
      uploaded.set(file.path, await io.upload(file));
    next = restoredState(plan.snapshot.data, uploaded);
    const version = await io.save(next, expectedVersion);
    committed = true;
    return { data: next, version };
  } catch (error) {
    if (next) {
      try {
        const current = await io.read();
        if (current.data.restoreToken === next.restoreToken) {
          committed = true;
          return current;
        }
      } catch {
        throw error;
      }
    }
    if (!committed && uploaded.size)
      await io
        .remove([...uploaded.values()].map((a) => a.path))
        .catch(() => {});
    throw error;
  }
}
