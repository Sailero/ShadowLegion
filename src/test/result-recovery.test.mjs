import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { GameOverScene } = await import('../scenes/GameOverScene.ts');
const { CampaignProgressionManager: Campaign } = await import('../systems/CampaignProgressionManager.ts');
const { MetaProgressionManager: Meta } = await import('../systems/MetaProgressionManager.ts');
const { ShadowTrialManager: ShadowTrial } = await import('../systems/ShadowTrialManager.ts');

// Calls the actual result-scene methods through the existing constructor boundary.
// This is not native input, DOM, canvas rendering or Phaser scene-manager coverage.
const storage = new Map();
const normalStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
beforeEach(() => { storage.clear(); globalThis.localStorage = normalStorage; });

function sceneBoundary() {
  const scene = new GameOverScene();
  const restarts = [], notices = [];
  scene.scene = { restart: data => restarts.push(data) };
  scene.saveNotice = { setText(text) { notices.push(text); return this; } };
  return { scene, restarts, notices };
}
const completion = extra => Object.freeze({
  completionId: 'result-recovery-one', operativeId: 'ranger', victory: true,
  durationSec: 120, coreRatio: .9, hpRatio: .8,
  dashes: 2, skills: 1, commands: 1, terrainHits: 4, intercepts: 5, priorityKills: 2,
  ...extra,
});
const outcome = extra => ({
  stageId: 1, stars: 3, newStars: 3, firstClear: true, nextStageId: 2,
  chapterCompleted: false, campaignCompleted: false,
  earned: 0, total: 0, masteryXp: 0, unlocks: [], duplicate: false,
  saved: false, routeSaved: false,
  ...extra,
});
const resultData = extra => ({
  mode: 'campaign', stageId: 1, operativeId: 'ranger', victory: true,
  score: 1200, kills: 18, durationSec: 120,
  stageCompletion: completion(), stageResult: outcome(),
  ...extra,
});

test('save retry passes the original frozen completion and preserves first-clear presentation', t => {
  const { scene, restarts } = sceneBoundary();
  const originalCompletion = completion();
  const profile = { style: '同行', mobility: 55 };
  const data = Object.freeze(resultData({ stageCompletion: originalCompletion, profile,
    stageResult: Object.freeze(outcome({ routeSaved: true })) }));
  const repaired = Object.freeze(outcome({ saved: true, routeSaved: true,
    firstClear: false, newStars: 0, earned: 6, total: 20, masteryXp: 10,
    unlocks: ['暖灯研究'], duplicate: true }));
  const calls = [];
  t.mock.method(Campaign, 'recordStageResult', (stageId, submitted) => {
    calls.push({ stageId, submitted });
    return repaired;
  });

  scene.retryStageSave(data);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].stageId, 1);
  assert.strictEqual(calls[0].submitted, originalCompletion);
  assert.equal(restarts.length, 1);
  assert.strictEqual(restarts[0].stageCompletion, originalCompletion);
  assert.strictEqual(restarts[0].profile, profile);
  assert.deepEqual(restarts[0], { ...data, stageResult: { ...repaired, firstClear: true, newStars: 3 } });
  assert.equal(data.stageResult.saved, false);
  assert.equal(repaired.firstClear, false);
});

test('a route-first-write failure retries the actual managers without another clear or payment', () => {
  const { scene, restarts } = sceneBoundary();
  const submitted = completion({ completionId: 'real-route-recovery' });
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === 'shadowlegion_campaign_v1') throw new Error('injected route write refusal');
    normalStorage.setItem(key, value);
  } };
  const failed = Campaign.recordStageResult(1, submitted);
  assert.equal(failed.saved, false);
  assert.equal(Meta.getState().shadowCores, 0);
  globalThis.localStorage = normalStorage;

  scene.retryStageSave(resultData({ stageCompletion: submitted, stageResult: failed }));

  assert.equal(restarts.length, 1);
  const repaired = restarts[0];
  assert.strictEqual(repaired.stageCompletion, submitted);
  assert.equal(repaired.stageResult.saved, true);
  assert.equal(repaired.stageResult.firstClear, true);
  assert.equal(repaired.stageResult.newStars, 3);
  assert.equal(repaired.stageResult.earned, 6);
  assert.equal(repaired.stageResult.total, 6);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
  assert.equal(Campaign.getStageRecord(1).attempts, 1);
  assert.equal(Meta.getState().shadowCores, 6);
  scene.retryStageSave(repaired);
  assert.equal(restarts.length, 1);
  assert.equal(Meta.getState().shadowCores, 6);
});

test('a repeated save failure restarts with the same receipt and does not invent saved progress', t => {
  const { scene, restarts } = sceneBoundary();
  const data = resultData({ stageResult: outcome({ firstClear: false, newStars: 1 }) });
  const failedAgain = outcome({ firstClear: false, newStars: 0, stars: 0,
    nextStageId: null, error: 'future-save-version' });
  t.mock.method(Campaign, 'recordStageResult', () => failedAgain);

  scene.retryStageSave(data);

  assert.equal(restarts.length, 1);
  assert.strictEqual(restarts[0].stageCompletion, data.stageCompletion);
  assert.equal(restarts[0].stageResult.saved, false);
  assert.equal(restarts[0].stageResult.routeSaved, false);
  assert.equal(restarts[0].stageResult.error, 'future-save-version');
  assert.equal(restarts[0].stageResult.firstClear, false);
  assert.equal(restarts[0].stageResult.newStars, 1);
  assert.equal(restarts[0].stageResult.nextStageId, null);
});

test('retry performs no stage writes for absent completion, absent result or an already saved result', t => {
  const { scene, restarts } = sceneBoundary();
  let writes = 0;
  t.mock.method(Campaign, 'recordStageResult', () => { writes++; return outcome({ saved: true }); });
  scene.retryStageSave(resultData({ stageCompletion: undefined }));
  scene.retryStageSave(resultData({ stageResult: null }));
  scene.retryStageSave(resultData({ stageResult: outcome({ saved: true, routeSaved: true }) }));
  assert.equal(writes, 0);
  assert.equal(restarts.length, 0);
});

for (const destination of ['map', 'workshop', 'escape']) {
  test(`an unwritten result blocks the first ${destination} exit and accepts its explicit repeat`, () => {
    const { scene, notices } = sceneBoundary();
    const data = resultData();
    let departures = 0;
    const leave = () => { departures++; };
    scene.leaveResult(data, destination, leave);
    assert.equal(departures, 0);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /尚未保存/);
    assert.match(notices[0], /再次选择同一出口/);
    assert.match(notices[0], /S.*重试保存/);
    scene.leaveResult(data, destination, leave);
    assert.equal(departures, 1);
    assert.equal(notices.length, 1);
  });
}

test('switching exits never reuses confirmation given for a different destination', () => {
  const { scene, notices } = sceneBoundary();
  const data = resultData();
  const departed = [];
  for (const destination of ['map', 'workshop', 'map', 'escape', 'workshop']) {
    scene.leaveResult(data, destination, () => departed.push(destination));
    assert.deepEqual(departed, []);
  }
  assert.equal(notices.length, 5);
  scene.leaveResult(data, 'workshop', () => departed.push('workshop'));
  assert.deepEqual(departed, ['workshop']);
});

test('a durable route with a pending wallet reward permits all exits immediately', () => {
  for (const destination of ['map', 'workshop', 'escape']) {
    const { scene, notices } = sceneBoundary();
    let departures = 0;
    scene.leaveResult(resultData({ stageResult: outcome({ saved: false, routeSaved: true }) }), destination, () => { departures++; });
    assert.equal(departures, 1, destination);
    assert.equal(notices.length, 0, destination);
  }
});

test('a fully saved result and non-campaign result do not request discard confirmation', () => {
  for (const data of [resultData({ stageResult: outcome({ saved: true, routeSaved: true }) }),
    resultData({ mode: 'shadow', victory: false, stageResult: null, stageCompletion: undefined })]) {
    for (const destination of ['map', 'workshop', 'escape']) {
      const { scene, notices } = sceneBoundary();
      let departures = 0;
      scene.leaveResult(data, destination, () => { departures++; });
      assert.equal(departures, 1);
      assert.equal(notices.length, 0);
    }
  }
});

function refuseWritesTo(keyToBlock) {
  globalThis.localStorage = { ...normalStorage, setItem(key, value) {
    if (key === keyToBlock) throw new Error(`injected write refusal: ${key}`);
    normalStorage.setItem(key, value);
  } };
}
const shadowInput = completionId => ({ completionId, mode: 'shadow', operativeId: 'ranger', tier: 5 });
const shadowResult = (input, trialResult, reward) => ({
  mode: 'shadow', victory: true, completionId: input.completionId, trialTier: input.tier,
  operativeId: input.operativeId, durationSec: 123, trialResult, reward,
});

test('tier-five wallet recovery grants only that tier once and does not repeat the saved trial victory', () => {
  const { scene, restarts } = sceneBoundary();
  const input = shadowInput('shadow-wallet-refused');
  const trialResult = ShadowTrial.recordVictory(5, 123, input.completionId);
  assert.equal(trialResult.saved, true);
  refuseWritesTo('shadowlegion_meta_v1');
  const failedReward = Meta.recordModeProgress(input);
  assert.equal(failedReward.saved, false);
  assert.equal(Meta.getState().shadowCores, 0);
  globalThis.localStorage = normalStorage;

  scene.retryStageSave(shadowResult(input, trialResult, failedReward));

  const repaired = restarts[0];
  assert.strictEqual(repaired.trialResult, trialResult);
  assert.equal(repaired.reward.saved, true);
  assert.equal(repaired.reward.earned, 14);
  assert.equal(repaired.reward.masteryXp, 20);
  assert.equal(Meta.getState().shadowCores, 14);
  assert.equal(Meta.getState().masteryXp.ranger, 20);
  assert.deepEqual(ShadowTrial.getRecords(), [{ tier: 5, wins: 1, bestTimeSec: 123, completionIds: [input.completionId] }]);
  const before = new Map(storage);
  scene.retryStageSave(repaired);
  assert.deepEqual(storage, before);
  assert.equal(restarts.length, 1);
});

test('tier-five trial-record recovery leaves an already paid wallet and mastery untouched', () => {
  const { scene, restarts } = sceneBoundary();
  const input = shadowInput('shadow-record-refused');
  const reward = Meta.recordModeProgress(input);
  assert.equal(reward.earned, 14);
  assert.equal(reward.masteryXp, 20);
  const walletBefore = storage.get('shadowlegion_meta_v1');
  refuseWritesTo('sunlit_shadow_trials_v1');
  const failedTrial = ShadowTrial.recordVictory(5, 123, input.completionId);
  assert.equal(failedTrial.saved, false);
  assert.deepEqual(ShadowTrial.getRecords(), []);
  globalThis.localStorage = normalStorage;

  scene.retryStageSave(shadowResult(input, failedTrial, reward));

  const repaired = restarts[0];
  assert.strictEqual(repaired.reward, reward);
  assert.equal(repaired.trialResult.saved, true);
  assert.equal(repaired.trialResult.firstClear, true);
  assert.equal(storage.get('shadowlegion_meta_v1'), walletBefore);
  assert.equal(Meta.getState().shadowCores, 14);
  assert.equal(Meta.getState().masteryXp.ranger, 20);
  assert.deepEqual(ShadowTrial.getRecords(), [{ tier: 5, wins: 1, bestTimeSec: 123, completionIds: [input.completionId] }]);
  const before = new Map(storage);
  scene.retryStageSave(repaired);
  assert.deepEqual(storage, before);
});

test('a failed habit diary is retried after the stage reward is saved without adding another run or reward', () => {
  const { scene, restarts } = sceneBoundary();
  const submitted = completion({ completionId: 'habit-diary-refused' });
  const savedStage = Campaign.recordStageResult(1, submitted);
  assert.equal(savedStage.saved, true);
  const profile = Object.freeze({ style: '战术家', mobility: 70, firepower: 41, reflex: 55, technique: 83,
    shots: 130, dashes: 5, skills: 8, damageTaken: 20, build: 'nova', createdAt: '2026-09-12T07:30:00.000Z' });
  const runSummary = Object.freeze({ completionId: submitted.completionId, recordOnly: true,
    mode: 'campaign', stageId: 1, operativeId: 'ranger', wave: 3, level: 1, startLevel: 1,
    kills: 18, durationSec: 120, victory: true, endless: false, build: 'nova', profile });
  refuseWritesTo('shadowlegion_meta_v1');
  Meta.recordRun(runSummary);
  assert.equal(Meta.getState().lastProfile, null);
  assert.equal(Meta.getState().totalRuns, 0);
  const routeBefore = storage.get('shadowlegion_campaign_v1');
  globalThis.localStorage = normalStorage;

  scene.retryStageSave(resultData({ stageCompletion: submitted, stageResult: savedStage,
    profile, profileSaved: false, runSummary }));

  const repaired = restarts[0];
  assert.strictEqual(repaired.stageResult, savedStage);
  assert.strictEqual(repaired.runSummary, runSummary);
  assert.equal(repaired.profileSaved, true);
  assert.deepEqual(Meta.getState().lastProfile, profile);
  assert.equal(Meta.getState().totalRuns, 1);
  assert.equal(Meta.getState().wins, 1);
  assert.equal(Meta.getState().totalKills, 18);
  assert.equal(Meta.getState().shadowCores, 6);
  assert.equal(storage.get('shadowlegion_campaign_v1'), routeBefore);
  const before = new Map(storage);
  scene.retryStageSave(repaired);
  assert.deepEqual(storage, before);
});

test('a partially saved shadow victory and an unsaved habit diary require explicit repeated departure', () => {
  const input = shadowInput('transient-exit');
  const savedTrial = ShadowTrial.recordVictory(5, 123, input.completionId);
  refuseWritesTo('shadowlegion_meta_v1');
  const failedReward = Meta.recordModeProgress(input);
  const partialShadow = shadowResult(input, savedTrial, failedReward);
  globalThis.localStorage = normalStorage;
  const savedStage = Campaign.recordStageResult(1, completion({ completionId: 'diary-exit' }));
  assert.equal(savedStage.saved, true);
  const profilePending = resultData({ stageResult: savedStage, profileSaved: false });
  for (const data of [partialShadow, profilePending]) {
    for (const destination of ['map', 'workshop', 'escape']) {
      const { scene, notices } = sceneBoundary();
      let departures = 0;
      scene.leaveResult(data, destination, () => { departures++; });
      assert.equal(departures, 0);
      assert.equal(notices.length, 1);
      scene.leaveResult(data, destination, () => { departures++; });
      assert.equal(departures, 1);
    }
  }
});

test('a committed shadow victory with failed verification is recovered without another win or wallet payment', () => {
  const { scene, restarts } = sceneBoundary();
  const input = shadowInput('shadow-verify-read-refused');
  const reward = Meta.recordModeProgress(input);
  assert.equal(reward.saved, true);
  const walletBefore = storage.get('shadowlegion_meta_v1');
  let rejectVerification = false, verificationFailures = 0, trialWrites = 0;
  globalThis.localStorage = {
    ...normalStorage,
    setItem(key, value) {
      normalStorage.setItem(key, value);
      if (key === 'sunlit_shadow_trials_v1') { trialWrites++; rejectVerification = true; }
    },
    getItem(key) {
      if (key === 'sunlit_shadow_trials_v1' && rejectVerification) {
        rejectVerification = false;
        verificationFailures++;
        throw new Error('injected readback refusal after committed write');
      }
      return normalStorage.getItem(key);
    },
  };
  const uncertainTrial = ShadowTrial.recordVictory(5, 123, input.completionId);
  assert.equal(uncertainTrial.saved, false);
  assert.equal(verificationFailures, 1);
  assert.equal(trialWrites, 1);
  assert.deepEqual(JSON.parse(storage.get('sunlit_shadow_trials_v1')), [
    { tier: 5, wins: 1, bestTimeSec: 123, completionIds: [input.completionId] },
  ]);
  globalThis.localStorage = normalStorage;
  const before = new Map(storage);

  scene.retryStageSave(shadowResult(input, uncertainTrial, reward));

  assert.equal(restarts.length, 1);
  const repaired = restarts[0];
  assert.equal(repaired.trialResult.saved, true);
  assert.equal(repaired.trialResult.bestTimeSec, 123);
  assert.strictEqual(repaired.reward, reward);
  assert.deepEqual(storage, before);
  assert.equal(storage.get('shadowlegion_meta_v1'), walletBefore);
  assert.equal(ShadowTrial.getRecords()[0].wins, 1);
  assert.equal(Meta.getState().shadowCores, 14);
  assert.equal(Meta.getState().masteryXp.ranger, 20);
  scene.retryStageSave(repaired);
  assert.equal(restarts.length, 1);
  assert.deepEqual(storage, before);
});
