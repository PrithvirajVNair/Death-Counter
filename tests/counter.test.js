import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, getState, resetState } from '../api/_db.js';

describe('Counter Logic & Atomic Mutations', () => {
  const testChannel = `test-channel-${Date.now()}`;

  it('initial state has 0 deaths, 0 session deaths, 0 boss kills', async () => {
    const state = await getState(testChannel);
    assert.equal(state.deaths, 0);
    assert.equal(state.sessionDeaths, 0);
    assert.equal(state.allTimeDeaths, 0);
    assert.equal(state.bossKills, 0);
  });

  it('increment death increases deaths, sessionDeaths, and allTimeDeaths', async () => {
    const { state } = await applyAction('add', 0, {}, testChannel);
    assert.equal(state.deaths, 1);
    assert.equal(state.sessionDeaths, 1);
    assert.equal(state.allTimeDeaths, 1);
  });

  it('increment multiple times accumulates correctly', async () => {
    await applyAction('add', 0, {}, testChannel);
    await applyAction('add', 0, {}, testChannel);
    const state = await getState(testChannel);
    assert.equal(state.deaths, 3);
    assert.equal(state.sessionDeaths, 3);
    assert.equal(state.allTimeDeaths, 3);
  });

  it('undo death decrements deaths and sessionDeaths, but leaves allTimeDeaths intact', async () => {
    const { state } = await applyAction('undo', 0, {}, testChannel);
    assert.equal(state.deaths, 2);
    assert.equal(state.sessionDeaths, 2);
    assert.equal(state.allTimeDeaths, 3);
  });

  it('undo death at zero never produces negative numbers', async () => {
    const zeroChannel = `zero-channel-${Date.now()}`;
    const { state } = await applyAction('undo', 0, {}, zeroChannel);
    assert.equal(state.deaths, 0);
    assert.equal(state.sessionDeaths, 0);
  });

  it('boss kill increment increases bossKills', async () => {
    const { state } = await applyAction('addBossKill', 0, {}, testChannel);
    assert.equal(state.bossKills, 1);
  });

  it('boss kill decrement at zero never goes below zero', async () => {
    const zeroChannel = `zero-boss-${Date.now()}`;
    const { state } = await applyAction('undoBossKill', 0, {}, zeroChannel);
    assert.equal(state.bossKills, 0);
  });

  it('setDeath adjusts session deaths and all-time deaths appropriately', async () => {
    const setChannel = `set-channel-${Date.now()}`;
    // Start at 0, set to 5
    const { state: s1 } = await applyAction('setDeath', 5, {}, setChannel);
    assert.equal(s1.deaths, 5);
    assert.equal(s1.sessionDeaths, 5);
    assert.equal(s1.allTimeDeaths, 5);

    // Set to 8 (diff +3)
    const { state: s2 } = await applyAction('setDeath', 8, {}, setChannel);
    assert.equal(s2.deaths, 8);
    assert.equal(s2.sessionDeaths, 8);
    assert.equal(s2.allTimeDeaths, 8);
  });

  it('handles invalid / non-numeric set values by clamping to 0', async () => {
    const clampChannel = `clamp-channel-${Date.now()}`;
    const { state } = await applyAction('setDeath', 'not-a-number', {}, clampChannel);
    assert.equal(state.deaths, 0);
  });

  it('resetSession resets deaths and sessionDeaths to 0 while keeping allTimeDeaths', async () => {
    const resetChannel = `reset-chan-${Date.now()}`;
    await applyAction('add', 0, {}, resetChannel);
    await applyAction('add', 0, {}, resetChannel);
    await applyAction('addBossKill', 0, {}, resetChannel);

    const resetStateResult = await resetState('session', resetChannel);
    assert.equal(resetStateResult.deaths, 0);
    assert.equal(resetStateResult.sessionDeaths, 0);
    assert.equal(resetStateResult.allTimeDeaths, 2);
    assert.equal(resetStateResult.bossKills, 1);
  });

  it('resetAll resets all tallies including allTimeDeaths and bossKills', async () => {
    const fullResetChannel = `full-reset-chan-${Date.now()}`;
    await applyAction('add', 0, {}, fullResetChannel);
    await applyAction('addBossKill', 0, {}, fullResetChannel);

    const resetResult = await resetState('all', fullResetChannel);
    assert.equal(resetResult.deaths, 0);
    assert.equal(resetResult.sessionDeaths, 0);
    assert.equal(resetResult.allTimeDeaths, 0);
    assert.equal(resetResult.bossKills, 0);
  });

  it('monotonically increments revision number on every mutation', async () => {
    const revChannel = `rev-chan-${Date.now()}`;
    const res1 = await applyAction('add', 0, {}, revChannel);
    const res2 = await applyAction('add', 0, {}, revChannel);
    assert.ok(res2.revision > res1.revision, 'Revision must increase after second mutation');
  });
});
