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
  const chartSql = readFileSync(
    new URL("../supabase/ghc-add-basic-chart.sql", import.meta.url),
    "utf8",
  );
  await assert.rejects(db.exec(chartSql), /بنفس الكود أو الاسم/);
  await db.exec("rollback");
  assert.equal(
    (await db.query("select data from accounting_state")).rows[0].data.accounts
      .length,
    1,
  );
  let state = (await db.query("select data, version from accounting_state"))
    .rows[0];
  state.data.accounts[0].code = "99";
  await db.query("select save_accounting_state($1,$2)", [
    state.version,
    JSON.stringify(state.data),
  ]);
  await db.exec(chartSql);
  state = (await db.query("select data, version from accounting_state"))
    .rows[0];
  assert.equal(state.data.accounts.length, 40);
  assert.equal(
    state.data.accounts.find((a) => a.id === "custom-assets").code,
    "99",
  );
  assert.deepEqual(state.data.entries, []);
  assert.equal(state.data.accounts.find((a) => a.code === "11").isGroup, true);
  await db.exec(chartSql);
  assert.equal(
    (await db.query("select version from accounting_state")).rows[0].version,
    state.version,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    "526918f2-5859-4b08-a1d4-97a44fb783a7",
  ]);
  const bad = structuredClone(state.data);
  bad.entries = [
    {
      id: "bad-folder-entry",
      number: 1,
      date: "2026-11-01",
      description: "folder must not accept posting",
      lines: [
        { accountId: "ghc-coa-11", debit: 100, credit: 0 },
        { accountId: "ghc-coa-4101", debit: 0, credit: 100 },
      ],
    },
  ];
  await assert.rejects(
    db.query("select save_accounting_state($1,$2)", [
      state.version,
      JSON.stringify(bad),
    ]),
    /الحسابات الفرعية/,
  );
  bad.draftEntries = [{ ...bad.entries[0], id: "bad-folder-draft" }];
  bad.entries = [];
  await assert.rejects(
    db.query("select save_accounting_state($1,$2)", [
      state.version,
      JSON.stringify(bad),
    ]),
    /آخر حساب فرعي/,
  );
  state.data.entries = [
    {
      id: "preserved-entry",
      number: 1,
      date: "2026-11-01",
      description: "رسوم اختبار",
      lines: [
        { accountId: "ghc-coa-120101", debit: 10000, credit: 0 },
        { accountId: "ghc-coa-4101", debit: 0, credit: 10000 },
      ],
    },
  ];
  state.data.accounts.find((a) => a.code === "5201").name = "دومين معدل يدويًا";
  await db.query("select save_accounting_state($1,$2)", [
    state.version,
    JSON.stringify(state.data),
  ]);
  await db.exec(chartSql);
  const preserved = (await db.query("select data from accounting_state"))
    .rows[0].data;
  assert.deepEqual(preserved.entries, state.data.entries);
  assert.equal(
    preserved.accounts.find((a) => a.code === "5201").name,
    "دومين معدل يدويًا",
  );
  await db.close();
});
