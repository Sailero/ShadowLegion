import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CampaignProgressionManager as Campaign, createDefaultCampaignState, sanitizeCampaignState } from '../systems/CampaignProgressionManager.ts';
import { MetaProgressionManager as Meta } from '../systems/MetaProgressionManager.ts';

const storage = new Map();
const normalStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
beforeEach(() => { storage.clear(); globalThis.localStorage = normalStorage; });
const win = (completionId, extra = {}) => ({ completionId, victory: true, operativeId: 'ranger', durationSec: 120, coreRatio: .9, hpRatio: .8, commands: 1, ...extra });

test('new campaign starts at 1-1 and rejects locked or invalid stage submissions', () => {
  assert.equal(Campaign.getState().highestUnlockedStage, 1);
  assert.equal(Campaign.getNextUnlockedStage().id, 1);
  assert.equal(Campaign.isStageUnlocked(1), true);
  assert.equal(Campaign.isStageUnlocked(2), false);
  assert.equal(Campaign.recordStageResult(2, win('locked')).error, 'locked-stage');
  assert.equal(Campaign.recordStageResult(0, win('invalid')).error, 'invalid-result');
  assert.equal(Campaign.recordStageResult(1, win('not valid')).error, 'invalid-result');
  assert.equal(Campaign.recordStageResult(1, win('locked-role', { operativeId: 'engineer' })).error, 'invalid-result');
  assert.equal(Campaign.recordStageResult(1, win('bad-hp', { hpRatio: NaN })).error, 'invalid-result');
  assert.equal(Meta.getState().shadowCores, 0);
});

test('clearing a stage stores three stars, unlocks exactly the next stage and uses one wallet', () => {
  const result = Campaign.recordStageResult(1, win('first-clear'));
  assert.equal(result.stars, 3);
  assert.equal(result.newStars, 3);
  assert.equal(result.firstClear, true);
  assert.equal(result.nextStageId, 2);
  assert.equal(result.earned, 6);
  assert.equal(result.saved, true);
  assert.equal(Meta.getState().shadowCores, 6);
  assert.equal(Campaign.getState().highestUnlockedStage, 2);
  assert.equal(Campaign.getStageRecord(1).bestTimeSec, 120);
  assert.equal(Campaign.isStageUnlocked(3), false);
});

test('duplicate completion does not add another clear, reward or faster fabricated record', () => {
  Campaign.recordStageResult(1, win('same-receipt'));
  const repeated = Campaign.recordStageResult(1, win('same-receipt', { durationSec: 1, commands: 50 }));
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.earned, 0);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
  assert.equal(Campaign.getStageRecord(1).attempts, 1);
  assert.equal(Campaign.getStageRecord(1).bestTimeSec, 120);
  assert.equal(Campaign.recordStageResult(2, win('same-receipt')).error, 'invalid-result');
});

test('failure records an attempt without unlocking or awarding currency', () => {
  const result = Campaign.recordStageResult(1, win('failed', { victory: false, coreRatio: 0 }));
  assert.equal(result.stars, 0);
  assert.equal(result.earned, 0);
  assert.equal(result.nextStageId, null);
  assert.equal(Campaign.getState().highestUnlockedStage, 1);
  assert.equal(Campaign.getStageRecord(1).attempts, 1);
  assert.equal(Campaign.getStageRecord(1).clears, 0);
  Campaign.recordStageResult(1, win('retry'));
  assert.equal(Campaign.getStageRecord(1).attempts, 2);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
});

test('replays preserve best stars and the Meta reward cap prevents unlimited farming', () => {
  Campaign.recordStageResult(1, win('replay-base'));
  const earned = [];
  for (let index = 1; index <= 5; index++) earned.push(Campaign.recordStageResult(1, win(`replay-${index}`, { coreRatio: .2, commands: 0, durationSec: 150 })).earned);
  assert.deepEqual(earned, [1, 1, 1, 0, 0]);
  assert.equal(Campaign.getStageRecord(1).stars, 3);
  assert.equal(Campaign.getStageRecord(1).bestTimeSec, 120);
  assert.equal(Meta.getState().shadowCores, 9);
});

test('legacy chapter progress becomes one-star access without retroactive rewards', () => {
  const migrated = createDefaultCampaignState({ version: 2, highestChapterUnlocked: 3, clearedChapters: [1, 2] });
  assert.equal(migrated.highestUnlockedStage, 21);
  assert.equal(migrated.totalStars, 20);
  assert.ok(Object.values(migrated.stageResults).every(record => record.stars === 1 && record.migrated));
  const finalOldChapter = createDefaultCampaignState({ version: 2, highestChapterUnlocked: 4, clearedChapters: [1, 2, 3, 4] });
  assert.equal(finalOldChapter.highestUnlockedStage, 41);
  assert.equal(finalOldChapter.totalStars, 40);
  assert.equal(Meta.getState().shadowCores, 0);
});

test('sanitization reconstructs route access and ignores forged unlock counters', () => {
  const state = sanitizeCampaignState({ version: 1, highestUnlockedStage: 50, totalStars: 999,
    stageResults: { 1: { stars: 99, clears: -2, bestTimeSec: Infinity }, 3: { stars: 2 }, 51: { stars: 3 } },
    recentCompletions: [{ id: 'bad id', stageId: 1 }],
  });
  assert.equal(state.highestUnlockedStage, 2);
  assert.equal(state.totalStars, 5);
  assert.equal(state.stageResults[1].bestTimeSec, null);
  assert.equal(state.stageResults[1].clears, 1);
  assert.equal(state.recentCompletions.length, 0);
});

test('corrupt or inaccessible storage fails safely and reports an unsaved result', () => {
  storage.set('shadowlegion_campaign_v1', '{broken');
  assert.equal(Campaign.getState().highestUnlockedStage, 1);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => Campaign.getState());
  const result = Campaign.recordStageResult(1, win('unavailable'));
  assert.equal(result.saved, false);
  assert.equal(result.earned, 0);
});

test('a wallet write can be retried with the same receipt without duplicating route progress', () => {
  let blockMeta = true;
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (blockMeta && key === 'shadowlegion_meta_v1') throw new Error('wallet unavailable');
    normalStorage.setItem(key, value);
  } };
  const first = Campaign.recordStageResult(1, win('repair-wallet'));
  assert.equal(first.saved, false);
  assert.equal(first.earned, 0);
  blockMeta = false;
  const retry = Campaign.recordStageResult(1, win('repair-wallet'));
  assert.equal(retry.earned, 6);
  assert.equal(retry.saved, true);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
  assert.equal(Meta.getState().shadowCores, 6);
});

test('a failed route write cannot create a wallet receipt or a duplicate clear on retry', () => {
  let blockRoute = true;
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (blockRoute && key === 'shadowlegion_campaign_v1') throw new Error('route unavailable');
    normalStorage.setItem(key, value);
  } };
  const first = Campaign.recordStageResult(1, win('repair-route'));
  assert.equal(first.saved, false);
  assert.equal(first.earned, 0);
  assert.equal(Meta.getState().shadowCores, 0);
  assert.equal(Campaign.getState().highestUnlockedStage, 1);
  blockRoute = false;
  const retry = Campaign.recordStageResult(1, win('repair-route'));
  assert.equal(retry.saved, true);
  assert.equal(retry.earned, 6);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
  assert.equal(Campaign.getStageRecord(1).attempts, 1);
  assert.equal(Campaign.getState().highestUnlockedStage, 2);
});
