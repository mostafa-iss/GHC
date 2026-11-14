import React, { useEffect, useState } from "react";
import { Monitor, RefreshCw, LogOut } from "lucide-react";
import { accessRpc } from "./access.js";
export default function DevicesPanel({ client, sessionId }) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setRows(await accessRpc(client, "app_list_sessions"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  const time = (v) =>
    v ? new Date(v).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "—";
  async function end(id) {
    if (
      !confirm("إنهاء وصول هذا الجهاز للبيانات؟ سيحتاج تسجيل الدخول من جديد.")
    )
      return;
    setBusy(true);
    try {
      await accessRpc(client, "app_end_session", { target_session: id });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card devices-panel">
      <div className="card-title">
        <h2>
          <Monitor size={20} /> الأجهزة والجلسات
        </h2>
        <button disabled={busy} onClick={refresh}>
          <RefreshCw size={16} />
          تحديث
        </button>
      </div>
      <p className="muted">
        آخر 200 جلسة · الأوقات بتوقيت القاهرة. النشاط حديث عند التواصل خلال آخر
        دقيقتين؛ إغلاق المتصفح لا يؤكد تسجيل الخروج.
      </p>
      <p className="report-note">
        حساب المحاسبين مشترك: يظهر الجهاز والحساب، ولا يحدد اسم الشخص. بيانات
        الجهاز يرسلها المتصفح وقد تكون غير دقيقة. يبدأ السجل من تفعيل هذه
        الخاصية.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "المستخدم",
                "الجهاز والمتصفح",
                "الدخول",
                "آخر نشاط",
                "الحالة",
                "الإجراء",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.session_id}>
                <td>
                  <span dir="ltr">{r.email}</span>
                  <small className="device-secondary">
                    {r.role === "admin" ? "أدمن" : "محاسب"}
                    {r.session_id === sessionId ? " · هذا الجهاز" : ""}
                  </small>
                </td>
                <td>
                  {r.device.kind}
                  <small className="device-secondary">
                    {r.device.os} · {r.device.browser}
                  </small>
                  <details>
                    <summary>تفاصيل المتصفح</summary>
                    <span dir="ltr">{r.device.userAgent}</span>
                  </details>
                </td>
                <td>{time(r.signed_in_at)}</td>
                <td>{time(r.last_seen_at)}</td>
                <td>
                  {r.ended_at
                    ? "منتهية"
                    : Date.now() - new Date(r.last_seen_at).getTime() < 120000
                      ? "نشاط حديث"
                      : "غير نشط مؤخرًا"}
                </td>
                <td>
                  {!r.ended_at && r.session_id !== sessionId && (
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => end(r.session_id)}
                    >
                      <LogOut size={16} />
                      إنهاء الجلسة
                    </button>
                  )}
                  {r.ended_at && time(r.ended_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && !busy && <p className="empty">لا توجد جلسات مسجلة.</p>}
    </section>
  );
}
