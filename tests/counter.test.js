process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, getState, resetState } from '../api/_db.js';

describe('Counter Logic & Atomic Mutations', () => {
  const testChannel = `test-channel-${Date.now()}`;
  let opSeq = 1;
  const nextOpId = () => `op_${Date.now()}_${String(opSeq++).padStart(4, '0')}`;

  it('initial state has 0 deaths, 0 session deaths, 0 boss kills', async () => {
    const state = await getState(testChannel);
    assert.equal(state.deaths, 0);
    assert.equal(state.sessionDeaths, 0);
    assert.equal(state.allTimeDeaths, 0);
    assert.equal(state.bossKills, 0);
  });

  it('increment death increases deaths, sessionDeaths, and allTimeDeaths', async () => {
    const { state } = await applyAction('add', 0, {}, testChannel, null, nextOpId());
    assert.equal(state.deaths, 1);
    assert.equal(state.sessionDeaths, 1);
    assert.equal(state.allTimeDeaths, 1);
  });

  it('increment multiple times accumulates correctly', async () => {
    await applyAction('add', 0, {}, testChannel, null, nextOpId());
    await applyAction('add', 0, {}, testChannel, null, nextOpId());
    const state = await getState(testChannel);
    assert.equal(state.deaths, 3);
    assert.equal(state.sessionDeaths, 3);
    assert.equal(state.allTimeDeaths, 3);
  });

  it('undo death decrements deaths and sessionDeaths, but leaves allTimeDeaths intact', async () => {
    const { state } = await applyAction('undo', 0, {}, testChannel, null, nextOpId());
    assert.equal(state.deaths, 2);
    assert.equal(state.sessionDeaths, 2);
    assert.equal(state.allTimeDeaths, 3);
  });

  it('undo death at zero never produces negative numbers', async () => {
    const zeroChannel = `zero-channel-${Date.now()}`;
    const { state } = await applyAction('undo', 0, {}, zeroChannel, null, nextOpId());
    assert.equal(state.deaths, 0);
    assert.equal(state.sessionDeaths, 0);
  });

  it('boss kill increment increases bossKills', async () => {
    const { state } = await applyAction('addBossKill', 0, {}, testChannel, null, nextOpId());
    assert.equal(state.bossKills, 1);
  });

  it('boss kill decrement at zero never goes below zero', async () => {
    const zeroChannel = `zero-boss-${Date.now()}`;
    const { state } = await applyAction('undoBossKill', 0, {}, zeroChannel, null, nextOpId());
    assert.equal(state.bossKills, 0);
  });

  it('setDeath adjusts session deaths and all-time deaths appropriately', async () => {
    const setChannel = `set-channel-${Date.now()}`;
    // Start at 0, set to 5
    const { state: s1 } = await applyAction('setDeath', 5, {}, setChannel, null, nextOpId());
    assert.equal(s1.deaths, 5);
    assert.equal(s1.sessionDeaths, 5);
    assert.equal(s1.allTimeDeaths, 5);

    // Set to 8 (diff +3)
    const { state: s2 } = await applyAction('setDeath', 8, {}, setChannel, null, nextOpId());
    assert.equal(s2.deaths, 8);
    assert.equal(s2.sessionDeaths, 8);
    assert.equal(s2.allTimeDeaths, 8);
  });

  it('handles invalid / non-numeric set values by clamping to 0', async () => {
    const clampChannel = `clamp-channel-${Date.now()}`;
    const { state } = await applyAction('setDeath', 'not-a-number', {}, clampChannel, null, nextOpId());
    assert.equal(state.deaths, 0);
  });

  it('resetSession resets deaths and sessionDeaths to 0 while keeping allTimeDeaths', async () => {
    const resetChannel = `reset-chan-${Date.now()}`;
    await applyAction('add', 0, {}, resetChannel, null, nextOpId());
    await applyAction('add', 0, {}, resetChannel, null, nextOpId());
    await applyAction('addBossKill', 0, {}, resetChannel, null, nextOpId());

    const resetStateResult = await resetState('session', resetChannel, null, nextOpId());
    assert.equal(resetStateResult.deaths, 0);
    assert.equal(resetStateResult.sessionDeaths, 0);
    assert.equal(resetStateResult.allTimeDeaths, 2);
    assert.equal(resetStateResult.bossKills, 1);
  });

  it('resetAll resets all tallies including allTimeDeaths and bossKills', async () => {
    const fullResetChannel = `full-reset-chan-${Date.now()}`;
    await applyAction('add', 0, {}, fullResetChannel, null, nextOpId());
    await applyAction('addBossKill', 0, {}, fullResetChannel, null, nextOpId());

    const resetResult = await resetState('all', fullResetChannel, null, nextOpId());
    assert.equal(resetResult.deaths, 0);
    assert.equal(resetResult.sessionDeaths, 0);
    assert.equal(resetResult.allTimeDeaths, 0);
    assert.equal(resetResult.bossKills, 0);
  });

  it('monotonically increments revision number on every mutation', async () => {
    const revChannel = `rev-chan-${Date.now()}`;
    const res1 = await applyAction('add', 0, {}, revChannel, null, nextOpId());
    const res2 = await applyAction('add', 0, {}, revChannel, null, nextOpId());
    assert.ok(res2.revision > res1.revision, 'Revision must increase after second mutation');
  });

  it('requires a valid operation_id and rejects missing or short IDs', async () => {
    const failChannel = `fail-id-${Date.now()}`;
    await assert.rejects(
      async () => {
        await applyAction('add', 0, {}, failChannel, null, '');
      },
      /operationId|operation_id/i
    );

    await assert.rejects(
      async () => {
        await applyAction('add', 0, {}, failChannel, null, 'short');
      },
      /operationId|operation_id/i
    );
  });

  it('duplicate operation ID returns cached result without double execution', async () => {
    const dedupChannel = `dedup-chan-${Date.now()}`;
    const fixedOpId = `op_fixed_dedup_12345678`;

    const r1 = await applyAction('add', 0, {}, dedupChannel, null, fixedOpId);
    assert.equal(r1.state.deaths, 1);
    assert.equal(r1.deduped, false);

    // Resend same operation ID
    const r2 = await applyAction('add', 0, {}, dedupChannel, null, fixedOpId);
    assert.equal(r2.state.deaths, 1, 'Death count must not increase on duplicate operation ID');
    assert.equal(r2.deduped, true, 'Result must be flagged as deduped');
  });

  it('rejects reusing the same operation ID for a conflicting action', async () => {
    const conflictChannel = `conflict-chan-${Date.now()}`;
    const fixedOpId = `op_conflict_12345678`;

    await applyAction('add', 0, {}, conflictChannel, null, fixedOpId);

    // Try sending undo with the same operation ID
    await assert.rejects(
      async () => {
        await applyAction('undo', 0, {}, conflictChannel, null, fixedOpId);
      },
      /conflicting action/i
    );
  });

  it('100 simultaneous increments produce the correct final count', async () => {
    const concurrentChannel = `concurrent-chan-${Date.now()}`;
    const promises = [];

    for (let i = 0; i < 100; i++) {
      const opId = `op_concurrent_${Date.now()}_${String(i).padStart(4, '0')}`;
      promises.push(applyAction('add', 0, {}, concurrentChannel, null, opId));
    }

    await Promise.all(promises);
    const finalState = await getState(concurrentChannel);
    assert.equal(finalState.deaths, 100, 'All 100 concurrent increments must be counted exactly');
    assert.equal(finalState.sessionDeaths, 100);
    assert.equal(finalState.allTimeDeaths, 100);
  });
});
