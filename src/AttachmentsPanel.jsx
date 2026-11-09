import React, { useState, useEffect } from "react";
import {
  FileText,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Paperclip,
} from "lucide-react";
import { client, cloud } from "./store";
import { entryDocuments } from "./documents";
function Attachment({ file }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const image = /\.(png|jpe?g|webp)$/i.test(file.name || "");
  useEffect(() => {
    let active = true;
    if (cloud)
      client.storage
        .from("attachments")
        .createSignedUrl(file.path, 300)
        .then(({ data, error }) => {
          if (active) {
            if (error) setError("تعذر فتح المرفق");
            else setUrl(data.signedUrl);
          }
        });
    return () => {
      active = false;
    };
  }, [file.path]);
  return (
    <div className="attachment-card">
      <a
        href={url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={"فتح " + file.name}
        className="attachment-preview"
      >
        {image && url ? (
          <img src={url} alt={file.name} />
        ) : (
          <FileText size={42} />
        )}
      </a>
      <div className="attachment-name">{file.name}</div>
      {error ? (
        <small role="alert">{error}</small>
      ) : (
        <a href={url || undefined} target="_blank" rel="noopener noreferrer">
          <Download size={14} />
          فتح / تحميل
        </a>
      )}
    </div>
  );
}
export default function AttachmentsPanel({ entry, extraDocuments }) {
  const links = entryDocuments(entry, extraDocuments);
  return (
    <section className="journal-attachments">
      <h2>
        <Paperclip size={20} />
        المرفقات
      </h2>
      <div className="attachment-section">
        <h3>مرفقات القيد</h3>
        {entry.attachments?.length ? (
          <div className="attachment-grid">
            {entry.attachments.map((a) => (
              <Attachment key={a.path} file={a} />
            ))}
          </div>
        ) : (
          <p className="muted">لا توجد ملفات مرفوعة على هذا القيد.</p>
        )}
      </div>
      <div className="attachment-section legacy-documents">
        <h3>مستندات Drive — القيود المستوردة</h3>
        {links.length ? (
          <div className="attachment-grid">
            {links.map((d, i) => (
              <a
                className="drive-card"
                key={d.url}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="drive-mark">△</span>
                <strong>
                  {d.label === "ملف Drive" ? "مستند Drive " + (i + 1) : d.label}
                </strong>
                <small>
                  <ExternalLink size={13} />
                  فتح في Google Drive
                </small>
              </a>
            ))}
          </div>
        ) : (
          <p className="muted">لا توجد روابط Drive لهذا القيد.</p>
        )}
      </div>
    </section>
  );
}
