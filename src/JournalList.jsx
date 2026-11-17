import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  ExternalLink,
  Paperclip,
} from "lucide-react";
import { journalCreatedTime } from "./journals.js";
import { money } from "./accounting";
import { entryDocuments } from "./documents";
import AccountChip from "./AccountChip";
export const journalLabel = (e) =>
  e.number
    ? "#" + String(e.number).padStart(4, "0")
    : "مسودة D-" + String(e.draftNumber || 1).padStart(4, "0");
export default function JournalList({
  canDelete = true,
  showCreatedAt = false,
  entries,
  data,
  open,
  onState,
  busy,
  onAccountOpen,
  onCopy,
  onTemplate,
  queryKey,
}) {
  const [page, setPage] = useState(0),
    [menu, setMenu] = useState(null);
  const size = 20;
  useEffect(() => {
    setPage(0);
    setMenu(null);
  }, [entries.length, queryKey]);
  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event) => {
      if (!event.target.closest(".journal-more")) setMenu(null);
    };
    const escape = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const total = Math.max(1, Math.ceil(entries.length / size));
  const actualPage = Math.min(page, total - 1);
  const account = (id) =>
    data.accounts.find((a) => a.id === id)?.name || "حساب غير محدد";
  return (
    <section className="journal-results">
      <div className="journal-results-heading">
        <span>النتائج ({entries.length})</span>
        <div className="journal-pagination">
          <span>
            {entries.length ? actualPage * size + 1 : 0}–
            {Math.min((actualPage + 1) * size, entries.length)} من{" "}
            {entries.length}
          </span>
          <button
            aria-label="الصفحة السابقة"
            disabled={!actualPage}
            onClick={() => setPage(actualPage - 1)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            aria-label="الصفحة التالية"
            disabled={actualPage + 1 >= total}
            onClick={() => setPage(actualPage + 1)}
          >
            <ChevronLeft size={17} />
          </button>
        </div>
      </div>
      {!entries.length ? (
        <div className="empty">
          <p>لا توجد قيود مطابقة للبحث.</p>
        </div>
      ) : (
        entries.slice(actualPage * size, (actualPage + 1) * size).map((e) => {
          const debits = e.lines.filter((l) => l.debit > 0),
            credits = e.lines.filter((l) => l.credit > 0);
          const docs = entryDocuments(e, data.entryDocuments?.[e.id]);
          return (
            <article key={e.id} className="journal-row">
              <div className="journal-row-main">
                <button className="journal-title" onClick={() => open(e)}>
                  {e.date} — {journalLabel(e)}
                  <strong>{e.description}</strong>
                </button>
                <div className="journal-row-meta">
                  <span className={"journal-state " + e.status}>
                    {e.status === "draft"
                      ? "مسودة"
                      : e.status === "deleted"
                        ? "محذوف"
                        : "مرحّل"}
                  </span>
                  <span>{e.importKey ? "مستورد من Excel" : "إدخال يدوي"}</span>
                  {showCreatedAt && (
                    <span
                      className="journal-created-at"
                      title="تاريخ الإنشاء بتوقيت القاهرة"
                    >
                      الإنشاء:{" "}
                      {journalCreatedTime(e) == null ? (
                        "غير مسجل"
                      ) : (
                        <time dateTime={e.createdAt}>
                          {new Date(journalCreatedTime(e)).toLocaleString(
                            "ar-EG",
                            {
                              timeZone: "Africa/Cairo",
                              dateStyle: "short",
                              timeStyle: "short",
                            },
                          )}
                        </time>
                      )}
                    </span>
                  )}
                  {(docs.length > 0 || e.attachments?.length > 0) && (
                    <button className="link" onClick={() => open(e)}>
                      <Paperclip size={13} />
                      {docs.length + (e.attachments?.length || 0)} مستند
                    </button>
                  )}
                </div>
              </div>
              <div className="journal-accounts">
                <div>
                  {debits.map((l, i) => (
                    <AccountChip
                      key={i}
                      accountId={l.accountId}
                      label={account(l.accountId)}
                      onOpen={onAccountOpen}
                    />
                  ))}
                </div>
                <ChevronLeft size={19} />
                <div>
                  {credits.map((l, i) => (
                    <AccountChip
                      key={i}
                      accountId={l.accountId}
                      label={account(l.accountId)}
                      onOpen={onAccountOpen}
                    />
                  ))}
                </div>
              </div>
              <div className="journal-row-total">
                <strong>
                  {money(debits.reduce((s, l) => s + l.debit, 0))}
                </strong>
                <small>ر.س</small>
              </div>
              <div className="journal-more">
                <button
                  aria-label={"إجراءات " + journalLabel(e)}
                  aria-expanded={menu === e.id}
                  onClick={() => setMenu(menu === e.id ? null : e.id)}
                >
                  <MoreHorizontal size={21} />
                </button>
                {menu === e.id && (
                  <div className="journal-menu">
                    <button
                      onClick={() => {
                        setMenu(null);
                        onCopy(e);
                      }}
                    >
                      نسخ القيد
                    </button>
                    <button
                      onClick={() => {
                        setMenu(null);
                        onTemplate(e);
                      }}
                    >
                      حفظ كقالب
                    </button>
                    <button
                      onClick={() => {
                        open(e);
                        setMenu(null);
                      }}
                    >
                      عرض القيد
                    </button>
                    {e.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => onState(e, "post")}
                      >
                        ترحيل القيد
                      </button>
                    )}
                    {e.status === "posted" && (
                      <button
                        disabled={busy}
                        onClick={() => onState(e, "draft")}
                      >
                        تحويل إلى مسودة
                      </button>
                    )}
                    {canDelete &&
                      (e.status !== "deleted" ? (
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => onState(e, "delete")}
                        >
                          حذف القيد
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => onState(e, "restore")}
                        >
                          استعادة القيد
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
