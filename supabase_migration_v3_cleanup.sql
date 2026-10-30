-- ==============================================================================
-- SOULS GAME DEATH COUNTER (SDC)
-- MIGRATION V3: CLEANUP DISCONTINUED DESKTOP COMPANION RECORDS
-- ==============================================================================
-- Description:
-- Safely purges legacy desktop companion pairing tokens from the shared
-- public.streamer_remote_tokens table while strictly preserving all legitimate
-- remote moderator delegation tokens.
--
-- This migration is idempotent and safe to apply repeatedly.
-- ==============================================================================

BEGIN;

-- 1. Remove legacy companion token records from streamer_remote_tokens
-- Preserves all legitimate moderator tokens (e.g., label <> 'Desktop Companion')
DELETE FROM public.streamer_remote_tokens
WHERE label = 'Desktop Companion'
   OR streamer_name = 'Streamer Companion';

-- 2. Verify table indexes and health
CREATE INDEX IF NOT EXISTS idx_streamer_remote_tokens_user ON public.streamer_remote_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_streamer_remote_tokens_key ON public.streamer_remote_tokens(streamer_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_streamer_remote_tokens_hash ON public.streamer_remote_tokens(token_hash);

COMMIT;
