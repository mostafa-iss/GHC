import { allJournals, saveJournal } from "./journals.js";
const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export function validateAttachment(file) {
  if (!Object.hasOwn(extensions, file.type))
    throw Error("المرفقات: PDF أو صور JPG وPNG وWebP فقط");
  if (file.size > 5 * 1024 * 1024) throw Error("الحد الأقصى للمرفق 5 ميجابايت");
}
export async function uploadAttachment(file, bucket) {
  validateAttachment(file);
  // Object keys are ASCII; the original Unicode name is retained for display.
  const path = crypto.randomUUID() + "/attachment." + extensions[file.type];
  const { error } = await bucket.upload(path, file, { contentType: file.type });
  if (error) throw error;
  return { path, name: file.name, mimeType: file.type, size: file.size };
}
export function orphanAttachmentPaths(data, candidates) {
  const used = new Set(
    allJournals(data).flatMap((e) => (e.attachments || []).map((a) => a.path)),
  );
  return [...new Set(candidates.map((a) => a.path))].filter(
    (path) => !used.has(path),
  );
}
// Upload replacements first, atomically save the journal, then remove old files.
// If a save response is lost, confirm its token before considering cleanup.
export async function saveJournalAttachments(data, entry, files, options, io) {
  files.forEach(validateAttachment);
  const old =
      allJournals(data).find((e) => e.id === entry.id)?.attachments || [],
    staged = [];
  let next,
    result,
    uncertainSave = false,
    cleanupHandled = false,
    committed = false;
  try {
    for (const file of files) staged.push(await io.upload(file));
    next = saveJournal(
      data,
      { ...entry, attachments: [...(entry.attachments || []), ...staged] },
      options,
    );
    if (data.entryDocuments?.[entry.id])
      next.entryDocuments = {
        ...(next.entryDocuments || {}),
        [entry.id]: entry.documentLinks,
      };
    next.journalSaveToken = crypto.randomUUID();
    try {
      result = await io.save(next);
      committed = true;
    } catch (error) {
      let current;
      try {
        current = await io.read();
      } catch {
        uncertainSave = true;
        throw error;
      }
      if (current.data.journalSaveToken === next.journalSaveToken) {
        result = current;
        committed = true;
        io.recover(current);
      } else {
        const unused = orphanAttachmentPaths(current.data, staged);
        if (unused.length) await io.remove(unused).catch(() => {});
        cleanupHandled = true;
        throw error;
      }
    }
  } catch (error) {
    if (!committed && !uncertainSave && !cleanupHandled && staged.length)
      await io.remove(staged.map((a) => a.path)).catch(() => {});
    throw error;
  }
  const saved = result?.data || next;
  const removed = orphanAttachmentPaths(saved, old);
  let cleanupWarning = "";
  if (removed.length)
    try {
      await io.remove(removed);
    } catch {
      cleanupWarning =
        "تم حفظ القيد ومرفقاته الجديدة، لكن تعذر حذف بعض الملفات القديمة من التخزين.";
    }
  return { data: saved, cleanupWarning };
}
