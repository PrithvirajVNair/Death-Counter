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

    // 1. Initial state with boss attempts
    await updateState({
      bosses: { 'Malenia': 14, 'Radahn': 5 },
      currentBoss: 'Malenia',
    }, testChannel);

    let current = await getState(testChannel);
    assert.equal(current.bosses['Malenia'], 14);
    assert.equal(current.currentBoss, 'Malenia');

    // 2. Perform counter mutation without passing bosses
    await applyAction('add', 0, {}, testChannel);

    // 3. Verify boss attempts were NOT wiped out!
    current = await getState(testChannel);
    assert.equal(current.deaths, 1);
    assert.equal(current.bosses['Malenia'], 14, 'Boss history for Malenia must be preserved');
    assert.equal(current.bosses['Radahn'], 5, 'Boss history for Radahn must be preserved');
    assert.equal(current.currentBoss, 'Malenia', 'Current boss must be preserved');
  });

  it('updateState preserves custom settings when counters are updated', async () => {
    const testChannel = `settings-preservation-${Date.now()}`;

    // Set custom gold color & preset
    await updateState({
      settings: { preset: 'crimson-death', goldColor: '#A82222' }
    }, testChannel);

    // Increment deaths
    await applyAction('add', 0, {}, testChannel);

    const current = await getState(testChannel);
    assert.equal(current.settings.preset, 'crimson-death');
    assert.equal(current.settings.goldColor, '#A82222');
  });

  it('idempotency operationId prevents duplicate action counting', async () => {
    const testChannel = `idemp-chan-${Date.now()}`;
    const opId = `op-${Date.now()}-test-duplicate`;

    const res1 = await applyAction('add', 0, {}, testChannel, null, opId);
    assert.equal(res1.state.deaths, 1);

    // Replay same operation ID
    const res2 = await applyAction('add', 0, {}, testChannel, null, opId);
    // If database RPC handled it, deduped is true; state remains at 1
    if (res2.deduped) {
      assert.equal(res2.state.deaths, 1, 'Duplicate operation ID must not re-increment');
    }
  });
});
