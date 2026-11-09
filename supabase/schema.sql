-- Run once in the Supabase SQL editor. No credentials belong in this file.
create table if not exists public.accounting_members (user_id uuid primary key references auth.users(id));
alter table public.accounting_members enable row level security;
create policy "read own membership" on public.accounting_members for select to authenticated using (user_id = auth.uid());
grant select on public.accounting_members to authenticated;
create table if not exists public.accounting_state (
 id integer primary key check (id=1), data jsonb not null,
 version bigint not null default 0, updated_at timestamptz not null default now()
);
alter table public.accounting_state enable row level security;
create policy "members read state" on public.accounting_state for select to authenticated using (exists(select 1 from public.accounting_members where user_id=auth.uid()));
create policy "members update state" on public.accounting_state for update to authenticated using (exists(select 1 from public.accounting_members where user_id=auth.uid())) with check (exists(select 1 from public.accounting_members where user_id=auth.uid()));
grant select,update on public.accounting_state to authenticated;

-- Transactional, optimistic locking prevents one browser overwriting another.
create or replace function public.save_accounting_state(expected_version bigint, new_data jsonb)
returns bigint language plpgsql security invoker set search_path = public as $$
declare current_data jsonb; current_version bigint; entry jsonb; line jsonb; account jsonb; item jsonb; d numeric; c numeric; seen text[]; n integer;
begin
 select data,version into current_data,current_version from public.accounting_state where id=1 for update;
 if not found then raise exception 'غير مصرح بالدخول'; end if;
 if current_version<>expected_version then raise exception 'تم تعديل البيانات من جهاز آخر. تم تحديثها؛ أعد المحاولة.'; end if;
 if jsonb_typeof(new_data->'accounts') is distinct from 'array' or jsonb_typeof(new_data->'centers') is distinct from 'array' or jsonb_typeof(new_data->'entries') is distinct from 'array' then raise exception 'بنية بيانات غير صالحة'; end if;
 if jsonb_array_length(new_data->'accounts')=0 then raise exception 'شجرة الحسابات مطلوبة'; end if;
 -- Entries are immutable after posting. Corrections use a reversing journal.
 for entry in select value from jsonb_array_elements(current_data->'entries') loop
  if not exists(select 1 from jsonb_array_elements(new_data->'entries') x where x=entry) then raise exception 'لا يمكن تعديل أو حذف قيد مرحّل؛ سجل قيدًا عكسيًا'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(new_data->'accounts') x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(new_data->'accounts') x group by x->>'code' having count(*)>1) or exists(select 1 from jsonb_array_elements(new_data->'centers') x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(new_data->'centers') x group by x->>'code' having count(*)>1) then raise exception 'الأكواد والمعرفات يجب أن تكون فريدة'; end if;
 for account in select value from jsonb_array_elements(new_data->'accounts') loop
  if coalesce(account->>'name','')='' or coalesce(account->>'id','')='' or coalesce(account->>'code','')='' or (account->>'type') not in ('asset','liability','equity','revenue','expense') or account->>'type' is null then raise exception 'حساب غير صالح'; end if;
  if coalesce(account->>'parentId','')<>'' and not exists(select 1 from jsonb_array_elements(new_data->'accounts') p where p->>'id'=account->>'parentId' and p->>'type'=account->>'type') then raise exception 'الحساب الرئيسي غير صالح'; end if;
  item:=account;seen:=array[]::text[];
  while coalesce(item->>'parentId','')<>'' loop
   if item->>'id'=any(seen) then raise exception 'تسلسل دائري في الحسابات'; end if;
   seen:=array_append(seen,item->>'id');select value into item from jsonb_array_elements(new_data->'accounts') p where p->>'id'=item->>'parentId';
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(new_data->'centers') loop
  if coalesce(item->>'name','')='' or coalesce(item->>'code','')='' or coalesce(item->>'id','')='' then raise exception 'مركز تكلفة غير صالح'; end if;
  seen:=array[]::text[];
  while coalesce(item->>'parentId','')<>'' loop
   if item->>'id'=any(seen) then raise exception 'تسلسل دائري في مراكز التكلفة'; end if;
   seen:=array_append(seen,item->>'id');select value into item from jsonb_array_elements(new_data->'centers') p where p->>'id'=item->>'parentId';
   if item is null then raise exception 'المركز الرئيسي غير صالح'; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(new_data->'entries') x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(new_data->'entries') x group by x->>'number' having count(*)>1) then raise exception 'رقم قيد مكرر'; end if;
 n:=0;
 for entry in select value from jsonb_array_elements(new_data->'entries') order by (value->>'number')::integer loop
  n:=n+1;
  if (entry->>'number')::integer<>n or coalesce(entry->>'description','')='' or coalesce(entry->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(entry->'lines') is distinct from 'array' or jsonb_array_length(entry->'lines')<2 then raise exception 'قيد غير مكتمل'; end if;
  perform (entry->>'date')::date;
  d:=0;c:=0;
  for line in select value from jsonb_array_elements(entry->'lines') loop
   if coalesce(line->>'debit','') !~ '^\d+$' or coalesce(line->>'credit','') !~ '^\d+$' then raise exception 'المبالغ يجب أن تكون هللات صحيحة'; end if;
   if ((line->>'debit')::numeric>0)=((line->>'credit')::numeric>0) then raise exception 'حدد طرفًا واحدًا لكل سطر'; end if;
   d:=d+(line->>'debit')::numeric;c:=c+(line->>'credit')::numeric;
   if not exists(select 1 from jsonb_array_elements(new_data->'accounts') a where a->>'id'=line->>'accountId') then raise exception 'حساب غير موجود'; end if;
   if exists(select 1 from jsonb_array_elements(new_data->'accounts') a where a->>'parentId'=line->>'accountId') then raise exception 'التسجيل على الحسابات الفرعية فقط'; end if;
   if coalesce(line->>'centerId','')<>'' and not exists(select 1 from jsonb_array_elements(new_data->'centers') a where a->>'id'=line->>'centerId') then raise exception 'مركز التكلفة غير موجود'; end if;
  end loop;
  if d<>c or d=0 then raise exception 'القيد غير متوازن'; end if;
 end loop;
 -- Keep classifications stable for posted accounts.
 if exists(select 1 from jsonb_array_elements(current_data->'accounts') old join jsonb_array_elements(new_data->'accounts') fresh on old->>'id'=fresh->>'id' where old->>'type'<>fresh->>'type' and exists(select 1 from jsonb_array_elements(current_data->'entries') e cross join lateral jsonb_array_elements(e->'lines') l where l->>'accountId'=old->>'id')) then raise exception 'لا يمكن تغيير تصنيف حساب مرتبط بقيود'; end if;
 perform set_config('ghaith.validated','yes',true);
 update public.accounting_state set data=new_data,version=version+1,updated_at=now() where id=1 returning version into current_version;
 return current_version;
end;$$;
revoke all on function public.save_accounting_state(bigint,jsonb) from public,anon;
grant execute on function public.save_accounting_state(bigint,jsonb) to authenticated;
-- Block direct REST updates; RPC uses a guarded transaction with a private flag.
create or replace function public.guard_state_write() returns trigger language plpgsql as $$
begin
 if current_setting('ghaith.validated',true) is distinct from 'yes' then raise exception 'استخدم عملية حفظ القيود المعتمدة'; end if;
 return new;
end;$$;
create trigger guard_accounting_update before update on public.accounting_state for each row execute function public.guard_state_write();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attachments','attachments',false,5242880,array['application/pdf','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy "members read attachments" on storage.objects for select to authenticated using(bucket_id='attachments' and exists(select 1 from public.accounting_members where user_id=auth.uid()));
create policy "members upload attachments" on storage.objects for insert to authenticated with check(bucket_id='attachments' and exists(select 1 from public.accounting_members where user_id=auth.uid()));
create policy "members clean failed uploads" on storage.objects for delete to authenticated using(bucket_id='attachments' and exists(select 1 from public.accounting_members where user_id=auth.uid()));

insert into public.accounting_state(id,data) values(1,'{"accounts":[{"id":"asset","code":"1","name":"الأصول","type":"asset","parentId":""},{"id":"liability","code":"2","name":"الالتزامات","type":"liability","parentId":""},{"id":"equity","code":"3","name":"حقوق الملكية","type":"equity","parentId":""},{"id":"revenue","code":"4","name":"الإيرادات","type":"revenue","parentId":""},{"id":"expense","code":"5","name":"المصروفات","type":"expense","parentId":""},{"id":"cash","code":"1101","name":"الصندوق","type":"asset","parentId":"asset"},{"id":"bank","code":"1102","name":"البنك","type":"asset","parentId":"asset"},{"id":"capital","code":"3101","name":"رأس المال","type":"equity","parentId":"equity"},{"id":"courses","code":"4101","name":"إيرادات الدورات التعليمية","type":"revenue","parentId":"revenue"},{"id":"teachers","code":"5101","name":"أجور المعلمين","type":"expense","parentId":"expense"},{"id":"rent","code":"5102","name":"الإيجار","type":"expense","parentId":"expense"}],"centers":[],"entries":[]}'::jsonb) on conflict(id) do nothing;

-- Append-only audit log, written by a trigger rather than trusting the browser.
create table public.accounting_audit(id bigint generated always as identity primary key, created_at timestamptz not null default now(), actor uuid, description text not null);
alter table public.accounting_audit enable row level security;
create policy "members read audit" on public.accounting_audit for select to authenticated using(exists(select 1 from public.accounting_members where user_id=auth.uid()));
grant select on public.accounting_audit to authenticated;
create or replace function public.log_accounting_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.accounting_audit(actor,description) values(auth.uid(),
 case when jsonb_array_length(new.data->'entries')>jsonb_array_length(old.data->'entries') then 'إضافة قيد يومي' when new.data->'accounts' is distinct from old.data->'accounts' then 'تحديث شجرة الحسابات' when new.data->'centers' is distinct from old.data->'centers' then 'تحديث مراكز التكلفة' else 'تحديث البيانات المحاسبية' end);
 return new;
end;$$;
create trigger audit_accounting_changes after update on public.accounting_state for each row execute function public.log_accounting_change();
