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
    setHeader: (k, v) => { res.headers[k] = v; },
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

  it('POST /api/action rejects unknown action names with 400', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      body: { action: 'DROP_DATABASE', key: 'test-streamer' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_ACTION');
  });

  it('POST /api/action rejects missing key and token with 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      body: { action: 'add' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('POST /api/action with invalid token returns 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/action',
      body: { action: 'add', token: 'rmt_non_existent_token_123456789' },
    });
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  it('POST /api/state prevents moderators with tokens from altering settings', async () => {
    // If a moderator tries to tamper with streamer settings:
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/state',
      body: { token: 'rmt_fake_token_123456789', settings: { fontSize: 100 } },
    });
    await handler(req, res);
    assert.ok(res.statusCode === 401 || res.statusCode === 403, 'Must reject moderator altering settings');
  });

  it('handles unsupported HTTP methods with 405 Method Not Allowed', async () => {
    const { req, res } = createMockReqRes({ method: 'DELETE', url: '/api/state?key=test' });
    await handler(req, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED');
  });
});
