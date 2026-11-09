import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { seed } from "../src/accounting.js";
test("PostgreSQL schema enforces authorization, balanced atomic writes, conflicts, immutable journals and audit", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;`,
  );
  await db.exec(
    readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  );
  const uid = "00000000-0000-4000-8000-000000000001";
  await db.query("insert into auth.users(id) values($1)", [uid]);
  await db.query("insert into accounting_members(user_id) values($1)", [uid]);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from accounting_state")).rows.length,
    0,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const data = seed();
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
  assert.equal(
    (
      await db.query("select save_accounting_state($1,$2) as version", [
        0,
        JSON.stringify(data),
      ])
    ).rows[0].version,
    1,
  );
  await assert.rejects(
    db.query("select save_accounting_state($1,$2)", [0, JSON.stringify(data)]),
    /جهاز آخر/,
  );
  await assert.rejects(
    db.query("update accounting_state set version=99 where id=1"),
    /المعتمدة/,
  );
  const bad = structuredClone(data);
  bad.entries.push({
    ...structuredClone(data.entries[0]),
    id: "two",
    number: 2,
  });
  bad.entries[1].lines[0].debit = 9000;
  await assert.rejects(
    db.query("select save_accounting_state($1,$2)", [1, JSON.stringify(bad)]),
    /غير متوازن/,
  );
  const removed = structuredClone(data);
  removed.entries = [];
  await assert.rejects(
    db.query("select save_accounting_state($1,$2)", [
      1,
      JSON.stringify(removed),
    ]),
    /قيد مرحّل/,
  );
  assert.equal(
    (await db.query("select version from accounting_state")).rows[0].version,
    1,
  );
  assert.equal(
    (await db.query("select * from accounting_audit")).rows.length,
    1,
  );
  await db.close();
});
