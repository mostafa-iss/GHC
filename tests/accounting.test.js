import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  cents,
  validateEntry,
  reportRows,
  ledger,
} from "../src/accounting.js";
const make = (date, amount = 10000, centerId = "") => ({
  id: date,
  date,
  number: 1,
  description: "رسوم دورة",
  lines: [
    { accountId: "cash", debit: amount, credit: 0, centerId },
    { accountId: "courses", debit: 0, credit: amount, centerId },
  ],
});
test("money uses integer halalas and rejects excess precision", () => {
  assert.equal(cents("10.25"), 1025);
  assert.throws(() => cents("1.001"));
  assert.throws(() => cents("-2"));
});
test("balanced entries require posting accounts and one side per line", () => {
  const d = seed();
  assert.equal(validateEntry(make("2026-01-01"), d.accounts, []), true);
  const e = make("2026-01-01");
  e.lines[0].debit++;
  assert.throws(() => validateEntry(e, d.accounts, []));
  e.lines[0].accountId = "asset";
  assert.throws(() => validateEntry(e, d.accounts, []));
});
test("trial balance distinguishes opening and period; ledger includes opening", () => {
  const d = seed();
  d.entries = [make("2026-01-01"), make("2026-02-01", 5000)];
  const f = { from: "2026-02-01", to: "2026-02-28", accountId: "cash" };
  const row = reportRows(d, f)[0];
  assert.equal(row.opening, 10000);
  assert.equal(row.debit, 5000);
  assert.equal(row.closing, 15000);
  assert.equal(ledger(d, f)[0].balance, 15000);
  const all = reportRows(d, { from: "2026-02-01", to: "2026-02-28" });
  assert.equal(
    all.reduce((s, r) => s + r.debit - r.credit, 0),
    0,
  );
});
test("cost center filter excludes other center movements", () => {
  const d = seed();
  d.entries = [make("2026-02-01", 5000, "a"), make("2026-02-02", 9000, "b")];
  assert.equal(
    reportRows(d, { centerId: "a" }).find((r) => r.id === "courses").credit,
    5000,
  );
});
