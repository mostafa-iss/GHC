import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { seed } from "../src/accounting.js";
import { restoredState } from "../src/backup.js";
test("PostgreSQL validates posted journals, drafts, permanent deletion, RLS, concurrent writes and one-time cutover", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;`,
  );
  await db.exec(
    readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  );
  const uid = "00000000-0000-4000-8000-000000000001";
  await db.query("insert into auth.users values($1)", [uid]);
  await db.query("insert into accounting_members values($1)", [uid]);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from accounting_state")).rows.length,
    0,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  let version = (await db.query("select version from accounting_state")).rows[0]
    .version;
  const data = seed();
  data.journalWorkflowVersion = 2;
  data.entries = [
    {
      id: "one",
      number: 1,
      date: "2026-01-01",
      description: "رسوم",
      attachments: [],
      lines: [
        { accountId: "cash", debit: 10000, credit: 0 },
        { accountId: "courses", debit: 0, credit: 10000 },
      ],
    },
  ];
  async function save(d) {
    const x = await db.query("select save_accounting_state($1,$2) as version", [
      version,
      JSON.stringify(d),
    ]);
    version = x.rows[0].version;
    return version;
  }
  const stale = version;
  await save(data);
  await assert.rejects(
    db.query("select save_accounting_state($1,$2)", [
      stale,
      JSON.stringify(data),
    ]),
    /جهاز آخر/,
  );
  await assert.rejects(
    db.query("update accounting_state set version=99 where id=1"),
    /المعتمدة/,
  );
  const bad = structuredClone(data);
  bad.entries[0].lines[0].debit++;
  await assert.rejects(save(bad), /غير متوازن/);
  const unbalanced = {
    id: "draft",
    draftNumber: 1,
    date: "2026-01-01",
    description: "مسودة غير متوازنة",
    lines: [{ accountId: "cash", debit: 20000, credit: 0 }],
  };
  data.draftEntries = [unbalanced];
  await save(data);
  assert.equal(
    (
      await db.query(
        "select jsonb_array_length(data->'draftEntries') as count from accounting_state",
      )
    ).rows[0].count,
    1,
  );
  const wrong = structuredClone(data);
  wrong.draftEntries[0].lines[0].accountId = "liability";
  await assert.rejects(save(wrong), /آخر حساب فرعي/);
  data.entries = [];
  await save(data);
  assert.equal(
    (
      await db.query(
        "select jsonb_array_length(data->'entries') as count from accounting_state",
      )
    ).rows[0].count,
    0,
  );
  data.entries = [{ ...structuredClone(bad.entries[0]), number: 7 }];
  data.entries[0].lines[0].debit = 10000;
  await save(data); // gaps after deletion are valid
  const count = (
    await db.query("select count(*) as count from accounting_audit")
  ).rows[0].count;
  assert(count >= 4);
  await db.exec("reset role");
  const migration = readFileSync(
    new URL("../supabase/migrations/002_journal_workflow.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  assert.equal(
    (
      await db.query(
        "select jsonb_array_length(data->'entries') as count from accounting_state",
      )
    ).rows[0].count,
    1,
  ); // never wipe data again once v2 is enabled
  await db.exec(
    "begin;select set_config('ghaith.validated','yes',true);update accounting_state set data=data-'journalWorkflowVersion';commit;",
  );
  await db.exec(migration);
  const reset = (await db.query("select data from accounting_state")).rows[0]
    .data;
  assert.equal(reset.entries.length, 0);
  assert.equal(reset.draftEntries.length, 0);
  assert.equal(reset.accounts.length, data.accounts.length);
  assert.equal(reset.journalWorkflowVersion, 2);
  await db.exec("set role authenticated");
  version = (await db.query("select version from accounting_state")).rows[0]
    .version;
  await save(data);
  const snapshot = structuredClone(data);
  snapshot.entries[0].description = "نسخة سابقة مسترجعة";
  Object.assign(
    snapshot.accounts.find((a) => a.id === "cash"),
    { type: "expense", parentId: "expense" },
  );
  const restored = restoredState(snapshot);
  await save(restored);
  const saved = (await db.query("select data from accounting_state")).rows[0]
    .data;
  assert.equal(saved.entries[0].description, "نسخة سابقة مسترجعة");
  assert.equal(saved.accounts.find((a) => a.code === "1101").type, "expense");
  assert.equal(saved.entries[0].number, 7);
  await db.close();
});
