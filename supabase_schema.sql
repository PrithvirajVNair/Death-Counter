-- ==============================================================================
-- Souls Game Death Counter (SDC) — Production PostgreSQL Database Schema
-- Complete Architecture: Strict RLS, Monotonic Revisions, SHA-256 Remote Tokens,
-- Transaction-Safe Idempotency, and Distinct Streamer/Backend Mutation RPCs.
-- ==============================================================================

-- 1. Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==============================================================================
-- 2. Tables & Constraints
-- ==============================================================================

-- 2.1 Core Streamer State Table
create table if not exists public.streamer_states (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  email text,
  display_name text,
  avatar_url text,
  streamer_key varchar(64) not null unique,
  deaths integer not null default 0 check (deaths >= 0),
  session_deaths integer not null default 0 check (session_deaths >= 0),
  all_time_deaths integer not null default 0 check (all_time_deaths >= 0),
  boss_kills integer not null default 0 check (boss_kills >= 0),
  settings jsonb not null default '{"preset":"classic-rune","fontSize":72,"labelVisible":true,"runeVisible":true,"goldColor":"#C8A65D","glowIntensity":0.6,"alignment":"center","layout":"horizontal","frameVisible":true,"animationsEnabled":true,"animationIntensity":0.7,"padding":20,"sessionCountVisible":true}'::jsonb,
  shortcuts jsonb not null default '{"addDeath":"F8","undoDeath":"F7","addBossKill":"F9","undoBossKill":"F10","resetSession":"F11"}'::jsonb,
  bosses jsonb not null default '{}'::jsonb,
  current_boss text not null default '',
  revision bigint not null default 1 check (revision >= 1),
  last_updated bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_streamer_states_user_id on public.streamer_states(user_id);
create index if not exists idx_streamer_states_streamer_key on public.streamer_states(streamer_key);

-- 2.2 Remote Moderator Tokens Table (Stores ONLY SHA-256 Hashes)
create table if not exists public.streamer_remote_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  streamer_key varchar(64) not null,
  streamer_name text,
  token_hash varchar(64) unique not null,
  label text default 'Friend Access',
  permissions jsonb not null default '{"can_increment_deaths":true,"can_increment_bosses":true,"can_set_deaths":true,"can_set_bosses":true,"can_reset_session":true,"can_reset_all":false}'::jsonb,
  expires_at timestamptz, -- null means permanent
  is_revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_streamer_remote_tokens_user on public.streamer_remote_tokens(user_id);
create index if not exists idx_streamer_remote_tokens_key on public.streamer_remote_tokens(streamer_key);
create unique index if not exists idx_streamer_remote_tokens_hash on public.streamer_remote_tokens(token_hash);

-- 2.3 Operation Idempotency Table (Scoped to streamer, transactionally locked)
create table if not exists public.operation_idempotency (
  streamer_key varchar(64) not null,
  operation_id varchar(128) not null,
  action_name varchar(64) not null,
  result_state jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (streamer_key, operation_id)
);

create index if not exists idx_operation_idempotency_created on public.operation_idempotency(created_at);

-- ==============================================================================
-- 3. Row-Level Security (RLS) Configuration
-- ==============================================================================

alter table public.streamer_states enable row level security;
alter table public.streamer_remote_tokens enable row level security;
alter table public.operation_idempotency enable row level security;

-- 3.1 streamer_states policies
drop policy if exists "Streamers own records" on public.streamer_states;
drop policy if exists "Streamers can update own state" on public.streamer_states;
drop policy if exists "Streamers can insert own state" on public.streamer_states;
drop policy if exists "Streamers can read own state" on public.streamer_states;
drop policy if exists "Streamers can delete own state" on public.streamer_states;
drop policy if exists "Public overlay read" on public.streamer_states;

create policy "Streamers own records"
  on public.streamer_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Public overlay read"
  on public.streamer_states
  for select
  using (true);

-- Restrict direct UPDATEs by authenticated users so counter columns cannot bypass mutate_counter
revoke update on public.streamer_states from public, anon, authenticated;
grant update (settings, shortcuts, bosses, current_boss, display_name, avatar_url, updated_at) on public.streamer_states to authenticated;

-- Column-Level SELECT Restrictions: Shield private fields (email, user_id, id, created_at) from anonymous access
revoke select on public.streamer_states from public, anon;
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
  last_updated
) on public.streamer_states to anon;
grant select on public.streamer_states to authenticated;
grant all on public.streamer_states to service_role;

-- 3.2 streamer_remote_tokens policies (Strict Privacy: Never readable by anonymous users)
drop policy if exists "Streamers manage own tokens" on public.streamer_remote_tokens;
drop policy if exists "Public remote tokens read" on public.streamer_remote_tokens;
drop policy if exists "Allow token validation by hash" on public.streamer_remote_tokens;

create policy "Streamers manage own tokens"
  on public.streamer_remote_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Explicitly revoke all anonymous and public permissions on remote tokens
revoke all on public.streamer_remote_tokens from public, anon;
grant select, insert, update, delete on public.streamer_remote_tokens to authenticated, service_role;

-- 3.3 operation_idempotency policies (Internal use only)
drop policy if exists "Streamers read own idempotency" on public.operation_idempotency;
drop policy if exists "Public idempotency" on public.operation_idempotency;

create policy "Streamers read own idempotency"
  on public.operation_idempotency
  for select
  using (auth.uid() is not null);

revoke all on public.operation_idempotency from public, anon;
grant select on public.operation_idempotency to authenticated;
grant all on public.operation_idempotency to service_role;

-- ==============================================================================
-- 4. Triggers
-- ==============================================================================

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
-- 5. Stored Procedures & RPCs
-- ==============================================================================

-- 5.1 Secure Token Validation (Returns metadata without exposing hashes)
create or replace function public.validate_remote_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then
    return jsonb_build_object('valid', false, 'reason', 'invalid_format');
  end if;

  select id, streamer_key, streamer_name, label, permissions, expires_at, is_revoked
  into v_row
  from public.streamer_remote_tokens
  where token_hash = p_token_hash;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_row.is_revoked then
    return jsonb_build_object('valid', false, 'reason', 'revoked', 'streamerName', v_row.streamer_name);
  end if;

  if v_row.expires_at is not null and v_row.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired', 'streamerName', v_row.streamer_name, 'expiresAt', v_row.expires_at);
  end if;

  return jsonb_build_object(
    'valid', true,
    'streamerKey', v_row.streamer_key,
    'streamerName', coalesce(v_row.streamer_name, 'Streamer'),
    'label', coalesce(v_row.label, 'Friend Access'),
    'permissions', coalesce(v_row.permissions, '{"can_increment_deaths":true,"can_increment_bosses":true,"can_set_deaths":true,"can_set_bosses":true,"can_reset_session":true,"can_reset_all":false}'::jsonb),
    'expiresAt', v_row.expires_at
  );
end;
$$;

revoke all on function public.validate_remote_token(text) from public, anon;
grant execute on function public.validate_remote_token(text) to authenticated, service_role;

-- 5.2 Direct Client Mutation RPC: mutate_counter
-- Called directly by authenticated streamers via PostgREST or moderators with tokens
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
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_state public.streamer_states%rowtype;
  v_diff integer;
  v_now_ms bigint;
  v_token_record public.streamer_remote_tokens%rowtype;
  v_is_authorized boolean := false;
  v_token_hash text;
  v_cached_result jsonb;
  v_cached_action text;
  v_result jsonb;
  v_perms jsonb;
begin
  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- Validate operation ID
  if p_operation_id is null or length(trim(p_operation_id)) < 8 or length(p_operation_id) > 128 or p_operation_id !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid or missing operation_id (must be 8-128 alphanumeric characters)';
  end if;

  -- 1. Authorization Verification
  -- Path A: Authenticated streamer calling directly
  if auth.uid() is not null then
    select user_id into v_user_id
    from public.streamer_states
    where streamer_key = p_streamer_key;

    if v_user_id is not null and v_user_id = auth.uid() then
      v_is_authorized := true;
    end if;
  end if;

  -- Path B: Moderator token authentication
  if not v_is_authorized and p_token is not null and p_token <> '' then
    v_token_hash := case when length(p_token) = 64 and p_token ~ '^[a-fA-F0-9]{64}$'
                         then lower(p_token)
                         else encode(digest(p_token, 'sha256'), 'hex') end;

    select * into v_token_record
    from public.streamer_remote_tokens
    where streamer_key = p_streamer_key
      and token_hash = v_token_hash
      and not is_revoked
      and (expires_at is null or expires_at > now())
    limit 1;

    if v_token_record.id is not null then
      v_is_authorized := true;
      v_perms := coalesce(v_token_record.permissions, '{"can_increment_deaths":true,"can_increment_bosses":true,"can_set_deaths":true,"can_set_bosses":true,"can_reset_session":true,"can_reset_all":false}'::jsonb);

      -- Enforce fine-grained permissions for moderators
      if p_action in ('add', 'addDeath', 'undo', 'undoDeath') and not coalesce((v_perms->>'can_increment_deaths')::boolean, true) then
        raise exception 'Permission denied: Token cannot modify deaths';
      elsif p_action in ('addBossKill', 'bossSlain', 'undoBossKill') and not coalesce((v_perms->>'can_increment_bosses')::boolean, true) then
        raise exception 'Permission denied: Token cannot modify boss kills';
      elsif p_action in ('setDeath', 'setCount') and not coalesce((v_perms->>'can_set_deaths')::boolean, true) then
        raise exception 'Permission denied: Token cannot set exact death count';
      elsif p_action in ('setBossKill', 'setBossCount') and not coalesce((v_perms->>'can_set_bosses')::boolean, true) then
        raise exception 'Permission denied: Token cannot set exact boss count';
      elsif p_action in ('resetSession', 'reset') and not coalesce((v_perms->>'can_reset_session')::boolean, true) then
        raise exception 'Permission denied: Token cannot reset session deaths';
      elsif p_action in ('resetAll') and not coalesce((v_perms->>'can_reset_all')::boolean, false) then
        raise exception 'Permission denied: Token cannot reset all-time statistics';
      end if;
    end if;
  end if;

  if not v_is_authorized then
    raise exception 'Unauthorized counter mutation: Authentication or valid token required';
  end if;

  -- 2. Lock the streamer state row first to strictly serialize concurrent mutations
  select * into v_state
  from public.streamer_states
  where streamer_key = p_streamer_key
  for update;

  if v_state.user_id is null then
    raise exception 'Streamer state not found';
  end if;

  -- 3. Idempotency Check (Thread-safe inside row lock)
  select result_state, action_name into v_cached_result, v_cached_action
  from public.operation_idempotency
  where streamer_key = p_streamer_key and operation_id = p_operation_id;

  if v_cached_result is not null then
    if v_cached_action <> p_action then
      raise exception 'Operation ID reuse with conflicting action';
    end if;
    return v_cached_result || jsonb_build_object('deduped', true);
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

  v_state.revision := coalesce(v_state.revision, 0) + 1;
  v_state.last_updated := v_now_ms;

  -- Update streamer_states
  update public.streamer_states
  set deaths = v_state.deaths,
      session_deaths = v_state.session_deaths,
      all_time_deaths = v_state.all_time_deaths,
      boss_kills = v_state.boss_kills,
      revision = v_state.revision,
      last_updated = v_state.last_updated,
      updated_at = now()
  where streamer_key = p_streamer_key;

  v_result := jsonb_build_object(
    'success', true,
    'deduped', false,
    'action', p_action,
    'deaths', v_state.deaths,
    'sessionDeaths', v_state.session_deaths,
    'allTimeDeaths', v_state.all_time_deaths,
    'bossKills', v_state.boss_kills,
    'revision', v_state.revision,
    'lastUpdated', v_state.last_updated
  );

  -- Store in idempotency table
  insert into public.operation_idempotency (streamer_key, operation_id, action_name, result_state)
  values (p_streamer_key, p_operation_id, p_action, v_result)
  on conflict (streamer_key, operation_id) do nothing;

  return v_result;
end;
$$;

revoke all on function public.mutate_counter(text, text, integer, text, text) from public, anon;
grant execute on function public.mutate_counter(text, text, integer, text, text) to authenticated, service_role;

-- 5.3 Dedicated Trusted Backend Mutation RPC: mutate_counter_backend
-- Callable ONLY by service_role from the trusted serverless backend
create or replace function public.mutate_counter_backend(
  p_streamer_key text,
  p_action text,
  p_value integer default 0,
  p_operation_id text default null,
  p_caller_type text default 'backend',
  p_caller_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.streamer_states%rowtype;
  v_diff integer;
  v_now_ms bigint;
  v_cached_result jsonb;
  v_cached_action text;
  v_result jsonb;
begin
  -- Validate caller role is service_role
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' and current_user <> 'postgres' then
    raise exception 'Unauthorized: Service role client required for privileged mutation';
  end if;

  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- Validate operation ID
  if p_operation_id is null or length(trim(p_operation_id)) < 8 or length(p_operation_id) > 128 or p_operation_id !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid or missing operation_id (must be 8-128 alphanumeric characters)';
  end if;

  -- 1. Lock the streamer state row first to strictly serialize concurrent mutations
  select * into v_state
  from public.streamer_states
  where streamer_key = p_streamer_key
  for update;

  if v_state.user_id is null then
    raise exception 'Streamer state not found';
  end if;

  -- 2. Idempotency Check (Thread-safe inside row lock)
  select result_state, action_name into v_cached_result, v_cached_action
  from public.operation_idempotency
  where streamer_key = p_streamer_key and operation_id = p_operation_id;

  if v_cached_result is not null then
    if v_cached_action <> p_action then
      raise exception 'Operation ID reuse with conflicting action';
    end if;
    return v_cached_result || jsonb_build_object('deduped', true);
  end if;

  -- 3. Apply Atomic Mutations
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

  v_state.revision := coalesce(v_state.revision, 0) + 1;
  v_state.last_updated := v_now_ms;

  -- Update streamer_states
  update public.streamer_states
  set deaths = v_state.deaths,
      session_deaths = v_state.session_deaths,
      all_time_deaths = v_state.all_time_deaths,
      boss_kills = v_state.boss_kills,
      revision = v_state.revision,
      last_updated = v_state.last_updated,
      updated_at = now()
  where streamer_key = p_streamer_key;

  v_result := jsonb_build_object(
    'success', true,
    'deduped', false,
    'action', p_action,
    'deaths', v_state.deaths,
    'sessionDeaths', v_state.session_deaths,
    'allTimeDeaths', v_state.all_time_deaths,
    'bossKills', v_state.boss_kills,
    'revision', v_state.revision,
    'lastUpdated', v_state.last_updated
  );

  -- Store in idempotency table
  insert into public.operation_idempotency (streamer_key, operation_id, action_name, result_state)
  values (p_streamer_key, p_operation_id, p_action, v_result)
  on conflict (streamer_key, operation_id) do nothing;

  return v_result;
end;
$$;

revoke all on function public.mutate_counter_backend(text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.mutate_counter_backend(text, text, integer, text, text, text) to service_role;

-- 5.4 Transaction-Safe Configuration Update RPC: update_streamer_config
-- Strictly updates settings, shortcuts, bosses, current_boss without touching counters
create or replace function public.update_streamer_config(
  p_streamer_key text,
  p_settings jsonb default null,
  p_shortcuts jsonb default null,
  p_bosses jsonb default null,
  p_current_boss text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_state public.streamer_states%rowtype;
  v_is_authorized boolean := false;
begin
  -- Authorization: Must be authenticated owner or service_role
  if auth.uid() is not null then
    select user_id into v_user_id from public.streamer_states where streamer_key = p_streamer_key;
    if v_user_id is not null and v_user_id = auth.uid() then
      v_is_authorized := true;
    end if;
  end if;

  if not v_is_authorized and coalesce(auth.role(), '') = 'service_role' then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Unauthorized: Only the streamer owner can update configuration';
  end if;

  -- Lock the streamer record for update
  select * into v_state from public.streamer_states where streamer_key = p_streamer_key for update;
  if v_state.user_id is null then
    raise exception 'Streamer record not found';
  end if;

  -- Merge permitted configuration fields only; NEVER touch counter tallies!
  if p_settings is not null then
    v_state.settings := v_state.settings || p_settings;
  end if;
  if p_shortcuts is not null then
    v_state.shortcuts := v_state.shortcuts || p_shortcuts;
  end if;
  if p_bosses is not null then
    v_state.bosses := p_bosses;
  end if;
  if p_current_boss is not null then
    v_state.current_boss := p_current_boss;
  end if;
  if p_display_name is not null then
    v_state.display_name := p_display_name;
  end if;

  v_state.revision := coalesce(v_state.revision, 1) + 1;
  v_state.last_updated := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_state.updated_at := now();

  update public.streamer_states
  set settings = v_state.settings,
      shortcuts = v_state.shortcuts,
      bosses = v_state.bosses,
      current_boss = v_state.current_boss,
      display_name = v_state.display_name,
      revision = v_state.revision,
      last_updated = v_state.last_updated,
      updated_at = v_state.updated_at
  where streamer_key = p_streamer_key;

  return jsonb_build_object(
    'success', true,
    'streamerKey', v_state.streamer_key,
    'settings', v_state.settings,
    'shortcuts', v_state.shortcuts,
    'bosses', v_state.bosses,
    'currentBoss', v_state.current_boss,
    'revision', v_state.revision,
    'lastUpdated', v_state.last_updated
  );
end;
$$;

revoke all on function public.update_streamer_config(text, jsonb, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.update_streamer_config(text, jsonb, jsonb, jsonb, text, text) to authenticated, service_role;

-- 5.5 Public Overlay Projection Helper
create or replace function public.get_public_overlay_state(p_streamer_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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

revoke all on function public.get_public_overlay_state(text) from public;
grant execute on function public.get_public_overlay_state(text) to anon, authenticated, service_role;

-- 5.6 Dedicated Authenticated Streamer Key Regeneration RPC
-- Updates streamer_key transactionally, updates associated moderator tokens, increments revision.
create or replace function public.regenerate_streamer_key(p_new_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_old_key text;
  v_revision bigint;
  v_now_ms bigint;
  v_existing_owner uuid;
begin
  -- 1. Verify caller is authenticated
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized: Authentication required to regenerate streamer key';
  end if;

  -- 2. Validate new key format (8-64 alphanumeric characters, underscores, dashes)
  if p_new_key is null or length(trim(p_new_key)) < 8 or length(trim(p_new_key)) > 64 or trim(p_new_key) !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid streamer key format. Must be 8-64 alphanumeric characters, underscores or dashes.';
  end if;

  p_new_key := trim(p_new_key);
  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- 3. Check uniqueness across other accounts
  select user_id into v_existing_owner
  from public.streamer_states
  where streamer_key = p_new_key;

  if v_existing_owner is not null and v_existing_owner <> v_user_id then
    raise exception 'Uniqueness conflict: Streamer key is already in use by another account';
  end if;

  -- 4. Lock the streamer record FOR UPDATE to serialize operations
  select streamer_key, revision
  into v_old_key, v_revision
  from public.streamer_states
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Streamer state record not found for user %', v_user_id;
  end if;

  -- 5. Transactionally update streamer_states
  update public.streamer_states
  set
    streamer_key = p_new_key,
    revision = v_revision + 1,
    last_updated = v_now_ms,
    updated_at = now()
  where user_id = v_user_id;

  -- 6. Update associated moderator tokens so existing moderator links continue working
  if v_old_key is not null and v_old_key <> p_new_key then
    update public.streamer_remote_tokens
    set streamer_key = p_new_key
    where user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'streamer_key', p_new_key,
    'old_streamer_key', v_old_key,
    'revision', v_revision + 1,
    'last_updated', v_now_ms
  );
end;
$$;

revoke all on function public.regenerate_streamer_key(text) from public, anon;
grant execute on function public.regenerate_streamer_key(text) to authenticated, service_role;

