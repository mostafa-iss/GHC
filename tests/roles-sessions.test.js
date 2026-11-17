import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { seed } from "../src/accounting.js";
import {
  saveJournal,
  changeJournalState,
  resetJournals,
} from "../src/journals.js";
import { restoredState } from "../src/backup.js";
const admin = "526918f2-5859-4b08-a1d4-97a44fb783a7",
  accountant = "23a39f9a-a293-4500-ae73-8c826b984356";
const adminSid = "10000000-0000-4000-8000-000000000001",
  staffSid = "20000000-0000-4000-8000-000000000001";
const sql = (name) =>
  readFileSync(new URL("../supabase/" + name, import.meta.url), "utf8");
test("database enforces roles, preserves journals, tracks trusted session identity and revokes read/write/storage immediately", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;insert into auth.users values('${admin}','admin@example.test'),('${accountant}','staff@example.test'),('30000000-0000-4000-8000-000000000001','outsider@example.test');`,
    );
    await db.exec(sql("ghc-fresh-install.sql"));
    const initial = {
      ...seed(),
      journalWorkflowVersion: 2,
      entries: [
        {
          id: "posted",
          number: 1,
          date: "2026-11-14",
          description: "existing entry",
          attachments: [{ path: "old.pdf", name: "old.pdf" }],
          lines: [
            { accountId: "cash", debit: 1000, credit: 0 },
            { accountId: "courses", debit: 0, credit: 1000 },
          ],
        },
      ],
      draftEntries: [],
      journalEvents: [],
      centers: [],
    };
    await db.query("select save_accounting_state(0,$1)", [
      JSON.stringify(initial),
    ]);
    await db.exec(
      `insert into storage.objects values('40000000-0000-4000-8000-000000000001','attachments','old.pdf'),('40000000-0000-4000-8000-000000000002','attachments','orphan.pdf')`,
    );
    await db.exec(sql("migrations/003_roles_and_sessions.sql"));
    await db.exec(sql("migrations/004_activity_identity.sql"));
    assert.deepEqual(
      (await db.query("select data from accounting_state")).rows[0].data,
      initial,
    );
    await db.query(
      "insert into accounting_audit(actor,description) values($1,'سجل قديم')",
      [accountant],
    );
    await db.exec(sql("migrations/004_activity_identity.sql"));
    const historical = (
      await db.query(
        "select actor_email from accounting_audit where description='سجل قديم'",
      )
    ).rows[0];
    assert.equal(historical.actor_email, "staff@example.test");
    async function login(uid, sid) {
      await db.exec("set role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
        [uid, JSON.stringify({ sub: uid, session_id: sid })],
      );
    }
    async function access() {
      return (
        await db.query(
          'select app_access(\'{"os":"Windows","browser":"Chrome"}\') as a',
        )
      ).rows[0].a;
    }
    async function state() {
      return (await db.query("select data,version from accounting_state"))
        .rows[0];
    }
    async function save(data) {
      const s = await state();
      return db.query("select save_accounting_state($1,$2)", [
        s.version,
        JSON.stringify(data),
      ]);
    }
    await login(accountant, undefined);
    await assert.rejects(access(), /غير مصرح/);
    await login(accountant, staffSid);
    assert.equal(
      (await db.query("select * from accounting_state")).rows.length,
      0,
    );
    assert.equal((await access()).role, "accountant");
    assert.equal((await access()).sessionId, staffSid);
    const forged = (
      await db.query("select app_access($1) as a", [
        JSON.stringify({ role: "admin", session_id: adminSid, user_id: admin }),
      ])
    ).rows[0].a;
    assert.equal(forged.role, "accountant");
    assert.equal(forged.sessionId, staffSid);
    let d = (await state()).data;
    d = saveJournal(
      d,
      {
        id: "draft",
        date: "2026-11-14",
        description: "staff draft",
        lines: [
          { accountId: "cash", debit: 200, credit: 0 },
          { accountId: "courses", debit: 0, credit: 200 },
        ],
      },
      { post: false },
    );
    await save(d);
    d = changeJournalState(d, "draft", "post");
    await save(d);
    d = changeJournalState(d, "draft", "draft");
    await save(d);
    d.draftEntries[0].description = "edited draft";
    await save(d);
    const history = (
      await db.query("select app_activity('draft',null) as rows")
    ).rows[0].rows;
    assert.deepEqual(
      history.map((r) => r.action),
      ["تعديل مسودة", "تحويل إلى مسودة", "ترحيل القيد", "إنشاء مسودة"],
    );
    assert(
      history.every(
        (r) =>
          r.actor === accountant &&
          r.actor_email === "staff@example.test" &&
          r.actor_role === "accountant",
      ),
    );
    const older = (
      await db.query("select app_activity('draft',$1) as rows", [history[0].id])
    ).rows[0].rows;
    assert.equal(older.length, history.length - 1);
    assert(older.every((r) => r.id < history[0].id));
    const forgedEvent = structuredClone(d);
    forgedEvent.journalEvents.push({
      id: "forged-client-event",
      entryId: "draft",
      actor: admin,
      action: "عملية مزورة",
    });
    await save(forgedEvent);
    d = forgedEvent;
    const trusted = (
      await db.query("select app_activity('draft',null) as rows")
    ).rows[0].rows;
    assert.equal(trusted.length, history.length);
    await assert.rejects(
      db.query(
        "insert into accounting_audit(actor,description) values($1,'forged')",
        [admin],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update accounting_audit set actor=$1", [admin]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from accounting_audit"),
      /permission denied/,
    );
    await assert.rejects(
      save(changeJournalState(d, "posted", "delete")),
      /للأدمن فقط/,
    );
    await assert.rejects(
      save(changeJournalState(d, "draft", "delete")),
      /للأدمن فقط/,
    );
    await assert.rejects(save(resetJournals(d)), /للأدمن فقط/);
    await assert.rejects(
      save(
        restoredState(
          d,
          new Map([["old.pdf", { path: "restored.pdf", name: "old.pdf" }]]),
        ),
      ),
      /للأدمن فقط/,
    );
    const masked = structuredClone(d);
    masked.entryLifecycle = {
      ...masked.entryLifecycle,
      posted: { status: "deleted" },
    };
    await assert.rejects(save(masked), /للأدمن فقط/);
    const removeAccount = structuredClone(d);
    removeAccount.accounts = removeAccount.accounts.filter(
      (a) => a.id !== "rent",
    );
    await assert.rejects(save(removeAccount), /للأدمن فقط/);
    await assert.rejects(db.query("select app_list_sessions()"), /للأدمن فقط/);
    await assert.rejects(
      db.query("select app_end_session($1)", [adminSid]),
      /غير مصرح/,
    );
    await assert.rejects(
      db.query("update accounting_members set role='admin'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from app_sessions"),
      /permission denied/,
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name='old.pdf' returning name",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name='orphan.pdf' returning name",
        )
      ).rows.length,
      1,
    );
    await login(admin, adminSid);
    assert.equal((await access()).role, "admin");
    const list = (await db.query("select app_list_sessions() as s")).rows[0].s;
    assert.equal(list.length, 2);
    assert.equal(
      list.find((s) => s.user_id === accountant).email,
      "staff@example.test",
    );
    await db.query("select app_end_session($1)", [staffSid]);
    await login(accountant, staffSid);
    assert.equal(
      (await db.query("select * from accounting_state")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from accounting_audit")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from storage.objects where bucket_id='attachments'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(access(), /إنهاء هذه الجلسة/);
    await assert.rejects(
      db.query("select app_activity(null,null)"),
      /غير صالحة/,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(id,bucket_id,name) values('50000000-0000-4000-8000-000000000001','attachments','blocked.pdf')",
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query("select save_accounting_state($1,$2)", [
        1,
        JSON.stringify(initial),
      ]),
      /غير مصرح/,
    );
    await login(accountant, "20000000-0000-4000-8000-000000000002");
    assert.equal((await access()).role, "accountant");
    await login(
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
    );
    await assert.rejects(access(), /غير مصرح/);
    await login(admin, adminSid);
    await save(changeJournalState((await state()).data, "posted", "delete"));
    const removedHistory = (
      await db.query("select app_activity('posted',null) as rows")
    ).rows[0].rows;
    assert.equal(removedHistory[0].action, "حذف قيد");
    assert.equal(removedHistory[0].actor, admin);
    assert.equal(removedHistory[0].actor_email, "admin@example.test");
    await db.query("select app_end_session($1)", [adminSid]);
    await assert.rejects(access(), /إنهاء هذه الجلسة/);
    await db.exec("reset role");
    await db.query(
      "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)",
    );
    const before = (await db.query("select data from accounting_state")).rows[0]
      .data;
    await db.exec(sql("migrations/003_roles_and_sessions.sql"));
    await db.exec(sql("migrations/004_activity_identity.sql"));
    assert.deepEqual(
      (await db.query("select data from accounting_state")).rows[0].data,
      before,
    );
  } finally {
    await db.close();
  }
});
