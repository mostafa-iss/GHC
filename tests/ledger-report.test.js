import test from "node:test";
import assert from "node:assert/strict";
import { seed, reportRows } from "../src/accounting.js";
import {
  ledgerReport,
  ledgerExportRows,
  ledgerPeriodError,
} from "../src/ledgerReport.js";
function fixture() {
  const d = seed();
  d.accounts.push({
    id: "depreciation",
    code: "129001",
    name: "مجمع الإهلاك",
    type: "asset",
    parentId: "asset",
    normalBalance: "credit",
  });
  const e = (
    number,
    date,
    debit,
    credit,
    amount,
    centerId = "one",
    description = "حركة",
  ) => ({
    id: "e" + number,
    number,
    date,
    description,
    lines: [
      { accountId: debit, debit: amount, credit: 0, centerId },
      { accountId: credit, debit: 0, credit: amount, centerId },
    ],
  });
  d.entries = [
    e(1, "2026-01-01", "cash", "courses", 10000),
    e(2, "2026-01-01", "bank", "capital", 20000),
    e(3, "2026-02-01", "bank", "cash", 3000),
    e(4, "2026-02-02", "teachers", "cash", 2500),
    e(5, "2026-02-03", "cash", "courses", 4000, "two", "تحصيل إيرادات المركز"),
    e(6, "2026-02-04", "teachers", "depreciation", 1000),
    e(7, "2026-03-01", "cash", "courses", 99999),
  ];
  d.draftEntries = [e(8, "2026-02-05", "cash", "courses", 88888)];
  return d;
}
test("a parent ledger contains only its posting descendants, with separate running balances and debit/credit closing totals", () => {
  const d = fixture(),
    report = ledgerReport(d, {
      accountId: "asset",
      from: "2026-02-01",
      to: "2026-02-28",
    });
  assert.equal(report.groups.length, 3);
  assert(report.groups.every((g) => g.account.type === "asset"));
  assert(
    report.groups.every((g) =>
      g.rows.every((r) => r.accountId === g.account.id),
    ),
  );
  const cash = report.groups.find((g) => g.account.id === "cash"),
    bank = report.groups.find((g) => g.account.id === "bank");
  assert.equal(cash.opening, 10000);
  assert.deepEqual(
    cash.rows.map((r) => r.balance),
    [7000, 4500, 8500],
  );
  assert.equal(bank.opening, 20000);
  assert.deepEqual(
    bank.rows.map((r) => r.balance),
    [23000],
  );
  assert.equal(report.totals.debit, 7000);
  assert.equal(report.totals.credit, 6500);
  assert.equal(report.totals.closingDebit, 31500);
  assert.equal(report.totals.closingCredit, 1000);
  assert.equal(cash.rows.at(-1).description, "تحصيل إيرادات المركز");
  for (const g of report.groups) {
    const row = reportRows(d, {
      accountId: g.account.id,
      from: "2026-02-01",
      to: "2026-02-28",
    })[0];
    assert.equal(g.opening, row.opening);
    assert.equal(g.closing, row.closing);
    assert.equal(g.debit, row.debit);
    assert.equal(g.credit, row.credit);
  }
});
test("date, center, empty-period and zero-account filters retain correct openings and never include drafts or future movements", () => {
  const d = fixture(),
    f = {
      accountId: "asset",
      from: "2026-02-01",
      to: "2026-02-28",
      centerId: "one",
    },
    r = ledgerReport(d, f);
  assert.equal(r.groups.find((g) => g.account.id === "cash").closing, 4500);
  assert(
    r.groups
      .flatMap((g) => g.rows)
      .every((row) => !["e5", "e7", "e8"].includes(row.entryId)),
  );
  const later = ledgerReport(d, { accountId: "cash", from: "2026-04-01" })
    .groups[0];
  assert.equal(later.rows.length, 0);
  assert.equal(later.closing, later.opening);
  assert.equal(
    ledgerReport(d, { accountId: "liability", showAccounts: "active" }).groups
      .length,
    0,
  );
  assert.equal(ledgerReport(d, { accountId: "unknown" }).groups.length, 0);
  assert.equal(ledgerReport(d, {}).groups.length, 0);
  assert.equal(ledgerReport(d, { accountId: "liability" }).groups.length, 0);
  assert(ledgerPeriodError({ from: "20261-01-01" }));
  assert(ledgerPeriodError({ from: "2026-03-01", to: "2026-01-01" }));
  assert.throws(() => ledgerReport(d, { from: "20261-01-01" }));
});
test("ledger export repeats the exact account identity and independent balance on each movement", () => {
  const d = fixture(),
    r = ledgerReport(d, {
      accountId: "asset",
      from: "2026-02-01",
      to: "2026-02-28",
    }),
    rows = ledgerExportRows(r);
  const transfer = rows.filter((row) => row[2] === 3);
  assert.equal(transfer.length, 2);
  assert.notEqual(transfer[0][0], transfer[1][0]);
  assert.deepEqual(
    transfer.map((row) => row[7]).sort((a, b) => a - b),
    [70, 230],
  );
  assert.deepEqual(rows.at(-1).slice(5), [70, 65, 315, 10]);
  assert(rows.every((row) => !String(row[0]).includes("إيرادات")));
});
