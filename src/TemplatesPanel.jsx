import React from "react";
import { Plus, Copy, Trash2, Pencil, BookCopy } from "lucide-react";
import { money } from "./accounting.js";
export default function TemplatesPanel({
  data,
  onNew,
  onUse,
  onEdit,
  onDelete,
  busy,
}) {
  const templates = data.journalTemplates || [];
  return (
    <>
      <div className="actions section-actions">
        <button className="primary" onClick={onNew}>
          <Plus size={17} />
          قالب جديد
        </button>
      </div>
      {templates.length ? (
        <div className="template-grid">
          {templates.map((t) => (
            <section className="card template-card" key={t.id}>
              <BookCopy size={25} />
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="template-accounts">
                {t.lines.map((l, i) => (
                  <span key={i}>
                    {data.accounts.find((a) => a.id === l.accountId)?.name ||
                      "حساب غير محدد"}
                  </span>
                ))}
              </div>
              <strong>
                {money(t.lines.reduce((s, l) => s + l.debit, 0))} ر.س
              </strong>
              <div className="actions">
                <button className="primary" onClick={() => onUse(t)}>
                  <Copy size={16} />
                  استخدام القالب
                </button>
                <button
                  aria-label={"تعديل القالب " + t.name}
                  onClick={() => onEdit(t)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={"حذف القالب " + t.name}
                  className="danger"
                  disabled={busy}
                  onClick={() => onDelete(t)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="card empty">
          <span>
            <BookCopy size={28} />
          </span>
          <h3>قوالب لقيودك المتكررة</h3>
          <p>
            جهّز قالبًا للرواتب أو الإيجار، أو احفظ أي قيد موجود كقالب. استخدام
            القالب يفتح قيدًا جديدًا للمراجعة.
          </p>
        </section>
      )}
    </>
  );
}
