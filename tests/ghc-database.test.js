import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
test("fresh GHC SQL grants only designated member, starts empty and supports first account without resetting on rerun", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;insert into auth.users values('526918f2-5859-4b08-a1d4-97a44fb783a7');`,
  );
  const sql = readFileSync(
    new URL("../supabase/ghc-fresh-install.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from accounting_state")).rows.length,
    0,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    "526918f2-5859-4b08-a1d4-97a44fb783a7",
  ]);
  const { data, version } = (
    await db.query("select data,version from accounting_state")
  ).rows[0];
  assert.deepEqual(data.accounts, []);
  assert.deepEqual(data.entries, []);
  assert.equal(data.journalWorkflowVersion, 2);
  data.accounts.push({
    id: "custom-assets",
    code: "1",
    name: "أصول GHC",
    type: "asset",
    parentId: "",
  });
  await db.query("select save_accounting_state($1,$2)", [
    version,
    JSON.stringify(data),
  ]);
  assert.equal(
    (await db.query("select data from accounting_state")).rows[0].data.accounts
      .length,
    1,
  );
  await db.exec("reset role");
  await assert.rejects(db.exec(sql), /مجهز بالفعل/);
  await db.exec("rollback");
  assert.equal(
    (await db.query("select data from accounting_state")).rows[0].data.accounts
      .length,
    1,
  );
  await db.close();
});
