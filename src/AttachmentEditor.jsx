import React, { useEffect, useState } from "react";
import { Paperclip, Trash2, RefreshCw, FileText, Undo2 } from "lucide-react";
import { Attachment } from "./AttachmentsPanel";
import { validateAttachment } from "./attachments.js";
import { cloud } from "./store";
function PendingFile({ file, onRemove, disabled }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="attachment-edit-item pending-file">
      <div className="attachment-card">
        <div className="attachment-preview">
          {url ? <img src={url} alt={file.name} /> : <FileText size={42} />}
        </div>
        <div className="attachment-name">{file.name}</div>
        <small>جديد · جاهز للحفظ</small>
      </div>
      <button
        type="button"
        className="danger"
        aria-label={"إزالة الملف الجديد " + file.name}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 size={14} />
        إزالة
      </button>
    </div>
  );
}
export default function AttachmentEditor({
  attachments,
  original,
  files,
  onAttachmentsChange,
  onFilesChange,
  busy,
}) {
  const [error, setError] = useState("");
  const removed = (original || []).filter(
    (a) => !attachments.some((b) => b.path === a.path),
  );
  function add(selected, replacing) {
    try {
      selected.forEach(validateAttachment);
      if (!selected.length) return;
      setError("");
      onFilesChange([...files, ...selected]);
      if (replacing)
        onAttachmentsChange(
          attachments.filter((a) => a.path !== replacing.path),
        );
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="entry-attachment-editor">
      <div className="attachment-editor-heading">
        <h3>
          <Paperclip size={19} />
          مرفقات القيد
        </h3>
        <span>{attachments.length + files.length} مرفق</span>
      </div>
      <p>إضافة المرفقات وحذفها واستبدالها يتم عند حفظ القيد.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {(attachments.length > 0 || files.length > 0) && (
        <div className="attachment-edit-grid">
          {attachments.map((a) => (
            <div className="attachment-edit-item" key={a.path}>
              <Attachment file={a} />
              <div className="attachment-edit-actions">
                <label
                  className={
                    "attachment-replace " + (!cloud || busy ? "disabled" : "")
                  }
                >
                  <RefreshCw size={14} />
                  استبدال
                  <input
                    type="file"
                    aria-label={"استبدال المرفق " + a.name}
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    disabled={!cloud || busy}
                    onChange={(e) => {
                      add(Array.from(e.target.files || []), a);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="danger"
                  aria-label={"حذف المرفق " + a.name}
                  disabled={busy}
                  onClick={() =>
                    onAttachmentsChange(
                      attachments.filter((b) => b.path !== a.path),
                    )
                  }
                >
                  <Trash2 size={14} />
                  حذف
                </button>
              </div>
            </div>
          ))}
          {files.map((file, i) => (
            <PendingFile
              key={file.name + "-" + i}
              file={file}
              disabled={busy}
              onRemove={() => onFilesChange(files.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      {removed.length > 0 && (
        <div className="attachment-pending-removal">
          {removed.map((a) => (
            <div key={a.path}>
              <span>سيُحذف عند الحفظ: {a.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAttachmentsChange([...attachments, a])}
              >
                <Undo2 size={13} />
                تراجع
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="upload">
        <Paperclip size={22} />
        <strong>إضافة مرفقات</strong>
        <span>
          صور أو PDF · حتى 5 ميجابايت لكل ملف
          {!cloud ? " · يتطلب الربط السحابي" : ""}
        </span>
        <input
          aria-label="إضافة مرفقات القيد"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={!cloud || busy}
          onChange={(e) => {
            add(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </label>
    </section>
  );
}
