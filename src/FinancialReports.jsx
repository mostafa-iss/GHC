import React, { useMemo, useState } from "react";
import { Download, Printer, CheckCircle2, AlertCircle } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { money, types } from "./accounting.js";
import {
  balanceSheet,
  monthlyComparison,
  previousMonth,
  isReportMonth,
  isReportDate,
} from "./financialReports.js";
import { exportReport } from "./exports.js";
const today = () => new Date().toLocaleDateString("en-CA");
export default function FinancialReports({ kind, data, onAccountOpen }) {
  const [date, setDate] = useState(today()),
    [month, setMonth] = useState(today().slice(0, 7)),
    [compare, setCompare] = useState(previousMonth(today().slice(0, 7))),
    [center, setCenter] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const isBalance = kind === "balance",
    validDate = isReportDate(date),
    validMonth = isReportMonth(month),
    validCompare = isReportMonth(compare),
    periodError = isBalance
      ? validDate
        ? ""
        : "اختر تاريخًا صحيحًا لعرض قائمة المركز المالي."
      : validMonth && validCompare
        ? ""
        : "اختر شهرًا وسنة صحيحين في الخانتين لعرض المقارنة (السنة من 0001 إلى 9999).";
  const balance = useMemo(
    () => (isBalance && validDate ? balanceSheet(data, date) : null),
    [data, date, isBalance, validDate],
  );
  const comparison = useMemo(
    () =>
      !isBalance && validMonth && validCompare
        ? monthlyComparison(data, month, compare, center)
        : null,
    [data, month, compare, center, isBalance, validMonth, validCompare],
  );
  const title = isBalance ? "قائمة المركز المالي" : "المقارنة الشهرية";
  const subtitle = isBalance
    ? `حتى ${date}`
    : `${month} مقارنة بـ ${compare} · ${data.centers.find((c) => c.id === center)?.name || "جميع مراكز التكلفة"}`;
  const percent = (r) => (r.percent == null ? "—" : `${r.percent.toFixed(1)}%`);
  async function download() {
    if (periodError) return;
    setBusy(true);
    setError("");
    try {
      let headers, rows;
      if (isBalance) {
        headers = ["الكود", "الحساب / البيان", "القيمة (SAR)"];
        rows = [];
        for (const section of balance.sections) {
          rows.push(["", types[section.type], ""]);
          rows.push(
            ...section.rows.map((r) => [r.code, r.name, r.amount / 100]),
          );
          rows.push(["", "إجمالي " + types[section.type], section.total / 100]);
        }
        rows.push(
          ["", "نتيجة النشاط غير المقفلة", balance.result / 100],
          ["", "حقوق الملكية شاملة نتيجة النشاط", balance.equity / 100],
          [
            "",
            "الالتزامات وحقوق الملكية",
            (balance.liabilities + balance.equity) / 100,
          ],
          ["", "فرق الميزانية", balance.difference / 100],
        );
      } else {
        headers = [
          "الكود",
          "الحساب / البيان",
          `القيمة ${month}`,
          `القيمة ${compare}`,
          "فرق القيمة",
          "نسبة التغير",
        ];
        rows = [
          ...comparison.summary.map((r) => [
            "",
            r.label,
            r.current / 100,
            r.previous / 100,
            r.change / 100,
            percent(r),
          ]),
          ...comparison.accounts.map((r) => [
            r.code,
            r.name,
            r.current / 100,
            r.previous / 100,
            r.change / 100,
            percent(r),
          ]),
        ];
      }
      await exportReport({
        title,
        subtitle,
        headers,
        rows,
        filename: `ghc-${kind}-${today()}.xlsx`,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const changeCells = (r) => (
    <>
      <td className="numeric">{money(r.current)}</td>
      <td className="numeric">{money(r.previous)}</td>
      <td className="numeric">{money(r.change)}</td>
      <td className="numeric">{percent(r)}</td>
    </>
  );
  return (
    <div className="financial-report-view">
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="report-controls card">
        <div className="filter-grid">
          {isBalance ? (
            <label className="field">
              حتى تاريخ
              <input
                aria-label="تاريخ المركز المالي"
                aria-invalid={!validDate}
                aria-describedby={
                  periodError ? "report-period-error" : undefined
                }
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="field">
                الشهر الأساسي
                <input
                  aria-label="الشهر الأساسي"
                  aria-invalid={!validMonth}
                  aria-describedby={
                    periodError ? "report-period-error" : undefined
                  }
                  type="month"
                  min="0001-01"
                  max="9999-12"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </label>
              <label className="field">
                شهر المقارنة
                <input
                  aria-label="شهر المقارنة"
                  aria-invalid={!validCompare}
                  aria-describedby={
                    periodError ? "report-period-error" : undefined
                  }
                  type="month"
                  min="0001-01"
                  max="9999-12"
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                />
              </label>
              <label className="field">
                مركز التكلفة
                <select
                  aria-label="مركز تكلفة المقارنة"
                  value={center}
                  onChange={(e) => setCenter(e.target.value)}
                >
                  <option value="">جميع مراكز التكلفة</option>
                  {data.centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        <div className="actions">
          <button
            onClick={() => window.print()}
            disabled={Boolean(periodError)}
          >
            <Printer size={16} />
            طباعة / PDF
          </button>
          <button onClick={download} disabled={busy || Boolean(periodError)}>
            <Download size={16} />
            {busy ? "جاري التصدير…" : "تصدير Excel"}
          </button>
        </div>
      </div>
      {periodError ? (
        <section className="card empty" id="report-period-error" role="alert">
          <AlertCircle size={24} />
          <p>{periodError}</p>
        </section>
      ) : (
        <section className="card">
          <div className="report-title">
            <BrandLogo className="report-logo" />
            <h2>{title}</h2>
            <p>{subtitle} · SAR</p>
          </div>
          {isBalance ? (
            <>
              {balance.sections.map((section) => (
                <div key={section.type}>
                  <h3 className="report-section">{types[section.type]}</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>الحساب</th>
                          <th>القيمة (ر.س)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <button
                                className="link"
                                onClick={() => onAccountOpen(r.id)}
                              >
                                {r.code} — {r.name}
                              </button>
                            </td>
                            <td className="numeric">{money(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>إجمالي {types[section.type]}</td>
                          <td className="numeric">{money(section.total)}</td>
                        </tr>
                        {section.type === "equity" && (
                          <>
                            <tr>
                              <td>نتيجة النشاط غير المقفلة حتى التاريخ</td>
                              <td className="numeric">
                                {money(balance.result)}
                              </td>
                            </tr>
                            <tr>
                              <td>حقوق الملكية شاملة نتيجة النشاط</td>
                              <td className="numeric">
                                {money(balance.equity)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
              <div className="net-income">
                <strong>الالتزامات وحقوق الملكية</strong>
                <strong className="numeric">
                  {money(balance.liabilities + balance.equity)} ر.س
                </strong>
              </div>
              <div
                className={
                  "balance-check " +
                  (balance.difference ? "unbalanced" : "balanced")
                }
              >
                {balance.difference ? (
                  <AlertCircle size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}{" "}
                {balance.difference
                  ? `فرق الميزانية: ${money(balance.difference)} ر.س`
                  : "الأصول = الالتزامات + حقوق الملكية"}
              </div>
            </>
          ) : (
            <>
              <div className="comparison-chart">
                {comparison.summary.slice(0, 2).map((r) => {
                  const max = Math.max(
                    1,
                    Math.abs(r.current),
                    Math.abs(r.previous),
                  );
                  return (
                    <div key={r.label}>
                      <h3>{r.label}</h3>
                      {[
                        [month, r.current],
                        [compare, r.previous],
                      ].map(([label, value], i) => (
                        <div className="comparison-bar" key={i}>
                          <span>{label}</span>
                          <div>
                            <i
                              className={i ? "previous" : ""}
                              style={{
                                width: (Math.abs(value) / max) * 100 + "%",
                              }}
                            />
                          </div>
                          <b className="numeric">{money(value)}</b>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>البيان / الحساب</th>
                      <th>{month}</th>
                      <th>{compare}</th>
                      <th>الفرق (ر.س)</th>
                      <th>التغير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.summary.map((r) => (
                      <tr className="group-row" key={r.label}>
                        <td>{r.label}</td>
                        {changeCells(r)}
                      </tr>
                    ))}
                    {comparison.accounts.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button
                            className="link"
                            onClick={() => onAccountOpen(r.id)}
                          >
                            {r.code} — {r.name}
                          </button>
                        </td>
                        {changeCells(r)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="report-note">
                النسبة غير محسوبة عندما تكون قيمة شهر المقارنة صفرًا. المسودات
                مستبعدة من التقرير.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
