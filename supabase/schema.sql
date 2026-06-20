create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  target_language text not null default 'de',
  cefr_level text not null default 'A1',
  streak_days integer not null default 0,
  total_xp integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cefr_level text not null default 'A1',
  topic text not null,
  estimated_minutes integer not null default 10,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null check (skill in ('reading', 'writing', 'listening', 'speaking')),
  score integer not null default 0 check (score between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (user_id, skill)
);

create table if not exists public.srs_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  answer text not null,
  srs_stage integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  duration_seconds integer not null default 0,
  accuracy numeric(5,2),
  hint_usage integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.skill_scores enable row level security;
alter table public.srs_cards enable row level security;
alter table public.session_logs enable row level security;

drop policy if exists "profiles are self managed" on public.profiles;
create policy "profiles are self managed"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "lessons are readable" on public.lessons;
create policy "lessons are readable"
on public.lessons
for select
using (auth.role() = 'authenticated');

drop policy if exists "skill scores are self managed" on public.skill_scores;
create policy "skill scores are self managed"
on public.skill_scores
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "srs cards are self managed" on public.srs_cards;
create policy "srs cards are self managed"
on public.srs_cards
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "session logs are self managed" on public.session_logs;
create policy "session logs are self managed"
on public.session_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
