process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler, { checkRateLimit } from '../api/index.js';
import {
  getSupabase,
  getState,
  applyAction,
  updateState,
  createCompanionToken,
  validateModeratorToken,
  COMPANION_PERMISSIONS,
} from '../api/_db.js';
import { saveCloudConfig, supabase } from '../src/lib/supabase.js';

function createMockReqRes({ method = 'GET', url = '/', body = null, headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: { 'content-type': 'application/json', ...headers },
    body,
    on: (evt, cb) => {
      if (evt === 'data' && body) cb(typeof body === 'string' ? body : JSON.stringify(body));
      if (evt === 'end') cb();
    },
    destroy: () => {},
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader: (k, v) => { res.headers[k.toLowerCase()] = v; },
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (payload) => {
      res.body = payload;
      return res;
    },
    end: () => res,
  };

  return { req, res };
}

describe('SDC Integration & Architecture Verification Suite', () => {
  // ─── 1. Missing Backend Credentials Fail-Closed Verification ───
  it('Production mode strictly requires SUPABASE_SERVICE_ROLE_KEY and fails closed (no anon key fallback)', async () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const origAnon = process.env.SUPABASE_ANON_KEY;

    try {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://fake-url.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;
      process.env.SUPABASE_ANON_KEY = 'test-anon-key-that-must-not-be-used-for-service-role';

      assert.throws(() => {
        getSupabase();
      }, /SUPABASE_SERVICE_ROLE_KEY are strictly required/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origUrl) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (origAnon) process.env.SUPABASE_ANON_KEY = origAnon; else delete process.env.SUPABASE_ANON_KEY;
    }
  });

  // ─── 2. Database Outage / Fail-Closed Read Behavior ───
  it('getState returns 503 SERVICE_UNAVAILABLE during database outages and NEVER returns a false 0-death success', async () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      process.env.NODE_ENV = 'production';
      // Simulate unreachable database connection
      process.env.SUPABASE_URL = 'http://127.0.0.1:1';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid-secret';

      let caught = false;
      try {
        await getState('streamer-test-fail-closed');
      } catch (err) {
        caught = true;
        assert.equal(err.status, 503);
        assert.equal(err.code, 'SERVICE_UNAVAILABLE');
      }
      assert.ok(caught, 'Must throw 503 SERVICE_UNAVAILABLE instead of returning fake 0 deaths');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origUrl) process.env.SUPABASE_URL = origUrl; else delete process.env.SUPABASE_URL;
      if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  // ─── 3. Token Transport & Validation Transport ───
  it('POST /api/validate-token validates token transmitted via X-Moderator-Token header', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/validate-token',
      headers: {
        'x-moderator-token': 'rmt_invalid_token_header_test',
      },
      body: {},
    });

    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  it('Token validation rejects empty or missing tokens with 400', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/validate-token',
      body: {},
    });

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'MISSING_TOKEN');
  });

  // ─── 4. Desktop Companion Pairing & Auth Handshake ───
  it('POST /api/pair-companion requires authenticated streamer Bearer JWT', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/pair-companion',
      body: { streamerKey: 'any-key' },
    });

    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('Companion pairing issues an scomp_ token with full permissions for the streamer', async () => {
    const testKey = 'streamer-comp-test-key';
    const testUserId = 'user-uuid-1234';

    const result = await createCompanionToken(testKey, testUserId);
    assert.ok(result.token, 'Must return token');
    assert.ok(result.token.startsWith('scomp_'), 'Companion token must have scomp_ prefix');
    assert.equal(result.streamerKey, testKey);
    assert.equal(result.permissions.can_increment_deaths, true);
    assert.equal(result.permissions.can_increment_bosses, true);
    assert.equal(result.permissions.can_reset_session, true);
    assert.equal(result.permissions.can_reset_all, false);

    // Verify token can be validated
    const validation = await validateModeratorToken(result.token);
    assert.equal(validation.valid, true);
    assert.equal(validation.streamerKey, testKey);
  });

  // ─── 5. Configuration Update Concurrency & Counter Separation ───
  it('updateState merges configuration fields without modifying counter columns', async () => {
    const testKey = 'streamer-cfg-isolation-key';

    // 1. Initial state with established counters
    const initial = await applyAction('add', 1, {}, testKey, null, 'op_cfg_test_init_1');
    const deathsBefore = initial.state.deaths;
    const sessionBefore = initial.state.sessionDeaths;
    const allTimeBefore = initial.state.allTimeDeaths;

    // 2. Perform configuration update (e.g. changing preset & bosses)
    const updatedState = await updateState(testKey, {
      settings: { preset: 'bloodborne', goldColor: '#E63946' },
      bosses: { 'Father Gascoigne': 3 },
      currentBoss: 'Father Gascoigne',
    }, null);

    // 3. Verify counters were NOT overwritten or reset
    assert.equal(updatedState.deaths, deathsBefore, 'Deaths must be preserved');
    assert.equal(updatedState.sessionDeaths, sessionBefore, 'Session deaths must be preserved');
    assert.equal(updatedState.allTimeDeaths, allTimeBefore, 'All time deaths must be preserved');
    assert.equal(updatedState.settings.preset, 'bloodborne');
    assert.equal(updatedState.currentBoss, 'Father Gascoigne');
  });

  // ─── 6. Live Supabase / PostgreSQL Integration Check ───
  it('Live PostgreSQL Integration Report', async (t) => {
    const hasLiveSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!hasLiveSupabase) {
      t.diagnostic('Note: Live Supabase credentials not provided in local environment.');
      t.diagnostic('Skipping direct network PostgreSQL row-lock query to avoid false test reports.');
      assert.ok(true, 'Test suite properly separates mock / local offline tests from live database integration');
      return;
    }

    // If live credentials exist, execute actual mutate_counter_backend RPC call
    const client = getSupabase();
    const { data, error } = await client.rpc('mutate_counter_backend', {
      p_streamer_key: 'ci-live-test-key',
      p_action: 'add',
      p_value: 1,
      p_operation_id: `live_ci_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });

    assert.ifError(error);
    assert.ok(data);
    assert.ok(data.revision >= 1);
  });

  // ─── 7. Final Mandatory Regression Suite (Items 1-10) ───
  describe('Mandatory Release-Blocker Regression Tests', () => {
    // 1. Streamer JWT mutation succeeds
    it('1. Streamer JWT mutation succeeds', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { authorization: 'Bearer valid-streamer-jwt' },
        body: { action: 'add', operationId: 'op_reg_streamer_jwt_succ_1' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.action, 'add');
    });

    // 2. Invalid streamer JWT is rejected
    it('2. Invalid streamer JWT is rejected', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { authorization: 'Bearer invalid-jwt' },
        body: { action: 'add', operationId: 'op_reg_streamer_jwt_fail_2' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    });

    // 3. Moderator token mutation succeeds
    it('3. Moderator token mutation succeeds', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { 'x-moderator-token': 'valid-token' },
        body: { action: 'add', operationId: 'op_reg_mod_token_succ_3' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.action, 'add');
    });

    // 4. Invalid moderator token is rejected
    it('4. Invalid moderator token is rejected', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { 'x-moderator-token': 'rmt_invalid_fake_token_4' },
        body: { action: 'add', operationId: 'op_reg_mod_token_fail_4' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error.code, 'INVALID_TOKEN');
    });

    // 5. Companion token mutation succeeds using X-Companion-Token only
    it('5. Companion token mutation succeeds using X-Companion-Token only', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { 'x-companion-token': 'scomp_valid_companion_5' },
        body: { action: 'add', operationId: 'op_reg_companion_succ_5' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.action, 'add');
    });

    // 6. Companion token mistakenly supplied as Bearer JWT is not accepted as a streamer JWT
    it('6. Companion token mistakenly supplied as Bearer JWT is not accepted as a streamer JWT', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { authorization: 'Bearer scomp_valid_companion_6' },
        body: { action: 'add', operationId: 'op_reg_comp_as_bearer_6' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    });

    // 7. Revoked companion token is rejected
    it('7. Revoked companion token is rejected', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/action',
        headers: { 'x-companion-token': 'revoked-companion-token' },
        body: { action: 'add', operationId: 'op_reg_comp_revoked_7' },
      });
      await handler(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error.code, 'INVALID_TOKEN');
    });

    // 8. Configuration RPC failure does not trigger a direct-update fallback
    it('8. Configuration RPC failure does not trigger a direct-update fallback', async () => {
      const origRpc = supabase.rpc;
      const origFrom = supabase.from;
      let directTableUpdateAttempted = false;

      try {
        supabase.rpc = async () => ({
          data: null,
          error: { message: 'RPC update_streamer_config execution failed', code: 'P0001' },
        });

        supabase.from = (table) => {
          if (table === 'streamer_states') {
            return {
              update: () => {
                directTableUpdateAttempted = true;
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { revision: 99 }, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return origFrom(table);
        };

        await assert.rejects(
          async () => {
            await saveCloudConfig(
              { id: 'user-regression-test-id', email: 'streamer@test.local' },
              { settings: { preset: 'bloodborne' } }
            );
          },
          (err) => {
            assert.equal(err.code, 'CONFIG_RPC_FAILED');
            return true;
          }
        );

        assert.equal(
          directTableUpdateAttempted,
          false,
          'Configuration RPC failure must NEVER trigger direct-update fallback on streamer_states'
        );
      } finally {
        supabase.rpc = origRpc;
        supabase.from = origFrom;
      }
    });

    // 9. Companion permissions returned to the client match stored permissions
    it('9. Companion permissions returned to the client match stored permissions', async () => {
      const testKey = 'streamer-comp-perm-key';
      const testUserId = 'user-uuid-perm-123';
      const companion = await createCompanionToken(testKey, testUserId);

      // Verify returned permissions
      assert.deepEqual(companion.permissions, COMPANION_PERMISSIONS);
      assert.equal(companion.permissions.can_reset_all, false, 'can_reset_all must be false');
      assert.equal(companion.permissions.can_increment_deaths, true);
      assert.equal(companion.permissions.can_reset_session, true);

      // Verify database-validated permissions match exactly
      const validated = await validateModeratorToken(companion.token);
      assert.equal(validated.valid, true);
      assert.deepEqual(validated.permissions, companion.permissions);
      assert.equal(validated.permissions.can_reset_all, false);
    });

    // 10. Redis rate limiting does not extend its expiry on every blocked request
    it('10. Redis rate limiting does not extend its expiry on every blocked request', async () => {
      const origUrl = process.env.UPSTASH_REDIS_REST_URL;
      const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      const origFetch = globalThis.fetch;

      try {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash-redis.com';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token-redis-123';

        let expireCallCount = 0;
        let mockCount = 0;

        globalThis.fetch = async (url, options) => {
          const urlStr = String(url);
          if (urlStr.includes('/pipeline')) {
            mockCount += 1;
            const currentTtl = mockCount === 1 ? -1 : 60 - mockCount;
            return {
              ok: true,
              json: async () => [{ result: mockCount }, { result: currentTtl }],
            };
          }
          if (urlStr.includes('/expire/')) {
            expireCallCount += 1;
            return { ok: true, json: async () => ({ result: 1 }) };
          }
          return origFetch(url, options);
        };

        const limit = 2;
        const windowSec = 60;

        // Request 1: initial request (allowed)
        const req1 = await checkRateLimit('test-redis-rl-key', limit, windowSec);
        assert.equal(req1.allowed, true);
        assert.equal(req1.distributed, true);
        assert.equal(expireCallCount, 1, 'EXPIRE must be called on initial request');

        // Request 2: within limit (allowed)
        const req2 = await checkRateLimit('test-redis-rl-key', limit, windowSec);
        assert.equal(req2.allowed, true);
        assert.equal(expireCallCount, 1, 'EXPIRE must NOT be called on request 2');

        // Request 3: blocked request
        const req3 = await checkRateLimit('test-redis-rl-key', limit, windowSec);
        assert.equal(req3.allowed, false);
        assert.equal(expireCallCount, 1, 'EXPIRE must NOT be called on blocked request 3');
        assert.equal(req3.resetSeconds, 57);

        // Request 4: subsequent blocked request
        const req4 = await checkRateLimit('test-redis-rl-key', limit, windowSec);
        assert.equal(req4.allowed, false);
        assert.equal(expireCallCount, 1, 'EXPIRE must NOT be called on blocked request 4');
        assert.equal(req4.resetSeconds, 56, 'Lockout TTL must count down instead of resetting to 60');
      } finally {
        if (origUrl) process.env.UPSTASH_REDIS_REST_URL = origUrl; else delete process.env.UPSTASH_REDIS_REST_URL;
        if (origToken) process.env.UPSTASH_REDIS_REST_TOKEN = origToken; else delete process.env.UPSTASH_REDIS_REST_TOKEN;
        globalThis.fetch = origFetch;
      }
    });
  });
});
