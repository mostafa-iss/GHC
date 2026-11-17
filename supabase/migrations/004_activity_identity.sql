-- Run after 003 in the existing GHC database. No accounting state is rewritten.
begin;
do $$ begin
 if to_regprocedure('public.app_session_active()') is null then raise exception 'شغّل ترقية 003 للأدوار والجلسات أولًا'; end if;
end $$;
alter table public.accounting_members add column if not exists display_name text;
alter table public.accounting_audit add column if not exists actor_email text;
alter table public.accounting_audit add column if not exists actor_name text;
alter table public.accounting_audit add column if not exists actor_role text;
alter table public.accounting_audit add column if not exists entry_id text;
alter table public.accounting_audit add column if not exists entry_number text;
alter table public.accounting_audit add column if not exists action text;
create index if not exists accounting_audit_entry on public.accounting_audit(entry_id,id desc);
-- Resolve old known actor IDs; never infer who performed client-authored legacy events.
update public.accounting_audit a set actor_email=u.email,actor_name=coalesce(nullif(m.display_name,''),u.email)
from auth.users u left join public.accounting_members m on m.user_id=u.id
where a.actor=u.id and a.actor_email is null;
create or replace function public.log_accounting_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record; actor_email_value text; actor_name_value text; actor_role_value text;
 action_value text; number_value text; count_events integer:=0;
begin
 select u.email,coalesce(nullif(m.display_name,''),u.email),m.role
 into actor_email_value,actor_name_value,actor_role_value
 from auth.users u left join public.accounting_members m on m.user_id=u.id where u.id=auth.uid();
 for r in
  with previous as (
   select e->>'id' id,e,'posted' status from jsonb_array_elements(coalesce(old.data->'entries','[]')) e
   union all select e->>'id',e,'draft' from jsonb_array_elements(coalesce(old.data->'draftEntries','[]')) e
  ), next_entries as (
   select e->>'id' id,e,'posted' status from jsonb_array_elements(coalesce(new.data->'entries','[]')) e
   union all select e->>'id',e,'draft' from jsonb_array_elements(coalesce(new.data->'draftEntries','[]')) e
  )
  select coalesce(n.id,p.id) id,p.e old_entry,n.e new_entry,p.status old_status,n.status new_status
  from previous p full join next_entries n on n.id=p.id
  where p.e is distinct from n.e or p.status is distinct from n.status
  or old.data->'entryDocuments'->coalesce(n.id,p.id) is distinct from new.data->'entryDocuments'->coalesce(n.id,p.id)
 loop
  action_value:=case
   when r.old_entry is null then case when r.new_status='draft' then 'إنشاء مسودة' else 'إضافة وترحيل قيد' end
   when r.new_entry is null then case when r.old_status='draft' then 'حذف مسودة' else 'حذف قيد' end
   when r.old_status<>r.new_status then case when r.new_status='draft' then 'تحويل إلى مسودة' else 'ترحيل القيد' end
   else case when r.new_status='draft' then 'تعديل مسودة' else 'تحديث مستندات القيد' end end;
  number_value:=case when coalesce(r.new_status,r.old_status)='draft' then 'D-'||coalesce(r.new_entry->>'draftNumber',r.old_entry->>'draftNumber','؟') else '#'||coalesce(r.new_entry->>'number',r.old_entry->>'number','؟') end;
  insert into public.accounting_audit(actor,actor_email,actor_name,actor_role,entry_id,entry_number,action,description)
  values(auth.uid(),actor_email_value,actor_name_value,actor_role_value,r.id,number_value,action_value,
   action_value||' '||number_value||' — '||left(coalesce(r.new_entry->>'description',r.old_entry->>'description',''),500));
  count_events:=count_events+1;
 end loop;
 if count_events=0 or new.data->'accounts' is distinct from old.data->'accounts' or new.data->'centers' is distinct from old.data->'centers' or new.data->'restoreToken' is distinct from old.data->'restoreToken' then
  action_value:=case
   when new.data->'restoreToken' is distinct from old.data->'restoreToken' then 'استرجاع نسخة احتياطية'
   when new.data->'accounts' is distinct from old.data->'accounts' then 'تحديث شجرة الحسابات'
   when new.data->'centers' is distinct from old.data->'centers' then 'تحديث مراكز التكلفة'
   when new.data->'journalTemplates' is distinct from old.data->'journalTemplates' then 'تحديث القوالب'
   when new.data->'financeAccounts' is distinct from old.data->'financeAccounts' then 'تحديث الحسابات المالية'
   else 'تحديث البيانات المحاسبية' end;
  insert into public.accounting_audit(actor,actor_email,actor_name,actor_role,action,description)
  values(auth.uid(),actor_email_value,actor_name_value,actor_role_value,action_value,action_value);
 end if;
 return new;
end $$;
create or replace function public.app_activity(target_entry text default null,before_id bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.app_session_active() then raise exception 'جلسة غير صالحة أو تم إنهاؤها'; end if;
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (
  select id,created_at,actor,actor_email,actor_name,actor_role,entry_id,entry_number,action,description
  from public.accounting_audit where (target_entry is null or entry_id=target_entry) and (before_id is null or id<before_id)
  order by id desc limit 100
 ) a),'[]'::jsonb);
end $$;
revoke all on function public.log_accounting_change(),public.app_activity(text,bigint) from public,anon;
grant execute on function public.app_activity(text,bigint) to authenticated;
commit;
