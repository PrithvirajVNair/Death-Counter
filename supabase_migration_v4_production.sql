-- ==============================================================================
-- SOULS GAME DEATH COUNTER (SDC)
-- MIGRATION V4: PRODUCTION READINESS — COLUMN PRIVILEGES & KEY REGENERATION RPC
-- ==============================================================================
-- Description:
-- 1. Enforces column-level SELECT privileges on public.streamer_states to shield
--    sensitive account data (email, user_id, id, created_at) from anonymous access.
--    Allows public OBS overlays and moderator controls to query only display fields:
--    (streamer_key, deaths, session_deaths, all_time_deaths, boss_kills, settings,
--     shortcuts, bosses, current_boss, revision, last_updated).
-- 2. Confirms public.streamer_remote_tokens remains inaccessible to anon.
-- 3. Implements dedicated authenticated RPC public.regenerate_streamer_key(p_new_key)
--    with SELECT ... FOR UPDATE locking, uniqueness enforcement, and cascading
--    moderator token updates.
--
-- This migration is idempotent and safe to apply to existing databases.
-- ==============================================================================

BEGIN;

-- 1. Column-Level SELECT Restrictions on public.streamer_states
-- Revoke broad table-level SELECT from anonymous and public roles
REVOKE SELECT ON public.streamer_states FROM anon, public;

-- Grant SELECT only to explicit public display columns required by overlays & remotes
GRANT SELECT (
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
) ON public.streamer_states TO anon;

-- Grant full SELECT to authenticated streamers (governed by RLS) and service_role
GRANT SELECT ON public.streamer_states TO authenticated;
GRANT ALL ON public.streamer_states TO service_role;

-- Ensure table-level direct UPDATE remains revoked (only mutate_counter & config RPC can update)
REVOKE UPDATE ON public.streamer_states FROM anon, public;
GRANT UPDATE (settings, shortcuts, bosses, current_boss, display_name, avatar_url, updated_at) ON public.streamer_states TO authenticated;

-- 2. Verify strict isolation of streamer_remote_tokens (Inaccessible to anonymous users)
REVOKE ALL ON public.streamer_remote_tokens FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streamer_remote_tokens TO authenticated, service_role;

-- 3. Dedicated Authenticated Streamer Key Regeneration RPC
CREATE OR REPLACE FUNCTION public.regenerate_streamer_key(p_new_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_old_key text;
  v_revision bigint;
  v_now_ms bigint;
  v_existing_owner uuid;
BEGIN
  -- Verify caller authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to regenerate streamer key';
  END IF;

  -- Validate key format (8-64 alphanumeric characters, underscores, dashes)
  IF p_new_key IS NULL OR length(trim(p_new_key)) < 8 OR length(trim(p_new_key)) > 64 OR trim(p_new_key) !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid streamer key format. Must be 8-64 alphanumeric characters, underscores or dashes.';
  END IF;

  p_new_key := trim(p_new_key);
  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  -- Check key uniqueness across other accounts
  SELECT user_id INTO v_existing_owner
  FROM public.streamer_states
  WHERE streamer_key = p_new_key;

  IF v_existing_owner IS NOT NULL AND v_existing_owner <> v_user_id THEN
    RAISE EXCEPTION 'Uniqueness conflict: Streamer key is already in use by another account';
  END IF;

  -- Lock streamer row FOR UPDATE to ensure serial execution
  SELECT streamer_key, revision
  INTO v_old_key, v_revision
  FROM public.streamer_states
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Streamer state record not found for user %', v_user_id;
  END IF;

  -- Transactionally update streamer_states
  UPDATE public.streamer_states
  SET
    streamer_key = p_new_key,
    revision = v_revision + 1,
    last_updated = v_now_ms,
    updated_at = now()
  WHERE user_id = v_user_id;

  -- Update associated moderator tokens so existing moderator links continue working
  IF v_old_key IS NOT NULL AND v_old_key <> p_new_key THEN
    UPDATE public.streamer_remote_tokens
    SET streamer_key = p_new_key
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'streamer_key', p_new_key,
    'old_streamer_key', v_old_key,
    'revision', v_revision + 1,
    'last_updated', v_now_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_streamer_key(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_streamer_key(text) TO authenticated, service_role;

COMMIT;
