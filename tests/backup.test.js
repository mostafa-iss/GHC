import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { seed } from "../src/accounting.js";
import {
  createBackupArchive,
  readBackup,
  restoredState,
  executeRestore,
  validateSnapshot,
} from "../src/backup.js";
function state() {
  const d = seed();
  d.entries = [
    {
      id: "posted",
      number: 7,
      date: "2026-01-01",
      description: "رسوم",
      lines: [
        { accountId: "cash", debit: 10000, credit: 0 },
        { accountId: "courses", debit: 0, credit: 10000 },
      ],
      attachments: [],
    },
  ];
  d.draftEntries = [
    {
      id: "draft",
      draftNumber: 1,
      date: "2026-01-02",
      description: "مسودة",
      lines: [{ accountId: "cash", debit: 1000, credit: 0 }],
      attachments: [{ path: "draft/receipt.pdf", name: "receipt.pdf" }],
    },
  ];
  d.financeAccounts = [
    {
      id: "bank-config",
      kind: "bank",
      name: "البنك",
      accountId: "bank",
      statementLinks: [{ url: "https://example.com/statement", label: "كشف" }],
    },
  ];
  d.journalTemplates = [
    {
      id: "template",
      name: "قالب",
      description: "قالب",
      lines: d.entries[0].lines,
    },
  ];
  d.entryDocuments = { posted: [{ url: "https://example.com/document" }] };
  return d;
}
test("backup includes draft attachments; restoration remaps all relationships and preserves displayed numbering", async () => {
  const d = state();
  const blob = await createBackupArchive({ data: d, version: 4 }, async () =>
    strToU8("%PDF-1.4\nexample"),
  );
  const plan = await readBackup(blob);
  assert.equal(plan.summary.attachments, 1);
  assert.equal(plan.files[0].mimeType, "application/pdf");
  const restored = restoredState(
    d,
    new Map([
      ["draft/receipt.pdf", { path: "new/receipt.pdf", name: "receipt.pdf" }],
    ]),
  );
  assert.equal(restored.entries[0].number, 7);
  assert.notEqual(restored.entries[0].id, "posted");
  assert.equal(
    restored.entries[0].lines[0].accountId,
    restored.accounts.find((a) => a.code === "1101").id,
  );
  assert.equal(
    restored.financeAccounts[0].accountId,
    restored.accounts.find((a) => a.code === "1102").id,
  );
  assert.equal(
    restored.journalTemplates[0].lines[0].accountId,
    restored.entries[0].lines[0].accountId,
  );
  assert(restored.entryDocuments[restored.entries[0].id]);
  assert.equal(restored.draftEntries[0].attachments[0].path, "new/receipt.pdf");
  assert.equal(
    restored.entryLifecycle[restored.draftEntries[0].id].status,
    "draft",
  );
});
test("restore preview refuses missing attachments, invalid account cycles, unbalanced entries and corrupt archives", async () => {
  const d = state();
  const file = new Blob([
    zipSync({
      "accounting.json": strToU8(
        JSON.stringify({ format: "ghaith-backup-v1", data: d }),
      ),
    }),
  ]);
  await assert.rejects(readBackup(file), /ناقص/);
  const bad = structuredClone(d);
  bad.entries[0].lines[0].debit++;
  assert.throws(() => validateSnapshot(bad), /متوازن/);
  bad.entries = d.entries;
  bad.accounts[0].parentId = "cash";
  assert.throws(() => validateSnapshot(bad), /تسلسل/);
  await assert.rejects(readBackup(new Blob(["not a zip"])));
});
test("restore rejects stale preview before writes and cleans staged files after a failed atomic save", async () => {
  const d = state(),
    plan = await readBackup(
      await createBackupArchive({ data: d, version: 4 }, async () =>
        strToU8("%PDF-1.4\nexample"),
      ),
    );
  const events = [];
  const io = {
    read: async () => ({ data: d, version: 4 }),
    backup: async () => events.push("backup"),
    upload: async () => ({ path: "staged/receipt.pdf", name: "receipt.pdf" }),
    save: async () => {
      throw Error("conflict");
    },
    remove: async (paths) => events.push(paths),
  };
  await assert.rejects(executeRestore(plan, 3, io), /تغيرت/);
  assert.deepEqual(events, []);
  await assert.rejects(executeRestore(plan, 4, io), /conflict/);
  assert.deepEqual(events, ["backup", ["staged/receipt.pdf"]]);
});
test("ambiguous save completion recovers the committed snapshot and never deletes its attachments", async () => {
  const d = state(),
    plan = await readBackup(
      await createBackupArchive({ data: d, version: 4 }, async () =>
        strToU8("%PDF-1.4\nexample"),
      ),
    );
  let committed,
    removed = false;
  const result = await executeRestore(plan, 4, {
    read: async () =>
      committed ? { data: committed, version: 5 } : { data: d, version: 4 },
    backup: async () => {},
    upload: async () => ({ path: "staged/receipt.pdf", name: "receipt.pdf" }),
    save: async (data) => {
      committed = data;
      throw Error("network response lost");
    },
    remove: async () => {
      removed = true;
    },
  });
  assert.equal(result.version, 5);
  assert.equal(removed, false);
});
