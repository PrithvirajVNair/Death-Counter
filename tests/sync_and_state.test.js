process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateState, getState, applyAction } from '../api/_db.js';
import { generateRemoteToken, generateCryptoRandomString } from '../src/lib/supabase.js';

// Replica of the C# companion exact origin verification algorithm
function isAllowedDesktopOrigin(originHeader, trustedServerUrl = 'https://soulgamedc-rosy.vercel.app') {
  if (!originHeader || typeof originHeader !== 'string') return false;
  if (originHeader === 'null') return false;

  try {
    const parsed = new URL(originHeader);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port ? parseInt(parsed.port, 10) : (scheme === 'https' ? 443 : 80);

    // Loopback development origins
    if (scheme === 'http') {
      if ((host === 'localhost' || host === '127.0.0.1') && (port === 5173 || port === 3000 || port === 4455 || port === 80)) {
        return true;
      }
    }

    // Production official web application origin
    if (scheme === 'https') {
      if (host === 'soulgamedc-rosy.vercel.app' && port === 443) {
        return true;
      }
      if (trustedServerUrl) {
        try {
          const sUri = new URL(trustedServerUrl);
          const sPort = sUri.port ? parseInt(sUri.port, 10) : 443;
          if (sUri.protocol.replace(':', '').toLowerCase() === scheme && sUri.hostname.toLowerCase() === host && sPort === port) {
            return true;
          }
        } catch {}
      }
    }

    return false;
  } catch {
    return false;
  }
}

describe('State Preservation, Idempotency & Cryptographic Randomness', () => {
  it('generateCryptoRandomString creates high-entropy unique strings', () => {
    const s1 = generateCryptoRandomString(12);
    const s2 = generateCryptoRandomString(12);
    assert.equal(s1.length, 12);
    assert.equal(s2.length, 12);
    assert.notEqual(s1, s2, 'Consecutive random strings must be unique');
  });

  it('generateRemoteToken produces tokens with rmt_ prefix and sufficient length', () => {
    const tok = generateRemoteToken();
    assert.ok(tok.startsWith('rmt_'), 'Must start with rmt_ prefix');
    assert.ok(tok.length >= 24, 'Must have at least 24 characters of randomness');
  });

  it('updateState preserves boss attempt history during counter updates', async () => {
    const testChannel = `boss-preservation-${Date.now()}`;
    const opId1 = `op_boss_1_${Date.now()}`;

    // 1. Initial state with boss attempts
    await updateState({
      bosses: { 'Malenia': 14, 'Radahn': 5 },
      currentBoss: 'Malenia',
    }, testChannel);

    let current = await getState(testChannel);
    assert.equal(current.bosses['Malenia'], 14);
    assert.equal(current.currentBoss, 'Malenia');

    // 2. Perform counter mutation without passing bosses
    await applyAction('add', 0, {}, testChannel, null, opId1);

    // 3. Verify boss attempts were NOT wiped out!
    current = await getState(testChannel);
    assert.equal(current.deaths, 1);
    assert.equal(current.bosses['Malenia'], 14, 'Boss history for Malenia must be preserved');
    assert.equal(current.bosses['Radahn'], 5, 'Boss history for Radahn must be preserved');
    assert.equal(current.currentBoss, 'Malenia', 'Current boss must be preserved');
  });

  it('updateState preserves custom settings when counters are updated', async () => {
    const testChannel = `settings-preservation-${Date.now()}`;
    const opId2 = `op_set_1_${Date.now()}`;

    // Set custom gold color & preset
    await updateState({
      settings: { preset: 'crimson-death', goldColor: '#A82222' }
    }, testChannel);

    // Increment deaths
    await applyAction('add', 0, {}, testChannel, null, opId2);

    const current = await getState(testChannel);
    assert.equal(current.settings.preset, 'crimson-death');
    assert.equal(current.settings.goldColor, '#A82222');
  });

  it('idempotency operationId prevents duplicate action counting', async () => {
    const testChannel = `idemp-chan-${Date.now()}`;
    const opId = `op_${Date.now()}_test_duplicate`;

    const res1 = await applyAction('add', 0, {}, testChannel, null, opId);
    assert.equal(res1.state.deaths, 1);

    // Replay same operation ID
    const res2 = await applyAction('add', 0, {}, testChannel, null, opId);
    assert.equal(res2.state.deaths, 1, 'Duplicate operation ID must not re-increment');
    assert.equal(res2.deduped, true, 'Result must be flagged as deduped');
  });

  it('desktop companion origin validation permits trusted origins and rejects attackers', () => {
    // Valid origins
    assert.equal(isAllowedDesktopOrigin('https://soulgamedc-rosy.vercel.app'), true);
    assert.equal(isAllowedDesktopOrigin('http://localhost:5173'), true);
    assert.equal(isAllowedDesktopOrigin('http://127.0.0.1:5173'), true);

    // Attacker origins: Must ALL be rejected!
    assert.equal(isAllowedDesktopOrigin('https://soulgamedc-rosy.vercel.app.attacker.com'), false, 'Prefix attack must be rejected');
    assert.equal(isAllowedDesktopOrigin('https://evil-hacker.vercel.app'), false, 'Arbitrary vercel subdomain must be rejected');
    assert.equal(isAllowedDesktopOrigin('null'), false, 'Null origin must be rejected');
    assert.equal(isAllowedDesktopOrigin(''), false, 'Empty origin must be rejected');
    assert.equal(isAllowedDesktopOrigin(null), false, 'Missing origin must be rejected');
    assert.equal(isAllowedDesktopOrigin('http://evil.com'), false, 'External HTTP must be rejected');
    assert.equal(isAllowedDesktopOrigin('javascript:alert(1)'), false, 'Invalid scheme must be rejected');
  });
});
