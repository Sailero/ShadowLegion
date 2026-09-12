import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionMetricsManager as Metrics } from '../systems/SessionMetricsManager.ts';
const storage = new Map();
beforeEach(() => {
  storage.clear();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
});
const sample = (activeMs, chapter = 1) => ({ chapter, wave: 1, activeMs, operativeId: 'ranger', shadowTrial: false, coreRatio: 0.8 });

test('local wave timing reports explicit sample counts and correct median/p90', () => {
  assert.deepEqual(Metrics.summary(), []);
  for (const ms of [1000, 4000, 2000, 3000]) assert.equal(Metrics.record(sample(ms)), true);
  Metrics.record(sample(9000, 2));
  assert.deepEqual(Metrics.summary(), [{ chapter: 1, count: 4, medianMs: 2500, p90Ms: 4000 }, { chapter: 2, count: 1, medianMs: 9000, p90Ms: 9000 }]);
});

test('wave timing retains only the most recent 120 observations', () => {
  for (let i = 1; i <= 140; i++) Metrics.record(sample(i * 100));
  assert.equal(Metrics.getSamples().length, 120);
  assert.equal(Metrics.getSamples()[0].activeMs, 2100);
  assert.equal(Metrics.clear(), true);
  assert.equal(Metrics.getSamples().length, 0);
});

test('invalid timing samples and broken storage never report fabricated observations', () => {
  for (const invalid of [sample(NaN), sample(Infinity), sample(-1), { ...sample(100), wave: 0 }, { ...sample(100), coreRatio: 2 }]) assert.equal(Metrics.record(invalid), false);
  storage.set('sunlit_echoes_wave_metrics_v1', '{invalid');
  assert.deepEqual(Metrics.summary(), []);
  globalThis.localStorage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('full'); }, removeItem() { throw Error('disabled'); } };
  assert.equal(Metrics.record(sample(2000)), false);
  assert.deepEqual(Metrics.summary(), []);
  assert.equal(Metrics.clear(), false);
});
