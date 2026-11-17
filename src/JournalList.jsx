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
  selectionKey,
  onBulkAction,
}) {
  const [page, setPage] = useState(0),
    [menu, setMenu] = useState(null);
  const size = 20;
  const [selected, setSelected] = useState(new Set());
  useEffect(() => setSelected(new Set()), [selectionKey]);
  useEffect(() => {
    const ids = new Set(entries.map((e) => e.id));
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [entries]);
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
  const pageEntries = entries.slice(actualPage * size, (actualPage + 1) * size);
  const picked = entries.filter((e) => selected.has(e.id));
  const allPage =
    pageEntries.length > 0 && pageEntries.every((e) => selected.has(e.id));
  function togglePage(checked) {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const e of pageEntries) checked ? next.add(e.id) : next.delete(e.id);
      return next;
    });
  }
  async function runBulk(operation) {
    if (!operation || !picked.length || busy) return;
    const completed = await onBulkAction(operation, picked);
    if (completed !== false) setSelected(new Set());
  }
  const account = (id) =>
    data.accounts.find((a) => a.id === id)?.name || "حساب غير محدد";
  return (
    <section className="journal-results">
      {onBulkAction && (
        <div className="journal-selection-toolbar">
          <label className="journal-check">
            <input
              type="checkbox"
              aria-label="تحديد الصفحة الحالية"
              disabled={busy || !pageEntries.length}
              checked={allPage}
              ref={(node) => {
                if (node)
                  node.indeterminate =
                    !allPage && pageEntries.some((e) => selected.has(e.id));
              }}
              onChange={(e) => togglePage(e.target.checked)}
            />
            تحديد
          </label>
          <select
            aria-label="نطاق تحديد القيود"
            value=""
            disabled={busy || !entries.length}
            onChange={(e) => {
              if (e.target.value === "none") setSelected(new Set());
              if (e.target.value === "page")
                setSelected(new Set(pageEntries.map((e) => e.id)));
              if (e.target.value === "all")
                setSelected(new Set(entries.map((e) => e.id)));
            }}
          >
            <option value="" disabled>
              نطاق التحديد
            </option>
            <option value="none">إلغاء التحديد</option>
            <option value="page">الكل — الصفحة الحالية</option>
            <option value="all">
              الكل — جميع نتائج البحث ({entries.length})
            </option>
          </select>
          <strong aria-live="polite">{picked.length} محدد</strong>
          <select
            aria-label="إجراءات القيود المحددة"
            value=""
            disabled={busy || !picked.length}
            onChange={(e) => runBulk(e.target.value)}
          >
            <option value="" disabled>
              الإجراءات
            </option>
            <option value="print">طباعة / PDF</option>
            <option value="export">تصدير إلى Excel</option>
            <option
              value="post"
              disabled={!picked.some((e) => e.status === "draft")}
            >
              ترحيل المسودات (
              {picked.filter((e) => e.status === "draft").length})
            </option>
            <option
              value="draft"
              disabled={!picked.some((e) => e.status === "posted")}
            >
              تحويل المرحّل إلى مسودة (
              {picked.filter((e) => e.status === "posted").length})
            </option>
            {canDelete && <option value="delete">حذف المحدد</option>}
          </select>
        </div>
      )}
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
        pageEntries.map((e) => {
          const debits = e.lines.filter((l) => l.debit > 0),
            credits = e.lines.filter((l) => l.credit > 0);
          const docs = entryDocuments(e, data.entryDocuments?.[e.id]);
          return (
            <article
              key={e.id}
              className={
                "journal-row" +
                (onBulkAction ? " has-selection" : "") +
                (selected.has(e.id) ? " is-selected" : "")
              }
            >
              {onBulkAction && (
                <input
                  className="journal-select-row"
                  type="checkbox"
                  aria-label={"تحديد " + journalLabel(e)}
                  disabled={busy}
                  checked={selected.has(e.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((previous) => {
                      const next = new Set(previous);
                      checked ? next.add(e.id) : next.delete(e.id);
                      return next;
                    });
                  }}
                />
              )}
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
