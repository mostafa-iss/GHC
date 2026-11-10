import React, { useState, useEffect } from "react";
import { FileText, Download, ExternalLink, Paperclip } from "lucide-react";
import { client, cloud } from "./store";
import { entryDocuments } from "./documents";
import driveLogo from "./assets/google-drive.svg";
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
  const hasFiles = Boolean(entry.attachments?.length);
  return (
    <section className="journal-attachments">
      <h2>
        <Paperclip size={20} />
        مرفقات القيد
      </h2>
      <div className="attachment-section">
        {hasFiles || links.length ? (
          <div className="attachment-grid">
            {entry.attachments?.map((a) => (
              <Attachment key={a.path} file={a} />
            ))}
            {links.map((d, i) => (
              <a
                className="drive-card"
                key={d.url}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="drive-card-preview">
                  <img
                    className="drive-logo"
                    src={driveLogo}
                    alt="Google Drive"
                  />
                </span>
                <strong className="attachment-name">
                  {d.label === "ملف Drive" ? "مستند Drive " + (i + 1) : d.label}
                </strong>
                <small className="drive-card-action">
                  <ExternalLink size={13} />
                  فتح في Google Drive
                </small>
              </a>
            ))}
          </div>
        ) : (
          <p className="muted">لا توجد مرفقات لهذا القيد.</p>
        )}
      </div>
    </section>
  );
}
