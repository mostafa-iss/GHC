import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postingAccounts, validateEntry } from "../src/accounting.js";
import { validateDraft } from "../src/journals.js";
import { validateSnapshot } from "../src/backup.js";
import { incomeStatement } from "../src/incomeStatement.js";
const accounts = JSON.parse(
  readFileSync(new URL("../supabase/ghc-chart-accounts.json", import.meta.url)),
);
test("GHC chart has requested empty folders, posting expense leaves and correct contra revenue", () => {
  const data = { accounts, centers: [], entries: [], draftEntries: [] };
  validateSnapshot(data);
  const code = (c) => accounts.find((a) => a.code === c);
  const leaves = postingAccounts(accounts);
  for (const c of ["11", "1202"]) {
    assert.equal(code(c).isGroup, true);
    assert.equal(
      accounts.some((a) => a.parentId === code(c).id),
      false,
    );
    assert.equal(leaves.includes(code(c)), false);
  }
  for (const c of [
    "5101",
    "5201",
    "5202",
    "5301",
    "5302",
    "5401",
    "3201",
    "120301",
    "120101",
  ])
    assert(leaves.includes(code(c)));
  assert.equal(code("3201").type, "equity");
  assert.equal(code("4201").normalBalance, "debit");
  const e = {
    id: "e",
    number: 1,
    date: "2026-11-01",
    description: "مردود رسوم",
    lines: [
      { accountId: code("4201").id, debit: 1000, credit: 0 },
      { accountId: code("120101").id, debit: 0, credit: 1000 },
    ],
  };
  validateEntry(e, accounts, []);
  data.entries = [e];
  assert.equal(incomeStatement(data, "2026-11", "2026-11").total, -1000);
  const invalid = {
    ...e,
    lines: [{ ...e.lines[0], accountId: code("11").id }, e.lines[1]],
  };
  assert.throws(() => validateEntry(invalid, accounts, []));
  assert.throws(() => validateDraft(invalid, accounts, []));
});
