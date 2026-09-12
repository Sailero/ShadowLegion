import test from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW_TRIALS, getShadowTrial, getShadowTrialWaves } from '../data/modes.ts';
import { ShadowTrialManager } from '../systems/ShadowTrialManager.ts';
import { sanitizeRunCheckpoint } from '../systems/RunCheckpointManager.ts';
import { RunRecorder } from '../systems/RunRecorder.ts';
import { MetaProgressionManager } from '../systems/MetaProgressionManager.ts';

test('five shadow challenges have readable tells, finite rounds and real encounter differences', () => {
  assert.equal(SHADOW_TRIALS.length, 5);
  for (const trial of SHADOW_TRIALS) {
    assert.equal(getShadowTrialWaves(trial.tier).length, 3);
    assert.ok(trial.telegraphMs >= 650);
    assert.ok(trial.damage > 0 && trial.damage <= 10);
  }
  assert.equal(SHADOW_TRIALS[0].rivals, 1);
  assert.equal(SHADOW_TRIALS[4].rivals, 2);
  assert.ok(SHADOW_TRIALS[4].volleyCount > SHADOW_TRIALS[0].volleyCount);
  assert.equal(getShadowTrial(NaN).tier, 1);
});

test('shadow records retain best time, separate tiers and reject corrupt inputs', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.deepEqual(ShadowTrialManager.recordVictory(1, 60), { tier: 1, firstClear: true, bestTimeSec: 60, newBest: true, saved: true });
  assert.equal(ShadowTrialManager.recordVictory(1, 80).newBest, false);
  assert.equal(ShadowTrialManager.recordVictory(1, 40).bestTimeSec, 40);
  ShadowTrialManager.recordVictory(5, 120);
  assert.equal(ShadowTrialManager.getRecords().length, 2);
  assert.equal(ShadowTrialManager.recordVictory(0, 30), null);
  assert.equal(ShadowTrialManager.recordVictory(1, Infinity), null);
  store.set('sunlit_shadow_trials_v1', '[null,{}, {"tier":1,"wins":-1,"bestTimeSec":3}]');
  assert.deepEqual(ShadowTrialManager.getRecords(), []);
});

test('shadow record writes that throw never claim a saved first clear or improved time', () => {
  const key = 'sunlit_shadow_trials_v1';
  const old = JSON.stringify([{ tier: 1, wins: 2, bestTimeSec: 60 }]);
  const store = new Map([[key, old]]);
  globalThis.localStorage = {
    getItem: name => store.get(name) ?? null,
    setItem: () => { throw new Error('quota exceeded'); },
  };
  assert.deepEqual(ShadowTrialManager.recordVictory(2, 50), { tier: 2, firstClear: false, bestTimeSec: 0, newBest: false, saved: false });
  assert.deepEqual(ShadowTrialManager.recordVictory(1, 30), { tier: 1, firstClear: false, bestTimeSec: 60, newBest: false, saved: false });
  assert.equal(store.get(key), old);
});

test('shadow record readback detects silent refusal without blocking independent wallet rewards', () => {
  const key = 'sunlit_shadow_trials_v1';
  const old = JSON.stringify([{ tier: 1, wins: 2, bestTimeSec: 60 }]);
  const store = new Map([[key, old]]);
  globalThis.localStorage = {
    getItem: name => store.get(name) ?? null,
    setItem: (name, value) => { if (name !== key) store.set(name, value); },
  };
  assert.deepEqual(ShadowTrialManager.recordVictory(2, 50), { tier: 2, firstClear: false, bestTimeSec: 0, newBest: false, saved: false });
  assert.deepEqual(ShadowTrialManager.recordVictory(1, 30), { tier: 1, firstClear: false, bestTimeSec: 60, newBest: false, saved: false });
  const reward = MetaProgressionManager.recordModeProgress({ mode: 'shadow', tier: 1, operativeId: 'ranger', completionId: 'shadow-record-write-refused' });
  assert.equal(reward.saved, true);
  assert.equal(reward.earned, 6);
  assert.equal(MetaProgressionManager.getState().shadowCores, 6);
  assert.equal(store.get(key), old);
});

test('shadow record readback errors stay unconfirmed and saved values follow existing bounds', () => {
  const store = new Map();
  let wrote = false;
  globalThis.localStorage = {
    getItem: key => { if (wrote) throw new Error('read refused'); return store.get(key) ?? null; },
    setItem: (key, value) => { store.set(key, value); wrote = true; },
  };
  assert.equal(ShadowTrialManager.recordVictory(1, 60).saved, false);
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  store.set('sunlit_shadow_trials_v1', JSON.stringify([{ tier: 5, wins: 1000000, bestTimeSec: 86400 }]));
  assert.deepEqual(ShadowTrialManager.recordVictory(5, 100000), { tier: 5, firstClear: false, bestTimeSec: 86400, newBest: false, saved: true });
  assert.deepEqual(ShadowTrialManager.getRecords(), [{ tier: 5, wins: 1000000, bestTimeSec: 86400 }]);
});

test('checkpoints preserve explicit modes and reject mismatched stage chapters', () => {
  const input = { version: 1, level: 5, startLevel: 5, mode: 'campaign', stageId: 50, trialTier: 1,
    endless: false, shadowTrial: false, operativeId: 'ranger', score: 0, kills: 0, elapsedMs: 0,
    appliedUpgrades: [], savedAt: new Date().toISOString(), recorder: new RunRecorder().serialize() };
  assert.equal(sanitizeRunCheckpoint(input).stageId, 50);
  assert.equal(sanitizeRunCheckpoint({ ...input, stageId: 1 }), null);
  assert.equal(sanitizeRunCheckpoint({ ...input, mode: 'endless' }), null);
  assert.equal(sanitizeRunCheckpoint({ ...input, trialTier: 6 }), null);
});
