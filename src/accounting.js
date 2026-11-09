export const types = {
  asset: "الأصول",
  liability: "الالتزامات",
  equity: "حقوق الملكية",
  revenue: "الإيرادات",
  expense: "المصروفات",
};
export const money = (n) =>
  new Intl.NumberFormat("en-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n / 100);
export function cents(v) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(v)))
    throw Error("أدخل مبلغًا موجبًا بحد أقصى منزلتين عشريتين");
  return Math.round(Number(v) * 100);
}
export function validateEntry(e, accounts, centers) {
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !e.description?.trim())
    throw Error("التاريخ وبيان القيد مطلوبان");
  if (e.lines.length < 2) throw Error("أضف طرفين على الأقل");
  let d = 0,
    c = 0;
  for (const l of e.lines) {
    if (
      !accounts.some(
        (a) =>
          a.id === l.accountId && !accounts.some((x) => x.parentId === a.id),
      )
    )
      throw Error("اختر حسابًا فرعيًا صالحًا لكل سطر");
    if (l.centerId && !centers.some((x) => x.id === l.centerId))
      throw Error("مركز التكلفة غير موجود");
    if (
      !Number.isSafeInteger(l.debit) ||
      !Number.isSafeInteger(l.credit) ||
      l.debit < 0 ||
      l.credit < 0 ||
      (!l.debit && !l.credit) ||
      (l.debit && l.credit)
    )
      throw Error("كل سطر يحتاج مبلغًا في المدين أو الدائن فقط");
    d += l.debit;
    c += l.credit;
  }
  if (d !== c || !d)
    throw Error("القيد غير متوازن: المدين يجب أن يساوي الدائن");
  return true;
}
export function descendants(accounts, id) {
  const out = new Set([id]);
  let n;
  do {
    n = out.size;
    accounts.forEach((a) => {
      if (out.has(a.parentId)) out.add(a.id);
    });
  } while (n !== out.size);
  return out;
}
export function reportRows(
  data,
  { from = "", to = "", centerId = "", accountId = "" } = {},
) {
  const ids = accountId ? descendants(data.accounts, accountId) : null;
  return data.accounts
    .filter((a) => !ids || ids.has(a.id))
    .map((a) => {
      let opening = 0,
        debit = 0,
        credit = 0;
      for (const e of data.entries) {
        if (to && e.date > to) continue;
        for (const l of e.lines) {
          if (l.accountId !== a.id || (centerId && l.centerId !== centerId))
            continue;
          if (from && e.date < from) opening += l.debit - l.credit;
          else {
            debit += l.debit;
            credit += l.credit;
          }
        }
      }
      return {
        ...a,
        opening,
        debit,
        credit,
        closing: opening + debit - credit,
      };
    });
}
export function ledger(data, filter) {
  const ids = filter.accountId
    ? descendants(data.accounts, filter.accountId)
    : new Set();
  let balance = 0;
  const rows = [];
  for (const e of [...data.entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.number - b.number,
  )) {
    if (filter.to && e.date > filter.to) continue;
    for (const l of e.lines) {
      if (
        !ids.has(l.accountId) ||
        (filter.centerId && l.centerId !== filter.centerId)
      )
        continue;
      balance += l.debit - l.credit;
      if (!filter.from || e.date >= filter.from)
        rows.push({
          ...l,
          date: e.date,
          number: e.number,
          entryId: e.id,
          description: l.description || e.description,
          balance,
        });
    }
  }
  return rows;
}
export function seed() {
  const roots = Object.entries(types).map(([type, name], i) => ({
    id: type,
    code: String(i + 1),
    name,
    type,
    parentId: "",
  }));
  return {
    accounts: [
      ...roots,
      {
        id: "cash",
        code: "1101",
        name: "الصندوق",
        type: "asset",
        parentId: "asset",
      },
      {
        id: "bank",
        code: "1102",
        name: "البنك",
        type: "asset",
        parentId: "asset",
      },
      {
        id: "capital",
        code: "3101",
        name: "رأس المال",
        type: "equity",
        parentId: "equity",
      },
      {
        id: "courses",
        code: "4101",
        name: "إيرادات الدورات التعليمية",
        type: "revenue",
        parentId: "revenue",
      },
      {
        id: "teachers",
        code: "5101",
        name: "أجور المعلمين",
        type: "expense",
        parentId: "expense",
      },
      {
        id: "rent",
        code: "5102",
        name: "الإيجار",
        type: "expense",
        parentId: "expense",
      },
    ],
    centers: [],
    entries: [],
  };
}
