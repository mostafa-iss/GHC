import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  reportRows,
  ledger,
  postingAccounts,
} from "../src/accounting.js";
import {
  saveJournal,
  changeJournalState,
  allJournals,
  filterJournals,
  resetJournals,
} from "../src/journals.js";
import { journalExportRows } from "../src/journalExport.js";
import { extractWorkbook, importPlan, applyImport } from "../src/importer.js";
const e = (amount = 10000) => ({
  id: crypto.randomUUID(),
  date: "2026-01-01",
  description: "إيرادات دورة العربية",
  lines: [
    {
      accountId: "cash",
      debit: amount,
      credit: 0,
      description: "تحصيل الدورة",
    },
    {
      accountId: "courses",
      debit: 0,
      credit: amount,
      description: "تحصيل الدورة",
    },
  ],
  attachments: [],
});
const cash = (d) => reportRows(d).find((a) => a.id === "cash").closing;
test("drafts, posting, conversion and physical deletion affect every accounting report correctly", () => {
  let d = seed(),
    x = e();
  x.lines[1].credit = 9000;
  d = saveJournal(d, x);
  assert.equal(d.entries.length, 0);
  assert.equal(d.draftEntries.length, 1);
  assert.equal(cash(d), 0);
  assert.equal(ledger(d, { accountId: "cash" }).length, 0);
  assert.throws(() => changeJournalState(d, x.id, "post"), /غير متوازن/);
  x.lines[1].credit = 10000;
  d = saveJournal(d, x);
  d = changeJournalState(d, x.id, "post");
  assert.equal(cash(d), 10000);
  assert.equal(d.draftEntries.length, 0);
  d = changeJournalState(d, x.id, "draft");
  assert.equal(cash(d), 0);
  assert.equal(d.entries.length, 0);
  d = changeJournalState(d, x.id, "post");
  assert.equal(cash(d), 10000);
  d = changeJournalState(d, x.id, "delete");
  assert.equal(cash(d), 0);
  assert.equal(allJournals(d).length, 0);
  assert(d.journalEvents.some((e) => e.action === "حذف القيد"));
});
test("posted numbers are not reused after individual deletion; explicit full reset restarts them", () => {
  let d = saveJournal(seed(), e(), { post: true });
  const first = d.entries[0];
  d = changeJournalState(d, first.id, "delete");
  d = saveJournal(d, e(), { post: true });
  assert.equal(d.entries[0].number, 2);
  d = resetJournals(d);
  d = saveJournal(d, e(), { post: true });
  assert.equal(d.entries[0].number, 1);
});
test("only terminal non-root accounts can be used, including an otherwise empty root", () => {
  const d = seed();
  assert(!postingAccounts(d.accounts).some((a) => a.id === "liability"));
  const x = e();
  x.lines[0].accountId = "liability";
  assert.throws(() => saveJournal(d, x), /آخر حساب فرعي/);
  assert.throws(() => saveJournal(d, x, { post: true }), /فرعي/);
});
test("title substring search normalizes Arabic and account filtering matches either journal side", () => {
  let d = saveJournal(seed(), e(), { post: true });
  d = saveJournal(d, { ...e(), description: "شراء مستلزمات" });
  assert.equal(filterJournals(d, { search: "ايراد" }).length, 1);
  assert.equal(filterJournals(d, { search: "عر" }).length, 1);
  assert.equal(filterJournals(d, { accountId: "courses" }).length, 2);
  assert.equal(filterJournals(d, { accountId: "bank" }).length, 0);
  assert.equal(filterJournals(d, { status: "draft" }).length, 1);
});
test("exported daily journal columns can be imported again and draft imports remain outside reports", async () => {
  const d = saveJournal(seed(), e(), { post: true });
  const rows = journalExportRows(d, allJournals(d));
  const header = [
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
  ];
  const x = extractWorkbook({
    اليومية: [header, ...rows],
    "دليل الحسابات": [
      ["كود الحساب", "اسم الحساب"],
      ["1101", "الصندوق"],
      ["4101", "إيرادات الدورات التعليمية"],
    ],
  });
  const plan = await importPlan(x, seed());
  assert.equal(plan.ready.length, 1);
  const imported = applyImport(plan, seed(), { asDraft: true });
  assert.equal(imported.entries.length, 0);
  assert.equal(imported.draftEntries.length, 1);
  assert.equal(cash(imported), 0);
  assert.equal((await importPlan(x, imported)).duplicates.length, 1);
});
