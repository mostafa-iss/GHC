import React, { useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Printer,
  FileDown,
  Trash2,
  Pencil,
  Send,
  FilePenLine,
  RotateCcw,
  Copy,
  BookCopy,
} from "lucide-react";
import { money } from "./accounting";
import { journalLabel } from "./JournalList";
import BrandLogo from "./BrandLogo";
import AttachmentsPanel from "./AttachmentsPanel";
import AccountChip from "./AccountChip";
export default function JournalDetail({
  canDelete = true,
  entry,
  data,
  onBack,
  onEdit,
  onState,
  onExport,
  onAccountOpen,
  onCopy,
  onTemplate,
  busy,
}) {
  const [tab, setTab] = useState("entry");
  const account = (id) => data.accounts.find((a) => a.id === id);
  const d = entry.lines.reduce((s, l) => s + (l.debit || 0), 0),
    c = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
  const events = (data.journalEvents || [])
    .filter((e) => e.entryId === entry.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="journal-detail">
      <div className="journal-detail-heading">
        <div>
          <button className="link" onClick={onBack}>
            <ArrowRight size={17} />
            القيود اليومية
          </button>
          <h1>قيد يومية {journalLabel(entry)}</h1>
          <span className={"journal-state " + entry.status}>
            {entry.status === "draft"
              ? "مسودة — لا تؤثر في الحسابات"
              : entry.status === "deleted"
                ? "محذوف — مستبعد من الحسابات"
                : "مرحّل"}
          </span>
        </div>
        <div className="journal-detail-flow">
          {entry.lines
            .filter((l) => l.debit > 0)
            .map((l, i) => (
              <AccountChip
                key={i}
                accountId={l.accountId}
                label={account(l.accountId)?.name || "حساب غير محدد"}
                onOpen={onAccountOpen}
              />
            ))}
          <ChevronLeft size={19} />
          {entry.lines
            .filter((l) => l.credit > 0)
            .map((l, i) => (
              <AccountChip
                key={i}
                accountId={l.accountId}
                label={account(l.accountId)?.name || "حساب غير محدد"}
                onOpen={onAccountOpen}
              />
            ))}
        </div>
      </div>
      <section className="journal-document">
        <div className="journal-detail-actions">
          <button onClick={() => onCopy(entry)}>
            <Copy size={16} />
            نسخ القيد
          </button>
          <button onClick={() => onTemplate(entry)}>
            <BookCopy size={16} />
            حفظ كقالب
          </button>
          {entry.status !== "deleted" && (
            <>
              <button disabled={busy} onClick={() => onEdit(entry)}>
                <Pencil size={16} />
                تعديل
              </button>
              <button onClick={() => window.print()}>
                <Printer size={16} />
                طباعة / PDF
              </button>
              <button onClick={() => onExport(entry)}>
                <FileDown size={16} />
                Excel
              </button>
              {canDelete && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => onState(entry, "delete")}
                >
                  <Trash2 size={16} />
                  حذف
                </button>
              )}
              {entry.status === "posted" ? (
                <button disabled={busy} onClick={() => onState(entry, "draft")}>
                  <FilePenLine size={16} />
                  تحويل إلى مسودة
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => onState(entry, "post")}
                >
                  <Send size={16} />
                  ترحيل القيد
                </button>
              )}
            </>
          )}
          {entry.status === "deleted" && (
            <button disabled={busy} onClick={() => onState(entry, "restore")}>
              <RotateCcw size={16} />
              استعادة القيد
            </button>
          )}
        </div>
        <div className="journal-detail-tabs">
          <button
            className={tab === "entry" ? "selected" : ""}
            onClick={() => setTab("entry")}
          >
            قيد اليومية
          </button>
          <button
            className={tab === "history" ? "selected" : ""}
            onClick={() => setTab("history")}
          >
            سجل القيد
          </button>
        </div>
        {tab === "entry" ? (
          <div className="journal-paper-canvas">
            <div className="journal-paper">
              <div className="journal-paper-heading">
                <div>
                  <h2>قيد يومية {journalLabel(entry)}</h2>
                  <p>التاريخ: {entry.date}</p>
                  <p>الوصف: {entry.description}</p>
                  {entry.status !== "posted" && (
                    <strong className="paper-draft">
                      {entry.status === "draft"
                        ? "مسودة — غير مرحّل"
                        : "قيد محذوف"}
                    </strong>
                  )}
                </div>
                <BrandLogo />
              </div>
              <div className="table-scroll">
                <table className="journal-paper-table">
                  <thead>
                    <tr>
                      <th colSpan="2">الحساب</th>
                      <th>الوصف</th>
                      <th>مركز التكلفة</th>
                      <th>مدين</th>
                      <th>دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{account(l.accountId)?.code || "—"}</td>
                        <td>{account(l.accountId)?.name || "لم يُحدد"}</td>
                        <td>{l.description || entry.description}</td>
                        <td>
                          {data.centers.find((c) => c.id === l.centerId)
                            ?.name || "—"}
                        </td>
                        <td className="numeric">{money(l.debit || 0)}</td>
                        <td className="numeric">{money(l.credit || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4">الإجمالي</td>
                      <td className="numeric">{money(d)} ر.س</td>
                      <td className="numeric">{money(c)} ر.س</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {d !== c && (
                <p className="paper-warning">
                  فرق القيد: {money(Math.abs(d - c))} ر.س — يلزم توازنه قبل
                  الترحيل.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="journal-history">
            <p>
              تاريخ الإنشاء:{" "}
              {entry.createdAt
                ? new Date(entry.createdAt).toLocaleString("ar-SA", {
                    calendar: "gregory",
                  })
                : "غير مسجل في البيانات القديمة"}
            </p>
            {events.map((e) => (
              <article key={e.id}>
                <strong>{e.action}</strong>
                <span>
                  {new Date(e.at).toLocaleString("ar-SA", {
                    calendar: "gregory",
                  })}
                </span>
                <p>{e.details}</p>
                <small>{e.actor} — الحساب المشترك</small>
              </article>
            ))}
            {!events.length && (
              <p className="muted">
                تظهر هنا عمليات المسودة والترحيل والحذف التي تتم بعد هذا
                التحديث.
              </p>
            )}
          </div>
        )}
      </section>
      <AttachmentsPanel
        entry={entry}
        extraDocuments={data.entryDocuments?.[entry.id]}
      />
    </div>
  );
}
