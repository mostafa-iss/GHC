export function documentLink(value, label = "ملف Drive") {
  const raw = typeof value === "object" && value ? value.url : value;
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw Error("أدخل رابط مستند كاملًا يبدأ بـ https://");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("روابط المستندات يجب أن تكون HTTPS ومن غير بيانات دخول");
  return {
    url: u.href,
    label:
      String((typeof value === "object" && value?.label) || label).trim() ||
      "ملف Drive",
  };
}
export function mergeDocuments(...lists) {
  const found = new Map();
  for (const list of lists)
    for (const item of list || []) {
      try {
        const link = documentLink(item);
        if (link && !found.has(link.url)) found.set(link.url, link);
      } catch {
        /* Invalid legacy references are kept as text, never made clickable. */
      }
    }
  return [...found.values()];
}
export function entryDocuments(entry, extra) {
  if (Array.isArray(extra)) return mergeDocuments(extra);
  return mergeDocuments(
    entry.documentLinks,
    extra,
    ...(entry.lines || []).map((l) => l.documentLinks),
  );
}
export function parseDocumentLinks(text) {
  return mergeDocuments(
    ...String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => [documentLink(line, "مستند " + (i + 1))]),
  );
}
