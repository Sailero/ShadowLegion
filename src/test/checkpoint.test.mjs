import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RunCheckpointManager as Checkpoint, sanitizeRunCheckpoint } from '../systems/RunCheckpointManager.ts';
import { RunRecorder, sanitizeRunRecorderSnapshot, MAX_RECORDED_RUN_MS } from '../systems/RunRecorder.ts';
const storage = new Map();
beforeEach(() => {
  storage.clear();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
});
const opening = () => ({ level: 2, operativeId: 'ranger', endless: false, score: 200, kills: 37, elapsedMs: 140000,
  appliedUpgrades: ['crit', 'explosive', 'atk_up', 'unlock_barrage', 'support_barrage_up'], shadowTrial: false, recorder: new RunRecorder().serialize() });

test('chapter checkpoint round-trips build choices and progress without live physics', () => {
  const input = opening();
  assert.equal(Checkpoint.save(input), true);
  const restored = Checkpoint.load();
  assert.equal(restored.version, 1);
  assert.deepEqual(restored.appliedUpgrades, input.appliedUpgrades);
  assert.equal(restored.level, 2);
  assert.equal(restored.elapsedMs, 140000);
  assert.equal(restored.startLevel, 1);
  assert.equal(Checkpoint.clear(), true);
  assert.equal(Checkpoint.load(), null);
});

test('checkpoint keeps starting chapter for reward boundaries and migrates old checkpoints', () => {
  assert.equal(Checkpoint.save({ ...opening(), startLevel: 2 }), true);
  assert.equal(Checkpoint.load().startLevel, 2);
  const legacy = { ...opening(), version: 1, savedAt: '2026-09-12T00:00:00.000Z' };
  assert.equal(sanitizeRunCheckpoint(legacy).startLevel, 1);
  assert.equal(sanitizeRunCheckpoint({ ...legacy, startLevel: 3 }), null);
  assert.equal(sanitizeRunCheckpoint({ ...legacy, startLevel: NaN }), null);
});

test('checkpoint rejects unknown versions, invalid classes and impossible card sequences', () => {
  const valid = { ...opening(), version: 1, savedAt: '2026-09-12T00:00:00.000Z' };
  for (const patch of [
    { version: 999 }, { level: 99 }, { elapsedMs: Infinity }, { operativeId: 'invalid' },
    { appliedUpgrades: ['support_barrage_up'] }, { appliedUpgrades: ['scatter'] },
    { appliedUpgrades: ['crit', 'crit', 'crit', 'crit'] }, { appliedUpgrades: ['not-a-card'] },
  ]) assert.equal(sanitizeRunCheckpoint({ ...valid, ...patch }), null);
  assert.ok(sanitizeRunCheckpoint({ ...valid, level: 99, endless: true }));
});

test('corrupt, oversized or inaccessible checkpoint storage fails without crashing', () => {
  storage.set('shadowlegion_checkpoint_v1', '{broken');
  assert.equal(Checkpoint.load(), null);
  storage.set('shadowlegion_checkpoint_v1', ' '.repeat(65537));
  assert.equal(Checkpoint.load(), null);
  globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(Checkpoint.load(), null);
  assert.equal(Checkpoint.save(opening()), false);
  assert.equal(Checkpoint.clear(), false);
});

test('restoring a behavior recorder preserves cumulative chapter measurements', () => {
  const original = new RunRecorder();
  for (let i = 0; i < 100; i++) original.recordFrame(100, true, i % 2 === 0);
  original.recordShot(20); original.recordDash(); original.recordSkill(); original.recordDamage(5);
  const restored = RunRecorder.restore(original.serialize());
  for (const recorder of [original, restored]) {
    recorder.recordFrame(100, false, true);
    recorder.recordShot(3);
  }
  assert.deepEqual(restored.serialize(), original.serialize());
  const { createdAt: _first, ...a } = restored.finish('nova', 120);
  const { createdAt: _second, ...b } = original.finish('nova', 120);
  assert.deepEqual(a, b);
});

test('recorder snapshots bound playtime and cannot restore invalid or negative counters', () => {
  const cleaned = sanitizeRunRecorderSnapshot({ version: 1, activeMs: MAX_RECORDED_RUN_MS * 2, movingMs: Infinity, firingMs: MAX_RECORDED_RUN_MS * 3, shots: -4, dashes: NaN, skills: 2.8, damageTaken: 'bad' });
  assert.equal(cleaned.activeMs, MAX_RECORDED_RUN_MS);
  assert.equal(cleaned.firingMs, MAX_RECORDED_RUN_MS);
  assert.equal(cleaned.movingMs, 0);
  assert.equal(cleaned.shots, 0);
  assert.equal(cleaned.skills, 2);
  assert.equal(sanitizeRunRecorderSnapshot({ version: 999, activeMs: 999 }).activeMs, 0);
});
