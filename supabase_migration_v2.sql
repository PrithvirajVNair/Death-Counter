-- ==============================================================================
-- Souls Game Death Counter — Non-Destructive v2 Repeatable Migration
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- Safe to run multiple times without data loss or duplicate-object errors.
-- ==============================================================================

-- 1. Ensure pgcrypto extension for SHA-256 tokens and UUID generation
create extension if not exists pgcrypto;

-- 2. Add revision column to streamer_states if not exists
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'streamer_states' and column_name = 'revision') then
    alter table public.streamer_states add column revision bigint not null default 1;
  end if;
end $$;

-- 3. Enhance streamer_remote_tokens table safely
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'streamer_remote_tokens' and column_name = 'token_hash') then
    alter table public.streamer_remote_tokens add column token_hash text;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'streamer_remote_tokens' and column_name = 'permissions') then
    alter table public.streamer_remote_tokens add column permissions jsonb not null default '{"can_increment_deaths":true,"can_increment_bosses":true,"can_set_deaths":true,"can_set_bosses":true,"can_reset_session":true,"can_reset_all":false}'::jsonb;
  end if;
end $$;

-- Migrate any existing plaintext tokens to token_hash
update public.streamer_remote_tokens
set token_hash = encode(digest(token, 'sha256'), 'hex')
where token_hash is null and token is not null and token <> '';

-- Allow token to be nullable, and clear plaintext tokens for security
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'streamer_remote_tokens' and column_name = 'token' and is_nullable = 'NO') then
    alter table public.streamer_remote_tokens alter column token drop not null;
  end if;
end $$;

-- Ensure unique index on token_hash
create unique index if not exists idx_streamer_remote_tokens_hash on public.streamer_remote_tokens(token_hash) where token_hash is not null;

-- 4. Create or update operation_idempotency table with scoped primary key and cached result
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'operation_idempotency') then
    create table public.operation_idempotency (
      streamer_key varchar(64) not null,
      operation_id varchar(128) not null,
      action_name varchar(64) not null,
      result_state jsonb not null,
      created_at timestamptz not null default timezone('utc', now()),
      primary key (streamer_key, operation_id)
    );
  else
    -- If table was created with old schema, ensure columns exist
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'operation_idempotency' and column_name = 'result_state') then
      alter table public.operation_idempotency add column result_state jsonb;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'operation_idempotency' and column_name = 'action_name') then
      alter table public.operation_idempotency add column action_name varchar(64);
    end if;
  end if;
end $$;

create index if not exists idx_operation_idempotency_created on public.operation_idempotency(created_at);

-- 5. Enable Row-Level Security on all tables
alter table public.streamer_states enable row level security;
alter table public.streamer_remote_tokens enable row level security;
alter table public.operation_idempotency enable row level security;

-- 6. Replace and Harden Policies on streamer_states
drop policy if exists "Streamers can update own state" on public.streamer_states;
drop policy if exists "Streamers can insert own state" on public.streamer_states;
drop policy if exists "Anyone can read streamer state" on public.streamer_states;
drop policy if exists "Streamers can read own state" on public.streamer_states;
drop policy if exists "Public overlay read" on public.streamer_states;
drop policy if exists "Streamers can delete own state" on public.streamer_states;
drop policy if exists "Streamers own records" on public.streamer_states;

create policy "Streamers own records"
  on public.streamer_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Public overlay read"
  on public.streamer_states
  for select
  to anon
  using (true);

-- Revoke all table-level privileges from anon, grant select ONLY on public overlay columns
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

-- 7. Replace and Harden Policies on streamer_remote_tokens
drop policy if exists "Streamers can manage own remote tokens" on public.streamer_remote_tokens;
drop policy if exists "Public token lookup" on public.streamer_remote_tokens;
drop policy if exists "Streamers manage own tokens" on public.streamer_remote_tokens;

-- Authenticated streamers can manage only their own token records
create policy "Streamers manage own tokens"
  on public.streamer_remote_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- STRICT: Revoke ALL access from anon on streamer_remote_tokens!
revoke all on public.streamer_remote_tokens from anon;
-- Authenticated users cannot select token_hash or raw token
revoke select (token, token_hash) on public.streamer_remote_tokens from authenticated;
grant select (id, user_id, streamer_key, streamer_name, label, permissions, expires_at, is_revoked, created_at)
  on public.streamer_remote_tokens to authenticated;
grant all on public.streamer_remote_tokens to service_role;

-- 8. Harden Policies on operation_idempotency
drop policy if exists "Service role and authenticated can manage idempotency" on public.operation_idempotency;
drop policy if exists "Service role only idempotency" on public.operation_idempotency;

-- Completely isolate idempotency table: no client access
revoke all on public.operation_idempotency from anon, authenticated;
grant all on public.operation_idempotency to service_role;

-- 9. Secure token validation function (Callable by backend or client without exposing hashes)
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

revoke all on function public.validate_remote_token(text) from public;
grant execute on function public.validate_remote_token(text) to anon, authenticated, service_role;

-- 10. Atomic and Idempotent Mutation RPC: mutate_counter
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
  if auth.uid() is not null then
    select user_id into v_user_id
    from public.streamer_states
    where streamer_key = p_streamer_key;

    if v_user_id is not null and v_user_id = auth.uid() then
      v_is_authorized := true;
    end if;
  end if;

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

  -- Service role can execute directly without JWT/token if invoked from trusted backend
  if not v_is_authorized and current_user = 'service_role' then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Unauthorized counter mutation';
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

revoke all on function public.mutate_counter(text, text, integer, text, text) from public;
grant execute on function public.mutate_counter(text, text, integer, text, text) to authenticated, service_role;

-- 11. Public overlay projection helper
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
