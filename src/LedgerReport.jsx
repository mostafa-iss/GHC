import React, { useMemo, useState } from "react";
import { Search, RotateCcw, Printer, Download, BookOpen } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { money } from "./accounting.js";
import { accountPath, sortAccounts } from "./chart.js";
import {
  ledgerReport,
  ledgerPeriodError,
  ledgerExportHeaders,
  ledgerExportRows,
} from "./ledgerReport.js";
import { exportReport } from "./exports.js";

export default function LedgerReport({
  data,
  filter,
  setFilter,
  onJournalOpen,
}) {
  const [mode, setMode] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const parents = useMemo(
    () => new Set(data.accounts.map((a) => a.parentId)),
    [data.accounts],
  );
  const options = useMemo(
    () =>
      sortAccounts(data.accounts).filter(
        (a) =>
          mode === "all" ||
          (mode === "main"
            ? !a.parentId || parents.has(a.id)
            : a.parentId && !parents.has(a.id)),
      ),
    [data.accounts, mode, parents],
  );
  const selected = data.accounts.find((a) => a.id === filter.accountId),
    periodError = ledgerPeriodError(filter);
  const report = useMemo(
    () => (periodError ? null : ledgerReport(data, filter)),
    [data, filter, periodError],
  );
  const period =
    !filter.from && !filter.to
      ? "جميع الفترات"
      : `${filter.from || "بداية التسجيل"} — ${filter.to || "بدون تاريخ نهاية"}`;
  const center =
    data.centers.find((c) => c.id === filter.centerId)?.name ||
    "جميع مراكز التكلفة";
  const set = (key, value) => setFilter({ ...filter, [key]: value });
  const reset = () => {
    setMode("all");
    setFilter({
      from: "",
      to: "",
      centerId: "",
      accountId: "",
      search: "",
      showAccounts: "all",
    });
    setError("");
  };
  async function download() {
    if (!selected || periodError) return;
    setBusy(true);
    setError("");
    try {
      await exportReport({
        title: "حساب الأستاذ",
        subtitle: `${selected.code} — ${selected.name} · ${period} · ${center} · SAR`,
        headers: ledgerExportHeaders,
        rows: ledgerExportRows(report, data.centers),
        filename: `ghc-ledger-${selected.code}.xlsx`,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ledger-report">
      <section className="card ledger-filters">
        <div className="ledger-filter-title">
          <Search size={17} />
          <h2>بحث وتصفية</h2>
          <button className="link" onClick={reset}>
            <RotateCcw size={14} />
            إلغاء الفلتر
          </button>
        </div>
        <div className="filter-grid">
          <label className="field">
            من تاريخ
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={filter.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <label className="field">
            إلى تاريخ
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={filter.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </label>
          <label className="field">
            نوع الحساب
            <select
              aria-label="نوع الحساب"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                set("accountId", "");
              }}
            >
              <option value="all">جميع أنواع الحسابات</option>
              <option value="main">حساب رئيسي</option>
              <option value="sub">حساب فرعي</option>
            </select>
          </label>
          <label className="field">
            الحساب
            <select
              aria-label="الحساب"
              value={filter.accountId}
              onChange={(e) => set("accountId", e.target.value)}
            >
              <option value="">اختر الحساب</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {"　".repeat(
                    Math.max(0, accountPath(data.accounts, a.id).length - 1),
                  )}
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            مركز التكلفة
            <select
              aria-label="مركز التكلفة"
              value={filter.centerId}
              onChange={(e) => set("centerId", e.target.value)}
            >
              <option value="">جميع مراكز التكلفة</option>
              {data.centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            عرض الحسابات
            <select
              aria-label="عرض الحسابات"
              value={filter.showAccounts || "all"}
              onChange={(e) => set("showAccounts", e.target.value)}
            >
              <option value="all">عرض جميع الحسابات الفرعية</option>
              <option value="active">حسابات لها رصيد أو حركة</option>
            </select>
          </label>
        </div>
        <div className="ledger-filter-footer">
          <span>المبالغ بالريال السعودي · القيود المرحّلة فقط</span>
          <div className="actions">
            <button
              disabled={!selected || !!periodError}
              onClick={() => window.print()}
            >
              <Printer size={16} />
              طباعة / PDF
            </button>
            <button
              disabled={busy || !selected || !!periodError}
              onClick={download}
            >
              <Download size={16} />
              {busy ? "جاري التصدير…" : "تصدير Excel"}
            </button>
          </div>
        </div>
      </section>
      {(error || periodError) && (
        <div className="error" role="alert">
          {periodError || error}
        </div>
      )}
      <section className="card ledger-document">
        <div className="report-title">
          <BrandLogo className="report-logo" />
          <h2>حساب الأستاذ</h2>
          <p>{period} · العملة: الريال السعودي (SAR)</p>
          {selected && (
            <p className="ledger-selected-account">
              {!selected.parentId || parents.has(selected.id)
                ? "الحساب الرئيسي"
                : "الحساب الفرعي"}
              : {selected.name} — {selected.code}
            </p>
          )}
          <p>{center}</p>
        </div>
        {!selected ? (
          <div className="ledger-empty">
            <BookOpen size={32} />
            <h3>اختر حسابًا لعرض حركته</h3>
            <p>الحساب الرئيسي يعرض كشفًا مستقلًا لكل حساب فرعي تحته.</p>
          </div>
        ) : (
          !periodError && (
            <>
              <div className="ledger-results-bar">
                <strong>{report.groups.length} حساب فرعي</strong>
                <span>{report.totals.count} حركة · رصيد مستقل لكل حساب</span>
              </div>
              <div className="table-scroll ledger-table-wrap">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th rowSpan="2" scope="col">
                        م
                      </th>
                      <th rowSpan="2" scope="col">
                        رقم القيد
                      </th>
                      <th rowSpan="2" scope="col">
                        التاريخ
                      </th>
                      <th rowSpan="2" scope="col">
                        الوصف
                      </th>
                      <th rowSpan="2" scope="col">
                        مركز التكلفة
                      </th>
                      <th colSpan="2" scope="colgroup">
                        الحركة (SAR)
                      </th>
                      <th colSpan="2" scope="colgroup">
                        الرصيد (SAR)
                      </th>
                    </tr>
                    <tr>
                      <th scope="col">مدين</th>
                      <th scope="col">دائن</th>
                      <th scope="col">مدين</th>
                      <th scope="col">دائن</th>
                    </tr>
                  </thead>
                  {report.groups.map((g) => (
                    <tbody
                      className="ledger-account-group"
                      data-account-id={g.account.id}
                      key={g.account.id}
                    >
                      <tr className="ledger-account-heading">
                        <th colSpan="9" scope="rowgroup">
                          <span>{g.account.name}</span>
                          <bdi>{g.account.code}</bdi>
                        </th>
                      </tr>
                      <tr className="ledger-opening">
                        <td colSpan="7">الرصيد قبل الفترة</td>
                        <td className="numeric">
                          {money(Math.max(g.opening, 0))}
                        </td>
                        <td className="numeric">
                          {money(Math.max(-g.opening, 0))}
                        </td>
                      </tr>
                      {g.rows.map((r, i) => (
                        <tr
                          className="ledger-line"
                          data-entry-id={r.entryId}
                          key={r.entryId + "-" + i}
                        >
                          <td>{i + 1}</td>
                          <td>
                            <button
                              className="link"
                              onClick={() =>
                                onJournalOpen(
                                  data.entries.find((e) => e.id === r.entryId),
                                )
                              }
                            >
                              #{r.number}
                            </button>
                          </td>
                          <td className="ledger-date">{r.date}</td>
                          <td className="ledger-description">
                            {r.description}
                          </td>
                          <td>
                            {data.centers.find((c) => c.id === r.centerId)
                              ?.name || "—"}
                          </td>
                          <td className="numeric">{money(r.debit)}</td>
                          <td className="numeric">{money(r.credit)}</td>
                          <td className="numeric">
                            {money(Math.max(r.balance, 0))}
                          </td>
                          <td className="numeric">
                            {money(Math.max(-r.balance, 0))}
                          </td>
                        </tr>
                      ))}
                      <tr className="ledger-account-total">
                        <td colSpan="5">المجموع — {g.account.name}</td>
                        <td className="numeric">{money(g.debit)}</td>
                        <td className="numeric">{money(g.credit)}</td>
                        <td className="numeric">
                          {money(Math.max(g.closing, 0))}
                        </td>
                        <td className="numeric">
                          {money(Math.max(-g.closing, 0))}
                        </td>
                      </tr>
                    </tbody>
                  ))}
                  <tfoot>
                    <tr>
                      <td colSpan="5">الإجمالي (SAR)</td>
                      <td className="numeric">{money(report.totals.debit)}</td>
                      <td className="numeric">{money(report.totals.credit)}</td>
                      <td className="numeric">
                        {money(report.totals.closingDebit)}
                      </td>
                      <td className="numeric">
                        {money(report.totals.closingCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!report.groups.length && (
                <div className="ledger-empty">
                  <p>لا توجد حسابات مطابقة للفلاتر المختارة.</p>
                </div>
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}
