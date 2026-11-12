import { reportRows } from "./accounting.js";
export function balanceSheet(data, to) {
  const rows = reportRows(data, { to });
  const sections = ["asset", "liability", "equity"].map((type) => ({
    type,
    rows: rows
      .filter(
        (r) =>
          r.type === type &&
          !r.isGroup &&
          !data.accounts.some((a) => a.parentId === r.id),
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
export function isReportMonth(value) {
  return (
    typeof value === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)
  );
}
export function isReportDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isReportMonth(value.slice(0, 7)) &&
    value >= value.slice(0, 7) + "-01" &&
    value <= monthBounds(value.slice(0, 7)).to
  );
}
export function monthBounds(month) {
  if (!isReportMonth(month)) throw Error("اختر شهرًا صحيحًا");
  const [y, m] = month.split("-").map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return {
    from: month + "-01",
    to: month + "-" + days[m - 1],
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
          !r.isGroup &&
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
