-- 我的 AI 衣橱：搭配功能
-- 在 Supabase 控制台 → SQL Editor → 新建查询 → 粘贴 → Run
-- 不会删除任何衣服数据。

-- 1. 让搭配只能引用同一账号的衣服
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'garments_user_id_id_key'
  ) then
    alter table public.garments
      add constraint garments_user_id_id_key unique (user_id, id);
  end if;
end $$;

-- 2. 搭配表：上衣、裤子必选；外套、鞋子可选
create table if not exists public.outfits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  notes text not null default '',
  top_id text not null,
  outerwear_id text,
  pants_id text not null,
  shoes_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outfits_top_fk foreign key (user_id, top_id)
    references public.garments(user_id, id) on delete restrict,
  constraint outfits_outerwear_fk foreign key (user_id, outerwear_id)
    references public.garments(user_id, id) on delete restrict,
  constraint outfits_pants_fk foreign key (user_id, pants_id)
    references public.garments(user_id, id) on delete restrict,
  constraint outfits_shoes_fk foreign key (user_id, shoes_id)
    references public.garments(user_id, id) on delete restrict
);

create index if not exists outfits_user_created_idx on public.outfits (user_id, created_at desc);
create index if not exists outfits_top_idx on public.outfits (top_id);
create index if not exists outfits_pants_idx on public.outfits (pants_id);

alter table public.outfits enable row level security;

drop policy if exists "outfits_select_own" on public.outfits;
create policy "outfits_select_own" on public.outfits
  for select using (auth.uid() = user_id);

drop policy if exists "outfits_insert_own" on public.outfits;
create policy "outfits_insert_own" on public.outfits
  for insert with check (auth.uid() = user_id);

drop policy if exists "outfits_update_own" on public.outfits;
create policy "outfits_update_own" on public.outfits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "outfits_delete_own" on public.outfits;
create policy "outfits_delete_own" on public.outfits
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.outfits to authenticated;
