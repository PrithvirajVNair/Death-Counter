-- ==============================================================================
-- Souls Game Death Counter — Production Database Schema & Security Hardening
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- Enable pgcrypto for secure cryptographic hashing
create extension if not exists pgcrypto;

-- 1. Create / Update streamer_states table
create table if not exists public.streamer_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  streamer_key text unique not null,
  deaths integer not null default 0 check (deaths >= 0),
  session_deaths integer not null default 0 check (session_deaths >= 0),
  all_time_deaths integer not null default 0 check (all_time_deaths >= 0),
  boss_kills integer not null default 0 check (boss_kills >= 0),
  settings jsonb not null default '{}'::jsonb,
  shortcuts jsonb not null default '{}'::jsonb,
  bosses jsonb not null default '{}'::jsonb,
  current_boss text not null default '',
  revision bigint not null default 1,
  last_updated bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure revision column exists for existing tables
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'streamer_states' and column_name = 'revision') then
    alter table public.streamer_states add column revision bigint not null default 1;
  end if;
end $$;

-- Indexes for fast queries
create index if not exists idx_streamer_states_key on public.streamer_states(streamer_key);

-- 2. Create / Update streamer_remote_tokens table (for Friend & Moderator Delegation)
create table if not exists public.streamer_remote_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  streamer_key text not null,
  streamer_name text not null,
  token text not null,
  token_hash text,
  label text not null default 'Friend Access',
  expires_at timestamptz, -- null means permanent
  is_revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ensure token_hash column exists
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'streamer_remote_tokens' and column_name = 'token_hash') then
    alter table public.streamer_remote_tokens add column token_hash text;
  end if;
end $$;

create index if not exists idx_streamer_remote_tokens_token on public.streamer_remote_tokens(token);
create index if not exists idx_streamer_remote_tokens_hash on public.streamer_remote_tokens(token_hash);
create index if not exists idx_streamer_remote_tokens_user on public.streamer_remote_tokens(user_id);
create index if not exists idx_streamer_remote_tokens_key on public.streamer_remote_tokens(streamer_key);

-- 3. Create operation_idempotency table (Prevents double counting on retries)
create table if not exists public.operation_idempotency (
  operation_id text primary key,
  streamer_key text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_operation_idempotency_streamer on public.operation_idempotency(streamer_key);
create index if not exists idx_operation_idempotency_created on public.operation_idempotency(created_at);

-- 4. Enable Row Level Security (RLS)
alter table public.streamer_states enable row level security;
alter table public.streamer_remote_tokens enable row level security;
alter table public.operation_idempotency enable row level security;

-- ==============================================================================
-- 5. RLS Policies: streamer_states
-- ==============================================================================

-- Drop old unsafe policies
drop policy if exists "Streamers can update own state" on public.streamer_states;
drop policy if exists "Streamers can insert own state" on public.streamer_states;
drop policy if exists "Anyone can read streamer state" on public.streamer_states;
drop policy if exists "Streamers can read own state" on public.streamer_states;
drop policy if exists "Public overlay read" on public.streamer_states;
drop policy if exists "Streamers can delete own state" on public.streamer_states;

-- Insert: Only authenticated users for their own user_id
create policy "Streamers can insert own state"
  on public.streamer_states
  for insert
  with check (auth.uid() = user_id);

-- Update: Streamers can ONLY update their own state
create policy "Streamers can update own state"
  on public.streamer_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete: Streamers can only delete their own state
create policy "Streamers can delete own state"
  on public.streamer_states
  for delete
  using (auth.uid() = user_id);

-- Select: Authenticated users can view their own record
create policy "Streamers can read own state"
  on public.streamer_states
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Select: Anonymous users can select overlay states for rendering OBS overlays
create policy "Public overlay read"
  on public.streamer_states
  for select
  to anon
  using (true);

-- Explicit Column Privileges for Anonymous Users (Protects Email & User ID)
revoke all on public.streamer_states from anon;
grant select (
  streamer_key,
  deaths,
  session_deaths,
  all_time_deaths,
  boss_kills,
  settings,
  shortcuts,
  bosses,
  current_boss,
  revision,
  last_updated,
  created_at,
  updated_at
) on public.streamer_states to anon;
grant all on public.streamer_states to authenticated, service_role;

-- ==============================================================================
-- 6. RLS Policies: streamer_remote_tokens
-- ==============================================================================
drop policy if exists "Streamers can manage own remote tokens" on public.streamer_remote_tokens;
drop policy if exists "Public token lookup" on public.streamer_remote_tokens;

create policy "Streamers can manage own remote tokens"
  on public.streamer_remote_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Public token lookup"
  on public.streamer_remote_tokens
  for select
  to anon, authenticated
  using (not is_revoked and (expires_at is null or expires_at > now()));

grant all on public.streamer_remote_tokens to authenticated, service_role;
grant select (
  id,
  streamer_key,
  streamer_name,
  token,
  token_hash,
  label,
  expires_at,
  is_revoked,
  created_at
) on public.streamer_remote_tokens to anon;

-- ==============================================================================
-- 7. RLS Policies: operation_idempotency
-- ==============================================================================
create policy "Service role and authenticated can manage idempotency"
  on public.operation_idempotency
  for all
  using (true)
  with check (true);

grant all on public.operation_idempotency to authenticated, service_role;

-- ==============================================================================
-- 8. Triggers
-- ==============================================================================

-- Automatically update updated_at timestamp
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

-- Prevent altering user_id on existing record
create or replace function public.prevent_user_id_tamper()
returns trigger as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Changing user_id is not allowed.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists check_user_id_tamper on public.streamer_states;
create trigger check_user_id_tamper
  before update on public.streamer_states
  for each row
  execute procedure public.prevent_user_id_tamper();

-- ==============================================================================
-- 9. Atomic Counter Mutation RPC (Transaction-Safe, Prevents Lost Updates)
-- ==============================================================================
create or replace function public.mutate_counter(
  p_streamer_key text,
  p_action text,
  p_value integer default 0,
  p_operation_id text default null,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_state public.streamer_states%rowtype;
  v_diff integer;
  v_now_ms bigint;
  v_token_record public.streamer_remote_tokens%rowtype;
  v_is_authorized boolean := false;
  v_token_hash text;
begin
  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- 1. Authorization Verification
  -- A. Authenticated Streamer Owner check
  if auth.uid() is not null then
    select user_id into v_user_id
    from public.streamer_states
    where streamer_key = p_streamer_key;

    if v_user_id is not null and v_user_id = auth.uid() then
      v_is_authorized := true;
    end if;
  end if;

  -- B. Moderator Token check (if not authorized as owner)
  if not v_is_authorized and p_token is not null and p_token <> '' then
    v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

    select * into v_token_record
    from public.streamer_remote_tokens
    where streamer_key = p_streamer_key
      and (token = p_token or token_hash = v_token_hash or token = v_token_hash)
      and not is_revoked
      and (expires_at is null or expires_at > now())
    limit 1;

    if v_token_record.id is not null then
      v_is_authorized := true;
    end if;
  end if;

  if not v_is_authorized then
    raise exception 'Unauthorized counter mutation';
  end if;

  -- 2. Idempotency Check (Prevents duplicate counting on network retries)
  if p_operation_id is not null and p_operation_id <> '' then
    if exists (
      select 1 from public.operation_idempotency
      where operation_id = p_operation_id and streamer_key = p_streamer_key
    ) then
      select * into v_state from public.streamer_states where streamer_key = p_streamer_key;
      return jsonb_build_object(
        'success', true,
        'deduped', true,
        'action', p_action,
        'deaths', v_state.deaths,
        'sessionDeaths', v_state.session_deaths,
        'allTimeDeaths', v_state.all_time_deaths,
        'bossKills', v_state.boss_kills,
        'revision', v_state.revision,
        'lastUpdated', v_state.last_updated
      );
    end if;

    insert into public.operation_idempotency (operation_id, streamer_key, action)
    values (p_operation_id, p_streamer_key, p_action)
    on conflict (operation_id) do nothing;
  end if;

  -- 3. Lock and retrieve current streamer state row (FOR UPDATE prevents race conditions)
  select * into v_state
  from public.streamer_states
  where streamer_key = p_streamer_key
  for update;

  if v_state.user_id is null then
    raise exception 'Streamer state not found';
  end if;

  -- 4. Apply Atomic Mutations
  if p_action in ('add', 'addDeath') then
    v_state.deaths := v_state.deaths + 1;
    v_state.session_deaths := v_state.session_deaths + 1;
    v_state.all_time_deaths := v_state.all_time_deaths + 1;
  elsif p_action in ('undo', 'undoDeath') then
    v_state.deaths := greatest(0, v_state.deaths - 1);
    v_state.session_deaths := greatest(0, v_state.session_deaths - 1);
  elsif p_action in ('addBossKill', 'bossSlain') then
    v_state.boss_kills := v_state.boss_kills + 1;
  elsif p_action in ('undoBossKill') then
    v_state.boss_kills := greatest(0, v_state.boss_kills - 1);
  elsif p_action in ('setDeath', 'setCount') then
    v_diff := p_value - v_state.deaths;
    v_state.deaths := greatest(0, p_value);
    v_state.session_deaths := greatest(0, v_state.session_deaths + v_diff);
    v_state.all_time_deaths := greatest(0, v_state.all_time_deaths + greatest(0, v_diff));
  elsif p_action in ('setBossKill', 'setBossCount') then
    v_state.boss_kills := greatest(0, p_value);
  elsif p_action in ('resetSession', 'reset') then
    v_state.deaths := 0;
    v_state.session_deaths := 0;
  elsif p_action in ('resetAll') then
    v_state.deaths := 0;
    v_state.session_deaths := 0;
    v_state.all_time_deaths := 0;
    v_state.boss_kills := 0;
  else
    raise exception 'Invalid counter action: %', p_action;
  end if;

  -- Increment authoritative revision and update timestamp
  v_state.revision := coalesce(v_state.revision, 0) + 1;
  v_state.last_updated := v_now_ms;

  update public.streamer_states
  set deaths = v_state.deaths,
      session_deaths = v_state.session_deaths,
      all_time_deaths = v_state.all_time_deaths,
      boss_kills = v_state.boss_kills,
      revision = v_state.revision,
      last_updated = v_state.last_updated,
      updated_at = now()
  where streamer_key = p_streamer_key;

  return jsonb_build_object(
    'success', true,
    'action', p_action,
    'deaths', v_state.deaths,
    'sessionDeaths', v_state.session_deaths,
    'allTimeDeaths', v_state.all_time_deaths,
    'bossKills', v_state.boss_kills,
    'revision', v_state.revision,
    'lastUpdated', v_state.last_updated
  );
end;
$$;

-- ==============================================================================
-- 10. Public Overlay Projection Function
-- ==============================================================================
create or replace function public.get_public_overlay_state(p_streamer_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select
    streamer_key,
    deaths,
    session_deaths,
    all_time_deaths,
    boss_kills,
    settings,
    shortcuts,
    bosses,
    current_boss,
    revision,
    last_updated
  into v_row
  from public.streamer_states
  where streamer_key = p_streamer_key;

  if not found then
    return null;
  end if;

  return to_jsonb(v_row);
end;
$$;

-- Clean up idempotency keys older than 24 hours
create or replace function public.cleanup_expired_idempotency_keys()
returns void
language sql
security definer
as $$
  delete from public.operation_idempotency
  where created_at < now() - interval '24 hours';
$$;

-- ==============================================================================
-- 11. Realtime Publication
-- ==============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'streamer_states'
  ) then
    alter publication supabase_realtime add table public.streamer_states;
  end if;
end $$;
