import test from "node:test";
import assert from "node:assert/strict";
import { seed, emptyState } from "../src/accounting.js";
import {
  incomeStatement,
  incomeExport,
  reportMonths,
} from "../src/incomeStatement.js";
test("monthly income respects year boundaries, posted lifecycle, center filters, reversals and totals", () => {
  const data = seed();
  const entry = (id, date, amount, centerId = "", status = "posted") => ({
    id,
    number: id,
    date,
    status,
    lines: [
      {
        accountId: "cash",
        debit: Math.max(amount, 0),
        credit: Math.max(-amount, 0),
        centerId,
      },
      {
        accountId: "courses",
        credit: Math.max(amount, 0),
        debit: Math.max(-amount, 0),
        centerId,
      },
    ],
  });
  data.entries = [
    entry(1, "2025-12-31", 10000, "a"),
    entry(2, "2026-01-01", 20000, "a"),
    entry(3, "2026-01-15", -5000, "a"),
    entry(4, "2026-01-16", 90000, "b"),
    entry(5, "2026-02-01", 70000, "a"),
    entry(6, "2026-01-05", 99000, "a", "draft"),
  ];
  const r = incomeStatement(data, "2025-12", "2026-01", "a");
  assert.deepEqual(r.months, ["2025-12", "2026-01"]);
  assert.deepEqual(r.values, [10000, 15000]);
  assert.equal(r.total, 25000);
  assert.equal(r.sections[0].total, 25000);
  assert.equal(incomeExport(r, true).rows.at(-1).at(-1), 250);
  assert.equal(incomeExport(r, false).headers.length, 3);
  assert.throws(() => reportMonths("2026-02", "2026-01"));
  assert.throws(() => reportMonths("2024-01", "2026-01"));
  assert.throws(() => reportMonths("", "2026-01"));
  assert.equal(reportMonths("2025-01", "2026-12").length, 24);
});
test("new GHC installation has no accounts, journals or centers", () => {
  const state = emptyState();
  assert.deepEqual(state.accounts, []);
  assert.deepEqual(state.entries, []);
  assert.deepEqual(state.centers, []);
  assert.equal(incomeStatement(state, "2026-01", "2026-03").total, 0);
});

test('empty company can be backed up without inventing chart accounts', async () => {
  const { validateSnapshot } = await import('../src/backup.js');
  assert.doesNotThrow(() => validateSnapshot(emptyState()));
});
