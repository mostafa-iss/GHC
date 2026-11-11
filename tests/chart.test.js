import test from "node:test";
import assert from "node:assert/strict";
import { seed, postingAccounts, ledger } from "../src/accounting.js";
import { curatedChart } from "../src/curatedChart.js";
import {
  chartModel,
  accountMovement,
  accountDeletionError,
} from "../src/chart.js";
import { validateSnapshot } from "../src/backup.js";

const chartNames = [
  "سيستم تعليمي",
  "مجمع إهلاك السيستم",
  "مكتبة تعليمية",
  "بنك تجريبي",
  "محفظة PayPal",
  "اشتراك أنظمة",
  "مصروف إهلاك",
  "رأس المال",
  "جاري الشريك أ",
  "توزيعات أرباح",
  "الأرباح والخسائر المرحلة",
];
export function fixture() {
  const d = curatedChart(seed(), chartNames).data;
  const id = (name) =>
    d.accounts.find(
      (a) => a.name === name && !d.accounts.some((c) => c.parentId === a.id),
    ).id;
  const e = (number, date, debit, credit, amount) => ({
    id: "j" + number,
    number,
    date,
    description: "حركة " + number,
    attachments: [],
    lines: [
      { accountId: id(debit), debit: amount, credit: 0 },
      { accountId: id(credit), debit: 0, credit: amount },
    ],
  });
  d.entries = [
    e(1, "2026-01-01", "بنك تجريبي", "رأس المال", 10000),
    e(2, "2026-02-01", "اشتراك أنظمة", "بنك تجريبي", 2500),
    e(3, "2026-02-02", "مصروف إهلاك", "مجمع إهلاك السيستم", 1000),
  ];
  d.draftEntries = [
    {
      ...e(4, "2026-02-03", "بنك تجريبي", "رأس المال", 99999),
      draftNumber: 1,
    },
  ];
  return d;
}
test("chart setup retains exactly the supplied posting accounts, stable used identities and no demo accounts", () => {
  const d = fixture();
  const c = curatedChart(d, chartNames);
  assert.equal(chartNames.length, 11);
  assert.deepEqual(
    postingAccounts(c.data.accounts)
      .map((a) => a.name)
      .sort(),
    [...chartNames].sort(),
  );
  assert.deepEqual(c.data.entries, d.entries);
  assert.deepEqual(c.data.draftEntries, d.draftEntries);
  for (const name of chartNames) {
    const a = postingAccounts(d.accounts).find((a) => a.name === name),
      b = c.data.accounts.find((b) => b.id === a.id);
    assert.equal(a.code, b.code);
    assert.equal(a.type, b.type);
  }
  assert.equal(
    postingAccounts(c.data.accounts).find(
      (a) => a.name === "مجمع إهلاك السيستم",
    ).normalBalance,
    "credit",
  );
  assert.equal(
    postingAccounts(c.data.accounts).find((a) => a.name === "توزيعات أرباح")
      .normalBalance,
    "debit",
  );
  validateSnapshot(c.data);
});
test("chart cleanup refuses to remove any extra account referenced by journals, drafts, templates or finance", () => {
  for (const kind of [
    "entries",
    "draftEntries",
    "journalTemplates",
    "financeAccounts",
  ]) {
    const d = fixture();
    d.accounts.push({
      id: "extra",
      name: "حساب إضافي",
      code: "199001",
      type: "asset",
      parentId: "asset",
    });
    if (kind === "financeAccounts") d[kind] = [{ accountId: "extra" }];
    else d[kind] = [...(d[kind] || []), { lines: [{ accountId: "extra" }] }];
    assert.throws(() => curatedChart(d, chartNames), /خارج القائمة/);
    assert.match(accountDeletionError(d, "extra"), /مرتبط|مستخدم/);
  }
});
test("folder balances aggregate posted descendants once, net contra assets, and exclude drafts", () => {
  const d = fixture(),
    m = chartModel(d);
  const asset = d.accounts.find((a) => a.code === "1"),
    equity = d.accounts.find((a) => a.code === "3");
  assert.equal(m.balances.get(asset.id), 6500);
  assert.equal(m.balances.get(equity.id), -10000);
  for (const a of d.accounts) {
    assert.equal(
      m.balances.get(a.id),
      ledger(d, { accountId: a.id }).at(-1)?.balance || 0,
    );
  }
});
test("account movements retain opening and closing balances when filtering, including an empty period", () => {
  const d = fixture(),
    id = d.accounts.find((a) => a.name === "بنك تجريبي").id;
  const period = accountMovement(d, id, {
    from: "2026-02-01",
    to: "2026-02-28",
  });
  assert.equal(period.opening, 10000);
  assert.equal(period.credit, 2500);
  assert.equal(period.closing, 7500);
  assert.equal(period.rows.length, 1);
  const empty = accountMovement(d, id, { from: "2026-03-01" });
  assert.equal(empty.opening, 7500);
  assert.equal(empty.closing, 7500);
  assert.equal(empty.rows.length, 0);
  assert.match(accountDeletionError(d, "asset"), /فرعية/);
});
