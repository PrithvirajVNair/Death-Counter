process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateState, getState, applyAction } from '../api/_db.js';
import { generateRemoteToken, generateCryptoRandomString } from '../src/lib/supabase.js';


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

  it('parseTokenInput extracts tokens from direct input, URLs, hashes, and queries', async () => {
    const { parseTokenInput } = await import('../src/lib/supabase.js');

    assert.equal(parseTokenInput('rmt_test1234567890'), 'rmt_test1234567890');
    assert.equal(parseTokenInput('  rmt_test1234567890  '), 'rmt_test1234567890');
    assert.equal(parseTokenInput('https://soulgamedc.vercel.app/remote?token=rmt_query123'), 'rmt_query123');
    assert.equal(parseTokenInput('https://soulgamedc.vercel.app/remote#token=rmt_hash123'), 'rmt_hash123');
    assert.equal(parseTokenInput('https://soulgamedc.vercel.app/remote#rmt_directhash123'), 'rmt_directhash123');
    assert.equal(parseTokenInput('Check out my code: rmt_embedded999!'), 'rmt_embedded999');
    assert.equal(parseTokenInput(''), '');
    assert.equal(parseTokenInput(null), '');
  });

  it('parseTokenFromLocation recovers token on reload and prioritizes URL params over storage', async () => {
    const { parseTokenFromLocation } = await import('../src/lib/supabase.js');

    // 1. Recover from search query
    const winWithQuery = { location: { search: '?token=rmt_from_search', hash: '' } };
    assert.equal(parseTokenFromLocation(winWithQuery), 'rmt_from_search');

    // 2. Recover from hash
    const winWithHash = { location: { search: '', hash: '#token=rmt_from_hash' } };
    assert.equal(parseTokenFromLocation(winWithHash), 'rmt_from_hash');

    // 3. Recover from sessionStorage when URL is reloaded without query
    const mockStorage = {
      sessionStorage: {
        getItem: (k) => (k === 'sdc_remote_token' ? 'rmt_from_session' : null),
      },
      localStorage: {
        getItem: () => null,
      },
    };
    const winEmpty = { location: { search: '', hash: '' } };
    assert.equal(parseTokenFromLocation(winEmpty, mockStorage), 'rmt_from_session');

    // 4. URL query takes precedence over cached storage
    assert.equal(parseTokenFromLocation(winWithQuery, mockStorage), 'rmt_from_search');
  });
});
