import React, { useRef, useState } from "react";
import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { readBackup } from "./backup.js";
export default function BackupPanel({
  data,
  version,
  onBackup,
  onRestore,
  busy,
}) {
  const [plan, setPlan] = useState(null),
    [baseVersion, setBaseVersion] = useState(null),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [consent, setConsent] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [done, setDone] = useState(false);
  const request = useRef(0);
  async function select(file) {
    const id = ++request.current;
    setPlan(null);
    setError("");
    setConsent(false);
    setConfirmation("");
    setDone(false);
    if (!file) return;
    setReading(true);
    try {
      const result = await readBackup(file);
      if (id === request.current) {
        setPlan(result);
        setBaseVersion(version);
      }
    } catch (e) {
      if (id === request.current) setError(e.message);
    } finally {
      if (id === request.current) setReading(false);
    }
  }
  async function restore() {
    setError("");
    try {
      await onRestore(plan, baseVersion);
      setPlan(null);
      setDone(true);
      setConfirmation("");
      setConsent(false);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="backup-page">
      <section className="card backup-download">
        <ShieldCheck size={32} />
        <div>
          <h2>نسخة كاملة من بياناتك</h2>
          <p>
            تشمل الحسابات والقيود والمسودات والمرفقات والقوالب وإعدادات المالية.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={onBackup}>
          <Download size={17} />
          تنزيل نسخة احتياطية
        </button>
      </section>
      <section className="card restore-panel">
        <h2>
          <RotateCcw size={21} />
          استرجاع نسخة احتياطية
        </h2>
        <p>اختر ملف ZIP صادرًا من GHC Academy لمراجعته قبل الاسترجاع.</p>
        <label className="upload">
          ملف النسخة الاحتياطية
          <input
            aria-label="ملف النسخة الاحتياطية"
            type="file"
            accept=".zip,application/zip"
            disabled={busy || reading}
            onChange={(e) => select(e.target.files?.[0])}
          />
        </label>
        {reading && <p role="status">جاري فحص البيانات والمرفقات…</p>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {done && (
          <div className="restore-success" role="status">
            تم استرجاع النسخة الاحتياطية بنجاح.
          </div>
        )}
        {plan && (
          <>
            <p>
              تاريخ النسخة:{" "}
              {plan.snapshot.exportedAt
                ? new Date(plan.snapshot.exportedAt).toLocaleString("ar-EG")
                : "غير متاح"}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>المحتوى</th>
                    <th>النسخة المختارة</th>
                    <th>الحالي</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["الحسابات", plan.summary.accounts, data.accounts.length],
                    [
                      "مراكز التكلفة",
                      plan.summary.centers,
                      data.centers.length,
                    ],
                    [
                      "القيود المرحّلة",
                      plan.summary.entries,
                      data.entries.length,
                    ],
                    [
                      "المسودات",
                      plan.summary.drafts,
                      data.draftEntries?.length || 0,
                    ],
                    [
                      "الملفات المرفقة",
                      plan.summary.attachments,
                      new Set(
                        [...data.entries, ...(data.draftEntries || [])].flatMap(
                          (e) => (e.attachments || []).map((a) => a.path),
                        ),
                      ).size,
                    ],
                  ].map(([label, count, current]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{count}</td>
                      <td>{current}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="restore-warning">
              الاسترجاع يستبدل البيانات الحالية بمحتويات النسخة. سيتم تنزيل نسخة
              من الوضع الحالي قبل الاستبدال.
            </div>
            <label className="partial-confirm">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              راجعت المعاينة وأوافق على استبدال البيانات الحالية
            </label>
            <label className="field">
              اكتب «استرجاع» للتأكيد
              <input
                aria-label="تأكيد الاسترجاع"
                value={confirmation}
                disabled={busy}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !consent || confirmation !== "استرجاع"}
              onClick={restore}
            >
              {busy ? "جاري الاسترجاع…" : "استرجاع النسخة المختارة"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
