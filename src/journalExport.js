import { brandedWorkbook, addReportTable, saveWorkbook } from "./exports.js";
import { entryDocuments, documentLink } from "./documents.js";
// Excel columns deliberately match the user's daily-journal workbook.
export function journalExportRows(data, entries) {
  const account = (id) => data.accounts.find((a) => a.id === id)?.name || "";
  return entries.flatMap((e) =>
    e.lines.map((l, i) => {
      const docs = entryDocuments(e, data.entryDocuments?.[e.id]);
      const link = l.documentLinks?.[0] || (!i ? docs[0] : null);
      return [
        "",
        (l.debit || 0) / 100,
        (l.credit || 0) / 100,
        "ريال سعودي",
        account(l.accountId),
        l.description || e.description,
        e.number || "D-" + e.draftNumber,
        link
          ? { text: l.reference || "Link", hyperlink: link.url }
          : l.reference || "",
        e.date,
        l.notes || "",
        data.centers.find((c) => c.id === l.centerId)?.name || "",
        e.status === "draft"
          ? "مسودة"
          : e.status === "deleted"
            ? "محذوف"
            : "مرحّل",
        !i ? docs.map((d) => d.url).join("\n") : "",
      ];
    }),
  );
}
export async function exportJournals(
  data,
  entries,
  { title = "اليومية", filename = "ghaith-journals.xlsx", logoBytes } = {},
) {
  const { book, sheet } = await brandedWorkbook({
    title,
    subtitle: "اليومية العامة — القيم بالريال السعودي",
    logoBytes,
  });
  sheet.name = "اليومية";
  addReportTable(
    sheet,
    [
      "",
      "مدين",
      "دائن",
      "نوع العملة",
      "اسم الحساب",
      "بيان",
      "رقم القيد",
      "مرجع/فاتورة",
      "تاريخ",
      "ملاحظات",
      "مركز التكلفة",
      "الحالة",
      "روابط Drive",
    ],
    journalExportRows(data, entries),
  );
  sheet.getColumn(1).width = 3;
  sheet.getColumn(5).width = 40;
  sheet.getColumn(6).width = 55;
  sheet.getColumn(13).width = 60;
  const chart = book.addWorksheet("دليل الحسابات", {
    views: [{ rightToLeft: true }],
  });
  chart.addRow(["كود الحساب", "اسم الحساب", "التصنيف", "الحساب الرئيسي"]);
  for (const a of data.accounts.filter(
    (a) => a.parentId && !data.accounts.some((x) => x.parentId === a.id),
  ))
    chart.addRow([
      a.code,
      a.name,
      a.type,
      data.accounts.find((x) => x.id === a.parentId)?.name || "",
    ]);
  chart.getColumn(1).width = 18;
  chart.getColumn(2).width = 45;
  chart.getColumn(3).width = 20;
  chart.getColumn(4).width = 40;
  chart.getRow(1).font = { bold: true };
  await saveWorkbook(book, filename);
}
