import { chartPlan, normalizeName } from "./importer.js";

// One-time setup helper. Account names are supplied privately by the owner;
// never reset an editable chart automatically when opening the application.
export function curatedChart(data, names) {
  const plan = chartPlan(names, data);
  if (plan.issues.length) throw Error(plan.issues.join("؛ "));
  const byId = new Map(plan.accounts.map((a) => [a.id, a]));
  // Retain the existing posting codes and identities, with fewer redundant
  // intermediate folders for this small chart.
  const parents = {
    121: "12",
    122: "12",
    129: "12",
    211: "21",
    212: "21",
    311: "3",
    321: "32",
    331: "3",
    341: "3",
    411: "4",
    421: "4",
    511: "51",
    512: "51",
    521: "52",
    531: "53",
    532: "53",
    533: "53",
    541: "54",
    551: "55",
    561: "56",
  };
  for (const item of plan.items) {
    const a = byId.get(item.id),
      code = parents[item.group] || item.group,
      parent = plan.accounts.find((p) => p.code === code);
    if (!parent || parent.type !== a.type)
      throw Error("تصنيف الحساب الرئيسي غير صالح");
    const original = data.accounts.find((old) => old.id === a.id);
    if (original) a.code = original.code;
    a.parentId = parent.id;
  }
  const keep = new Set();
  for (const item of plan.items) {
    let a = byId.get(item.id);
    const seen = new Set();
    while (a) {
      if (seen.has(a.id)) throw Error("تسلسل الحسابات غير صالح");
      seen.add(a.id);
      keep.add(a.id);
      a = a.parentId ? byId.get(a.parentId) : null;
    }
  }
  const removed = data.accounts.filter((a) => !keep.has(a.id));
  const used = new Set(
    [
      ...[
        ...data.entries,
        ...(data.draftEntries || []),
        ...(data.journalTemplates || []),
      ].flatMap((e) => e.lines.map((l) => l.accountId)),
      ...(data.financeAccounts || []).map((f) => f.accountId),
    ].filter(Boolean),
  );
  const blocked = removed.filter((a) => used.has(a.id));
  if (blocked.length)
    throw Error(
      "حسابات خارج القائمة مرتبطة ببيانات: " +
        blocked.map((a) => a.name).join("، "),
    );
  const suppliedNames = new Map(names.map((n) => [normalizeName(n), n]));
  return {
    removed,
    data: {
      ...data,
      accounts: plan.accounts
        .filter((a) => keep.has(a.id))
        .map((a) => ({
          ...a,
          name:
            suppliedNames.get(normalizeName(a.name)) &&
            !plan.accounts.some((c) => c.parentId === a.id)
              ? suppliedNames.get(normalizeName(a.name))
              : a.name,
        })),
    },
  };
}
