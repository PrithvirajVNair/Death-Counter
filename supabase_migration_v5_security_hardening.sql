-- ==============================================================================
-- SOULS GAME DEATH COUNTER (SDC)
-- MIGRATION V5: SECURITY HARDENING — STREAMER TOKEN OWNERSHIP & DB SHIELDING
-- ==============================================================================
-- Description:
-- 1. Strictly enforces that ONLY the authenticated owner of a streamer key can
--    create remote access links and set their time limits.
-- 2. Prevents any other user from creating tokens or altering time limits for
--    another streamer's channel.
-- 3. Shields the database so NO plaintext access tokens are ever stored, and
--    even SHA-256 token hashes are shielded from direct SELECT queries.
-- 4. Provides transactional RPCs `create_remote_token` and `revoke_remote_token`
--    enforcing server-side duration calculation and ownership verification.
--
-- This migration is idempotent and safe to apply to existing databases.
-- ==============================================================================

BEGIN;

-- 1. Tighten Row Level Security (RLS) on public.streamer_remote_tokens
-- Guarantee that a user can ONLY manage tokens for the streamer key they actually own.
DROP POLICY IF EXISTS "Streamers manage own tokens" ON public.streamer_remote_tokens;
DROP POLICY IF EXISTS "Public remote tokens read" ON public.streamer_remote_tokens;
DROP POLICY IF EXISTS "Allow token validation by hash" ON public.streamer_remote_tokens;

CREATE POLICY "Streamers manage own tokens"
  ON public.streamer_remote_tokens
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.streamer_states s
      WHERE s.user_id = auth.uid()
        AND s.streamer_key = streamer_remote_tokens.streamer_key
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.streamer_states s
      WHERE s.user_id = auth.uid()
        AND s.streamer_key = streamer_remote_tokens.streamer_key
    )
  );

-- 2. Explicit Column-Level Privilege Restrictions on streamer_remote_tokens
-- Revoke all access from anonymous users
REVOKE ALL ON public.streamer_remote_tokens FROM anon, public;

-- Grant authenticated streamers access to metadata columns only (never expose token_hash)
REVOKE SELECT ON public.streamer_remote_tokens FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  streamer_key,
  streamer_name,
  label,
  permissions,
  expires_at,
  is_revoked,
  created_at
) ON public.streamer_remote_tokens TO authenticated;

-- Grant INSERT, UPDATE, DELETE to authenticated users (governed by the strict RLS above)
GRANT INSERT, UPDATE, DELETE ON public.streamer_remote_tokens TO authenticated;

-- Service role retains full access for backend API validation
GRANT ALL ON public.streamer_remote_tokens TO service_role;

-- 3. Dedicated Authenticated RPC: create_remote_token
-- Ensures streamer_key and streamer_name are sourced authoritatively from streamer_states
-- and time limits (expires_at) are computed server-side.
CREATE OR REPLACE FUNCTION public.create_remote_token(
  p_label text,
  p_duration_hours integer,
  p_token_hash text,
  p_permissions jsonb default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_streamer_key text;
  v_streamer_name text;
  v_expires_at timestamptz;
  v_record record;
  v_default_perms jsonb := '{"can_increment_deaths":true,"can_increment_bosses":true,"can_set_deaths":true,"can_set_bosses":true,"can_reset_session":true,"can_reset_all":false}'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to create a remote access link';
  END IF;

  -- Verify caller owns an active streamer chronicle and retrieve authorized streamer key
  SELECT streamer_key, coalesce(display_name, 'Streamer')
  INTO v_streamer_key, v_streamer_name
  FROM public.streamer_states
  WHERE user_id = v_user_id;

  IF v_streamer_key IS NULL THEN
    RAISE EXCEPTION 'Forbidden: You do not own an active streamer chronicle';
  END IF;

  -- Validate token hash format (must be 64-character lowercase hex string)
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) <> 64 OR trim(p_token_hash) !~ '^[a-fA-F0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid token hash format (must be 64-character hex string)';
  END IF;

  -- Calculate time limit (expiry duration) strictly controlled by the owner streamer
  IF p_duration_hours IS NOT NULL AND p_duration_hours > 0 THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  ELSE
    v_expires_at := NULL; -- permanent link
  END IF;

  -- Insert token record strictly bound to caller user_id and verified streamer_key
  INSERT INTO public.streamer_remote_tokens (
    user_id,
    streamer_key,
    streamer_name,
    token_hash,
    label,
    permissions,
    expires_at,
    is_revoked
  ) VALUES (
    v_user_id,
    v_streamer_key,
    v_streamer_name,
    lower(trim(p_token_hash)),
    coalesce(nullif(trim(p_label), ''), 'Friend Access'),
    coalesce(p_permissions, v_default_perms),
    v_expires_at,
    false
  )
  RETURNING id, user_id, streamer_key, streamer_name, label, permissions, expires_at, is_revoked, created_at
  INTO v_record;

  RETURN jsonb_build_object(
    'id', v_record.id,
    'user_id', v_record.user_id,
    'streamer_key', v_record.streamer_key,
    'streamer_name', v_record.streamer_name,
    'label', v_record.label,
    'permissions', v_record.permissions,
    'expires_at', v_record.expires_at,
    'is_revoked', v_record.is_revoked,
    'created_at', v_record.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_remote_token(text, integer, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_remote_token(text, integer, text, jsonb) TO authenticated, service_role;

-- 4. Dedicated Authenticated RPC: revoke_remote_token
-- Ensures only the owner streamer can revoke their access links.
CREATE OR REPLACE FUNCTION public.revoke_remote_token(p_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  UPDATE public.streamer_remote_tokens
  SET is_revoked = true
  WHERE id = p_token_id AND user_id = v_user_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_remote_token(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_remote_token(uuid) TO authenticated, service_role;

COMMIT;
