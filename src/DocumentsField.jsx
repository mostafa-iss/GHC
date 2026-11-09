import React, { useState } from "react";
import { ExternalLink, Link, Save } from "lucide-react";
import { parseDocumentLinks, mergeDocuments } from "./documents";
export default function DocumentsField({
  links = [],
  onChange,
  onSave,
  readOnly = false,
  busy = false,
  textValue = "",
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(""),
    [error, setError] = useState("");
  const docs = mergeDocuments(links);
  function start() {
    setText(docs.map((d) => d.url).join("\n"));
    setError("");
    setEditing(true);
  }
  return (
    <section className="documents-field">
      <div className="documents-heading">
        <span>
          <Link size={18} />
          روابط المستندات وملفات Drive
        </span>
        {readOnly && onSave && !editing && (
          <button type="button" className="link" onClick={start}>
            إضافة أو تعديل الروابط
          </button>
        )}
      </div>
      {readOnly && !editing ? (
        <>
          {docs.length ? (
            <div className="document-chips">
              {docs.map((d, i) => (
                <a
                  href={d.url}
                  key={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                  {d.label === "Link" || d.label === "link"
                    ? "مستند " + (i + 1)
                    : d.label}
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">لا توجد روابط مستندات لهذا القيد.</p>
          )}
        </>
      ) : (
        <>
          <label className="field">
            <span>رابط كامل في كل سطر</span>
            <textarea
              aria-label="روابط مستندات Drive"
              dir="ltr"
              rows="3"
              placeholder="https://drive.google.com/file/d/.../view"
              value={readOnly ? text : textValue}
              onChange={(e) => {
                if (readOnly) setText(e.target.value);
                else onChange(e.target.value);
              }}
              disabled={busy}
            />
          </label>
          <p className="muted">
            تُفتح الملفات من Drive؛ يحتاج من يفتحها إلى صلاحية الوصول الأصلية.
          </p>
          {readOnly && (
            <div className="document-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={async () => {
                  try {
                    const parsed = parseDocumentLinks(text);
                    await onSave(parsed);
                    setEditing(false);
                    setError("");
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <Save size={15} />
                حفظ الروابط
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                إلغاء
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
