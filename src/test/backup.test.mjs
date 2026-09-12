import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SaveBackupManager as Backup, BACKUP_KEYS, SAVE_BACKUP_FORMAT, MAX_BACKUP_BYTES } from '../systems/SaveBackupManager.ts';
import { MetaProgressionManager as Meta, createDefaultMetaState } from '../systems/MetaProgressionManager.ts';
import { CampaignProgressionManager as Campaign } from '../systems/CampaignProgressionManager.ts';
import { RunCheckpointManager as Checkpoint } from '../systems/RunCheckpointManager.ts';
import { RunRecorder } from '../systems/RunRecorder.ts';
import { MAX_ENDLESS_LEVEL, MAX_ENDLESS_WAVE } from '../config/gameConfig.ts';

let entries;
let store;
beforeEach(() => {
  entries = new Map();
  store = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
  globalThis.localStorage = store;
});
const envelope = (data, extra = {}) => JSON.stringify({ format: SAVE_BACKUP_FORMAT, version: 1, createdAt: '2026-09-12T06:00:00.000Z', data, ...extra });
const meta = overrides => ({ ...createDefaultMetaState(), ...overrides });
const write = (key, value) => entries.set(key, JSON.stringify(value));
const snapshot = () => [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
const stage = id => Campaign.recordStageResult(id, { completionId: `stage-${id}`, victory: true, operativeId: 'ranger', durationSec: 80, coreRatio: 1,
  commands: 5, dashes: 10, intercepts: 100, priorityKills: 100, terrainHits: 100, skills: 10 });

const deliveredPostal = () => ({ version: 1, foundAddressIds: ['recipient', 'address', 'landmark'], deliveryCompleted: true, completionId: 'forest-delivery-1' });

test('the forest letter survives export and restore without granting campaign stars or currency', () => {
  write(BACKUP_KEYS.postal, deliveredPostal());
  const exported = Backup.exportBackup(store);
  assert.equal(exported.ok, true);
  assert.deepEqual(exported.preview.postal, { delivered: true, addressPieces: 3 });
  entries.clear();
  assert.equal(Backup.restoreBackup(exported.text, store).ok, true);
  assert.deepEqual(JSON.parse(entries.get(BACKUP_KEYS.postal)), deliveredPostal());
  assert.equal(Meta.getState().shadowCores, 0);
  assert.equal(Campaign.getState().totalStars, 0);
});

test('an old backup without postal data preserves the exact current forest journey', () => {
  const original = JSON.stringify({ version: 1, foundAddressIds: ['recipient'], deliveryCompleted: false, completionId: null }, null, 2);
  entries.set(BACKUP_KEYS.postal, original);
  const text = envelope({ meta: meta() });
  assert.equal(Backup.previewBackup(text).preview.preserved.includes('森林邮路与回信'), true);
  assert.equal(Backup.restoreBackup(text, store).ok, true);
  assert.equal(entries.get(BACKUP_KEYS.postal), original);
});

test('postal backup rejects missing address proof and protects a newer current journey', () => {
  const incomplete = { ...deliveredPostal(), foundAddressIds: ['recipient'] };
  assert.equal(Backup.previewBackup(envelope({ meta: meta(), postal: incomplete })).ok, false);
  assert.equal(Backup.previewBackup(envelope({ meta: meta(), postal: { ...deliveredPostal(), version: 2 } })).ok, false);
  write(BACKUP_KEYS.postal, { version: 2, futureRoute: true });
  const before = snapshot();
  assert.equal(Backup.restoreBackup(envelope({ meta: meta(), postal: deliveredPostal() }), store).code, 'newer-current-save');
  assert.deepEqual(snapshot(), before);
});

test('a refused postal restore rolls every preceding game section back to its original bytes', () => {
  write(BACKUP_KEYS.meta, meta({ shadowCores: 9 }));
  write(BACKUP_KEYS.postal, { version: 1, foundAddressIds: ['address'], deliveryCompleted: false, completionId: null });
  const before = snapshot();
  let denied = false;
  const flaky = { ...store, setItem(key, value) { if (key === BACKUP_KEYS.postal && !denied) { denied = true; throw new Error('quota'); } store.setItem(key, value); } };
  const result = Backup.restoreBackup(envelope({ meta: meta({ shadowCores: 44 }), postal: deliveredPostal() }), flaky);
  assert.equal(result.ok, false);
  assert.equal(result.rollback, 'complete');
  assert.deepEqual(snapshot(), before);
});

test('a future shadow reward ledger is rejected on export, preview and restore without erasing it', () => {
  const future = meta();
  future.modeProgress.shadowRewardLedger = { version: 2, futurePayments: [5] };
  write(BACKUP_KEYS.meta, future);
  const original = snapshot();
  assert.equal(Backup.exportBackup(store).ok, false);
  assert.equal(Backup.previewBackup(envelope({ meta: future })).ok, false);
  assert.equal(Backup.restoreBackup(envelope({ meta: meta() }), store).ok, false);
  assert.deepEqual(snapshot(), original);
});

test('individual shadow rewards survive backup without inventing preceding tier payments', () => {
  const reward = Meta.recordModeProgress({ completionId: 'fifth-first', mode: 'shadow', tier: 5, operativeId: 'ranger' });
  assert.equal(reward.earned, 14);
  const exported = Backup.exportBackup(store);
  assert.equal(exported.ok, true);
  entries.clear();
  assert.equal(Backup.restoreBackup(exported.text, store).ok, true);
  assert.deepEqual(Meta.getState().modeProgress.shadowRewardLedger.paidTiers, [5]);
  assert.equal(Meta.recordModeProgress({ completionId: 'first-after-restore', mode: 'shadow', tier: 1, operativeId: 'ranger' }).earned, 6);
  assert.equal(Meta.recordModeProgress({ completionId: 'fifth-repeat', mode: 'shadow', tier: 5, operativeId: 'ranger' }).earned, 0);
});

test('a durable unpaid campaign reward survives backup and is reconciled exactly once', () => {
  globalThis.localStorage = { ...store, setItem(key, value) {
    if (key === BACKUP_KEYS.meta) throw new Error('wallet full');
    store.setItem(key, value);
  } };
  assert.equal(stage(1).saved, false);
  const exported = Backup.exportBackup(store);
  assert.equal(exported.ok, true);
  assert.equal(JSON.parse(exported.text).data.campaign.pendingRewards.length, 1);
  entries.clear();
  globalThis.localStorage = store;
  assert.equal(Backup.restoreBackup(exported.text, store).ok, true);
  const restored = Campaign.reconcilePendingRewards();
  assert.equal(restored.saved, true);
  assert.equal(restored.earned, 6);
  assert.equal(Campaign.reconcilePendingRewards().earned, 0);
  assert.equal(Meta.getState().shadowCores, 6);
  assert.equal(Campaign.getStageRecord(1).clears, 1);
});

test('export reads exactly the nine game keys and preview performs no storage access or writes', () => {
  entries.set('another-application-token', 'private-unrelated-data');
  const reads = [];
  const readonly = { getItem(key) { reads.push(key); return store.getItem(key); }, setItem() { throw new Error('write forbidden'); }, removeItem() { throw new Error('remove forbidden'); } };
  const result = Backup.exportBackup(readonly);
  assert.equal(result.ok, true);
  assert.deepEqual(reads.sort(), Object.values(BACKUP_KEYS).sort());
  assert.equal(result.text.includes('private-unrelated-data'), false);
  assert.equal(Object.keys(JSON.parse(result.text).data).length, 9);
  globalThis.localStorage = { getItem() { throw new Error('preview must be pure'); } };
  const preview = Backup.previewBackup(result.text);
  assert.equal(preview.ok, true);
  assert.equal(preview.preview.clearedStages, 0);
  assert.equal(preview.preview.shadowCores, 0);
});

test('full backup round-trips growth, route, profile, settings, scores, trials, tutorial, samples and checkpoint', () => {
  stage(1); stage(2); stage(3);
  const state = Meta.getState();
  const recorder = new RunRecorder();
  recorder.recordFrame(100, true, true); recorder.recordShot(3); recorder.recordDash();
  state.lastProfile = recorder.finish('nova', 120);
  write(BACKUP_KEYS.meta, state);
  write(BACKUP_KEYS.settings, { volume: 0.65, reducedMotion: true, autoFire: true });
  write(BACKUP_KEYS.scores, [{ score: 100, kills: 5, level: 1, wave: 2, date: '2026-09-12T06:00:00Z', endless: false, build: 'nova' }]);
  write(BACKUP_KEYS.shadowTrials, [{ tier: 1, wins: 2, bestTimeSec: 56 }]);
  entries.set(BACKUP_KEYS.tutorial, 'done');
  write(BACKUP_KEYS.waveSamples, [{ chapter: 1, wave: 1, activeMs: 15000, operativeId: 'ranger', shadowTrial: false, coreRatio: 0.9, recordedAt: '2026-09-12T06:00:00Z' }]);
  assert.equal(Checkpoint.save({ mode: 'campaign', stageId: 4, level: 1, startLevel: 1, operativeId: 'ranger', endless: false, shadowTrial: false,
    score: 0, kills: 0, elapsedMs: 0, appliedUpgrades: ['crit'], recorder: recorder.serialize() }), true);
  const exported = Backup.exportBackup(store);
  assert.equal(exported.ok, true);
  assert.equal(exported.preview.clearedStages, 3);
  assert.equal(exported.preview.stars, 9);
  assert.equal(exported.preview.shadowCores, 18);
  assert.equal(exported.preview.hasCheckpoint, true);
  entries.clear(); entries.set('other-origin-app', 'untouched');
  assert.equal(Backup.restoreBackup(exported.text, store).ok, true);
  const again = Backup.exportBackup(store);
  assert.equal(again.ok, true);
  assert.deepEqual(JSON.parse(again.text).data, JSON.parse(exported.text).data);
  assert.equal(entries.get('other-origin-app'), 'untouched');
  assert.equal(Meta.getState().lastProfile.build, 'nova');
  assert.equal(Checkpoint.load().recorder.shots, 3);
});

test('preview rejects broken envelopes, future versions, missing growth and foreign sections without mutation', () => {
  write(BACKUP_KEYS.meta, meta({ shadowCores: 30 }));
  const before = snapshot();
  const invalid = [
    '{truncated', 'null', envelope({ meta: meta() }, { format: 'another-game' }), envelope({ meta: meta() }, { version: 2 }),
    envelope({ settings: {} }), envelope({ meta: {} }), envelope({ meta: [] }), envelope({ meta: meta(), foreign: { cookie: 'unknown' } }),
    envelope({ meta: meta() }, { createdAt: 'bad-date' }), envelope({ meta: meta({ version: 99 }) }),
    envelope({ meta: meta(), campaign: { version: 2 } }), envelope({ meta: meta(), checkpoint: { version: 2 } }),
    envelope({ meta: meta(), settings: { version: 2 } }),
  ];
  for (const text of invalid) {
    assert.equal(Backup.previewBackup(text).ok, false, text.slice(0, 50));
    assert.equal(Backup.restoreBackup(text, store).ok, false);
    assert.deepEqual(snapshot(), before);
  }
});

test('the size limit counts UTF-8 bytes and rejects oversized individual domains', () => {
  assert.equal(Backup.previewBackup(' '.repeat(MAX_BACKUP_BYTES + 1)).code, 'too-large');
  const nonAscii = envelope({ meta: meta(), scores: [] }, { ignoredText: '暖'.repeat(360000) });
  assert.ok(nonAscii.length < MAX_BACKUP_BYTES);
  assert.equal(Backup.previewBackup(nonAscii).code, 'too-large');
  const largeSettings = envelope({ meta: meta(), settings: { unknown: 'x'.repeat(2100) } });
  assert.equal(Backup.previewBackup(largeSettings).code, 'section-too-large');
});

test('domain sanitizers remove unrecognized fields and bound counters without importing executable or prototype data', () => {
  const dangerousMeta = meta({ shadowCores: 1e20, modules: { arsenal: 900, armor: -5, reactor: 'bad' }, unlockedOperatives: ['ranger', 'hacker'], unknown: '<script>alert(1)</script>' });
  const text = envelope({ meta: dangerousMeta, settings: { volume: 5, autoFire: 'true', reducedMotion: true, extra: 'omit' },
    scores: [null, { score: -1 }, { score: 1, kills: 2, level: 1, wave: 1, date: '2026-09-12', endless: false, extra: 'omit' }],
    shadowTrials: [null, { tier: 6, wins: 1, bestTimeSec: 1 }, { tier: 1, wins: 3, bestTimeSec: 20, extra: 'omit' }],
    waveSamples: [null, { chapter: 1, wave: 99 }], tutorial: 'done' });
  assert.equal(Backup.restoreBackup(text, store).ok, true);
  const state = Meta.getState();
  assert.equal(state.shadowCores, 1000000);
  assert.deepEqual(state.modules, { arsenal: 5, armor: 0, reactor: 0 });
  assert.deepEqual(state.unlockedOperatives, ['ranger']);
  assert.equal(entries.get(BACKUP_KEYS.meta).includes('<script>'), false);
  assert.deepEqual(JSON.parse(entries.get(BACKUP_KEYS.settings)), { volume: 1, autoFire: false, reducedMotion: true });
  assert.equal(JSON.parse(entries.get(BACKUP_KEYS.scores)).length, 1);
  assert.deepEqual(JSON.parse(entries.get(BACKUP_KEYS.shadowTrials)), [{ tier: 1, wins: 3, bestTimeSec: 20 }]);
  assert.deepEqual(JSON.parse(entries.get(BACKUP_KEYS.waveSamples)), []);
  const proto = JSON.parse(envelope({ meta: meta() }));
  Object.defineProperty(proto.data, '__proto__', { value: { polluted: true }, enumerable: true });
  assert.equal(Backup.previewBackup(JSON.stringify(proto)).ok, false);
  assert.equal({}.polluted, undefined);
});

test('partial backups rebuild the route from imported growth and preserve absent optional game keys', () => {
  stage(1); stage(2); stage(3);
  const incomingMeta = Meta.getState();
  const text = envelope({ meta: incomingMeta });
  write(BACKUP_KEYS.settings, { volume: 0.1, autoFire: true, reducedMotion: false });
  entries.set(BACKUP_KEYS.tutorial, 'done');
  write(BACKUP_KEYS.campaign, { version: 1, stageResults: { 50: { stars: 3 } } });
  const settings = entries.get(BACKUP_KEYS.settings);
  const preview = Backup.previewBackup(text);
  assert.equal(preview.preview.routeRebuilt, true);
  assert.ok(preview.preview.preserved.includes('声音与操作设置'));
  assert.equal(Backup.restoreBackup(text, store).ok, true);
  assert.equal(entries.get(BACKUP_KEYS.settings), settings);
  assert.equal(entries.get(BACKUP_KEYS.tutorial), 'done');
  assert.equal(Campaign.getState().totalStars, 9);
  assert.equal(Campaign.getState().stageResults[50], undefined);
});

test('explicit null values preview removal and clear only the corresponding game keys', () => {
  write(BACKUP_KEYS.meta, meta({ shadowCores: 88 }));
  write(BACKUP_KEYS.settings, { volume: 1 });
  entries.set(BACKUP_KEYS.tutorial, 'done');
  entries.set('unrelated', 'keep');
  const text = envelope({ meta: null, campaign: null, settings: null, tutorial: null });
  const preview = Backup.previewBackup(text);
  assert.equal(preview.ok, true);
  assert.equal(preview.preview.shadowCores, 0);
  assert.ok(preview.preview.cleared.includes('声音与操作设置'));
  assert.equal(Backup.restoreBackup(text, store).ok, true);
  assert.equal(entries.has(BACKUP_KEYS.meta), false);
  assert.equal(entries.has(BACKUP_KEYS.settings), false);
  assert.equal(entries.has(BACKUP_KEYS.tutorial), false);
  assert.equal(entries.get('unrelated'), 'keep');
});

test('invalid checkpoint cards, inconsistent modes and malformed domain containers are rejected before writing', () => {
  const checkpoint = { version: 1, savedAt: '2026-09-12T00:00:00Z', mode: 'campaign', stageId: 1, level: 1, operativeId: 'ranger',
    endless: false, shadowTrial: false, score: 0, kills: 0, elapsedMs: 0, appliedUpgrades: ['not-a-card'], recorder: new RunRecorder().serialize() };
  for (const patch of [{ checkpoint }, { checkpoint: { ...checkpoint, appliedUpgrades: [], mode: 'endless' } },
    { scores: {} }, { shadowTrials: {} }, { waveSamples: {} }, { settings: [] }, { tutorial: 'wrong' }]) {
    assert.equal(Backup.previewBackup(envelope({ meta: meta(), ...patch })).ok, false);
    assert.equal(entries.size, 0);
  }
});

test('v2 saves migrate through the same Meta and Campaign sanitizers without granting currency', () => {
  const text = envelope({ meta: { version: 2, modules: { armor: 2 }, shadowCores: 17, highestChapterUnlocked: 3, clearedChapters: [1, 2] } });
  const result = Backup.previewBackup(text);
  assert.equal(result.preview.clearedStages, 20);
  assert.equal(result.preview.stars, 20);
  assert.equal(result.preview.shadowCores, 17);
  assert.equal(Backup.restoreBackup(text, store).ok, true);
  assert.equal(Meta.getState().version, 3);
  assert.equal(Meta.getState().shadowCores, 17);
  assert.equal(Campaign.getState().highestUnlockedStage, 21);
});

test('read failure aborts before any writes and future current saves are never overwritten', () => {
  const text = envelope({ meta: meta({ shadowCores: 100 }) });
  let writes = 0;
  const denied = { getItem() { throw new Error('blocked'); }, setItem() { writes++; }, removeItem() { writes++; } };
  assert.equal(Backup.exportBackup(denied).ok, false);
  assert.equal(Backup.restoreBackup(text, denied).rollback, 'not-needed');
  assert.equal(writes, 0);
  write(BACKUP_KEYS.meta, { version: 4, shadowCores: 10000, futureData: true });
  const before = snapshot();
  assert.equal(Backup.restoreBackup(text, store).code, 'newer-current-save');
  assert.deepEqual(snapshot(), before);
});

test('a later failed write rolls back earlier changes and preserves the original byte strings', () => {
  entries.set(BACKUP_KEYS.meta, '{ "version":3, "shadowCores":5, "modules":{} }');
  entries.set(BACKUP_KEYS.campaign, '{"version":1,"stageResults":{}}');
  entries.set(BACKUP_KEYS.settings, '{ "volume":0.2 }');
  const before = snapshot();
  let failed = false;
  const flaky = { ...store, setItem(key, value) {
    if (key === BACKUP_KEYS.settings && !failed) { failed = true; throw new Error('quota'); }
    store.setItem(key, value);
  } };
  const result = Backup.restoreBackup(envelope({ meta: meta({ shadowCores: 90 }), settings: { volume: 0.8 } }), flaky);
  assert.equal(result.ok, false);
  assert.equal(result.rollback, 'complete');
  assert.deepEqual(snapshot(), before);
});

test('rollback handles a storage adapter that writes then throws and a removed key', () => {
  write(BACKUP_KEYS.meta, meta({ shadowCores: 5 }));
  entries.set(BACKUP_KEYS.checkpoint, 'old checkpoint bytes');
  const before = snapshot();
  let failed = false;
  const flaky = { ...store, setItem(key, value) {
    store.setItem(key, value);
    if (key === BACKUP_KEYS.settings && !failed) { failed = true; throw new Error('write then fail'); }
  } };
  const result = Backup.restoreBackup(envelope({ meta: meta({ shadowCores: 77 }), checkpoint: null, settings: { volume: 0.8 } }), flaky);
  assert.equal(result.rollback, 'complete');
  assert.deepEqual(snapshot(), before);
});

test('silent discarded writes are detected and rollback failure is explicitly distinguished from success', () => {
  const text = envelope({ meta: meta({ shadowCores: 80 }), settings: { volume: 0.8 } });
  write(BACKUP_KEYS.meta, meta({ shadowCores: 3 }));
  const ignored = { ...store, setItem() {} };
  assert.equal(Backup.restoreBackup(text, ignored).ok, false);
  assert.equal(Meta.getState().shadowCores, 3);
  let failed = false;
  const unavailableAfterPartial = { ...store, setItem(key, value) {
    if (key === BACKUP_KEYS.settings) failed = true;
    if (failed) throw new Error('all later writes unavailable');
    store.setItem(key, value);
  } };
  const result = Backup.restoreBackup(text, unavailableAfterPartial);
  assert.equal(result.ok, false);
  assert.equal(result.rollback, 'incomplete');
  assert.equal(result.code, 'rollback-failed');
});

test('exports do not silently replace corrupt or future saved data with a fresh-looking backup', () => {
  entries.set(BACKUP_KEYS.meta, '{bad');
  assert.equal(Backup.exportBackup(store).ok, false);
  write(BACKUP_KEYS.meta, meta({ version: 9 }));
  assert.equal(Backup.exportBackup(store).ok, false);
  write(BACKUP_KEYS.meta, meta());
  entries.set(BACKUP_KEYS.settings, 'not-json');
  assert.equal(Backup.exportBackup(store).ok, false);
});

test('restore revalidates modified preview text rather than trusting a mutable prepared object', () => {
  const text = envelope({ meta: meta({ shadowCores: 40 }) });
  assert.equal(Backup.previewBackup(text).ok, true);
  const changed = JSON.parse(text); changed.data.meta.version = 99;
  assert.equal(Backup.restoreBackup(JSON.stringify(changed), store).ok, false);
  assert.equal(entries.size, 0);
});

test('safe endless limits survive Meta, leaderboard and checkpoint backup round-trip while rewards stay capped', () => {
  const state = meta({ bestWave: MAX_ENDLESS_WAVE });
  state.modeProgress.endlessBestWave = MAX_ENDLESS_WAVE;
  write(BACKUP_KEYS.meta, state);
  write(BACKUP_KEYS.scores, [{ score: 1, kills: 1, level: MAX_ENDLESS_LEVEL, wave: MAX_ENDLESS_WAVE, date: '2026-09-12', endless: true }]);
  assert.equal(Checkpoint.save({ level: MAX_ENDLESS_LEVEL, startLevel: 1, operativeId: 'ranger', endless: true, mode: 'endless', shadowTrial: false,
    score: 0, kills: 0, elapsedMs: 0, appliedUpgrades: [], recorder: new RunRecorder().serialize() }), true);
  const exported = Backup.exportBackup(store);
  assert.equal(exported.ok, true);
  entries.clear();
  assert.equal(Backup.restoreBackup(exported.text, store).ok, true);
  assert.equal(Meta.getState().bestWave, MAX_ENDLESS_WAVE);
  assert.equal(Meta.getState().modeProgress.endlessBestWave, MAX_ENDLESS_WAVE);
  assert.equal(Checkpoint.load().level, MAX_ENDLESS_LEVEL);
  assert.equal(JSON.parse(entries.get(BACKUP_KEYS.scores))[0].wave, MAX_ENDLESS_WAVE);
  assert.equal(Meta.recordModeProgress({ mode: 'endless', completionId: 'repeat-maximum', operativeId: 'ranger', wave: MAX_ENDLESS_WAVE }).earned, 0);
});
