-- GHC Academy chart: run after ghc-fresh-install.sql in the GHC project's SQL Editor.
-- Additive and repeatable: no deletion, balance creation, journal reset or RLS bypass.
-- Conflicting existing codes/names stop the entire transaction for manual review.
begin;
create or replace function public.save_accounting_state(expected_version bigint, new_data jsonb)
returns bigint language plpgsql security invoker set search_path = public as $$
declare current_data jsonb; current_version bigint; entry jsonb; line jsonb; account jsonb; item jsonb; d numeric; c numeric; seen text[]; n integer;
begin
 select data,version into current_data,current_version from public.accounting_state where id=1 for update;
 if not found then raise exception 'غير مصرح بالدخول'; end if;
 if current_version<>expected_version then raise exception 'تم تعديل البيانات من جهاز آخر. تم تحديثها؛ أعد المحاولة.'; end if;
 if jsonb_typeof(new_data->'accounts') is distinct from 'array' or jsonb_typeof(new_data->'centers') is distinct from 'array' or jsonb_typeof(new_data->'entries') is distinct from 'array' then raise exception 'بنية بيانات غير صالحة'; end if;

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
  if coalesce(entry->>'number','') !~ '^[1-9][0-9]*$' or coalesce(entry->>'description','')='' or coalesce(entry->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(entry->'lines') is distinct from 'array' or jsonb_array_length(entry->'lines')<2 then raise exception 'قيد غير مكتمل'; end if;
  perform (entry->>'date')::date;
  d:=0;c:=0;
  for line in select value from jsonb_array_elements(entry->'lines') loop
   if coalesce(line->>'debit','') !~ '^\d+$' or coalesce(line->>'credit','') !~ '^\d+$' then raise exception 'المبالغ يجب أن تكون هللات صحيحة'; end if;
   if ((line->>'debit')::numeric>0)=((line->>'credit')::numeric>0) then raise exception 'حدد طرفًا واحدًا لكل سطر'; end if;
   d:=d+(line->>'debit')::numeric;c:=c+(line->>'credit')::numeric;
   if not exists(select 1 from jsonb_array_elements(new_data->'accounts') a where a->>'id'=line->>'accountId') then raise exception 'حساب غير موجود'; end if;
   if exists(select 1 from jsonb_array_elements(new_data->'accounts') a where a->>'parentId'=line->>'accountId' or (a->>'id'=line->>'accountId' and (coalesce(a->>'parentId','')='' or a->>'isGroup'='true'))) then raise exception 'التسجيل على الحسابات الفرعية فقط'; end if;
   if coalesce(line->>'centerId','')<>'' and not exists(select 1 from jsonb_array_elements(new_data->'centers') a where a->>'id'=line->>'centerId') then raise exception 'مركز التكلفة غير موجود'; end if;
  end loop;
  if d<>c or d=0 then raise exception 'القيد غير متوازن'; end if;
 end loop;

 -- Drafts are stored separately and never contribute to posted reports.
 if new_data ? 'draftEntries' and jsonb_typeof(new_data->'draftEntries') is distinct from 'array' then raise exception 'قائمة المسودات غير صالحة'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(new_data->'draftEntries','[]'::jsonb)) x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(new_data->'entries') p join jsonb_array_elements(coalesce(new_data->'draftEntries','[]'::jsonb)) draft_row on p->>'id'=draft_row->>'id') then raise exception 'معرف قيد مكرر'; end if;
 for entry in select value from jsonb_array_elements(coalesce(new_data->'draftEntries','[]'::jsonb)) loop
  if coalesce(entry->>'id','')='' or trim(coalesce(entry->>'description',''))='' or coalesce(entry->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(entry->'lines') is distinct from 'array' then raise exception 'بيانات المسودة غير مكتملة'; end if;
  perform (entry->>'date')::date;
  for line in select value from jsonb_array_elements(entry->'lines') loop
   if coalesce(line->>'debit','') !~ '^\d+$' or coalesce(line->>'credit','') !~ '^\d+$' or ((line->>'debit')::numeric>0 and (line->>'credit')::numeric>0) then raise exception 'مبالغ المسودة غير صالحة'; end if;
   if coalesce(line->>'accountId','')<>'' and not exists(select 1 from jsonb_array_elements(new_data->'accounts') a where a->>'id'=line->>'accountId' and coalesce(a->>'parentId','')<>'' and coalesce(a->>'isGroup','false')<>'true' and not exists(select 1 from jsonb_array_elements(new_data->'accounts') child_row where child_row->>'parentId'=a->>'id')) then raise exception 'اختر آخر حساب فرعي فقط للمسودة'; end if;
   if coalesce(line->>'centerId','')<>'' and not exists(select 1 from jsonb_array_elements(new_data->'centers') center_row where center_row->>'id'=line->>'centerId') then raise exception 'مركز تكلفة المسودة غير موجود'; end if;
  end loop;
 end loop;

 -- Existing posted entries can be deleted or moved to drafts, but edited only after draft conversion.
 for entry in select value from jsonb_array_elements(current_data->'entries') loop
  if exists(select 1 from jsonb_array_elements(new_data->'entries') candidate where candidate->>'id'=entry->>'id' and candidate<>entry) then raise exception 'حوّل القيد إلى مسودة قبل تعديله'; end if;
 end loop;
 -- Keep classifications stable for posted accounts.
 if exists(select 1 from jsonb_array_elements(current_data->'accounts') old join jsonb_array_elements(new_data->'accounts') fresh on old->>'id'=fresh->>'id' where old->>'type'<>fresh->>'type' and exists(select 1 from jsonb_array_elements(current_data->'entries') e cross join lateral jsonb_array_elements(e->'lines') l where l->>'accountId'=old->>'id')) then raise exception 'لا يمكن تغيير تصنيف حساب مرتبط بقيود'; end if;
 perform set_config('ghaith.validated','yes',true);
 new_data:=jsonb_set(new_data,'{journalWorkflowVersion}','2'::jsonb,true);
 update public.accounting_state set data=new_data,version=version+1,updated_at=now() where id=1 returning version into current_version;
 return current_version;
end;$$;
revoke all on function public.save_accounting_state(bigint,jsonb) from public,anon;
grant execute on function public.save_accounting_state(bigint,jsonb) to authenticated;

do $chart$
declare
 current_data jsonb; current_version bigint; account jsonb; existing jsonb;
 additions jsonb := '[]'::jsonb;
 requested jsonb := $accounts$[{"id": "ghc-coa-1", "code": "1", "name": "الأصول", "type": "asset", "parentId": "", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-11", "code": "11", "name": "الأصول الثابتة", "type": "asset", "parentId": "ghc-coa-1", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-12", "code": "12", "name": "الأصول المتداولة", "type": "asset", "parentId": "ghc-coa-1", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-1201", "code": "1201", "name": "البنوك", "type": "asset", "parentId": "ghc-coa-12", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-120101", "code": "120101", "name": "بنك ساب - حلول الأنظمة", "type": "asset", "parentId": "ghc-coa-1201", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-1202", "code": "1202", "name": "المصروفات المدفوعة مقدمًا", "type": "asset", "parentId": "ghc-coa-12", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-1203", "code": "1203", "name": "العملاء", "type": "asset", "parentId": "ghc-coa-12", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-120301", "code": "120301", "name": "عملاء GHC", "type": "asset", "parentId": "ghc-coa-1203", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-1204", "code": "1204", "name": "الصندوق", "type": "asset", "parentId": "ghc-coa-12", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-2", "code": "2", "name": "الالتزامات", "type": "liability", "parentId": "", "isGroup": true, "normalBalance": "credit"}, {"id": "ghc-coa-21", "code": "21", "name": "الالتزامات المتداولة", "type": "liability", "parentId": "ghc-coa-2", "isGroup": true, "normalBalance": "credit"}, {"id": "ghc-coa-2101", "code": "2101", "name": "الموردون", "type": "liability", "parentId": "ghc-coa-21", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-2102", "code": "2102", "name": "مصروفات مستحقة", "type": "liability", "parentId": "ghc-coa-21", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-2103", "code": "2103", "name": "إيرادات مقدمة", "type": "liability", "parentId": "ghc-coa-21", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-3", "code": "3", "name": "حقوق الملكية", "type": "equity", "parentId": "", "isGroup": true, "normalBalance": "credit"}, {"id": "ghc-coa-31", "code": "31", "name": "رأس المال", "type": "equity", "parentId": "ghc-coa-3", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-32", "code": "32", "name": "جاري الشركاء", "type": "equity", "parentId": "ghc-coa-3", "isGroup": true, "normalBalance": "credit"}, {"id": "ghc-coa-3201", "code": "3201", "name": "جاري الشريك مصطفى خالد", "type": "equity", "parentId": "ghc-coa-32", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-33", "code": "33", "name": "الأرباح والخسائر المرحلة", "type": "equity", "parentId": "ghc-coa-3", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-4", "code": "4", "name": "الإيرادات ومردوداتها", "type": "revenue", "parentId": "", "isGroup": true, "normalBalance": "credit"}, {"id": "ghc-coa-41", "code": "41", "name": "إيرادات النشاط", "type": "revenue", "parentId": "ghc-coa-4", "isGroup": true, "normalBalance": "credit"}, {"id": "ghc-coa-4101", "code": "4101", "name": "إيرادات الدورات", "type": "revenue", "parentId": "ghc-coa-41", "isGroup": false, "normalBalance": "credit"}, {"id": "ghc-coa-42", "code": "42", "name": "مردودات الإيرادات", "type": "revenue", "parentId": "ghc-coa-4", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-4201", "code": "4201", "name": "مردودات الدورات", "type": "revenue", "parentId": "ghc-coa-42", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-5", "code": "5", "name": "المصروفات", "type": "expense", "parentId": "", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-51", "code": "51", "name": "مصروفات العاملين", "type": "expense", "parentId": "ghc-coa-5", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-5101", "code": "5101", "name": "رواتب", "type": "expense", "parentId": "ghc-coa-51", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-52", "code": "52", "name": "المصروفات التقنية والتراخيص", "type": "expense", "parentId": "ghc-coa-5", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-5201", "code": "5201", "name": "دومين", "type": "expense", "parentId": "ghc-coa-52", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-5202", "code": "5202", "name": "ترخيص إلكتروني", "type": "expense", "parentId": "ghc-coa-52", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-53", "code": "53", "name": "مصروفات التحويل والخدمات البنكية", "type": "expense", "parentId": "ghc-coa-5", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-5301", "code": "5301", "name": "عمولات تحويل", "type": "expense", "parentId": "ghc-coa-53", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-5302", "code": "5302", "name": "عمولات بنكية", "type": "expense", "parentId": "ghc-coa-53", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-54", "code": "54", "name": "مصروفات التسويق", "type": "expense", "parentId": "ghc-coa-5", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-5401", "code": "5401", "name": "إعلانات", "type": "expense", "parentId": "ghc-coa-54", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-55", "code": "55", "name": "المصروفات الإدارية والعمومية", "type": "expense", "parentId": "ghc-coa-5", "isGroup": true, "normalBalance": "debit"}, {"id": "ghc-coa-5501", "code": "5501", "name": "إيجار", "type": "expense", "parentId": "ghc-coa-55", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-5502", "code": "5502", "name": "اتصالات وإنترنت", "type": "expense", "parentId": "ghc-coa-55", "isGroup": false, "normalBalance": "debit"}, {"id": "ghc-coa-5503", "code": "5503", "name": "أدوات ومستلزمات مكتبية", "type": "expense", "parentId": "ghc-coa-55", "isGroup": false, "normalBalance": "debit"}]$accounts$::jsonb;
 member_id uuid := '526918f2-5859-4b08-a1d4-97a44fb783a7';
begin
 if not exists(select 1 from public.accounting_members where user_id=member_id) then
  raise exception 'حساب GHC غير مصرح له';
 end if;
 select data,version into current_data,current_version from public.accounting_state where id=1 for update;
 if not found then raise exception 'شغّل ملف تجهيز GHC أولًا'; end if;
 if coalesce(current_data->>'journalWorkflowVersion','')<>'2' then raise exception 'إصدار قاعدة البيانات غير متوافق'; end if;
 for account in select value from jsonb_array_elements(requested) loop
  select value into existing from jsonb_array_elements(current_data->'accounts') a where a->>'id'=account->>'id';
  if existing is not null then
   -- A later user edit wins. Re-running never reverts it.
   continue;
  end if;
  if exists(select 1 from jsonb_array_elements(current_data->'accounts') a where a->>'code'=account->>'code' or trim(a->>'name')=trim(account->>'name')) then
   raise exception 'يوجد حساب بنفس الكود أو الاسم: % (%). لم يتم تغيير أي بيانات.',account->>'name',account->>'code';
  end if;
  additions := additions || jsonb_build_array(account);
 end loop;
 if jsonb_array_length(additions)>0 then
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  perform public.save_accounting_state(current_version,jsonb_set(current_data,'{accounts}',(current_data->'accounts') || additions));
 end if;
end;
$chart$;
commit;
