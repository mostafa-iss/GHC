import React, { useMemo, useState } from "react";
import { Download, Printer, ChevronDown, ChevronLeft } from "lucide-react";
import BrandLogo from "./BrandLogo.jsx";
import { money, types } from "./accounting.js";
import { incomeStatement, incomeExport } from "./incomeStatement.js";
import { exportReport } from "./exports.js";
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (m) =>
  new Intl.DateTimeFormat("ar-SA", {
    month: "long",
    year: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(`${m}-15T12:00:00Z`));
export default function IncomeStatement({ data, onAccountOpen }) {
  const [from, setFrom] = useState(currentMonth),
    [to, setTo] = useState(currentMonth);
  const [mode, setMode] = useState("monthly"),
    [center, setCenter] = useState("");
  const [collapsed, setCollapsed] = useState({}),
    [hideZero, setHideZero] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const result = useMemo(() => {
    try {
      return { report: incomeStatement(data, from, to, center) };
    } catch (e) {
      return { invalid: e.message };
    }
  }, [data, from, to, center]);
  const { report, invalid } = result,
    monthly = mode === "monthly";
  const subtitle = report
    ? `${monthLabel(from)} — ${monthLabel(to)} · ${data.centers.find((c) => c.id === center)?.name || "جميع مراكز التكلفة"}`
    : "";
  const visibleReport = report && {
    ...report,
    sections: report.sections.map((s) => ({
      ...s,
      rows: s.rows.filter((r) => !hideZero || r.values.some(Boolean)),
    })),
  };
  const cells = (r) => (
    <>
      {monthly &&
        r.values.map((v, i) => (
          <td className="numeric" key={report.months[i]}>
            {money(v)}
          </td>
        ))}
      <td className="numeric income-total">{money(r.total)}</td>
    </>
  );
  async function download() {
    setError("");
    setBusy(true);
    try {
      await exportReport({
        title: "قائمة الدخل",
        subtitle,
        ...incomeExport(visibleReport, monthly),
        filename: `ghc-income-${from}-${to}.xlsx`,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="income-view">
      <section className="card income-controls">
        <div className="income-toolbar">
          <div>
            <h2>فترة التقرير</h2>
            <p>اختر الفترة وطريقة العرض المناسبة لمراجعة نتائج النشاط.</p>
          </div>
          <div
            className="income-modes"
            role="group"
            aria-label="طريقة عرض قائمة الدخل"
          >
            <button aria-pressed={!monthly} onClick={() => setMode("total")}>
              عرض مجمّع
            </button>
            <button aria-pressed={monthly} onClick={() => setMode("monthly")}>
              أعمدة شهرية
            </button>
          </div>
        </div>
        <div className="filter-grid">
          <label className="field">
            من شهر
            <input
              type="month"
              min="0001-01"
              max="9999-12"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-invalid={Boolean(invalid)}
            />
          </label>
          <label className="field">
            إلى شهر
            <input
              type="month"
              min="0001-01"
              max="9999-12"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={Boolean(invalid)}
            />
          </label>
          <label className="field">
            مركز التكلفة
            <select value={center} onChange={(e) => setCenter(e.target.value)}>
              <option value="">جميع مراكز التكلفة</option>
              {data.centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="income-toolbar income-actions">
          <label className="income-check">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
            />
            إخفاء الحسابات بدون حركة
          </label>
          <div className="actions">
            <button disabled={Boolean(invalid)} onClick={() => window.print()}>
              <Printer size={16} />
              طباعة / PDF
            </button>
            <button
              className="primary"
              disabled={busy || Boolean(invalid)}
              onClick={download}
            >
              <Download size={16} />
              {busy ? "جاري التصدير…" : "تصدير Excel"}
            </button>
          </div>
        </div>
      </section>
      {(error || invalid) && (
        <div className="error" role="alert">
          {error || invalid}
        </div>
      )}
      {report && (
        <>
          <div className="income-summary">
            {[
              ...report.sections.map((s) => ({
                label: `إجمالي ${types[s.type]}`,
                total: s.total,
              })),
              { label: "صافي الربح / الخسارة", total: report.total },
            ].map((r, i) => (
              <div
                className={"card " + (i === 2 ? "income-net" : "")}
                key={r.label}
              >
                <span>{r.label}</span>
                <strong className="numeric">
                  {money(r.total)} <small>ر.س</small>
                </strong>
              </div>
            ))}
          </div>
          <section className="card income-paper">
            <div className="report-title">
              <BrandLogo className="report-logo" />
              <span className="income-eyebrow">
                GHC ACADEMY · التقارير المالية
              </span>
              <h2>قائمة الدخل</h2>
              <p>{subtitle}</p>
              <span className="income-currency">
                جميع المبالغ بالريال السعودي · SAR
              </span>
            </div>
            {!data.accounts.length && (
              <p className="income-empty">
                ابدأ بإضافة شجرة حساباتك من «شجرة الحسابات». ستظهر نتائج نشاطك
                هنا بعد ترحيل القيود.
              </p>
            )}
            <div
              className="table-scroll income-scroll"
              tabIndex={0}
              role="region"
              aria-label="جدول قائمة الدخل الشهرية"
            >
              <table className="income-table">
                <thead>
                  <tr>
                    <th scope="col">الحساب / البيان</th>
                    {monthly &&
                      report.months.map((m) => (
                        <th scope="col" key={m}>
                          {monthLabel(m)}
                        </th>
                      ))}
                    <th scope="col" className="income-total">
                      إجمالي الفترة
                    </th>
                  </tr>
                </thead>
                {visibleReport.sections.map((s) => (
                  <tbody key={s.type}>
                    <tr className="income-section">
                      <th scope="row">
                        <button
                          aria-expanded={!collapsed[s.type]}
                          onClick={() =>
                            setCollapsed({
                              ...collapsed,
                              [s.type]: !collapsed[s.type],
                            })
                          }
                        >
                          {collapsed[s.type] ? (
                            <ChevronLeft size={15} />
                          ) : (
                            <ChevronDown size={15} />
                          )}{" "}
                          {types[s.type]} <small>{s.rows.length}</small>
                        </button>
                        <span className="income-print-label">
                          {types[s.type]}
                        </span>
                      </th>
                      {cells(s)}
                    </tr>
                    {s.rows.map((r) => (
                      <tr
                        key={r.id}
                        className={collapsed[s.type] ? "income-collapsed" : ""}
                      >
                        <th scope="row">
                          <button
                            className="link"
                            onClick={() => onAccountOpen(r.id)}
                          >
                            <span className="income-code">{r.code}</span>
                            {r.name}
                          </button>
                        </th>
                        {cells(r)}
                      </tr>
                    ))}
                    <tr className="income-subtotal">
                      <th scope="row">إجمالي {types[s.type]}</th>
                      {cells(s)}
                    </tr>
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <th scope="row">صافي الربح / الخسارة</th>
                    {cells(report)}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="income-footnote">
              <span>القيود المرحّلة فقط · المسودات مستبعدة</span>
              <span>
                {report.months.length} شهر ·{" "}
                {monthly ? "تفصيل شهري" : "إجمالي الفترة"}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
