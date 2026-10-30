-- ==============================================================================
-- Souls Game Death Counter — Supabase Database Schema
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create streamer_states table
create table if not exists public.streamer_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  streamer_key text unique not null,
  deaths integer default 0,
  session_deaths integer default 0,
  all_time_deaths integer default 0,
  boss_kills integer default 0,
  settings jsonb default '{}'::jsonb,
  shortcuts jsonb default '{}'::jsonb,
  bosses jsonb default '{}'::jsonb,
  current_boss text default '',
  last_updated bigint default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Create index on streamer_key for fast OBS overlay queries
create index if not exists idx_streamer_states_key on public.streamer_states(streamer_key);

-- 3. Enable Row Level Security (RLS)
alter table public.streamer_states enable row level security;

-- 4. Policies:
-- Streamers can insert and update their own state
create policy "Streamers can insert own state"
  on public.streamer_states
  for insert
  with check (auth.uid() = user_id);

create policy "Streamers can update own state"
  on public.streamer_states
  for update
  using (auth.uid() = user_id);

-- OBS overlays and public viewers can read states by streamer_key
create policy "Anyone can read streamer state"
  on public.streamer_states
  for select
  using (true);

-- 5. Trigger to automatically update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.streamer_states;
create trigger set_timestamp
  before update on public.streamer_states
  for each row
  execute procedure public.handle_updated_at();
