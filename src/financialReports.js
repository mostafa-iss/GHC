import { reportRows } from "./accounting.js";
export function balanceSheet(data, to) {
  const rows = reportRows(data, { to });
  const sections = ["asset", "liability", "equity"].map((type) => ({
    type,
    rows: rows
      .filter(
        (r) =>
          r.type === type && !data.accounts.some((a) => a.parentId === r.id),
      )
      .map((r) => ({
        ...r,
        amount: type === "asset" ? r.closing : -r.closing,
      })),
  }));
  const result = rows
    .filter((r) => ["revenue", "expense"].includes(r.type))
    .reduce((sum, r) => sum - r.closing, 0);
  for (const section of sections)
    section.total = section.rows.reduce((sum, r) => sum + r.amount, 0);
  const [assets, liabilities, equity] = sections;
  return {
    sections,
    result,
    assets: assets.total,
    liabilities: liabilities.total,
    equity: equity.total + result,
    difference: assets.total - liabilities.total - equity.total - result,
  };
}
export function monthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("اختر شهرًا صحيحًا");
  const [y, m] = month.split("-").map(Number);
  return {
    from: month + "-01",
    to: month + "-" + new Date(Date.UTC(y, m, 0)).getUTCDate(),
  };
}
export function previousMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}
export function monthlyComparison(data, first, second, centerId = "") {
  const period = (month) => {
    const rows = reportRows(data, { ...monthBounds(month), centerId });
    const revenue = rows
      .filter((r) => r.type === "revenue")
      .reduce((s, r) => s + r.credit - r.debit, 0);
    const expense = rows
      .filter((r) => r.type === "expense")
      .reduce((s, r) => s + r.debit - r.credit, 0);
    return { revenue, expense, net: revenue - expense, rows };
  };
  const a = period(first),
    b = period(second);
  const change = (current, previous) => ({
    current,
    previous,
    change: current - previous,
    percent:
      previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100,
  });
  return {
    summary: [
      { label: "الإيرادات", ...change(a.revenue, b.revenue) },
      { label: "المصروفات", ...change(a.expense, b.expense) },
      { label: "صافي الدخل", ...change(a.net, b.net) },
    ],
    accounts: a.rows
      .filter(
        (r) =>
          ["revenue", "expense"].includes(r.type) &&
          !data.accounts.some((c) => c.parentId === r.id),
      )
      .map((r) => {
        const old = b.rows.find((x) => x.id === r.id);
        const sign = r.type === "revenue" ? -1 : 1;
        return {
          ...r,
          ...change(
            sign * (r.debit - r.credit),
            sign * (old.debit - old.credit),
          ),
        };
      }),
  };
}
