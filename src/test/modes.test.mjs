import test from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW_TRIALS, getShadowTrial, getShadowTrialWaves } from '../data/modes.ts';
import { ShadowTrialManager } from '../systems/ShadowTrialManager.ts';
import { sanitizeRunCheckpoint } from '../systems/RunCheckpointManager.ts';
import { RunRecorder } from '../systems/RunRecorder.ts';

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
  assert.equal(ShadowTrialManager.recordVictory(1, 60).firstClear, true);
  assert.equal(ShadowTrialManager.recordVictory(1, 80).newBest, false);
  assert.equal(ShadowTrialManager.recordVictory(1, 40).bestTimeSec, 40);
  ShadowTrialManager.recordVictory(5, 120);
  assert.equal(ShadowTrialManager.getRecords().length, 2);
  assert.equal(ShadowTrialManager.recordVictory(0, 30), null);
  assert.equal(ShadowTrialManager.recordVictory(1, Infinity), null);
  store.set('sunlit_shadow_trials_v1', '[null,{}, {"tier":1,"wins":-1,"bestTimeSec":3}]');
  assert.deepEqual(ShadowTrialManager.getRecords(), []);
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
