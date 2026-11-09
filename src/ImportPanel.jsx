import React, { useState, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Download,
  Save,
} from "lucide-react";
import { money, types } from "./accounting";
import {
  readWorkbook,
  extractWorkbook,
  importPlan,
  applyImport,
  downloadChart,
  accountGroups,
  normalizeName,
} from "./importer";
export default function ImportPanel({
  data,
  busy,
  onSave,
  initialMode = "entries",
}) {
  const [file, setFile] = useState(null),
    [extracted, setExtracted] = useState(null),
    [plan, setPlan] = useState(null),
    [overrides, setOverrides] = useState({}),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [mode, setMode] = useState(initialMode),
    [asDraft, setAsDraft] = useState(true),
    [partial, setPartial] = useState(false),
    [show, setShow] = useState("error");
  useEffect(() => {
    if (!extracted) return;
    let active = true;
    setReading(true);
    importPlan(extracted, data, overrides)
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
      const p = await importPlan(x, data);
      setFile(f);
      setExtracted(x);
      setOverrides({});
      setPlan(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  }
  async function reclassify(name, value) {
    const next = { ...overrides, [normalizeName(name)]: { group: value } };
    setOverrides(next);
    setReading(true);
    try {
      setPlan(await importPlan(extracted, data, next));
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  }
  const canSave =
    plan &&
    !plan.chart.issues.length &&
    !reading &&
    !busy &&
    (mode === "accounts"
      ? plan.chart.added > 0
      : (plan.ready.length > 0 || plan.linkUpdates.length > 0) &&
        (!plan.errors.length || partial));
  return (
    <div className="import-panel">
      <div className="import-notice">
        <FileSpreadsheet size={22} />
        <div>
          <strong>استيراد ملف اليومية ودليل الحسابات</strong>
          <p>
            يدعم تنسيق ملفك الحالي. لا يُحفظ شيء قبل المراجعة والضغط على زر
            التأكيد. ملفك لا يُرفع إلى أي خدمة لتحليله.
          </p>
        </div>
      </div>
      <div className="import-mode">
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={mode === "entries"}
            onChange={() => setMode("entries")}
          />
          القيود وشجرة الحسابات
        </label>
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={mode === "accounts"}
            onChange={() => setMode("accounts")}
          />
          شجرة الحسابات فقط
        </label>
      </div>
      {mode === "entries" && (
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
      )}
      <label className="upload">
        <Upload size={24} />
        <strong>{file?.name || "اختر ملف Excel للمراجعة"}</strong>
        <span>XLSX · حد أقصى 5 ميجابايت · لا تُستنتج مبالغ من البيان</span>
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
          جاري تحليل الملف وحساب الأكواد…
        </p>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {plan && (
        <>
          <div className="import-stats">
            <span>
              <strong>{plan.chart.items.length}</strong>حساب بالملف
            </span>
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
                `سيتم استكمال روابط ${plan.linkUpdates.length} قيد محفوظ بدون تكرار قيوده أو تغيير مبالغه.`}
            </div>
          )}
          <details
            className="import-details"
            open={mode === "accounts" || plan.chart.issues.length > 0}
          >
            <summary>
              شجرة الحسابات والأكواد المقترحة ({plan.chart.added} حساب ومجموعة
              جديدة)
            </summary>
            <p>
              الأكواد تبدأ بـ1 للأصول، 2 للالتزامات، 3 لحقوق الملكية، 4
              للإيرادات، 5 للمصروفات. الحساب الموجود يُستخدم دون تكراره أو تغيير
              تصنيفه.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>اسم الحساب</th>
                    <th>المجموعة المحاسبية</th>
                    <th>الطبيعة</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.chart.items.map((a, i) => (
                    <tr key={a.id || i}>
                      <td className="numeric">{a.code || "—"}</td>
                      <td>
                        {a.name}
                        <small className="muted">
                          {a.status === "existing" ? " · موجود بالفعل" : ""}
                        </small>
                      </td>
                      <td>
                        <select
                          aria-label={"تصنيف " + a.name}
                          value={a.group}
                          disabled={reading || busy}
                          onChange={(e) => reclassify(a.name, e.target.value)}
                        >
                          <option value="">اختر التصنيف</option>
                          {accountGroups.map((g) => (
                            <option key={g.code} value={g.code}>
                              {types[g.type]} / {g.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{a.normalBalance === "credit" ? "دائن" : "مدين"}</td>
                      <td>{a.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {plan.chart.issues.length > 0 && (
            <div className="error" role="alert">
              {plan.chart.issues.join("؛ ")}
            </div>
          )}
          {mode === "entries" && (
            <>
              <div className="import-notice">
                <AlertCircle size={19} />
                <div>
                  <strong>تجميع القيود بدون رقم</strong>
                  <p>
                    تُجمع الأسطر المتتالية حتى يتوازن القيد، ويُنهي الصف الفارغ
                    المجموعة. يلزم تاريخ واحد لكل قيد. التقريب لخانتين لا يضيف
                    سطر تسوية؛ أي فرق بعد التقريب يمنع استيراد القيد.
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
                    key={key}
                    type="button"
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
                  {plan.warnings.length} قيد يحتوي مبالغ مقربة إلى هللتين. القيم
                  الأصلية محفوظة داخل تفاصيل الاستيراد.
                </p>
              )}
            </>
          )}
          <div className="modal-footer">
            <button
              type="button"
              disabled={busy || reading || plan.chart.issues.length > 0}
              onClick={() =>
                downloadChart(plan).catch((e) => setError(e.message))
              }
            >
              <Download size={16} />
              تنزيل شجرة الحسابات المكودة
            </button>
            <button
              className="primary"
              type="button"
              disabled={!canSave}
              onClick={() => {
                setError("");
                try {
                  const next = applyImport(plan, data, {
                    accountsOnly: mode === "accounts",
                    allowPartial: partial,
                    fileName: file.name,
                    asDraft,
                  });
                  onSave(next, {
                    accountsOnly: mode === "accounts",
                    entries:
                      next.entries.length -
                      data.entries.length +
                      (next.draftEntries?.length || 0) -
                      (data.draftEntries?.length || 0),
                    asDraft,
                    accounts: plan.chart.added,
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
                : mode === "accounts"
                  ? "تأكيد إضافة الشجرة"
                  : plan.ready.length || !plan.linkUpdates.length
                    ? `تأكيد استيراد ${plan.ready.length} قيد`
                    : `حفظ روابط ${plan.linkUpdates.length} قيد`}
            </button>
          </div>
          <p className="muted">
            القيود الموجودة لا تُحذف. إعادة استيراد نفس القيود تتجاوز ما سبق
            استيراده. روابط Drive تظهر كروابط لفتح المستندات، والملاحظات محفوظة.
            الملفات تظل في Drive بصلاحياتها الأصلية.
          </p>
        </>
      )}
    </div>
  );
}
