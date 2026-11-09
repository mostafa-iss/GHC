import { createClient } from "@supabase/supabase-js";
import { authStorage } from "./authStorage";
import { seed } from "./accounting";
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
const KEY = "ghaith-demo-v1";
export async function readData() {
  if (!cloud)
    return {
      data: JSON.parse(localStorage.getItem(KEY) || "null") || seed(),
      version: 0,
    };
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
    localStorage.setItem(KEY, JSON.stringify(data));
    return version + 1;
  }
  const { data: next, error } = await client.rpc("save_accounting_state", {
    expected_version: version,
    new_data: data,
  });
  if (error) throw error;
  return next;
}
export async function upload(file) {
  if (
    !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
      file.type,
    )
  )
    throw Error("المرفقات: PDF أو صور JPG وPNG وWebP فقط");
  if (file.size > 5 * 1024 * 1024) throw Error("الحد الأقصى للمرفق 5 ميجابايت");
  if (!cloud) throw Error("رفع المرفقات متاح بعد ربط التخزين السحابي");
  const path =
    crypto.randomUUID() + "/" + file.name.replace(/[^\w.\u0600-\u06ff-]/g, "_");
  const { error } = await client.storage.from("attachments").upload(path, file);
  if (error) throw error;
  return { path, name: file.name };
}
export async function openAttachment(a) {
  const { data, error } = await client.storage
    .from("attachments")
    .createSignedUrl(a.path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
