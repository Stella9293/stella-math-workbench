-- ============================================================
-- Stella 数学工作台 · Supabase 初始化脚本
-- 用法：Supabase 控制台 → 左侧 SQL Editor → New query → 粘贴全部 → Run
-- 可以重复执行，不会删除已有数据。
-- ============================================================

-- ① 快照表：一个账号一行，存整份工作台数据（JSON）
create table if not exists public.wb_snapshots (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb  not null,
  rev        integer not null default 1,
  device     text,
  updated_at timestamptz not null default now()
);

-- ② 每次更新自动刷新时间戳（前端只负责递增 rev）
create or replace function public.wb_touch() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists wb_snapshots_touch on public.wb_snapshots;
create trigger wb_snapshots_touch before update on public.wb_snapshots
for each row execute function public.wb_touch();

-- ③ 行级安全：只能读写自己那一行（anon key 是公开的，靠这一层保护数据）
alter table public.wb_snapshots enable row level security;

drop policy if exists "wb own row" on public.wb_snapshots;
create policy "wb own row" on public.wb_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 账号准备（二选一）
-- A. 工作台里点「注册新账号」——需要邮箱点确认链接后才能登录
-- B. Supabase → Authentication → Users → Add user（勾选 Auto Confirm，免验证）
--
-- 如果只想自己一个人用，建议做两件事，避免别人乱注册：
--   1) Authentication → Providers → Email → 关闭 "Enable sign-ups"（关掉后只能后台手动加账号）
--   2) 或者加一条邮箱白名单限制（见下）
-- ============================================================
-- 可选：只允许特定邮箱注册
-- create or replace function public.wb_allow_signup() returns trigger as $$
-- begin
--   if new.email not in ('you@example.com') then
--     raise exception 'not allowed';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer;
-- drop trigger if exists wb_allow_signup_trg on auth.users;
-- create trigger wb_allow_signup_trg before insert on auth.users
-- for each row execute function public.wb_allow_signup();
