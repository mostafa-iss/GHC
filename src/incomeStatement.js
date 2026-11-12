import { reportRows } from "./accounting.js";
import { isReportMonth, monthBounds } from "./financialReports.js";
export function reportMonths(from, to) {
  if (!isReportMonth(from) || !isReportMonth(to))
    throw Error("اختر شهرًا وسنة صحيحين.");
  if (from > to) throw Error("شهر البداية يجب أن يسبق شهر النهاية.");
  const index = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5)) - 1;
  const first = index(from),
    last = index(to);
  if (last - first >= 24)
    throw Error("اختر فترة لا تزيد عن 24 شهرًا لتسهيل قراءة التقرير.");
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const n = first + i;
    return (
      String(Math.floor(n / 12)).padStart(4, "0") +
      "-" +
      String((n % 12) + 1).padStart(2, "0")
    );
  });
}
export function incomeStatement(data, from, to, centerId = "") {
  const months = reportMonths(from, to);
  const periods = months.map((month) =>
    reportRows(data, { ...monthBounds(month), centerId }),
  );
  const sections = ["revenue", "expense"].map((type) => {
    const rows = data.accounts
      .filter(
        (a) =>
          a.type === type && !data.accounts.some((c) => c.parentId === a.id),
      )
      .map((a) => {
        const values = periods.map((period) => {
          const r = period.find((r) => r.id === a.id);
          return type === "revenue" ? r.credit - r.debit : r.debit - r.credit;
        });
        return { ...a, values, total: values.reduce((s, n) => s + n, 0) };
      })
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    const values = months.map((_, i) =>
      rows.reduce((sum, r) => sum + r.values[i], 0),
    );
    return { type, rows, values, total: values.reduce((s, n) => s + n, 0) };
  });
  const values = months.map(
    (_, i) => sections[0].values[i] - sections[1].values[i],
  );
  return { months, sections, values, total: values.reduce((s, n) => s + n, 0) };
}
export function incomeExport(report, monthly) {
  return {
    headers: [
      "كود الحساب",
      "الحساب / البيان",
      ...(monthly ? report.months.map((m) => `قيمة ${m} (ر.س)`) : []),
      "إجمالي الفترة (ر.س)",
    ],
    rows: [
      ...report.sections.flatMap((s) => [
        ["", s.type === "revenue" ? "الإيرادات" : "المصروفات"],
        ...s.rows.map((r) => [
          r.code,
          r.name,
          ...(monthly ? r.values.map((n) => n / 100) : []),
          r.total / 100,
        ]),
        [
          "",
          s.type === "revenue" ? "إجمالي الإيرادات" : "إجمالي المصروفات",
          ...(monthly ? s.values.map((n) => n / 100) : []),
          s.total / 100,
        ],
      ]),
      [
        "",
        "صافي الربح / الخسارة",
        ...(monthly ? report.values.map((n) => n / 100) : []),
        report.total / 100,
      ],
    ],
  };
}
