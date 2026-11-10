import React, { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Save } from "lucide-react";
import { money } from "./accounting";
import {
  readWorkbook,
  extractWorkbook,
  planJournalImport,
  applyImport,
} from "./importer";
export default function ImportPanel({ data, busy, onSave }) {
  const [file, setFile] = useState(null),
    [extracted, setExtracted] = useState(null),
    [plan, setPlan] = useState(null),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [asDraft, setAsDraft] = useState(true),
    [partial, setPartial] = useState(false),
    [show, setShow] = useState("error");
  useEffect(() => {
    if (!extracted) return;
    let active = true;
    setReading(true);
    planJournalImport(extracted, data)
      .then((p) => {
        if (active) setPlan(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [data]);
  async function pick(f) {
    if (!f) return;
    setReading(true);
    setError("");
    setPlan(null);
    setPartial(false);
    try {
      if (!f.name.toLowerCase().endsWith(".xlsx"))
        throw Error("اختر ملف Excel بصيغة XLSX");
      const x = extractWorkbook(await readWorkbook(f));
      const p = await planJournalImport(x, data);
      setFile(f);
      setExtracted(x);
      setPlan(p);
      setShow(
        p.errors.length ? "error" : p.ready.length ? "ready" : "duplicate",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  }
  const canSave =
    plan &&
    !reading &&
    !busy &&
    (plan.ready.length > 0 || plan.linkUpdates.length > 0) &&
    (!plan.errors.length || partial);
  return (
    <div className="import-panel">
      <div className="import-notice">
        <FileSpreadsheet size={22} />
        <div>
          <strong>استيراد القيود اليومية</strong>
          <p>
            اختر ملف القيود؛ الحسابات تُربط بشجرة الحسابات الموجودة بدون
            تغييرها. أي حساب غير موجود يظهر في المراجعة قبل الحفظ.
          </p>
        </div>
      </div>
      <label className="upload">
        <Upload size={24} />
        <strong>{file?.name || "اختر ملف القيود"}</strong>
        <span>XLSX · حد أقصى 5 ميجابايت</span>
        <input
          aria-label="ملف Excel"
          type="file"
          accept=".xlsx"
          disabled={reading || busy}
          onChange={(e) => pick(e.target.files[0])}
        />
      </label>
      {reading && (
        <p role="status" className="import-loading">
          جاري مراجعة القيود وربط الحسابات…
        </p>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {plan && (
        <>
          <label className="field import-status">
            حالة القيود بعد الاستيراد
            <select
              aria-label="حالة القيود بعد الاستيراد"
              value={asDraft ? "draft" : "posted"}
              onChange={(e) => setAsDraft(e.target.value === "draft")}
            >
              <option value="draft">مسودات — لا تؤثر في الحسابات</option>
              <option value="posted">مرحّلة — تؤثر في الحسابات فورًا</option>
            </select>
          </label>
          <div className="import-stats journals-only">
            <span className="balanced">
              <strong>{plan.ready.length}</strong>قيد صالح
            </span>
            <span className="danger">
              <strong>{plan.errors.length}</strong>مجموعة صفوف تحتاج مراجعة
            </span>
            <span>
              <strong>{plan.duplicates.length}</strong>قيد سبق استيراده
            </span>
          </div>
          {plan.linked.length > 0 && (
            <div className="import-notice">
              روابط المستندات موجودة في {plan.linked.length} مجموعة قيود.{" "}
              {plan.linkUpdates.length > 0 &&
                `سيتم استكمال روابط ${plan.linkUpdates.length} قيد محفوظ بدون تكراره أو تغيير مبالغه.`}
            </div>
          )}
          <div className="import-notice">
            <AlertCircle size={19} />
            <div>
              <strong>معاينة قبل الحفظ</strong>
              <p>
                القيود بدون رقم تُجمع من الأسطر المتتالية حتى تتوازن. الصف
                الفارغ ينهي المجموعة. التاريخ واختيار حساب فرعي صحيح وتوازن
                القيد مطلوبة؛ لا تُضاف فروق أو مبالغ تلقائيًا.
              </p>
            </div>
          </div>
          <div className="import-tabs">
            {[
              ["error", "تحتاج مراجعة", plan.errors.length],
              ["ready", "صالحة للاستيراد", plan.ready.length],
              ["duplicate", "مستوردة مسبقًا", plan.duplicates.length],
            ].map(([key, title, count]) => (
              <button
                type="button"
                key={key}
                className={show === key ? "primary" : ""}
                onClick={() => setShow(key)}
              >
                {title} ({count})
              </button>
            ))}
          </div>
          <div className="table-scroll import-preview">
            <table>
              <thead>
                <tr>
                  <th>صفوف Excel</th>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>روابط المستندات</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {plan.groups
                  .filter((g) => g.status === show)
                  .map((g, i) => (
                    <tr key={i}>
                      <td>{g.rows.join("، ")}</td>
                      <td>{g.entry?.date || "—"}</td>
                      <td>{g.entry?.description || "سطر غير مكتمل"}</td>
                      <td className="numeric">{money(g.debit)}</td>
                      <td className="numeric">{money(g.credit)}</td>
                      <td>
                        <div className="document-chips">
                          {g.entry?.documentLinks?.map((d, i) => (
                            <a
                              key={d.url}
                              href={d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              مستند {i + 1}
                            </a>
                          ))}
                        </div>
                      </td>
                      <td>
                        {g.errors.length
                          ? g.errors.join("؛ ")
                          : g.status === "duplicate"
                            ? "تم استيراده سابقًا"
                            : g.warnings.join("؛ ") || "صالح"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!plan.groups.some((g) => g.status === show) && (
              <p className="import-loading">لا توجد صفوف في هذه الفئة.</p>
            )}
          </div>
          {plan.errors.length > 0 && (
            <label className="partial-confirm">
              <input
                type="checkbox"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
              />
              أوافق على استيراد القيود السليمة فقط وترك مجموعات الصفوف غير
              الصالحة ({plan.errors.length}) دون حفظ.
            </label>
          )}
          {plan.warnings.length > 0 && (
            <p className="muted">
              {plan.warnings.length} قيد يحتوي مبالغ مقربة إلى هللتين، مع
              الاحتفاظ بالقيم الأصلية.
            </p>
          )}
          <div className="modal-footer">
            <span className="muted">شجرة الحسابات الحالية لن تتغير.</span>
            <button
              type="button"
              className="primary"
              disabled={!canSave}
              onClick={() => {
                setError("");
                try {
                  const next = applyImport(plan, data, {
                    allowPartial: partial,
                    fileName: file.name,
                    asDraft,
                  });
                  onSave(next, {
                    entries:
                      next.entries.length -
                      data.entries.length +
                      (next.draftEntries?.length || 0) -
                      (data.draftEntries?.length || 0),
                    asDraft,
                    linkUpdates: plan.linkUpdates.length,
                  });
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <Save size={17} />
              {busy
                ? "جاري الحفظ…"
                : plan.ready.length || !plan.linkUpdates.length
                  ? `تأكيد استيراد ${plan.ready.length} قيد`
                  : `حفظ روابط ${plan.linkUpdates.length} قيد`}
            </button>
          </div>
          <p className="muted">
            الاستيراد لا يحذف القيود الموجودة، ويتجاوز ما سبق استيراده. روابط
            Drive تُعرض بجوار الملفات في مرفقات القيد، وتظل ملفاتها بصلاحياتها
            الأصلية.
          </p>
        </>
      )}
    </div>
  );
}
