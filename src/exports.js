import { BRAND_NAME, logoBytes as fetchLogoBytes } from "./brand.js";
export async function brandedWorkbook({
  title,
  subtitle = "",
  logoBytes,
} = {}) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const book = new ExcelJS.Workbook();
  book.creator = BRAND_NAME;
  book.created = new Date();
  book.subject = title;
  book.title = title;
  const sheet = book.addWorksheet(
    (title || "تقرير").replace(/[\\/*?:\[\]]/g, " ").slice(0, 31),
    {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 10 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.3,
          bottom: 0.3,
          header: 0.1,
          footer: 0.1,
        },
      },
    },
  );
  sheet.columns = Array.from({ length: 8 }, () => ({ width: 22 }));
  for (let i = 1; i <= 8; i++) sheet.getRow(i).height = 19;
  const bytes = logoBytes || (await fetchLogoBytes());
  const image = book.addImage({ buffer: bytes, extension: "png" });
  sheet.addImage(image, {
    tl: { col: 0, row: 0 },
    ext: { width: 112, height: 146 },
    editAs: "oneCell",
  });
  sheet.mergeCells("B2:H3");
  sheet.getCell("B2").value = BRAND_NAME + " — " + title;
  sheet.getCell("B2").font = {
    name: "Cairo",
    bold: true,
    size: 17,
    color: { argb: "FF24384B" },
  };
  sheet.getCell("B2").alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells("B5:H6");
  sheet.getCell("B5").value = subtitle;
  sheet.getCell("B5").alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  sheet.getCell("B5").font = {
    name: "Cairo",
    size: 11,
    color: { argb: "FF647887" },
  };
  sheet.headerFooter.oddFooter = "&C" + BRAND_NAME + " — &P / &N";
  sheet.pageSetup.printTitlesRow = "1:10";
  return { book, sheet };
}
export function addReportTable(sheet, headers, rows, { startRow = 10 } = {}) {
  const header = sheet.getRow(startRow);
  header.values = headers;
  header.height = 29;
  header.eachCell((c) => {
    c.font = {
      name: "Cairo",
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
    };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D6263" },
    };
    c.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  });
  for (let i = 0; i < rows.length; i++) {
    const row = sheet.getRow(startRow + i + 1);
    row.values = rows[i];
    row.height = 25;
    row.eachCell((cell, col) => {
      cell.font = { name: "Cairo", size: 11, color: { argb: "FF24384B" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: typeof cell.value === "number" ? "left" : "right",
        wrapText: true,
      };
      if (
        typeof cell.value === "number" &&
        headers[col - 1]?.match(/مدين|دائن|رصيد|مبلغ|قيمة|إجمالي|صافي/)
      )
        cell.numFmt = "#,##0.00;[Red](#,##0.00)";
      if (i % 2 === 0)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F7F6" },
        };
    });
  }
  sheet.getColumn(2).width = 44;
  sheet.autoFilter = {
    from: { row: startRow, column: 1 },
    to: { row: startRow + rows.length, column: headers.length },
  };
  return sheet;
}
export async function saveWorkbook(book, filename) {
  const blob = new Blob([await book.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export async function exportReport({
  title,
  subtitle,
  headers,
  rows,
  filename,
}) {
  const { book, sheet } = await brandedWorkbook({ title, subtitle });
  addReportTable(sheet, headers, rows);
  await saveWorkbook(book, filename);
}
