import React, { useEffect, useState, useRef } from "react";
import { RefreshCw, UserRound } from "lucide-react";
import { accessRpc } from "./access.js";
export default function ActivityLog({ client, data, entryId = null, version }) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false);
  const request = useRef(0);
  const legacy = (
    entryId
      ? (data.journalEvents || []).filter((e) => e.entryId === entryId)
      : data.audit || []
  )
    .map((e, i) => ({
      id: e.id || i,
      created_at: e.at,
      description: e.action
        ? `${e.action} — ${e.details || ""}`
        : e.description,
      legacy: true,
    }))
    .reverse();
  async function load(older = false) {
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      const items = await accessRpc(client, "app_activity", {
        target_entry: entryId,
        before_id: older ? rows.at(-1)?.id : null,
      });
      if (token !== request.current) return;
      setRows((prev) =>
        older
          ? [...prev, ...items.filter((r) => !prev.some((p) => p.id === r.id))]
          : items,
      );
      setMore(items.length === 100);
    } catch (e) {
      if (token === request.current) setError(e.message);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    const token = ++request.current;
    setRows([]);
    setMore(false);
    setError("");
    if (!client) return;
    setBusy(true);
    accessRpc(client, "app_activity", {
      target_entry: entryId,
      before_id: null,
    })
      .then(
        (items) => {
          if (live && token === request.current) {
            setRows(items);
            setMore(items.length === 100);
          }
        },
        (e) => {
          if (live && token === request.current) setError(e.message);
        },
      )
      .finally(() => {
        if (live && token === request.current) setBusy(false);
      });
    return () => {
      live = false;
      request.current++;
    };
  }, [client, entryId, version]);
  const displayed = client ? rows : legacy;
  return (
    <section className="card activity-log">
      <div className="card-title">
        <h2>{entryId ? "سجل نشاط القيد" : "سجل النشاط"}</h2>
        {client && (
          <button disabled={busy} onClick={() => load()}>
            <RefreshCw size={15} />
            تحديث السجل
          </button>
        )}
      </div>
      <p className="activity-note">
        {client
          ? "المستخدم والوقت مسجلان من الخادم. الحساب المشترك يحدد الحساب المنفذ، وليس المحاسب الفعلي."
          : "نسخة محلية بدون مصادقة؛ هوية منفذ العمليات غير موثقة."}
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
          <p>قد يلزم تشغيل ترقية 004_activity_identity.sql.</p>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>التاريخ والوقت · القاهرة</th>
              <th>منفذ العملية</th>
              <th>العملية</th>
              <th>القيد</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.created_at
                    ? new Date(r.created_at).toLocaleString("ar-EG", {
                        timeZone: "Africa/Cairo",
                      })
                    : "غير مسجل"}
                </td>
                <td>
                  <span className="activity-user">
                    <UserRound size={15} />
                    {r.legacy
                      ? "هوية غير موثقة"
                      : r.actor_name ||
                        r.actor_email ||
                        (r.actor ? "مستخدم سابق" : "غير مسجل سابقًا")}
                  </span>
                  {r.actor_email && r.actor_name !== r.actor_email && (
                    <small dir="ltr">{r.actor_email}</small>
                  )}
                  {r.actor_role && (
                    <small>{r.actor_role === "admin" ? "أدمن" : "محاسب"}</small>
                  )}
                </td>
                <td>{r.description}</td>
                <td>{r.entry_number || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!displayed.length && !busy && !error && (
        <p className="empty">
          لا توجد عمليات موثقة مسجلة{entryId ? " لهذا القيد" : ""}.
        </p>
      )}
      {client &&
        entryId &&
        !rows.length &&
        !busy &&
        !error &&
        legacy.length > 0 && (
          <div className="activity-legacy">
            <h3>سجل سابق بدون هوية موثقة</h3>
            {legacy.map((r) => (
              <p key={r.id}>{r.description} · هوية المنفذ غير مسجلة</p>
            ))}
          </div>
        )}
      {more && (
        <button disabled={busy} onClick={() => load(true)}>
          تحميل عمليات أقدم
        </button>
      )}
    </section>
  );
}
