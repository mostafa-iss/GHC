import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { seed } from "../src/accounting.js";
import {
  classifyAccount,
  chartPlan,
  readWorkbook,
  extractWorkbook,
  importPlan,
  applyImport,
} from "../src/importer.js";
const header = [
  "",
  "مدين",
  "دائن",
  "نوع العملة",
  "اسم الحساب",
  "بيــــــــــان",
  "رقم القيد",
  "مرجع/فاتورة",
  "تاريخ",
  "ملاحظات",
];
const row = (
  d,
  c,
  name,
  date = "2026-01-01",
  text = "رسوم دورة",
  number = null,
) => [
  "",
  d,
  c,
  "ريال سعودي",
  name,
  text,
  number,
  "مرجع تجريبي",
  date,
  "ملاحظة",
];
const extract = (rows) =>
  extractWorkbook({
    اليومية: [["", "اليومية"], header, ...rows],
    "دليل الحسابات": [
      ["", "الحساب"],
      ["", "بنك تجريبي"],
      ["", "إيرادات"],
    ],
  });
const pair = () => [row(100, null, "بنك تجريبي"), row(null, 100, "إيرادات")];
test("classifies fees, contra-assets, partner accounts and drawings by substance", () => {
  assert.equal(classifyAccount("رسوم و عمولات بنكية").group, "541");
  assert.equal(classifyAccount("مجمع إهلاك نظام").normalBalance, "credit");
  assert.equal(classifyAccount("جاري الشريك أ").group, "321");
  assert.equal(classifyAccount("توزيعات أرباح").normalBalance, "debit");
  assert.equal(classifyAccount("رواتب مستحقة الدفع").group, "211");
});
test("chart uses unique hierarchical codes and reuses an existing capital account", () => {
  const d = seed();
  const p = chartPlan(
    ["رأس المال", "بنك تجريبي", "رسوم و عمولات بنكية", "بنك   تجريبي"],
    d,
  );
  assert.equal(p.items.length, 3);
  assert.equal(p.issues.length, 0);
  assert.equal(new Set(p.accounts.map((a) => a.code)).size, p.accounts.length);
  assert.equal(p.items.find((a) => a.name === "رأس المال").id, "capital");
  assert.equal(p.items.find((a) => a.name === "رأس المال").code, "311001");
  assert.equal(p.items.find((a) => a.name.includes("عمولات")).type, "expense");
  assert.equal(chartPlan(["حساب مجهول"], d).issues.length, 1);
});
test("un-numbered compound entries retain reference, notes and source rows; replay is idempotent", async () => {
  const d = seed();
  const x = extract([
    row(30, null, "بنك تجريبي"),
    row(70, null, "بنك تجريبي"),
    row(null, 100, "إيرادات"),
  ]);
  const p = await importPlan(x, d);
  assert.equal(p.ready.length, 1);
  assert.equal(p.ready[0].entry.lines.length, 3);
  assert.equal(p.ready[0].entry.lines[0].reference, "مرجع تجريبي");
  const next = applyImport(p, d);
  const replay = await importPlan(x, next);
  assert.equal(replay.duplicates.length, 1);
  assert.equal(applyImport(replay, next).entries.length, 1);
});
test("identical legitimate entries within the file keep distinct occurrence identifiers", async () => {
  const d = seed(),
    x = extract([...pair(), ...pair()]);
  const p = await importPlan(x, d);
  assert.equal(p.ready.length, 2);
  assert.notEqual(p.ready[0].key, p.ready[1].key);
  assert.equal((await importPlan(x, applyImport(p, d))).duplicates.length, 2);
});
test("blocks conflicting dates, zero amount rows and unbalanced groups without adjusting numbers", async () => {
  const d = seed(),
    x = extract([
      ...pair(),
      [],
      row(10, null, "بنك تجريبي", "2026-01-01"),
      row(null, 10, "إيرادات", "2026-01-02"),
      [],
      row(25, null, "بنك تجريبي"),
      row(null, 24, "إيرادات"),
      [],
      row(null, null, "بنك تجريبي"),
    ]);
  const p = await importPlan(x, d);
  assert.equal(p.ready.length, 1);
  assert.equal(p.errors.length, 3);
  assert.throws(() => applyImport(p, d));
  assert.equal(applyImport(p, d, { allowPartial: true }).entries.length, 1);
  assert.equal(applyImport(p, d, { accountsOnly: true }).entries.length, 0);
});
test("rounding to halalas never conceals an unbalanced compound entry", async () => {
  const d = seed();
  const p = await importPlan(
    extract([
      row(0.005, null, "بنك تجريبي"),
      row(0.005, null, "بنك تجريبي"),
      row(null, 0.01, "إيرادات"),
    ]),
    d,
  );
  assert.equal(p.ready.length, 0);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0].errors.join(" "), /غير متوازن/);
});
test("reads real XLSX cached formulas and styled dates without executing formulas", async () => {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("اليومية");
  s.addRow(["", "العنوان"]);
  s.addRow(header);
  s.addRow(
    row(
      { formula: "50+50", result: 100 },
      null,
      "بنك تجريبي",
      new Date("2026-01-01T00:00:00Z"),
    ),
  );
  s.addRow(row(null, 100, "إيرادات", new Date("2026-01-01T00:00:00Z")));
  s.getCell("I3").numFmt = "dd/mm/yyyy";
  s.getCell("I4").numFmt = "dd/mm/yyyy";
  const bytes = await w.xlsx.writeBuffer();
  const p = await importPlan(
    extractWorkbook(await readWorkbook(new File([bytes], "test.xlsx"))),
    seed(),
  );
  assert.equal(p.ready.length, 1);
  assert.equal(p.ready[0].debit, 10000);
  assert.equal(p.ready[0].entry.date, "2026-01-01");
});

test("changing references, annotations, filename or original numbering does not bypass replay protection", async () => {
  const data = seed();
  const first = extract(pair());
  const imported = applyImport(await importPlan(first, data), data);
  const next = extract(pair());
  for (const row of next.rows) {
    row.reference = "REF-CHANGED";
    row.notes = "ملاحظة جديدة";
    row.number = "99";
  }
  const preview = await importPlan(next, imported);
  assert.equal(preview.duplicates.length, 1);
  assert.equal(preview.ready.length, 0);
});
