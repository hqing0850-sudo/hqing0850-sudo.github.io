-- 我的 AI 衣橱：增加「鞋子」分类
-- 在 Supabase 控制台 → SQL Editor → 新建查询 → 粘贴 → Run
-- 只会放宽分类约束，不会删除任何衣服数据。

-- 1. 删掉旧的分类检查约束（名字可能不同，这里按定义找）
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.garments'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%category%'
  loop
    execute format('alter table public.garments drop constraint %I', c.conname);
  end loop;
end $$;

-- 2. 允许 top / outerwear / pants / shoes
alter table public.garments
  add constraint garments_category_check
  check (category in ('top', 'outerwear', 'pants', 'shoes'));

-- 3. 编号函数增加「鞋子001」序列
create or replace function public.next_garment_sequence(p_category text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
  candidate integer;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  if p_category = 'top' then
    prefix := '上衣';
  elsif p_category = 'outerwear' then
    prefix := '外套';
  elsif p_category = 'pants' then
    prefix := '裤子';
  elsif p_category = 'shoes' then
    prefix := '鞋子';
  else
    raise exception '未知分类: %', p_category;
  end if;

  select g into candidate
    from generate_series(1, 99999) as g
   where not exists (
     select 1 from public.garments
      where user_id = auth.uid()
        and code = prefix || lpad(g::text, 3, '0')
   )
   order by g
   limit 1;

  if candidate is null then
    raise exception '该分类的编号已经用完了';
  end if;

  return candidate;
end;
$$;
