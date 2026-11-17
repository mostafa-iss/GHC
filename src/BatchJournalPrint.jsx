import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import BrandLogo from "./BrandLogo.jsx";
import { journalLabel } from "./JournalList.jsx";
import { money } from "./accounting.js";
export default function BatchJournalPrint({ entries, data, onDone }) {
  useEffect(() => {
    if (!entries.length) return;
    let live = true;
    const done = () => onDone();
    document.body.classList.add("printing-journals");
    window.addEventListener("afterprint", done);
    document.fonts.ready.then(() => {
      if (live)
        requestAnimationFrame(() => {
          if (live) window.print();
        });
    });
    return () => {
      live = false;
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("printing-journals");
    };
  }, [entries]);
  if (!entries.length) return null;
  return createPortal(
    <div className="batch-journal-print" dir="rtl">
      {entries.map((e) => (
        <section className="batch-print-entry" key={e.id}>
          <div className="report-title">
            <BrandLogo className="report-logo" />
            <h2>قيد يومية {journalLabel(e)}</h2>
            <p>
              {e.date} · {e.status === "draft" ? "مسودة — غير مرحّل" : "مرحّل"}{" "}
              · SAR
            </p>
            <strong>{e.description}</strong>
          </div>
          <table>
            <thead>
              <tr>
                {["الحساب", "البيان", "مركز التكلفة", "مدين", "دائن"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {e.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {data.accounts.find((a) => a.id === l.accountId)?.name ||
                      "—"}
                  </td>
                  <td>{l.description || e.description}</td>
                  <td>
                    {data.centers.find((c) => c.id === l.centerId)?.name || "—"}
                  </td>
                  <td className="numeric">{money(l.debit || 0)}</td>
                  <td className="numeric">{money(l.credit || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>الإجمالي</th>
                <td className="numeric">
                  {money(e.lines.reduce((s, l) => s + (l.debit || 0), 0))}
                </td>
                <td className="numeric">
                  {money(e.lines.reduce((s, l) => s + (l.credit || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      ))}
    </div>,
    document.body,
  );
}
