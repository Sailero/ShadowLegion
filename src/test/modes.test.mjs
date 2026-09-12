import test from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW_TRIALS, getShadowTrial, getShadowTrialWaves } from '../data/modes.ts';
import { ShadowTrialManager } from '../systems/ShadowTrialManager.ts';
import { sanitizeRunCheckpoint } from '../systems/RunCheckpointManager.ts';
import { RunRecorder } from '../systems/RunRecorder.ts';
import { MetaProgressionManager, createDefaultMetaState } from '../systems/MetaProgressionManager.ts';
import { SaveBackupManager, SAVE_BACKUP_FORMAT } from '../systems/SaveBackupManager.ts';

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

test('a committed shadow write with failed readback retries the same ID without another win or faster time', () => {
  const key = 'sunlit_shadow_trials_v1';
  const store = new Map();
  let wrote = false;
  let writes = 0;
  const storage = { getItem: name => store.get(name) ?? null, setItem: (name, value) => { writes++; store.set(name, value); } };
  globalThis.localStorage = {
    getItem: name => { if (wrote) throw new Error('readback failed'); return storage.getItem(name); },
    setItem: (name, value) => { storage.setItem(name, value); wrote = true; },
  };
  assert.equal(ShadowTrialManager.recordVictory(5, 90, 'trial-result-5').saved, false);
  const committed = store.get(key);
  assert.equal(JSON.parse(committed)[0].wins, 1, 'write really reached the backing Map');
  globalThis.localStorage = storage;
  const retried = ShadowTrialManager.recordVictory(5, 1, 'trial-result-5');
  assert.deepEqual(retried, { tier: 5, firstClear: false, bestTimeSec: 90, newBest: false, saved: true });
  assert.equal(writes, 1);
  assert.equal(store.get(key), committed);
  assert.deepEqual(ShadowTrialManager.getRecords(), [{ tier: 5, wins: 1, bestTimeSec: 90, completionIds: ['trial-result-5'] }]);
});

test('shadow completion IDs deduplicate retries while a different completion increments wins normally', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(ShadowTrialManager.recordVictory(2, 80, 'run-a').firstClear, true);
  assert.equal(ShadowTrialManager.recordVictory(2, 20, 'run-a').newBest, false);
  assert.deepEqual(ShadowTrialManager.getRecords()[0], { tier: 2, wins: 1, bestTimeSec: 80, completionIds: ['run-a'] });
  assert.equal(ShadowTrialManager.recordVictory(2, 60, 'run-b').newBest, true);
  assert.deepEqual(ShadowTrialManager.getRecords()[0], { tier: 2, wins: 2, bestTimeSec: 60, completionIds: ['run-a', 'run-b'] });
});

test('an unreadable shadow history is never replaced by a fresh-looking victory', () => {
  const key = 'sunlit_shadow_trials_v1';
  const original = JSON.stringify([{ tier: 1, wins: 20, bestTimeSec: 45, completionIds: ['old-result'] }]);
  const store = new Map([[key, original]]);
  let writes = 0;
  const storage = { getItem: name => store.get(name) ?? null, setItem: (name, value) => { writes++; store.set(name, value); } };
  globalThis.localStorage = { ...storage, getItem() { throw new Error('history is inaccessible'); } };
  assert.deepEqual(ShadowTrialManager.getRecords(), []);
  assert.equal(ShadowTrialManager.recordVictory(1, 30, 'next-result').saved, false);
  assert.equal(writes, 0);
  assert.equal(store.get(key), original);
  globalThis.localStorage = storage;
  assert.equal(ShadowTrialManager.recordVictory(1, 30, 'next-result').saved, true);
  assert.equal(ShadowTrialManager.getRecords()[0].wins, 21);
});

test('broken or oversized shadow history is left intact when recording cannot establish its contents', () => {
  const key = 'sunlit_shadow_trials_v1';
  for (const original of ['{broken', '{"version":2,"records":[]}', ' '.repeat(8193)]) {
    const store = new Map([[key, original]]);
    let writes = 0;
    globalThis.localStorage = { getItem: name => store.get(name) ?? null, setItem: () => { writes++; } };
    assert.equal(ShadowTrialManager.recordVictory(1, 60, 'safe-retry').saved, false);
    assert.equal(writes, 0);
    assert.equal(store.get(key), original);
  }
});

test('shadow records keep eight recent IDs per tier and the maximum legal records stay below 8192 bytes', () => {
  const key = 'sunlit_shadow_trials_v1';
  const store = new Map();
  globalThis.localStorage = { getItem: name => store.get(name) ?? null, setItem: (name, value) => store.set(name, value) };
  for (let tier = 1; tier <= 5; tier++) {
    for (let index = 0; index < 9; index++) ShadowTrialManager.recordVictory(tier, 100, `${tier}-${index}-`.padEnd(120, 'x'));
  }
  const records = ShadowTrialManager.getRecords();
  assert.equal(records.length, 5);
  for (const record of records) {
    assert.equal(record.wins, 9);
    assert.equal(record.completionIds.length, 8);
    assert.ok(record.completionIds[0].startsWith(`${record.tier}-1-`));
    assert.ok(record.completionIds[7].startsWith(`${record.tier}-8-`));
    assert.equal(ShadowTrialManager.recordVictory(record.tier, 1, record.completionIds[0]).bestTimeSec, 100);
  }
  assert.ok(Buffer.byteLength(store.get(key), 'utf8') <= 8192);
  const before = store.get(key);
  for (const invalid of ['', 'x'.repeat(121), 'bad id', '中文', null]) assert.equal(ShadowTrialManager.recordVictory(1, 60, invalid), null);
  assert.equal(store.get(key), before);
});

test('backup export and restore retain shadow deduplication IDs so a recovered result cannot count twice', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  globalThis.localStorage = storage;
  ShadowTrialManager.recordVictory(3, 72, 'backup-result');
  const exported = SaveBackupManager.exportBackup(storage);
  assert.equal(exported.ok, true);
  assert.deepEqual(JSON.parse(exported.text).data.shadowTrials[0].completionIds, ['backup-result']);
  store.clear();
  assert.equal(SaveBackupManager.restoreBackup(exported.text, storage).ok, true);
  assert.equal(ShadowTrialManager.recordVictory(3, 10, 'backup-result').saved, true);
  assert.deepEqual(ShadowTrialManager.getRecords()[0], { tier: 3, wins: 1, bestTimeSec: 72, completionIds: ['backup-result'] });
});

test('backup and runtime sanitizers preserve the same eight newest legal shadow IDs', () => {
  const key = 'sunlit_shadow_trials_v1';
  const ids = [...Array.from({ length: 10 }, (_, i) => `result-${i}`), 'result-2', '', 4, 'bad id', 'x'.repeat(121)];
  const trials = [{ tier: 4, wins: 30, bestTimeSec: 60, completionIds: ids }];
  const store = new Map([[key, JSON.stringify(trials)]]);
  const storage = { getItem: name => store.get(name) ?? null, setItem: (name, value) => store.set(name, value), removeItem: name => store.delete(name) };
  globalThis.localStorage = storage;
  const runtime = ShadowTrialManager.getRecords()[0].completionIds;
  const text = JSON.stringify({ format: SAVE_BACKUP_FORMAT, version: 1, createdAt: '2026-09-12T06:00:00Z', data: { meta: createDefaultMetaState(), shadowTrials: trials } });
  assert.equal(SaveBackupManager.restoreBackup(text, storage).ok, true);
  assert.deepEqual(JSON.parse(store.get(key))[0].completionIds, runtime);
  assert.deepEqual(runtime, ['result-3', 'result-4', 'result-5', 'result-6', 'result-7', 'result-8', 'result-9', 'result-2']);
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
