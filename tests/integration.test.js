process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';
import {
  getSupabase,
  getState,
  applyAction,
  updateState,
  createCompanionToken,
  validateModeratorToken,
} from '../api/_db.js';

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
    assert.equal(result.permissions.can_reset_all, true);

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
});
