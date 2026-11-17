import test from "node:test";
import assert from "node:assert/strict";
import {
  sortJournals,
  filterJournals,
  journalCreatedTime,
} from "../src/journals.js";
import { journalExportRows } from "../src/journalExport.js";
const entries = [
  {
    id: "two",
    number: 2,
    date: "2026-01-03",
    createdAt: "2026-04-01T08:00:00Z",
    description: "دورة",
    lines: [{ accountId: "cash", debit: 100, credit: 0 }],
  },
  {
    id: "ten",
    number: 10,
    date: "2026-01-01",
    createdAt: "2026-04-03T08:00:00Z",
    description: "دورة",
    lines: [{ accountId: "cash", debit: 200, credit: 0 }],
  },
  {
    id: "one",
    number: 1,
    date: "2026-01-02",
    createdAt: "2026-04-02T08:00:00Z",
    description: "آخر",
    lines: [{ accountId: "cash", debit: 300, credit: 0 }],
  },
];
test("each journal ordering uses its own field, supports both directions, and preserves input and export order", () => {
  const before = structuredClone(entries);
  for (const [field, ascending] of [
    ["number", ["one", "two", "ten"]],
    ["date", ["ten", "one", "two"]],
    ["createdAt", ["two", "one", "ten"]],
  ]) {
    for (const direction of ["asc", "desc"]) {
      const result = sortJournals(entries, { field, direction });
      assert.deepEqual(
        result.map((e) => e.id),
        direction === "asc" ? ascending : [...ascending].reverse(),
      );
      assert.deepEqual(
        journalExportRows(
          { accounts: [{ id: "cash", name: "الصندوق" }], centers: [] },
          result,
        ).map((r) => r[6]),
        result.map((e) => e.number),
      );
    }
  }
  assert.deepEqual(entries, before);
  assert.deepEqual(
    filterJournals(
      { entries, draftEntries: [] },
      { search: "دورة" },
      { field: "number", direction: "asc" },
    ).map((e) => e.number),
    [2, 10],
  );
  assert.deepEqual(
    sortJournals(entries, { field: "invalid", direction: "desc" }).map(
      (e) => e.id,
    ),
    ["two", "one", "ten"],
  );
});
test("unknown creation times stay last, timestamps respect timezones, ties are deterministic and drafts use draft numbers", () => {
  const unknown = [
    { id: "unknown", number: 100, date: "2030-01-01" },
    { id: "invalid", number: 200, date: "2031-01-01", createdAt: "not-a-date" },
  ];
  for (const direction of ["asc", "desc"]) {
    const sorted = sortJournals([...unknown, ...entries], {
      field: "createdAt",
      direction,
    });
    assert(sorted.slice(-2).every((e) => unknown.some((u) => u.id === e.id)));
  }
  assert.equal(journalCreatedTime(unknown[0]), null);
  assert.equal(journalCreatedTime(unknown[1]), null);
  const times = [
    { id: "later", date: "2026-01-01", createdAt: "2026-05-01T10:00:00Z" },
    {
      id: "earlier",
      date: "2026-01-01",
      createdAt: "2026-05-01T11:00:00+02:00",
    },
  ];
  assert.deepEqual(
    sortJournals(times, { field: "createdAt", direction: "asc" }).map(
      (e) => e.id,
    ),
    ["earlier", "later"],
  );
  const drafts = [
    { id: "d12", draftNumber: 12, date: "2026-01-01" },
    { id: "d3", draftNumber: 3, date: "2026-01-01" },
  ];
  assert.deepEqual(
    sortJournals(drafts, { field: "number", direction: "asc" }).map(
      (e) => e.id,
    ),
    ["d3", "d12"],
  );
  const ties = [
    {
      id: "b",
      number: 1,
      date: "2026-01-01",
      createdAt: "2026-01-01T10:00:00Z",
    },
    {
      id: "a",
      number: 1,
      date: "2026-01-01",
      createdAt: "2026-01-01T12:00:00+02:00",
    },
  ];
  assert.deepEqual(
    sortJournals(ties, { field: "createdAt" }),
    sortJournals([...ties].reverse(), { field: "createdAt" }),
  );
});
