import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/accounting.js";
import {
  balanceSheet,
  monthlyComparison,
  previousMonth,
  isReportMonth,
  isReportDate,
  monthBounds,
} from "../src/financialReports.js";
import { copyJournal, makeTemplate } from "../src/templates.js";
test("report periods reject incomplete and out-of-range input and use real calendar month ends", () => {
  for (const value of [
    "",
    "2026",
    "2026-",
    "2026-00",
    "2026-13",
    "20261-01",
    "0000-01",
    null,
  ]) {
    assert.equal(isReportMonth(value), false);
    assert.throws(() => monthBounds(value), /شهرًا صحيحًا/);
  }
  for (const [month, end] of [
    ["2026-02", "28"],
    ["2024-02", "29"],
    ["1900-02", "28"],
    ["2000-02", "29"],
    ["0004-02", "29"],
    ["9999-12", "31"],
  ]) {
    assert.equal(isReportMonth(month), true);
    assert.deepEqual(monthBounds(month), {
      from: month + "-01",
      to: month + "-" + end,
    });
  }
  assert.equal(isReportDate("2024-02-29"), true);
  for (const value of [
    "",
    "2026-02-29",
    "2026-01-00",
    "2026-04-31",
    "20261-01-01",
    "0000-01-01",
  ])
    assert.equal(isReportDate(value), false);
});
const entry = (n, date, debit, credit, amount, centerId = "one") => ({
  id: String(n),
  number: n,
  date,
  description: "حركة",
  lines: [
    { accountId: debit, debit: amount, credit: 0, centerId },
    { accountId: credit, debit: 0, credit: amount, centerId },
  ],
});
function fixture() {
  const d = seed();
  d.centers = [
    { id: "one", code: "1", name: "أ" },
    { id: "two", code: "2", name: "ب" },
  ];
  d.accounts.push(
    {
      id: "loan",
      code: "2101",
      name: "قرض",
      type: "liability",
      parentId: "liability",
    },
    {
      id: "draw",
      code: "3102",
      name: "مسحوبات",
      type: "equity",
      parentId: "equity",
      normalBalance: "debit",
    },
    {
      id: "depreciation",
      code: "1103",
      name: "مجمع الإهلاك",
      type: "asset",
      parentId: "asset",
      normalBalance: "credit",
    },
  );
  d.entries = [
    entry(1, "2025-01-01", "cash", "capital", 100000),
    entry(2, "2025-12-01", "cash", "courses", 10000),
    entry(3, "2026-01-02", "cash", "courses", 20000),
    entry(4, "2026-01-03", "teachers", "cash", 5000),
    entry(5, "2026-02-01", "cash", "courses", 40000, "two"),
    entry(6, "2026-02-02", "teachers", "cash", 10000, "two"),
    entry(7, "2026-01-01", "bank", "loan", 50000),
    entry(8, "2026-01-01", "draw", "cash", 7000),
    entry(9, "2026-01-03", "teachers", "depreciation", 3000),
  ];
  d.draftEntries = [entry(10, "2026-01-01", "cash", "courses", 999999)];
  return d;
}
test("balance sheet handles retained results, contra assets, drawings and date cutoff without double counting parent accounts", () => {
  const b = balanceSheet(fixture(), "2026-01-31");
  assert.equal(b.assets, 165000);
  assert.equal(b.liabilities, 50000);
  assert.equal(b.result, 22000);
  assert.equal(b.equity, 115000);
  assert.equal(b.difference, 0);
  assert.equal(
    b.sections[0].rows.find((a) => a.id === "depreciation").amount,
    -3000,
  );
});
test("monthly comparison uses month movement rather than brought-forward balances, including centers and zero baseline", () => {
  const d = fixture();
  const r = monthlyComparison(d, "2026-01", "2025-12");
  assert.equal(r.summary[0].current, 20000);
  assert.equal(r.summary[0].previous, 10000);
  assert.equal(r.summary[0].percent, 100);
  assert.equal(r.summary[1].percent, null);
  assert.equal(r.accounts.find((a) => a.id === "courses").current, 20000);
  assert.equal(r.summary[2].current, 12000);
  assert.equal(
    monthlyComparison(d, "2026-02", "2026-01", "one").summary[0].current,
    0,
  );
  assert.equal(previousMonth("2026-01"), "2025-12");
});
test("copy and template omit identity, attachment and import metadata while preserving journal amounts", () => {
  const d = fixture(),
    e = {
      ...d.entries[2],
      attachments: [{ path: "private/x.pdf" }],
      importKey: "original",
      documentLinks: [{ url: "https://example.com" }],
      sourceRows: [1, 2],
    };
  const copy = copyJournal(e, "2026-03-01");
  assert.notEqual(copy.id, e.id);
  assert.equal(copy.date, "2026-03-01");
  assert.equal(copy.number, undefined);
  assert.equal(copy.importKey, undefined);
  assert.deepEqual(copy.attachments, []);
  assert.equal(copy.documentLinks, undefined);
  assert.equal(copy.lines[0].debit, 20000);
  const t = makeTemplate(e, "رواتب", d);
  assert.equal(t.name, "رواتب");
  assert.equal(t.attachments, undefined);
  assert.equal(d.entries.length, 9);
});
