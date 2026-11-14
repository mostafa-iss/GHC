-- GHC only. Run once after the existing schema/chart in Supabase SQL Editor.
-- Repeatable; preserves accounting data. No passwords, JWTs or service keys stored.
begin;
do $$ begin
 if not exists(select 1 from auth.users where id='526918f2-5859-4b08-a1d4-97a44fb783a7')
 or not exists(select 1 from auth.users where id='23a39f9a-a293-4500-ae73-8c826b984356') then
 raise exception 'أنشئ حساب الأدمن وحساب المحاسبين أولًا'; end if;
end $$;
alter table public.accounting_members add column if not exists role text not null default 'accountant' check(role in ('admin','accountant'));
insert into public.accounting_members(user_id,role) values
 ('526918f2-5859-4b08-a1d4-97a44fb783a7','admin'),
 ('23a39f9a-a293-4500-ae73-8c826b984356','accountant')
on conflict(user_id) do update set role=excluded.role;
create table if not exists public.app_sessions(
 session_id uuid primary key, user_id uuid not null references auth.users(id),
 email text not null, device jsonb not null default '{}',
 signed_in_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 ended_at timestamptz, ended_by uuid references auth.users(id)
);
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from public,anon,authenticated;
create index if not exists app_sessions_seen on public.app_sessions(last_seen_at desc);
create or replace function public.app_session_id() returns uuid
language sql stable set search_path=pg_catalog,public as $$
 select nullif(coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id',current_setting('request.jwt.claim.session_id',true)),'')::uuid
$$;
create or replace function public.app_role() returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select role from public.accounting_members where user_id=auth.uid()
$$;
create or replace function public.app_session_active() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.app_sessions s join public.accounting_members m on m.user_id=s.user_id
 where s.session_id=public.app_session_id() and s.user_id=auth.uid() and s.ended_at is null)
$$;
create or replace function public.app_access(device_info jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare sid uuid:=public.app_session_id(); member_role text:=public.app_role(); r public.app_sessions;
begin
 if auth.uid() is null or sid is null or member_role is null then raise exception 'غير مصرح بالدخول أو جلسة غير صالحة'; end if;
 insert into public.app_sessions(session_id,user_id,email,device)
 select sid,auth.uid(),coalesce(u.email,''),jsonb_build_object(
  'browser',left(coalesce(device_info->>'browser','غير معروف'),80),
  'os',left(coalesce(device_info->>'os','غير معروف'),80),
  'kind',left(coalesce(device_info->>'kind','غير معروف'),40),
  'userAgent',left(coalesce(device_info->>'userAgent',''),500))
 from auth.users u where u.id=auth.uid()
 on conflict(session_id) do update set last_seen_at=now()
 where app_sessions.user_id=auth.uid() and app_sessions.ended_at is null returning * into r;
 if r.session_id is null then raise exception 'تم إنهاء هذه الجلسة؛ سجّل الدخول من جديد'; end if;
 return jsonb_build_object('role',member_role,'sessionId',sid);
end $$;
create or replace function public.app_list_sessions() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if public.app_role() is distinct from 'admin' or not public.app_session_active() then raise exception 'هذه الصفحة للأدمن فقط'; end if;
 return coalesce((select jsonb_agg(to_jsonb(s) order by s.last_seen_at desc) from (
 select s.*,m.role from public.app_sessions s join public.accounting_members m on m.user_id=s.user_id order by s.last_seen_at desc limit 200) s),'[]'::jsonb);
end $$;
create or replace function public.app_end_session(target_session uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.app_session_active() or (public.app_role() is distinct from 'admin' and target_session is distinct from public.app_session_id()) then raise exception 'غير مصرح بإنهاء هذه الجلسة'; end if;
 update public.app_sessions set ended_at=coalesce(ended_at,now()),ended_by=coalesce(ended_by,auth.uid()) where session_id=target_session;
end $$;
-- Defense in depth: restrictive policies combine with all existing membership policies.
drop policy if exists "require app session" on public.accounting_state;
create policy "require app session" on public.accounting_state as restrictive for all to authenticated using(public.app_session_active()) with check(public.app_session_active());
drop policy if exists "require app session" on public.accounting_audit;
create policy "require app session" on public.accounting_audit as restrictive for select to authenticated using(public.app_session_active());
drop policy if exists "require app session" on storage.objects;
create policy "require app session" on storage.objects as restrictive for all to authenticated using(bucket_id<>'attachments' or public.app_session_active()) with check(bucket_id<>'attachments' or public.app_session_active());
-- Accountants can replace attachments and clean failed uploads, but cannot remove a referenced file.
create or replace function public.app_can_remove_file(file_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.app_session_active() and (public.app_role()='admin' or not exists(
 select 1 from public.accounting_state s,
 lateral jsonb_array_elements(coalesce(s.data->'entries','[]') || coalesce(s.data->'draftEntries','[]')) e,
 lateral jsonb_array_elements(coalesce(e->'attachments','[]')) a where a->>'path'=file_path))
$$;
drop policy if exists "protect referenced attachments" on storage.objects;
create policy "protect referenced attachments" on storage.objects as restrictive for delete to authenticated using(bucket_id<>'attachments' or public.app_can_remove_file(name));
-- This trigger protects all callers, including direct RPC requests and older frontends.
create or replace function public.enforce_accounting_permissions() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare key text; old_item jsonb; next_journals jsonb; previous_journals jsonb;
begin
 -- SQL Editor maintenance remains available to the database owner; API roles never take this path.
 if auth.uid() is null and session_user in ('postgres','supabase_admin') then return new; end if;
 if not public.app_session_active() then raise exception 'جلسة غير صالحة أو تم إنهاؤها'; end if;
 if public.app_role()='admin' then return new; end if;
 if public.app_role() is distinct from 'accountant' then raise exception 'غير مصرح بالتعديل'; end if;
 if new.data->'restoreToken' is distinct from old.data->'restoreToken' then raise exception 'استرجاع النسخة الاحتياطية للأدمن فقط'; end if;
 previous_journals:=coalesce(old.data->'entries','[]')||coalesce(old.data->'draftEntries','[]');
 next_journals:=coalesce(new.data->'entries','[]')||coalesce(new.data->'draftEntries','[]');
 for old_item in select value from jsonb_array_elements(previous_journals) loop
  if not exists(select 1 from jsonb_array_elements(next_journals) n where n->>'id'=old_item->>'id' and coalesce(n->>'status','')<>'deleted') then raise exception 'حذف القيود والمسودات للأدمن فقط'; end if;
 end loop;
 if exists(select 1 from jsonb_each(coalesce(new.data->'entryLifecycle','{}')) l where l.value->>'status'='deleted') then raise exception 'حذف القيود للأدمن فقط'; end if;
 foreach key in array array['accounts','centers','journalTemplates','financeAccounts','journalEvents'] loop
  for old_item in select value from jsonb_array_elements(coalesce(old.data->key,'[]')) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(new.data->key,'[]')) n where n->>'id'=old_item->>'id') then raise exception 'حذف البيانات للأدمن فقط'; end if;
  end loop;
 end loop;
 if coalesce((new.data->>'entryNumberSequence')::bigint,0)<coalesce((old.data->>'entryNumberSequence')::bigint,0)
 or coalesce((new.data->>'draftNumberSequence')::bigint,0)<coalesce((old.data->>'draftNumberSequence')::bigint,0) then raise exception 'تصفير العدادات للأدمن فقط'; end if;
 return new;
end $$;
drop trigger if exists enforce_accounting_permissions on public.accounting_state;
create trigger enforce_accounting_permissions before update on public.accounting_state for each row execute function public.enforce_accounting_permissions();
-- Restrict every helper; grants are explicit and do not expose role/session table writes.
revoke all on function public.app_session_id(),public.app_role(),public.app_session_active(),public.app_access(jsonb),public.app_list_sessions(),public.app_end_session(uuid),public.app_can_remove_file(text),public.enforce_accounting_permissions() from public,anon;
grant execute on function public.app_session_id(),public.app_role(),public.app_session_active(),public.app_access(jsonb),public.app_list_sessions(),public.app_end_session(uuid),public.app_can_remove_file(text) to authenticated;
commit;
