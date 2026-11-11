import { descendants, postedEntries } from "./accounting.js";
import { isReportDate } from "./financialReports.js";

export function ledgerPeriodError({ from = "", to = "" }) {
  if ((from && !isReportDate(from)) || (to && !isReportDate(to)))
    return "اختر تاريخًا صحيحًا لعرض حساب الأستاذ";
  return from && to && from > to
    ? "تاريخ البداية يجب أن يسبق تاريخ النهاية"
    : "";
}
export function ledgerReport(data, filter = {}) {
  const error = ledgerPeriodError(filter);
  if (error) throw Error(error);
  const ids = filter.accountId
    ? descendants(data.accounts, filter.accountId)
    : new Set();
  const parents = new Set(data.accounts.map((a) => a.parentId));
  const accounts = data.accounts
    .filter((a) => a.parentId && ids.has(a.id) && !parents.has(a.id))
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  const byId = new Map(
    accounts.map((account) => [
      account.id,
      { account, opening: 0, debit: 0, credit: 0, closing: 0, rows: [] },
    ]),
  );
  for (const e of [...postedEntries(data)].sort(
    (a, b) => a.date.localeCompare(b.date) || a.number - b.number,
  )) {
    if (filter.to && e.date > filter.to) continue;
    for (const l of e.lines) {
      const group = byId.get(l.accountId);
      if (!group || (filter.centerId && l.centerId !== filter.centerId))
        continue;
      group.closing += l.debit - l.credit;
      if (filter.from && e.date < filter.from)
        group.opening += l.debit - l.credit;
      else {
        group.debit += l.debit;
        group.credit += l.credit;
        group.rows.push({
          ...l,
          entryId: e.id,
          number: e.number,
          date: e.date,
          description: l.description || e.description,
          balance: group.closing,
        });
      }
    }
  }
  const groups = [...byId.values()].filter(
    (g) => filter.showAccounts !== "active" || g.opening || g.rows.length,
  );
  const totals = groups.reduce(
    (t, g) => ({
      debit: t.debit + g.debit,
      credit: t.credit + g.credit,
      openingDebit: t.openingDebit + Math.max(g.opening, 0),
      openingCredit: t.openingCredit + Math.max(-g.opening, 0),
      closingDebit: t.closingDebit + Math.max(g.closing, 0),
      closingCredit: t.closingCredit + Math.max(-g.closing, 0),
      count: t.count + g.rows.length,
    }),
    {
      debit: 0,
      credit: 0,
      openingDebit: 0,
      openingCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
      count: 0,
    },
  );
  return { groups, totals };
}
export const ledgerExportHeaders = [
  "الحساب / الكود",
  "التاريخ",
  "رقم القيد",
  "الوصف",
  "مركز التكلفة",
  "الحركة — مدين (SAR)",
  "الحركة — دائن (SAR)",
  "الرصيد — مدين (SAR)",
  "الرصيد — دائن (SAR)",
];
export function ledgerExportRows(report, centers = []) {
  const rows = [];
  for (const g of report.groups) {
    const label = g.account.code + " — " + g.account.name;
    rows.push([
      label,
      "",
      "",
      "رصيد أول المدة",
      "",
      "",
      "",
      Math.max(g.opening, 0) / 100,
      Math.max(-g.opening, 0) / 100,
    ]);
    rows.push(
      ...g.rows.map((r) => [
        label,
        r.date,
        r.number,
        r.description,
        centers.find((c) => c.id === r.centerId)?.name || "—",
        r.debit / 100,
        r.credit / 100,
        Math.max(r.balance, 0) / 100,
        Math.max(-r.balance, 0) / 100,
      ]),
    );
    rows.push([
      label,
      "",
      "",
      "المجموع",
      "",
      g.debit / 100,
      g.credit / 100,
      Math.max(g.closing, 0) / 100,
      Math.max(-g.closing, 0) / 100,
    ]);
  }
  const t = report.totals;
  rows.push([
    "",
    "",
    "",
    "الإجمالي (SAR)",
    "",
    t.debit / 100,
    t.credit / 100,
    t.closingDebit / 100,
    t.closingCredit / 100,
  ]);
  return rows;
}
