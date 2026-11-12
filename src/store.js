import { createClient } from "@supabase/supabase-js";
import { authStorage } from "./authStorage";
import { emptyState } from "./accounting";
import { uploadAttachment, validateAttachment } from "./attachments.js";
const projectUrl = (import.meta.env.VITE_SUPABASE_URL || "")
  .trim()
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/$/, "");
export const cloud = Boolean(
  projectUrl && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
export const client = cloud
  ? createClient(projectUrl, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { storage: authStorage },
    })
  : null;
const KEY = "ghc-demo-v1";
export async function readData() {
  if (!cloud) {
    const { _localVersion = 0, ...data } =
      JSON.parse(localStorage.getItem(KEY) || "null") || emptyState();
    return { data, version: _localVersion };
  }
  const { data, error } = await client
    .from("accounting_state")
    .select("data,version")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}
export async function saveData(data, version) {
  if (!cloud) {
    const current = JSON.parse(localStorage.getItem(KEY) || "null");
    if ((current?._localVersion || 0) !== version)
      throw Error(
        "تم تعديل البيانات من نافذة أخرى. أعد تحميل البيانات قبل الحفظ.",
      );
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...data, _localVersion: version + 1 }),
    );
    return version + 1;
  }
  if (data.journalWorkflowVersion !== 2)
    throw Error(
      "يلزم تشغيل ملف تحديث قاعدة البيانات 002_journal_workflow.sql لتفعيل المسودات والحذف وتصفير القيود القديمة.",
    );
  const { data: next, error } = await client.rpc("save_accounting_state", {
    expected_version: version,
    new_data: data,
  });
  if (error) throw error;
  return next;
}
export async function upload(file) {
  validateAttachment(file);
  if (!cloud) throw Error("رفع المرفقات متاح بعد ربط التخزين السحابي");
  return uploadAttachment(file, client.storage.from("attachments"));
}
export async function openAttachment(a) {
  const { data, error } = await client.storage
    .from("attachments")
    .createSignedUrl(a.path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
