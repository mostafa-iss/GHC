import { validateDraft } from "./journals.js";
export function copyJournal(entry, date) {
  return {
    id: crypto.randomUUID(),
    date,
    description: entry.description,
    attachments: [],
    lines: entry.lines.map((l) => ({
      accountId: l.accountId || "",
      centerId: l.centerId || "",
      description: l.description || "",
      debit: l.debit || 0,
      credit: l.credit || 0,
    })),
  };
}
export function makeTemplate(entry, name, data) {
  if (!name?.trim()) throw Error("اسم القالب مطلوب");
  validateDraft(entry, data.accounts, data.centers);
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: entry.description,
    lines: copyJournal(entry, entry.date).lines,
    createdAt: new Date().toISOString(),
  };
}
