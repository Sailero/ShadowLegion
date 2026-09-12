import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CampaignProgressionManager as Campaign, createDefaultCampaignState, sanitizeCampaignState, MAX_PENDING_CAMPAIGN_REWARDS } from '../systems/CampaignProgressionManager.ts';
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
  assert.equal(result.routeSaved, true);
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

test('future campaign versions are preserved byte-for-byte on victory and defeat without wallet changes', () => {
  for (const version of [2, 999]) {
    const original = ` { "version": ${version}, "stageResults": {"1":{"stars":3,"clears":1}}, "futureFeature":{"keep":true} } `;
    storage.set('shadowlegion_campaign_v1', original);
    const before = new Map(storage);
    assert.equal(Campaign.getWriteProtection(), 'future-save-version');
    assert.equal(Campaign.getState().highestUnlockedStage, 1);
    for (const victory of [true, false]) {
      const result = Campaign.recordStageResult(1, win(`future-${version}-${victory}`, { victory }));
      assert.equal(result.error, 'future-save-version');
      assert.equal(result.saved, false);
      assert.equal(result.routeSaved, false);
      assert.equal(result.earned, 0);
      assert.equal(result.masteryXp, 0);
      assert.equal(result.firstClear, false);
      assert.equal(result.newStars, 0);
      assert.equal(result.nextStageId, null);
      assert.deepEqual(storage, before);
    }
  }
});

test('the save boundary independently rejects a newer route supplied after a supported read', () => {
  const oldView = Campaign.getState();
  assert.equal(Campaign.getWriteProtection(), null);
  const future = JSON.stringify({ version: 2, futurePayload: 'x'.repeat(100001) });
  storage.set('shadowlegion_campaign_v1', future);
  // Exercise the real TypeScript-private persistence boundary; a caller holding
  // an earlier supported snapshot must not overwrite a later version.
  assert.equal(Campaign.save(oldView), false);
  assert.equal(storage.get('shadowlegion_campaign_v1'), future);
  assert.equal(storage.has('shadowlegion_meta_v1'), false);
});

test('an unreadable route cannot be overwritten even when storage still accepts writes', () => {
  let writes = 0;
  globalThis.localStorage = {
    ...normalStorage,
    getItem(key) { if (key === 'shadowlegion_campaign_v1') throw new Error('read refused'); return normalStorage.getItem(key); },
    setItem(key, value) { writes++; normalStorage.setItem(key, value); },
  };
  assert.equal(Campaign.getWriteProtection(), 'storage-unavailable');
  const result = Campaign.recordStageResult(1, win('unreadable-route'));
  assert.equal(result.error, 'storage-unavailable');
  assert.equal(result.saved, false);
  assert.equal(writes, 0);
});

test('future-version protection preserves legacy migration and legitimate v1 writes and retries', () => {
  storage.set('shadowlegion_meta_v1', JSON.stringify({ version: 2, highestChapterUnlocked: 2, clearedChapters: [1] }));
  assert.equal(Campaign.getWriteProtection(), null);
  assert.equal(Campaign.getState().highestUnlockedStage, 11);
  const result = Campaign.recordStageResult(11, win('migrated-route'));
  assert.equal(result.saved, true);
  assert.equal(result.earned, 5);
  assert.equal(JSON.parse(storage.get('shadowlegion_campaign_v1')).version, 1);
  assert.equal(Campaign.getStageRecord(1).migrated, true);
  assert.equal(Campaign.getWriteProtection(), null);
  const repeated = Campaign.recordStageResult(11, win('migrated-route'));
  assert.equal(repeated.saved, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.earned, 0);
  assert.equal(Campaign.getStageRecord(11).clears, 1);
});

test('stage 15 wallet failure survives reload and reconciles the engineer unlock exactly once', () => {
  for (let id = 1; id < 15; id++) assert.equal(Campaign.recordStageResult(id, win(`before-fifteen-${id}`)).saved, true);
  const initialCores = Meta.getState().shadowCores;
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === 'shadowlegion_meta_v1') throw new Error('temporary wallet refusal');
    normalStorage.setItem(key, value);
  } };
  const first = Campaign.recordStageResult(15, win('fifteen-unpaid'));
  assert.equal(first.saved, false);
  assert.equal(first.routeSaved, true);
  assert.equal(Meta.isOperativeUnlocked('engineer'), false);
  assert.equal(Campaign.getState().highestUnlockedStage, 16);
  assert.equal(Campaign.getState().pendingRewards[0].id, 'fifteen-unpaid');
  const reloaded = [...storage.entries()];
  storage.clear();
  for (const [key, value] of reloaded) storage.set(key, value);
  globalThis.localStorage = normalStorage;
  const repaired = Campaign.reconcilePendingRewards();
  assert.equal(repaired.saved, true);
  assert.equal(repaired.pending, 0);
  assert.equal(repaired.earned, 3 + first.stars);
  assert.equal(repaired.total, initialCores + repaired.earned);
  assert.ok(repaired.unlocks.length > 0);
  assert.equal(Meta.isOperativeUnlocked('engineer'), true);
  assert.equal(Campaign.getStageRecord(15).clears, 1);
  assert.equal(Campaign.getStageRecord(15).attempts, 1);
  assert.equal(Campaign.reconcilePendingRewards().earned, 0);
  assert.equal(Campaign.recordStageResult(15, win('fifteen-unpaid')).earned, 0);
  assert.equal(Campaign.getStageRecord(15).clears, 1);
});

test('following stage 3 with stage 4 also settles the persisted unlock in receipt order', () => {
  Campaign.recordStageResult(1, win('route-one'));
  Campaign.recordStageResult(2, win('route-two'));
  let refuse = true;
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === 'shadowlegion_meta_v1' && refuse) { refuse = false; throw new Error('one wallet failure'); }
    normalStorage.setItem(key, value);
  } };
  const third = Campaign.recordStageResult(3, win('third-unpaid'));
  assert.equal(third.saved, false);
  assert.equal(third.routeSaved, true);
  const fourth = Campaign.recordStageResult(4, win('fourth-after-failure'));
  assert.equal(fourth.saved, true);
  assert.equal(Meta.isOperativeUnlocked('gunner'), true);
  assert.equal(Meta.getState().stageProgress[3].stars, third.stars);
  assert.equal(Campaign.getState().pendingRewards.length, 0);
});

test('failed or silently discarded queue acknowledgements never pay the same receipt twice', () => {
  for (const failure of ['throw', 'silent']) {
    storage.clear();
    let blockAck = true;
    globalThis.localStorage = { ...normalStorage, setItem(key, value) {
      if (blockAck && key === 'shadowlegion_campaign_v1' && JSON.parse(value).pendingRewards.length === 0) {
        if (failure === 'throw') throw new Error('ack refusal');
        return;
      }
      normalStorage.setItem(key, value);
    } };
    const first = Campaign.recordStageResult(1, win(`ack-${failure}`));
    assert.equal(first.routeSaved, true);
    assert.equal(first.saved, false);
    assert.equal(first.earned, 6);
    assert.equal(Meta.getState().shadowCores, 6);
    assert.equal(Campaign.getState().pendingRewards.length, 1);
    blockAck = false;
    const repaired = Campaign.reconcilePendingRewards();
    assert.equal(repaired.saved, true);
    assert.equal(repaired.pending, 0);
    assert.equal(repaired.earned, 0);
    assert.equal(repaired.masteryXp, 0);
    assert.equal(Meta.getState().shadowCores, 6);
    assert.equal(Campaign.getStageRecord(1).clears, 1);
  }
});

test('a silently discarded initial route never reaches the wallet and its original receipt can retry', () => {
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key !== 'shadowlegion_campaign_v1') normalStorage.setItem(key, value);
  } };
  const failed = Campaign.recordStageResult(1, win('route-readback'));
  assert.equal(failed.routeSaved, false);
  assert.equal(failed.saved, false);
  assert.equal(failed.earned, 0);
  assert.equal(storage.has('shadowlegion_meta_v1'), false);
  globalThis.localStorage = normalStorage;
  const repeated = Campaign.recordStageResult(1, win('route-readback'));
  assert.equal(repeated.saved, true);
  assert.equal(repeated.earned, 6);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
});

test('unpaid receipts outlive the recent history and a full queue rejects new victories without dropping data', () => {
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === 'shadowlegion_meta_v1') throw new Error('wallet remains unavailable');
    normalStorage.setItem(key, value);
  } };
  for (let index = 0; index < MAX_PENDING_CAMPAIGN_REWARDS; index++) {
    const result = Campaign.recordStageResult(1, win(`pending-${index}`));
    assert.equal(result.routeSaved, true);
    assert.equal(result.saved, false);
  }
  let state = Campaign.getState();
  assert.equal(state.recentCompletions.length, 100);
  assert.equal(state.pendingRewards.length, MAX_PENDING_CAMPAIGN_REWARDS);
  assert.equal(state.pendingRewards[0].id, 'pending-0');
  Campaign.recordStageResult(1, win('pending-0'));
  assert.equal(Campaign.getStageRecord(1).clears, MAX_PENDING_CAMPAIGN_REWARDS);
  const before = new Map(storage);
  const overflow = Campaign.recordStageResult(1, win('pending-overflow'));
  assert.equal(overflow.error, 'pending-reward-capacity');
  assert.equal(overflow.routeSaved, false);
  assert.deepEqual(storage, before);
  globalThis.localStorage = normalStorage;
  const repaired = Campaign.reconcilePendingRewards();
  assert.equal(repaired.saved, true);
  assert.equal(repaired.earned, 9);
  state = Campaign.getState();
  assert.equal(state.pendingRewards.length, 0);
  assert.equal(state.stageResults[1].clears, MAX_PENDING_CAMPAIGN_REWARDS);
});

test('old rc2 missing wallet progress is queued durably before reconciliation pays it', () => {
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === 'shadowlegion_meta_v1') throw new Error('old wallet failure');
    normalStorage.setItem(key, value);
  } };
  Campaign.recordStageResult(1, win('old-rc2-unpaid'));
  const oldRoute = JSON.parse(storage.get('shadowlegion_campaign_v1'));
  delete oldRoute.pendingRewards;
  storage.set('shadowlegion_campaign_v1', JSON.stringify(oldRoute));
  let queuedBeforeWallet = false;
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === 'shadowlegion_meta_v1') queuedBeforeWallet = JSON.parse(storage.get('shadowlegion_campaign_v1')).pendingRewards.some(receipt => receipt.id === 'old-rc2-unpaid');
    normalStorage.setItem(key, value);
  } };
  assert.equal(Campaign.getState().pendingRewards.length, 1);
  const repaired = Campaign.reconcilePendingRewards();
  assert.equal(queuedBeforeWallet, true);
  assert.equal(repaired.saved, true);
  assert.equal(repaired.earned, 6);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
});

test('old paid receipts with expired reward IDs cannot manufacture a new replay reward', () => {
  Campaign.recordStageResult(1, win('old-paid'));
  const route = JSON.parse(storage.get('shadowlegion_campaign_v1'));
  delete route.pendingRewards;
  storage.set('shadowlegion_campaign_v1', JSON.stringify(route));
  const meta = JSON.parse(storage.get('shadowlegion_meta_v1'));
  meta.rewardReceipts = [];
  meta.stageProgress[1].rewardIds = [];
  storage.set('shadowlegion_meta_v1', JSON.stringify(meta));
  const before = new Map(storage);
  assert.equal(Campaign.getState().pendingRewards.length, 0);
  assert.equal(Campaign.reconcilePendingRewards().earned, 0);
  assert.equal(Meta.getState().stageProgress[1].replayRewards, 0);
  assert.deepEqual(storage, before);
});

test('old rc2 receipts recover missing higher stars and independent operative mastery', () => {
  for (const role of ['ranger', 'gunner']) {
    storage.clear(); globalThis.localStorage = normalStorage;
    Campaign.recordStageResult(1, win('paid-base', role === 'ranger' ? { coreRatio: .2, commands: 0 } : {}));
    Campaign.recordStageResult(2, win('paid-two'));
    Campaign.recordStageResult(3, win('paid-three'));
    globalThis.localStorage = { ...normalStorage, setItem(key, value) {
      if (key === 'shadowlegion_meta_v1') throw new Error('new stars/mastery unpaid');
      normalStorage.setItem(key, value);
    } };
    Campaign.recordStageResult(1, win(`unpaid-${role}`, { operativeId: role }));
    const route = JSON.parse(storage.get('shadowlegion_campaign_v1'));
    delete route.pendingRewards;
    storage.set('shadowlegion_campaign_v1', JSON.stringify(route));
    globalThis.localStorage = normalStorage;
    assert.equal(Campaign.getState().pendingRewards.length, 1);
    const repaired = Campaign.reconcilePendingRewards();
    assert.equal(repaired.saved, true);
    assert.equal(repaired.earned, role === 'ranger' ? 2 : 1);
    assert.equal(repaired.masteryXp, role === 'ranger' ? 4 : 10);
    assert.equal(Meta.getState().stageProgress[1].masteryStars[role], 3);
    assert.equal(Campaign.reconcilePendingRewards().earned, 0);
  }
});

test('reconciliation cannot pay a recovered legacy receipt before its queue is read back', () => {
  storage.set('shadowlegion_campaign_v1', JSON.stringify({ version: 1, stageResults: { 1: { stars: 3, clears: 1, attempts: 1 } },
    recentCompletions: [{ id: 'legacy-needs-queue', stageId: 1, operativeId: 'ranger', stars: 3, victory: true }] }));
  const original = storage.get('shadowlegion_campaign_v1');
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key !== 'shadowlegion_campaign_v1') normalStorage.setItem(key, value);
  } };
  const result = Campaign.reconcilePendingRewards();
  assert.equal(result.saved, false);
  assert.equal(result.pending, 1);
  assert.equal(result.earned, 0);
  assert.equal(storage.has('shadowlegion_meta_v1'), false);
  assert.equal(storage.get('shadowlegion_campaign_v1'), original);
});

test('reconciliation preserves future route versions and never drains their receipts into an older wallet', () => {
  const future = JSON.stringify({ version: 2, stageResults: { 1: { stars: 3, clears: 1 } },
    pendingRewards: [{ id: 'future-unpaid', stageId: 1, operativeId: 'ranger', stars: 3, victory: true }], futureData: { keep: true } });
  storage.set('shadowlegion_campaign_v1', future);
  const before = new Map(storage);
  assert.equal(Campaign.reconcilePendingRewards().saved, false);
  assert.equal(Campaign.getWriteProtection(), 'future-save-version');
  assert.deepEqual(storage, before);
});
