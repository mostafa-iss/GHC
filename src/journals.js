import { validateEntry, postingAccounts } from "./accounting.js";
export const isPosted = (data, e) => journalStatus(data, e) === "posted";
export function journalStatus(data, e) {
  if (data.draftEntries?.some((draft) => draft.id === e.id)) return "draft";
  return data.entryLifecycle?.[e.id]?.status || e.status || "posted";
}
export function allJournals(data) {
  const map = new Map((data.entries || []).map((e) => [e.id, e]));
  for (const e of data.draftEntries || []) map.set(e.id, e);
  return [...map.values()].map((e) => ({
    ...e,
    status: journalStatus(data, e),
  }));
}
export function normalizeSearch(v) {
  return String(v ?? "")
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export function filterJournals(data, f = {}) {
  return allJournals(data)
    .filter((e) => {
      if (f.status ? e.status !== f.status : e.status === "deleted")
        return false;
      if ((f.from && e.date < f.from) || (f.to && e.date > f.to)) return false;
      if (f.accountId && !e.lines.some((l) => l.accountId === f.accountId))
        return false;
      if (f.centerId && !e.lines.some((l) => l.centerId === f.centerId))
        return false;
      if (f.source && (e.importKey ? "excel" : "manual") !== f.source)
        return false;
      if (
        f.number &&
        !normalizeSearch(
          [e.number, e.draftNumber, e.sourceNumber].join(" "),
        ).includes(normalizeSearch(f.number))
      )
        return false;
      if (
        f.search &&
        !normalizeSearch(e.description).includes(normalizeSearch(f.search))
      )
        return false;
      const amount = e.lines.reduce((s, l) => s + (l.debit || 0), 0) / 100;
      if (
        (f.minAmount !== "" &&
          f.minAmount != null &&
          amount < Number(f.minAmount)) ||
        (f.maxAmount !== "" &&
          f.maxAmount != null &&
          amount > Number(f.maxAmount))
      )
        return false;
      const created = (e.createdAt || "").slice(0, 10);
      if (
        (f.createdFrom && created < f.createdFrom) ||
        (f.createdTo && created > f.createdTo)
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (b.number || 0) - (a.number || 0),
    );
}
function event(data, id, action, details = "") {
  return [
    ...(data.journalEvents || []),
    {
      id: crypto.randomUUID(),
      entryId: id,
      action,
      details,
      at: new Date().toISOString(),
      actor: "ghaith",
    },
  ];
}
export function validateDraft(entry, accounts, centers) {
  if (!entry.description?.trim()) throw Error("عنوان القيد مطلوب لحفظ المسودة");
  if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    throw Error("تاريخ القيد مطلوب");
  const leaves = postingAccounts(accounts);
  for (const l of entry.lines) {
    if (l.accountId && !leaves.some((a) => a.id === l.accountId))
      throw Error("التسجيل متاح على آخر حساب فرعي فقط");
    if (l.centerId && !centers.some((c) => c.id === l.centerId))
      throw Error("مركز التكلفة غير موجود");
    if (
      !Number.isSafeInteger(l.debit) ||
      !Number.isSafeInteger(l.credit) ||
      l.debit < 0 ||
      l.credit < 0 ||
      (l.debit && l.credit)
    )
      throw Error("أدخل مبلغًا صحيحًا في مدين أو دائن فقط لكل سطر");
  }
  return true;
}
export function saveJournal(data, input, { post = false } = {}) {
  const entry = structuredClone(input);
  delete entry.status;
  entry.id ||= crypto.randomUUID();
  entry.createdAt ||= new Date().toISOString();
  const existing = data.entries.find((e) => e.id === entry.id);
  if (existing) throw Error("حوّل القيد إلى مسودة قبل التعديل");
  let drafts = [...(data.draftEntries || [])];
  const oldDraft = drafts.find((e) => e.id === entry.id);
  const lifecycle = { ...(data.entryLifecycle || {}) };
  const at = new Date().toISOString();
  if (!post) {
    validateDraft(entry, data.accounts, data.centers);
    entry.draftNumber ||=
      oldDraft?.draftNumber ||
      Math.max(
        data.draftNumberSequence || 0,
        0,
        ...drafts.map((e) => e.draftNumber || 0),
      ) + 1;
    delete entry.number;
    drafts = [...drafts.filter((e) => e.id !== entry.id), entry];
    lifecycle[entry.id] = { status: "draft", updatedAt: at };
    return {
      ...data,
      draftEntries: drafts,
      entryLifecycle: lifecycle,
      draftNumberSequence: Math.max(
        data.draftNumberSequence || 0,
        entry.draftNumber,
      ),
      journalEvents: event(
        data,
        entry.id,
        oldDraft ? "تعديل مسودة" : "حفظ مسودة",
      ),
    };
  }
  validateEntry(entry, data.accounts, data.centers);
  const sequence = Math.max(
    data.entryNumberSequence || 0,
    0,
    ...data.entries.map((e) => e.number),
  );
  entry.number =
    entry.originalNumber &&
    !data.entries.some((e) => e.number === entry.originalNumber)
      ? entry.originalNumber
      : sequence + 1;
  delete entry.originalNumber;
  delete entry.draftNumber;
  drafts = drafts.filter((e) => e.id !== entry.id);
  lifecycle[entry.id] = { status: "posted", updatedAt: at };
  return {
    ...data,
    entries: [...data.entries, entry],
    draftEntries: drafts,
    entryLifecycle: lifecycle,
    entryNumberSequence: Math.max(sequence, entry.number),
    journalEvents: event(data, entry.id, "ترحيل القيد"),
  };
}
export function changeJournalState(data, id, action) {
  const entry = allJournals(data).find((e) => e.id === id);
  if (!entry) throw Error("القيد غير موجود");
  const current = journalStatus(data, entry);
  if (action === "post") {
    if (current !== "draft") throw Error("الترحيل متاح للمسودات فقط");
    return saveJournal(data, entry, { post: true });
  }
  const states = { ...(data.entryLifecycle || {}) };
  let drafts = [...(data.draftEntries || [])];
  let entries = [...data.entries];
  let documents = { ...(data.entryDocuments || {}) };
  let label;
  if (action === "draft") {
    if (current !== "posted") throw Error("القيد ليس مرحّلًا");
    const copy = structuredClone(entry);
    delete copy.status;
    copy.originalNumber = copy.number;
    copy.draftNumber =
      Math.max(
        data.draftNumberSequence || 0,
        0,
        ...drafts.map((e) => e.draftNumber || 0),
      ) + 1;
    delete copy.number;
    entries = entries.filter((e) => e.id !== id);
    drafts = [...drafts.filter((e) => e.id !== id), copy];
    states[id] = { status: "draft", updatedAt: new Date().toISOString() };
    label = "تحويل القيد إلى مسودة";
  } else if (action === "delete") {
    entries = entries.filter((e) => e.id !== id);
    drafts = drafts.filter((e) => e.id !== id);
    delete states[id];
    delete documents[id];
    label = "حذف القيد";
  } else throw Error("إجراء غير معروف");
  return {
    ...data,
    entries,
    draftEntries: drafts,
    entryLifecycle: states,
    entryDocuments: documents,
    draftNumberSequence: Math.max(
      data.draftNumberSequence || 0,
      0,
      ...drafts.map((e) => e.draftNumber || 0),
    ),
    entryNumberSequence: Math.max(
      data.entryNumberSequence || 0,
      ...data.entries.map((e) => e.number),
      0,
    ),
    journalEvents: event(data, id, label, entry.description),
  };
}
export function resetJournals(data) {
  return {
    ...data,
    entries: [],
    draftEntries: [],
    entryLifecycle: {},
    entryDocuments: {},
    entryNumberSequence: 0,
    draftNumberSequence: 0,
    journalEvents: event(data, "*", "حذف جميع القيود"),
  };
}
