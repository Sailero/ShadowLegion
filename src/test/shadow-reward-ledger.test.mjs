import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MetaProgressionManager as Meta, createDefaultMetaState } from '../systems/MetaProgressionManager.ts';

const key = 'shadowlegion_meta_v1';
let entries;
let storage;
beforeEach(() => {
  entries = new Map();
  storage = { getItem: id => entries.get(id) ?? null, setItem: (id, value) => entries.set(id, String(value)) };
  globalThis.localStorage = storage;
});
const save = state => entries.set(key, JSON.stringify(state));
const reward = (tier, options = {}) => Meta.recordModeProgress({
  mode: 'shadow', tier, operativeId: 'ranger', completionId: `shadow-${tier}`, ...options,
});
const ledger = () => Meta.getState().modeProgress.shadowRewardLedger;

test('choosing tier 5 first pays only tier 5, then tier 1 still earns its actual first-clear reward', () => {
  const high = reward(5);
  assert.deepEqual([high.earned, high.masteryXp, high.firstClear, high.saved], [14, 20, true, true]);
  assert.deepEqual(ledger().paidTiers, [5]);
  assert.deepEqual(ledger().masteryPaidTiers.ranger, [5]);
  const low = reward(1);
  assert.deepEqual([low.earned, low.masteryXp, low.firstClear], [6, 12, true]);
  assert.deepEqual(ledger().paidTiers, [1, 5]);
  assert.equal(Meta.getState().modeProgress.shadowBestTier, 5);
  assert.equal(Meta.getState().modeProgress.shadowMasteryTiers.ranger, 5);
});

test('all five tiers pay the same bounded total in arbitrary order and remain paid after receipt eviction', () => {
  let currency = 0;
  let xp = 0;
  for (const tier of [5, 1, 4, 2, 3]) { const result = reward(tier); currency += result.earned; xp += result.masteryXp; }
  assert.equal(currency, 50);
  assert.equal(xp, 80);
  assert.equal(reward(5).duplicate, true);
  const state = Meta.getState();
  state.rewardReceipts = [];
  save(state);
  for (const tier of [1, 2, 3, 4, 5]) {
    const result = reward(tier, { completionId: `after-eviction-${tier}` });
    assert.deepEqual([result.earned, result.masteryXp, result.firstClear, result.saved], [0, 0, false, true]);
  }
  assert.equal(Meta.getState().shadowCores, 50);
  assert.equal(Meta.getState().masteryXp.ranger, 80);
});

test('currency is shared per tier while mastery is independent per operative and exact tier', () => {
  const state = createDefaultMetaState();
  state.unlockedOperatives.push('gunner');
  save(state);
  reward(5);
  const gunnerHigh = reward(5, { operativeId: 'gunner', completionId: 'gunner-5' });
  assert.deepEqual([gunnerHigh.earned, gunnerHigh.masteryXp], [0, 20]);
  const gunnerLow = reward(1, { operativeId: 'gunner', completionId: 'gunner-1' });
  assert.deepEqual([gunnerLow.earned, gunnerLow.masteryXp], [6, 12]);
  const rangerLow = reward(1);
  assert.deepEqual([rangerLow.earned, rangerLow.masteryXp], [0, 12]);
  assert.deepEqual(ledger().masteryPaidTiers.ranger, [1, 5]);
  assert.deepEqual(ledger().masteryPaidTiers.gunner, [1, 5]);
  assert.deepEqual(ledger().masteryPaidTiers.warden, []);
});

test('legacy highest-tier prefixes migrate as already paid without retroactive rewards or wallet changes', () => {
  const state = createDefaultMetaState();
  delete state.modeProgress.shadowRewardLedger;
  state.shadowCores = 3; // Earlier prefix rewards may already have been spent.
  state.modeProgress.shadowBestTier = 3;
  state.modeProgress.shadowMasteryTiers.ranger = 2;
  state.masteryXp.ranger = 26;
  save(state);
  const original = entries.get(key);
  assert.deepEqual(ledger().paidTiers, [1, 2, 3]);
  assert.deepEqual(ledger().masteryPaidTiers.ranger, [1, 2]);
  assert.equal(entries.get(key), original, 'sanitizing migration is read-only');
  assert.deepEqual([reward(2).earned, Meta.getState().masteryXp.ranger], [0, 26]);
  const high = reward(5);
  assert.deepEqual([high.earned, high.masteryXp], [14, 20]);
  assert.deepEqual(ledger().paidTiers, [1, 2, 3, 5]);
  const skipped = reward(4);
  assert.deepEqual([skipped.earned, skipped.masteryXp], [12, 18]);
  const oldGlobalOnly = reward(3);
  assert.deepEqual([oldGlobalOnly.earned, oldGlobalOnly.masteryXp], [0, 16]);
  assert.equal(Meta.getState().shadowCores, 29);
});

test('legacy tier 5 rewards cannot be claimed again even if the old wallet was spent', () => {
  const state = createDefaultMetaState();
  delete state.modeProgress.shadowRewardLedger;
  state.modeProgress.shadowBestTier = 5;
  state.modeProgress.shadowMasteryTiers.ranger = 5;
  save(state);
  for (const tier of [1, 3, 5]) {
    const result = reward(tier);
    assert.deepEqual([result.earned, result.masteryXp, result.firstClear], [0, 0, false]);
  }
  assert.equal(Meta.getState().shadowCores, 0);
});

test('throwing storage leaves a tier retryable and a later tier never implicitly claims it', () => {
  globalThis.localStorage = { ...storage, setItem() { throw new Error('quota'); } };
  const failed = reward(1);
  assert.deepEqual([failed.earned, failed.masteryXp, failed.saved], [0, 0, false]);
  assert.equal(entries.has(key), false);
  globalThis.localStorage = storage;
  assert.equal(reward(5).earned, 14);
  assert.equal(reward(1).earned, 6);
  assert.equal(reward(1).duplicate, true);
  assert.deepEqual(ledger().paidTiers, [1, 5]);
});

test('silent write refusal is not reported as a saved reward and the same completion can retry', () => {
  globalThis.localStorage = { ...storage, setItem() {} };
  const failed = reward(5);
  assert.deepEqual([failed.earned, failed.masteryXp, failed.saved], [0, 0, false]);
  assert.deepEqual(ledger().paidTiers, []);
  globalThis.localStorage = storage;
  const retried = reward(5);
  assert.deepEqual([retried.earned, retried.masteryXp, retried.duplicate, retried.saved], [14, 20, false, true]);
});

test('failed migration write preserves old paid prefixes and retries only the new exact tier', () => {
  const state = createDefaultMetaState();
  delete state.modeProgress.shadowRewardLedger;
  state.modeProgress.shadowBestTier = 2;
  state.modeProgress.shadowMasteryTiers.ranger = 2;
  save(state);
  const original = entries.get(key);
  globalThis.localStorage = { ...storage, setItem() { throw new Error('quota'); } };
  assert.equal(reward(5).saved, false);
  assert.equal(entries.get(key), original);
  globalThis.localStorage = storage;
  assert.equal(reward(5).earned, 14);
  assert.deepEqual(ledger().paidTiers, [1, 2, 5]);
  assert.equal(reward(1).earned, 0);
});

test('future outer or reward-ledger versions stay byte-for-byte protected from mutation', () => {
  for (const location of ['outer', 'ledger']) {
    const state = createDefaultMetaState();
    state.shadowCores = 100;
    if (location === 'outer') state.version = 4;
    else state.modeProgress.shadowRewardLedger.version = 2;
    save(state);
    const original = entries.get(key);
    assert.equal(Meta.getWriteProtection(), 'future-version');
    assert.equal(reward(5).saved, false);
    assert.equal(Meta.purchase('armor'), false);
    assert.equal(entries.get(key), original);
  }
});

test('unreadable storage is protected and can later recover without a phantom receipt', () => {
  globalThis.localStorage = { ...storage, getItem() { throw new Error('storage blocked'); } };
  assert.equal(Meta.getWriteProtection(), 'unreadable');
  assert.equal(reward(5).saved, false);
  assert.equal(entries.size, 0);
  globalThis.localStorage = storage;
  assert.equal(Meta.getWriteProtection(), null);
  assert.equal(reward(5).earned, 14);
});

test('new exact-tier ledgers sanitize invalid entries without rebuilding a highest-tier prefix', () => {
  const state = createDefaultMetaState();
  state.modeProgress.shadowBestTier = 5;
  state.modeProgress.shadowMasteryTiers.ranger = 5;
  state.modeProgress.shadowRewardLedger.paidTiers = [5, 0, 2, 5, 6, 1.5, '1'];
  state.modeProgress.shadowRewardLedger.masteryPaidTiers.ranger = [5, 2, 2, -1];
  save(state);
  assert.deepEqual(ledger().paidTiers, [2, 5]);
  assert.deepEqual(ledger().masteryPaidTiers.ranger, [2, 5]);
  assert.deepEqual([reward(1).earned, Meta.getState().masteryXp.ranger], [6, 12]);
});

test('a committed write with failed verification cannot pay again when the same completion retries', () => {
  let wrote = false;
  globalThis.localStorage = {
    getItem(id) { if (wrote) throw new Error('readback blocked'); return storage.getItem(id); },
    setItem(id, value) { storage.setItem(id, value); wrote = true; },
  };
  assert.equal(reward(5).saved, false);
  globalThis.localStorage = storage;
  const retried = reward(5);
  assert.deepEqual([retried.earned, retried.masteryXp, retried.duplicate, retried.saved], [0, 0, true, true]);
  assert.equal(Meta.getState().shadowCores, 14);
  assert.equal(Meta.getState().masteryXp.ranger, 20);
});
