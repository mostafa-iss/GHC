import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { unzipSync, strFromU8 } from "fflate";
import {
  documentLink,
  parseDocumentLinks,
  mergeDocuments,
  entryDocuments,
} from "../src/documents.js";
import {
  readWorkbook,
  extractWorkbook,
  importPlan,
  applyImport,
} from "../src/importer.js";
import { seed } from "../src/accounting.js";
import { brandedWorkbook, addReportTable } from "../src/exports.js";
const url = "https://drive.google.com/file/d/EXAMPLE_TEST_FILE/view";
test("document URLs reject executable schemes and embedded credentials; duplicates are collapsed", () => {
  assert.throws(() => documentLink("javascript:alert(1)"));
  assert.throws(() => documentLink("https://user:pass@example.com/file"));
  assert.equal(parseDocumentLinks(url + "\n" + url).length, 1);
  assert.equal(mergeDocuments([{ url: "javascript:alert(1)" }]).length, 0);
  assert.equal(
    entryDocuments({ documentLinks: [{ url }], lines: [] }, []).length,
    0,
  );
});
async function fixture(formula = false) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("اليومية");
  s.addRow(["", "اليومية"]);
  s.addRow([
    "",
    "مدين",
    "دائن",
    "نوع العملة",
    "اسم الحساب",
    "بيان",
    "رقم القيد",
    "مرجع/فاتورة",
    "تاريخ",
  ]);
  s.addRow([
    "",
    100,
    null,
    "ريال سعودي",
    "بنك تجريبي",
    "اختبار روابط",
    null,
    formula
      ? { formula: `HYPERLINK("${url}","Link")`, result: "Link" }
      : { text: "Link", hyperlink: url },
    "2026-01-01",
  ]);
  s.addRow([
    "",
    null,
    100,
    "ريال سعودي",
    "إيرادات",
    "اختبار روابط",
    null,
    "",
    "2026-01-01",
  ]);
  return extractWorkbook(
    await readWorkbook(
      new File([await w.xlsx.writeBuffer()], "documents.xlsx"),
    ),
  );
}
test("imports the real URL behind Excel Link text and literal HYPERLINK formulas", async () => {
  for (const formula of [false, true]) {
    const p = await importPlan(await fixture(formula), seed());
    assert.equal(p.ready.length, 1);
    assert.equal(p.ready[0].entry.documentLinks[0].url, url);
    assert.equal(p.ready[0].entry.lines[0].reference, "Link");
  }
});
test("reimport restores Drive URLs for a previously posted entry without modifying financial entries", async () => {
  const x = await fixture(),
    initial = seed(),
    p = await importPlan(x, initial),
    old = applyImport(p, initial);
  for (const e of old.entries) {
    delete e.documentLinks;
    for (const l of e.lines) delete l.documentLinks;
  }
  const before = JSON.stringify(old.entries);
  const preview = await importPlan(x, old);
  assert.equal(preview.duplicates.length, 1);
  assert.equal(preview.linkUpdates.length, 1);
  const next = applyImport(preview, old);
  assert.equal(JSON.stringify(next.entries), before);
  assert.equal(next.entryDocuments[old.entries[0].id][0].url, url);
  assert.equal((await importPlan(x, next)).linkUpdates.length, 0);
});
test("exported XLSX embeds the actual Ghaith PNG and retains numeric accounting values", async () => {
  const image = new Uint8Array(
    fs.readFileSync(new URL("../src/assets/ghc-logo.png", import.meta.url)),
  );
  const { book, sheet } = await brandedWorkbook({
    title: "قائمة الدخل",
    subtitle: "فترة الاختبار",
    logoBytes: image,
  });
  addReportTable(
    sheet,
    ["الحساب", "البيان", "القيمة (SAR)"],
    [
      ["411001", "إيرادات", 1250.5],
      ["", "صافي الربح / الخسارة", 1250.5],
    ],
  );
  const bytes = await book.xlsx.writeBuffer(),
    zip = unzipSync(new Uint8Array(bytes));
  assert(
    Object.keys(zip).some(
      (k) => k.startsWith("xl/media/") && k.endsWith(".png"),
    ),
  );
  assert(strFromU8(zip["xl/worksheets/sheet1.xml"]).includes("GHC Academy"));
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(bytes);
  assert.equal(read.worksheets[0].getCell("C11").value, 1250.5);
  assert.equal(read.worksheets[0].getRow(10).getCell(3).value, "القيمة (SAR)");
});
