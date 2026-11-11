import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/accounting.js";
import {
  uploadAttachment,
  saveJournalAttachments,
} from "../src/attachments.js";
const file = () =>
  new File(["%PDF-1.4\nexample"], "تجديد اقامة 3 أشهر.pdf", {
    type: "application/pdf",
  });
function fixture() {
  const d = seed();
  d.draftEntries = [
    {
      id: "draft",
      date: "2026-01-01",
      draftNumber: 1,
      description: "مسودة بمرفق",
      attachments: [{ path: "old/receipt.pdf", name: "إيصال قديم.pdf" }],
      lines: [
        { accountId: "cash", debit: 10000, credit: 0 },
        { accountId: "courses", debit: 0, credit: 10000 },
      ],
    },
  ];
  return d;
}
test("Arabic filenames use ASCII storage keys while preserving the full display name and MIME type", async () => {
  const f = file();
  let path;
  const a = await uploadAttachment(f, {
    upload: async (p, body, options) => {
      path = p;
      assert.equal(body, f);
      assert.equal(options.contentType, "application/pdf");
      return {};
    },
  });
  assert.match(path, /^[a-f0-9-]+\/attachment\.pdf$/);
  assert.equal(a.name, f.name);
  assert.equal(a.mimeType, f.type);
  await assert.rejects(
    uploadAttachment(
      new File(["x"], "bad.exe", { type: "application/octet-stream" }),
      {
        upload() {
          throw Error("should not upload");
        },
      },
    ),
    /المرفقات/,
  );
});
test("replacement commits before deleting the old file; files shared with another draft are retained", async () => {
  const d = fixture(),
    old = d.draftEntries[0],
    events = [];
  const io = {
    upload: async (f) => ({ path: "new/file.pdf", name: f.name }),
    save: async (next) => {
      events.push("save");
      return { data: next, version: 2 };
    },
    read: async () => ({ data: d, version: 1 }),
    recover() {},
    remove: async (paths) => events.push(paths),
  };
  let result = await saveJournalAttachments(
    d,
    { ...old, attachments: [] },
    [file()],
    { post: false },
    io,
  );
  assert.deepEqual(events, ["save", ["old/receipt.pdf"]]);
  assert.equal(result.data.entries.length, 0);
  assert.equal(result.data.draftEntries[0].attachments[0].name, file().name);
  assert.deepEqual(result.data.draftEntries[0].lines, old.lines);
  d.draftEntries.push({ ...old, id: "second", draftNumber: 2 });
  events.length = 0;
  result = await saveJournalAttachments(
    d,
    { ...old, attachments: [] },
    [],
    { post: false },
    io,
  );
  assert.deepEqual(events, ["save"]);
});
test("failed upload/save preserves original metadata/files and cleans only staged uploads", async () => {
  const d = fixture(),
    old = d.draftEntries[0],
    removed = [];
  const io = {
    upload: async (f) => ({ path: "new/file.pdf", name: f.name }),
    save: async () => {
      throw Error("conflict");
    },
    read: async () => ({ data: d, version: 1 }),
    recover() {},
    remove: async (paths) => removed.push(...paths),
  };
  await assert.rejects(
    saveJournalAttachments(d, { ...old, attachments: [] }, [file()], {}, io),
    /conflict/,
  );
  assert.deepEqual(removed, ["new/file.pdf"]);
  assert.equal(d.draftEntries[0].attachments[0].path, "old/receipt.pdf");
  removed.length = 0;
  io.upload = async () => {
    throw Error("upload failed");
  };
  await assert.rejects(
    saveJournalAttachments(d, { ...old, attachments: [] }, [file()], {}, io),
    /upload failed/,
  );
  assert.deepEqual(removed, []);
});
test("a lost save response is recovered; cleanup errors cannot delete committed replacement attachments", async () => {
  const d = fixture(),
    old = d.draftEntries[0];
  let committed,
    recovered,
    removed = [];
  const io = {
    upload: async (f) => ({ path: "new/file.pdf", name: f.name }),
    save: async (next) => {
      committed = { data: next, version: 2 };
      throw Error("response lost");
    },
    read: async () => committed,
    recover: (s) => (recovered = s),
    remove: async (paths) => {
      removed = paths;
      throw Error("cleanup failed");
    },
  };
  const result = await saveJournalAttachments(
    d,
    { ...old, attachments: [] },
    [file()],
    {},
    io,
  );
  assert.equal(recovered.version, 2);
  assert.deepEqual(removed, ["old/receipt.pdf"]);
  assert.match(result.cleanupWarning, /تم حفظ القيد/);
  assert.equal(result.data.draftEntries[0].attachments[0].path, "new/file.pdf");
  io.read = async () => {
    throw Error("offline");
  };
  removed = [];
  await assert.rejects(
    saveJournalAttachments(d, { ...old, attachments: [] }, [file()], {}, io),
    /response lost/,
  );
  assert.deepEqual(removed, []);
});
