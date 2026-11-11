import { postedEntries, ledger } from "./accounting.js";
export const sortAccounts = (accounts) =>
  [...accounts].sort((a, b) =>
    a.code.localeCompare(b.code, "en", { numeric: true }),
  );
export function chartModel(data) {
  const byId = new Map(data.accounts.map((a) => [a.id, a])),
    children = new Map(),
    balances = new Map(data.accounts.map((a) => [a.id, 0]));
  for (const a of sortAccounts(data.accounts)) {
    const parent = a.parentId || "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(a);
  }
  for (const e of postedEntries(data))
    for (const l of e.lines) {
      let a = byId.get(l.accountId);
      const seen = new Set();
      while (a && !seen.has(a.id)) {
        seen.add(a.id);
        balances.set(a.id, balances.get(a.id) + l.debit - l.credit);
        a = byId.get(a.parentId);
      }
    }
  return { byId, children, balances };
}
export function accountPath(accounts, id) {
  const byId = new Map(accounts.map((a) => [a.id, a])),
    path = [],
    seen = new Set();
  let a = byId.get(id);
  while (a && !seen.has(a.id)) {
    path.unshift(a);
    seen.add(a.id);
    a = byId.get(a.parentId);
  }
  return path;
}
export function accountMovement(data, accountId, filter = {}) {
  const all = ledger(data, { accountId });
  const opening = all
    .filter(
      (r) =>
        filter.from &&
        r.date < filter.from &&
        (!filter.to || r.date <= filter.to),
    )
    .reduce((s, r) => s + r.debit - r.credit, 0);
  const rows = all.filter(
    (r) =>
      (!filter.from || r.date >= filter.from) &&
      (!filter.to || r.date <= filter.to),
  );
  return {
    rows,
    opening,
    closing: rows.at(-1)?.balance ?? opening,
    debit: rows.reduce((s, r) => s + r.debit, 0),
    credit: rows.reduce((s, r) => s + r.credit, 0),
  };
}
export function accountDeletionError(data, id) {
  if (data.accounts.some((a) => a.parentId === id))
    return "لا يمكن حذف حساب له حسابات فرعية";
  if (
    [...data.entries, ...(data.draftEntries || [])].some((e) =>
      e.lines.some((l) => l.accountId === id),
    )
  )
    return "لا يمكن حذف حساب مرتبط بقيود أو مسودات";
  if (
    (data.journalTemplates || []).some((t) =>
      t.lines.some((l) => l.accountId === id),
    )
  )
    return "الحساب مستخدم في أحد قوالب القيود";
  if ((data.financeAccounts || []).some((f) => f.accountId === id))
    return "الحساب مرتبط بحساب مالي؛ عدّل الربط أولًا";
  return "";
}
export function nextAccountCode(accounts, parentId = "") {
  const parent = accounts.find((a) => a.id === parentId);
  let n = 1,
    code;
  do {
    code = parent ? parent.code + String(n++).padStart(3, "0") : String(n++);
  } while (accounts.some((a) => a.code === code));
  return code;
}
