process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';
import { getPublicOverlayState } from '../api/_db.js';

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

describe('API Security, Endpoint Authorization & Public Projection', () => {
  it('GET /api/state returns 400 when key is missing', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/state' });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'MISSING_KEY');
  });

  it('GET /api/state with valid key returns public overlay state without email or user_id', async () => {
    const testKey = 'streamer-safe-key-1';
    const { req, res } = createMockReqRes({ method: 'GET', url: `/api/state?key=${testKey}` });
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.email, undefined, 'Public state must NEVER leak email address');
    assert.equal(res.body.user_id, undefined, 'Public state must NEVER leak auth user_id');
    assert.equal(typeof res.body.deaths, 'number');
  });

  it('getPublicOverlayState explicitly strips private fields', async () => {
    const testKey = 'safe-projection-key';
    const publicState = await getPublicOverlayState(testKey);
    assert.equal(publicState.email, undefined);
    assert.equal(publicState.user_id, undefined);
    assert.equal(publicState.avatar_url, undefined);
    assert.ok(publicState.settings !== undefined);
  });

  it('POST /api/action rejects missing key and token with 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      body: { action: 'add', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('CRITICAL: POST /api/action with streamer key alone (without Bearer JWT or token) is rejected with 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      body: { action: 'add', key: 'streamer-fake-key', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401, 'Possession of streamer key alone must not authorize mutations');
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('POST /api/action with invalid streamer Bearer JWT returns 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { authorization: 'Bearer invalid-jwt' },
      body: { action: 'add', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('POST /api/action with expired streamer Bearer JWT returns 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { authorization: 'Bearer expired-jwt' },
      body: { action: 'add', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('POST /api/action with valid streamer Bearer JWT succeeds with 200', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { authorization: 'Bearer valid-streamer-jwt' },
      body: { action: 'add', operationId: 'op_valid_jwt_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.action, 'add');
  });

  it('POST /api/action with another user JWT attempting to mutate foreign streamer key returns 403', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { authorization: 'Bearer other-user-jwt' },
      body: { action: 'add', key: 'test-streamer', operationId: 'op_steal_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/action with invalid moderator token returns 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'x-moderator-token': 'rmt_non_existent_token_123456789' },
      body: { action: 'add', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  it('POST /api/action with expired moderator token returns 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'x-moderator-token': 'expired-token' },
      body: { action: 'add', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  it('POST /api/action with revoked moderator token returns 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'x-moderator-token': 'revoked-token' },
      body: { action: 'add', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  it('POST /api/action rejects unknown action names with 400', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'x-moderator-token': 'valid-token' },
      body: { action: 'DROP_DATABASE', operationId: 'op_test_12345678' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_ACTION');
  });

  it('POST /api/action rejects missing or short operationId with 400', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'x-moderator-token': 'valid-token' },
      body: { action: 'add' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'INVALID_OPERATION_ID');
  });

  it('POST /api/state prevents moderators with tokens from altering settings', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/state',
      headers: { 'x-moderator-token': 'valid-token' },
      body: { settings: { fontSize: 100 } },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 403, 'Must return 403 Forbidden for moderator updating settings');
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/action enforces moderator fine-grained permissions', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'x-moderator-token': 'limited-mod-token' },
      body: { action: 'addBossKill', operationId: 'op_boss_perm_12345' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 403, 'Limited moderator must be denied boss kill mutation');
    assert.equal(res.body.error.code, 'PERMISSION_DENIED');
  });

  it('POST requires Content-Type application/json', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      headers: { 'content-type': 'text/plain' },
      body: 'invalid-body',
    });
    await handler(req, res);
    assert.equal(res.statusCode, 415);
    assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('handles unsupported HTTP methods with 405 Method Not Allowed', async () => {
    const { req, res } = createMockReqRes({ method: 'DELETE', url: '/api/state?key=test' });
    await handler(req, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED');
  });

  it('GET /api/validate-token validates token format and requires parameter', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/validate-token' });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'MISSING_TOKEN');
  });

  it('GET /api/validate-token with valid token returns permissions and streamer info', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/validate-token?token=valid-token' });
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.streamerKey, 'test-streamer');
    assert.equal(res.body.permissions.can_increment_deaths, true);
  });
});
