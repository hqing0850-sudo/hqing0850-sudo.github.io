-- ============================================================
--  我的 AI 衣橱 · Supabase 数据库脚本
--  用法：打开 Supabase 控制台 → SQL Editor → 新建查询 → 粘贴本文件 → 运行
--  这个脚本可以重复运行，不会重复建表，也不会清空已有数据。
-- ============================================================

-- ---------- 1. 编号分配：每个分类独立，从 001 开始找最小空缺 ----------
-- 规则和本机完全一致：
--   删掉上衣003 之后，下一件上衣重新拿到 003；
--   删掉上衣001 之后，下一件上衣重新拿到 001；
--   上衣/外套/裤子三个序列互不影响。
-- 实现方式是「从 001 往上找第一个没被占用的号」，
-- 不依赖计数器，所以计数器丢失或数据不全都不会跳号。
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
  -- 未登录一律不给号，防止有人绕过前端直接调接口刷编号
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  prefix := case p_category
    when 'top' then '上衣'
    when 'outerwear' then '外套'
    when 'pants' then '裤子'
    else raise exception '未知分类: %', p_category
  end;

  -- 从 1 开始找第一个没有被任何衣服占用的编号
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

-- ---------- 2. 衣服表 ----------
create table if not exists public.garments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  category text not null check (category in ('top', 'outerwear', 'pants')),
  name text not null default '',
  color text not null default '',
  seasons text[] not null default '{}',
  thickness text not null default 'medium' check (thickness in ('thin', 'medium', 'thick')),
  notes text not null default '',
  photo_path text,
  display_mode text not null default 'photo'
    check (display_mode in ('photo', 'cartoon', 'hidden')),
  cartoon_id text,
  custom_asset_id text,
  wash_status text not null default 'clean'
    check (wash_status in ('clean', 'to_wash', 'washing', 'drying', 'stored')),
  status_changed_at timestamptz not null default now(),
  last_washed_at timestamptz,
  wear_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

-- 老项目升级：补上新增的列
alter table public.garments add column if not exists display_mode text not null default 'photo';
alter table public.garments add column if not exists cartoon_id text;
alter table public.garments add column if not exists custom_asset_id text;

create index if not exists garments_user_created_idx on public.garments (user_id, created_at desc);

-- ---------- 3. 洗涤记录表 ----------
create table if not exists public.wash_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_code text not null,
  item_name text not null default '',
  category text not null,
  from_status text,
  to_status text not null,
  at timestamptz not null default now()
);

create index if not exists wash_logs_user_at_idx on public.wash_logs (user_id, at desc);

-- ---------- 4. 自定义图片素材表 ----------
create table if not exists public.custom_assets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '自定义图片',
  photo_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists custom_assets_user_idx on public.custom_assets (user_id, created_at desc);

-- ---------- 5. 打开行级安全，并限制“只能看自己的数据” ----------
alter table public.garments enable row level security;
alter table public.wash_logs enable row level security;
alter table public.custom_assets enable row level security;

-- 旧版本用过的计数器表，现在不再需要（编号改为直接找最小空缺）
drop table if exists public.garment_used_codes;
drop table if exists public.garment_counters;

drop policy if exists "garments_select_own" on public.garments;
create policy "garments_select_own" on public.garments
  for select using (auth.uid() = user_id);

drop policy if exists "garments_insert_own" on public.garments;
create policy "garments_insert_own" on public.garments
  for insert with check (auth.uid() = user_id);

drop policy if exists "garments_update_own" on public.garments;
create policy "garments_update_own" on public.garments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "garments_delete_own" on public.garments;
create policy "garments_delete_own" on public.garments
  for delete using (auth.uid() = user_id);

drop policy if exists "wash_logs_select_own" on public.wash_logs;
create policy "wash_logs_select_own" on public.wash_logs
  for select using (auth.uid() = user_id);

drop policy if exists "wash_logs_insert_own" on public.wash_logs;
create policy "wash_logs_insert_own" on public.wash_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "wash_logs_delete_own" on public.wash_logs;
create policy "wash_logs_delete_own" on public.wash_logs
  for delete using (auth.uid() = user_id);

drop policy if exists "counters_select_own" on public.garment_counters;
drop policy if exists "counters_insert_own" on public.garment_counters;
drop policy if exists "counters_update_own" on public.garment_counters;
drop policy if exists "used_codes_select_own" on public.garment_used_codes;
drop policy if exists "used_codes_insert_own" on public.garment_used_codes;
drop policy if exists "used_codes_update_own" on public.garment_used_codes;
drop policy if exists "used_codes_delete_own" on public.garment_used_codes;

drop policy if exists "assets_select_own" on public.custom_assets;
create policy "assets_select_own" on public.custom_assets
  for select using (auth.uid() = user_id);

drop policy if exists "assets_insert_own" on public.custom_assets;
create policy "assets_insert_own" on public.custom_assets
  for insert with check (auth.uid() = user_id);

drop policy if exists "assets_update_own" on public.custom_assets;
create policy "assets_update_own" on public.custom_assets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "assets_delete_own" on public.custom_assets;
create policy "assets_delete_own" on public.custom_assets
  for delete using (auth.uid() = user_id);

-- ---------- 6. 照片存储桶（私有，只能本人访问） ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_select_own" on storage.objects;
create policy "photos_select_own" on storage.objects
  for select using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_insert_own" on storage.objects;
create policy "photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_update_own" on storage.objects;
create policy "photos_update_own" on storage.objects
  for update using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
--  7. 只读分享链接
--  主人生成一个随机 token，别人拿链接就能看；
--  撤销后立刻失效，分享出去的照片也会被删除。
-- ============================================================

create table if not exists public.wardrobe_shares (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '我的衣橱',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked boolean not null default false
);

create index if not exists wardrobe_shares_user_idx
  on public.wardrobe_shares (user_id, created_at desc);

alter table public.wardrobe_shares enable row level security;

drop policy if exists "shares_select_own" on public.wardrobe_shares;
create policy "shares_select_own" on public.wardrobe_shares
  for select using (auth.uid() = user_id);

drop policy if exists "shares_insert_own" on public.wardrobe_shares;
create policy "shares_insert_own" on public.wardrobe_shares
  for insert with check (auth.uid() = user_id);

drop policy if exists "shares_update_own" on public.wardrobe_shares;
create policy "shares_update_own" on public.wardrobe_shares
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shares_delete_own" on public.wardrobe_shares;
create policy "shares_delete_own" on public.wardrobe_shares
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.wardrobe_shares to authenticated;

-- 访客凭 token 读分享内容（不需要登录）
create or replace function public.get_shared_wardrobe(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select payload
    from public.wardrobe_shares
   where token = p_token
     and revoked = false
   limit 1;
$$;

revoke all on function public.get_shared_wardrobe(text) from public;
grant execute on function public.get_shared_wardrobe(text) to anon, authenticated;

-- 分享用的照片桶：公开读，只有主人能往自己的 token 目录里写
insert into storage.buckets (id, name, public)
values ('shared', 'shared', true)
on conflict (id) do update set public = true;

drop policy if exists "shared_photos_select_own" on storage.objects;
create policy "shared_photos_select_own" on storage.objects
  for select to authenticated using (
    bucket_id = 'shared'
    and exists (
      select 1 from public.wardrobe_shares s
       where s.token = (storage.foldername(name))[1]
         and s.user_id = auth.uid()
         and not s.revoked
    )
  );

drop policy if exists "shared_photos_insert_own" on storage.objects;
create policy "shared_photos_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'shared'
    and exists (
      select 1 from public.wardrobe_shares s
       where s.token = (storage.foldername(name))[1]
         and s.user_id = auth.uid()
         and not s.revoked
    )
  );

drop policy if exists "shared_photos_update_own" on storage.objects;
create policy "shared_photos_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'shared'
    and exists (
      select 1 from public.wardrobe_shares s
       where s.token = (storage.foldername(name))[1]
         and s.user_id = auth.uid()
         and not s.revoked
    )
  );

drop policy if exists "shared_photos_delete_own" on storage.objects;
create policy "shared_photos_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'shared'
    and exists (
      select 1 from public.wardrobe_shares s
       where s.token = (storage.foldername(name))[1]
         and s.user_id = auth.uid()
    )
  );

-- ============================================================
--  完成。回到应用里用邮箱注册账号，然后就能在手机和电脑之间同步，
--  并在「设置 → 分享衣橱」生成只读链接。
-- ============================================================
