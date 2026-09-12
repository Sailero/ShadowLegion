import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyProgressManager as Journey, JOURNEY_STORAGE_KEY as KEY, MAX_JOURNEY_BYTES, sanitizeJourneyState } from '../systems/JourneyProgressManager.ts';
import { createJourneyState, deriveLakeCheckpoint, deriveMountainCheckpoint, deriveDesertCheckpoint, JOURNEY_REGION_IDS } from '../data/journey.ts';
import { PostalJourneyManager as Forest, POSTAL_JOURNEY_STORAGE_KEY as OLD, POSTAL_ADDRESS_IDS } from '../systems/PostalJourneyManager.ts';

let entries, reads, writes, store;
beforeEach(() => {
  entries = new Map(); reads = []; writes = [];
  store = { getItem(key) { reads.push(key); return entries.get(key) ?? null; },
    setItem(key, value) { writes.push(key); entries.set(key, value); }, removeItem(key) { entries.delete(key); } };
  globalThis.localStorage = store;
});
const forestValue = () => ({ version: 1, foundAddressIds: [...POSTAL_ADDRESS_IDS], deliveryCompleted: true, completionId: 'real-forest-receipt' });
function legacy() { const raw = JSON.stringify(forestValue(), null, 2); entries.set(OLD, raw); return raw; }
function lake() {
  legacy();
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, true);
  assert.equal(Journey.completeNode('lake', 'lake.mailDocked').saved, true);
  assert.equal(Journey.deliver('lake', 'real-lake-receipt').saved, true);
  return Journey.getState();
}
function mountain() {
  lake();
  assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').saved, true);
  assert.equal(Journey.completeNode('mountain', 'mountain.passOpened').saved, true);
  assert.equal(Journey.deliver('mountain', 'real-mountain-receipt').saved, true);
  return Journey.getState();
}

test('journey reads are write-free and old campaign progress never opens the lake or planned regions', () => {
  entries.set('shadowlegion_campaign_v1', JSON.stringify({ version: 1, highestUnlockedStage: 50 }));
  assert.deepEqual(Journey.getState(), createJourneyState());
  assert.equal(Journey.getWriteProtection(), null);
  assert.deepEqual(JOURNEY_REGION_IDS.map(id => Journey.isRegionUnlocked(id)), [true, false, false, false, false]);
  assert.equal(Journey.isRegionUnlocked('__proto__'), false);
  assert.deepEqual(writes, []);
  assert.ok(reads.every(key => [KEY, OLD].includes(key)));
});

test('partial real forest clues derive without migration and cannot manufacture a forest delivery', () => {
  const raw = JSON.stringify({ version: 1, foundAddressIds: ['address'], deliveryCompleted: false, completionId: null });
  entries.set(OLD, raw);
  assert.deepEqual(Journey.getState().regions.forest.completedNodeIds, ['forest.address']);
  assert.equal(Journey.completeNode('forest', 'forest.recipient').saved, false);
  assert.equal(Journey.deliver('forest', 'invented').saved, false);
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').error, 'region-locked');
  assert.deepEqual(writes, []); assert.equal(entries.get(OLD), raw);
});

test('first actual lake save migrates complete legacy proof while preserving every original v1 byte', () => {
  const raw = legacy();
  assert.equal(Journey.isRegionUnlocked('lake'), true);
  assert.equal(Journey.getLakeCheckpoint(), 'start');
  assert.equal(Journey.getState().deliveries.forest.completionId, 'real-forest-receipt');
  assert.equal(entries.has(KEY), false); assert.deepEqual(writes, []);
  const result = Journey.completeNode('lake', 'lake.midDocked');
  assert.equal(result.saved, true); assert.equal(result.duplicate, false);
  assert.equal(Journey.getLakeCheckpoint(), 'mid');
  assert.equal(entries.get(OLD), raw); assert.deepEqual(writes, [KEY]);
  assert.deepEqual(JSON.parse(entries.get(KEY)), result.state);
});

test('an imported empty v2 can later see a real forest completion and persist that proof on the first lake action', () => {
  const originalV2 = JSON.stringify({ ...createJourneyState(), version: 2 }, null, 2); entries.set(KEY, originalV2);
  for (const id of POSTAL_ADDRESS_IDS) assert.equal(Forest.findAddress(id).saved, true);
  assert.equal(Journey.isRegionUnlocked('lake'), false);
  assert.equal(Forest.completeDelivery('later-forest-receipt').saved, true);
  const legacyBytes = entries.get(OLD); writes.length = 0;
  assert.equal(Journey.isRegionUnlocked('lake'), true);
  assert.equal(entries.get(KEY), originalV2); assert.deepEqual(writes, []);
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, true);
  assert.equal(Journey.getState().deliveries.forest.completionId, 'later-forest-receipt');
  assert.equal(entries.get(OLD), legacyBytes); assert.deepEqual(writes, [KEY]);
});

test('legacy clue merging is monotonic but does not infer a delivery from a complete-looking address', () => {
  const state = createJourneyState(); state.regions.forest.completedNodeIds = ['forest.recipient'];
  entries.set(KEY, JSON.stringify(state));
  entries.set(OLD, JSON.stringify({ version: 1, foundAddressIds: ['address', 'landmark'], deliveryCompleted: false, completionId: null }));
  assert.equal(Journey.getState().regions.forest.completedNodeIds.length, 3);
  assert.equal(Journey.isRegionUnlocked('lake'), false); assert.deepEqual(writes, []);
});

test('a durable current forest receipt is independent of missing, corrupt or future v1 records', () => {
  legacy(); assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, true);
  for (const raw of ['{broken', '{"version":99}', null]) {
    if (raw === null) entries.delete(OLD); else entries.set(OLD, raw);
    reads.length = 0;
    assert.equal(Journey.getWriteProtection(), null);
    assert.equal(Journey.isRegionUnlocked('lake'), true);
    assert.deepEqual([...new Set(reads)], [KEY]);
  }
});

test('lake nodes enforce their order and delivery requirements while optional discovery never gates the letter', () => {
  legacy();
  assert.equal(Journey.completeNode('lake', 'lake.mailDocked').error, 'missing-prerequisite');
  assert.equal(Journey.deliver('lake', 'lake-receipt').error, 'missing-prerequisite');
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, true);
  assert.equal(Journey.deliver('lake', 'lake-receipt').saved, false);
  assert.equal(Journey.completeNode('lake', 'lake.mailDocked').saved, true);
  assert.equal(Journey.getLakeCheckpoint(), 'mail');
  assert.equal(Journey.deliver('lake', 'real-forest-receipt').error, 'invalid-completion');
  assert.equal(Journey.deliver('lake', 'lake-receipt').saved, true);
  assert.deepEqual(Journey.getState().optionalDiscoveries, []);
  assert.equal(Journey.discover('lake.picnicCloth').saved, true);
  assert.deepEqual(Journey.getState().optionalDiscoveries, ['lake.picnicCloth']);
  assert.deepEqual(JOURNEY_REGION_IDS.slice(2).map(id => Journey.isRegionUnlocked(id)), [true, false, false]);
});

test('unknown nodes, discoveries, regions and invalid receipt values cannot create a write', () => {
  legacy();
  for (const action of [() => Journey.completeNode('lake', 'forest.address'), () => Journey.completeNode('forest', 'lake.midDocked'),
    () => Journey.completeNode('unknown', 'lake.midDocked'), () => Journey.completeNode('mountain', 'mountain.fake'),
    () => Journey.discover('lake.fake'), () => Journey.discover('__proto__'), () => Journey.deliver('forest', 'forged'),
    () => Journey.deliver('lake', ''), () => Journey.deliver('lake', 'x'.repeat(121)), () => Journey.deliver('snow', 'fake')]) {
    assert.equal(action().saved, false);
  }
  assert.deepEqual(writes, []);
});

test('durable actions and delivery receipts are idempotent without replacing the original receipt', () => {
  lake(); assert.equal(Journey.discover('lake.picnicCloth').saved, true);
  const raw = entries.get(KEY); writes.length = 0;
  for (const result of [Journey.completeNode('lake', 'lake.midDocked'), Journey.completeNode('lake', 'lake.mailDocked'),
    Journey.deliver('lake', 'another-scene-receipt'), Journey.discover('lake.picnicCloth'), Journey.deliver('forest', 'real-forest-receipt')]) {
    assert.equal(result.saved, true); assert.equal(result.duplicate, true);
  }
  assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
});

test('each failed or silently refused milestone remains retryable and never advances its returned checkpoint', () => {
  legacy();
  const actions = [() => Journey.completeNode('lake', 'lake.midDocked'), () => Journey.completeNode('lake', 'lake.mailDocked'),
    () => Journey.deliver('lake', 'lake-failure-retry'), () => Journey.discover('lake.picnicCloth')];
  for (const action of actions) {
    const before = Journey.getState(); const original = entries.get(KEY);
    for (const throwing of [true, false]) {
      globalThis.localStorage = { ...store, setItem() { if (throwing) throw Error('quota'); } };
      const result = action();
      assert.equal(result.saved, false); assert.equal(result.error, 'write-failed');
      assert.deepEqual(result.state, before); assert.equal(entries.get(KEY), original);
    }
    globalThis.localStorage = store;
    assert.equal(action().saved, true);
  }
});

test('a committed value with failed readback is safely confirmed after refresh without repeating the write', () => {
  legacy();
  let denyRead = false;
  globalThis.localStorage = { ...store, getItem(key) { if (denyRead) throw Error('read denied'); return store.getItem(key); },
    setItem(key, value) { store.setItem(key, value); denyRead = true; } };
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, false);
  denyRead = false; globalThis.localStorage = store;
  const result = Journey.completeNode('lake', 'lake.midDocked');
  assert.equal(result.saved, true); assert.equal(result.duplicate, true); assert.deepEqual(writes, [KEY]);
});

test('future, malformed and oversized current domains are preserved instead of falling back over them', () => {
  legacy();
  for (const raw of ['{"version":5,"future":"keep"}', '{broken', JSON.stringify({ ...createJourneyState(), regions: {} }), ' '.repeat(MAX_JOURNEY_BYTES + 1)]) {
    entries.set(KEY, raw);
    assert.ok(Journey.getWriteProtection());
    assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, false);
    assert.equal(entries.get(KEY), raw);
  }
  assert.deepEqual(writes, []);
  entries.delete(KEY); entries.set(OLD, '{"version":2}');
  assert.equal(Journey.getWriteProtection(), 'future-version');
  globalThis.localStorage = { ...store, getItem() { throw Error('unavailable'); } };
  assert.equal(Journey.getWriteProtection(), 'storage-unavailable');
  assert.equal(Journey.discover('lake.picnicCloth').saved, false);
});

test('write-before-read comparison detects a changing legacy proof or a newly arrived future journey', () => {
  legacy();
  let readsOfNew = 0;
  globalThis.localStorage = { ...store, getItem(key) {
    if (key === KEY && ++readsOfNew === 2) entries.set(OLD, JSON.stringify({ ...forestValue(), completionId: 'concurrent-forest' }));
    return store.getItem(key);
  } };
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').error, 'save-changed');
  assert.deepEqual(writes, []);
  readsOfNew = 0;
  globalThis.localStorage = { ...store, getItem(key) {
    if (key === KEY && ++readsOfNew === 2) entries.set(KEY, '{"version":9,"future":"keep"}');
    return store.getItem(key);
  } };
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').error, 'future-version');
  assert.equal(entries.get(KEY), '{"version":9,"future":"keep"}'); assert.deepEqual(writes, []);
});

test('journey sanitizer rejects forged dependencies and planned content, while dropping transient or executable extras', () => {
  const valid = lake();
  for (const change of [state => { state.version = 5; }, state => { delete state.deliveries.forest; },
    state => { state.regions.lake.completedNodeIds = ['lake.mailDocked']; },
    state => { state.regions.forest.completedNodeIds = []; }, state => { state.regions.mountain.completedNodeIds = ['fake']; },
    state => { state.deliveries.mountain = { completionId: 'planned' }; },
    state => { state.deliveries.lake.completionId = state.deliveries.forest.completionId; },
    state => { state.optionalDiscoveries = ['unknown']; }, state => { state.regions.lake.completedNodeIds.push('lake.midDocked'); },
    state => { Object.defineProperty(state.regions, '__proto__', { value: {}, enumerable: true }); }]) {
    const bad = structuredClone(valid); change(bad); assert.equal(sanitizeJourneyState(bad), null);
  }
  const extras = { ...valid, boatX: 123, playerY: 88, execute: '<script>bad</script>' };
  assert.deepEqual(sanitizeJourneyState(extras), valid);
  assert.equal(deriveLakeCheckpoint(valid), 'mail');
  const copy = Journey.getState(); copy.deliveries.lake.completionId = 'changed-outside';
  assert.equal(Journey.getState().deliveries.lake.completionId, 'real-lake-receipt');
});

test('valid v2 reads migrate only in memory until the first successful current mountain write', () => {
  const state = lake(); const oldForest = entries.get(OLD);
  const rawV2 = JSON.stringify({ ...state, version: 2 }, null, 2); entries.set(KEY, rawV2);
  // A durable v2 forest receipt needs no further access to the original forest key.
  entries.set(OLD, '{broken-after-v2-migration'); writes.length = 0; reads.length = 0;
  assert.deepEqual(Journey.getState(), state);
  assert.equal(Journey.getState().version, 4);
  assert.equal(Journey.isRegionUnlocked('mountain'), true);
  assert.equal(Journey.getMountainCheckpoint(), 'trailhead');
  assert.equal(entries.get(KEY), rawV2); assert.deepEqual(writes, []);
  assert.ok(reads.every(key => key === KEY));
  for (const silent of [true, false]) {
    globalThis.localStorage = { ...store, setItem() { if (!silent) throw Error('quota'); } };
    assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').error, 'write-failed');
    assert.equal(entries.get(KEY), rawV2); assert.equal(Journey.getMountainCheckpoint(), 'trailhead');
  }
  globalThis.localStorage = store; entries.set(OLD, oldForest);
  assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').saved, true);
  assert.equal(JSON.parse(entries.get(KEY)).version, 4);
  assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
  assert.equal(entries.get(OLD), oldForest); assert.deepEqual(writes, [KEY]);
});

test('an explicit duplicate v2 action migrates once without replacing its delivery receipt', () => {
  const state = lake(); const raw = JSON.stringify({ ...state, version: 2 }); entries.set(KEY, raw); writes.length = 0;
  globalThis.localStorage = { ...store, setItem() {} };
  assert.equal(Journey.deliver('lake', 'new-scene-receipt').saved, false);
  assert.equal(entries.get(KEY), raw);
  globalThis.localStorage = store;
  const result = Journey.deliver('lake', 'new-scene-receipt');
  assert.equal(result.saved, true); assert.equal(result.duplicate, true);
  assert.equal(result.state.version, 4); assert.equal(result.state.deliveries.lake.completionId, 'real-lake-receipt');
  assert.equal(Journey.deliver('lake', 'yet-another-receipt').duplicate, true);
  assert.deepEqual(writes, [KEY]);
});

test('only a real lake delivery opens ordered mountain milestones and only its actual handover opens desert', () => {
  legacy();
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, true);
  assert.equal(Journey.completeNode('lake', 'lake.mailDocked').saved, true);
  entries.set('shadowlegion_campaign_v1', JSON.stringify({ version: 1, highestUnlockedStage: 50 }));
  assert.equal(Journey.isRegionUnlocked('mountain'), false);
  assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').error, 'region-locked');
  assert.equal(Journey.discover('mountain.sharedChime').error, 'region-locked');
  assert.equal(Journey.deliver('lake', 'actual-lake-receipt').saved, true);
  assert.equal(Journey.isRegionUnlocked('mountain'), true);
  assert.equal(Journey.discover('mountain.sharedChime').error, 'missing-prerequisite');
  assert.equal(Journey.getMountainCheckpoint(), 'trailhead');
  assert.equal(Journey.completeNode('mountain', 'mountain.passOpened').error, 'missing-prerequisite');
  assert.equal(Journey.deliver('mountain', 'mountain-receipt').error, 'missing-prerequisite');
  assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').saved, true);
  assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
  assert.equal(Journey.deliver('mountain', 'mountain-receipt').error, 'missing-prerequisite');
  assert.equal(Journey.completeNode('mountain', 'mountain.passOpened').saved, true);
  assert.equal(Journey.getMountainCheckpoint(), 'mailbox');
  for (const reused of ['real-forest-receipt', 'actual-lake-receipt']) {
    assert.equal(Journey.deliver('mountain', reused).error, 'invalid-completion');
  }
  assert.equal(Journey.deliver('mountain', 'mountain-receipt').saved, true);
  assert.deepEqual(Journey.getState().optionalDiscoveries, []);
  assert.deepEqual(JOURNEY_REGION_IDS.map(id => Journey.isRegionUnlocked(id)), [true, true, true, true, false]);
  assert.equal(Journey.deliver('desert', 'cannot-bypass-next-region').error, 'missing-prerequisite');
  assert.equal(Journey.deliver('snow', 'cannot-skip-region').error, 'region-locked');
});

test('mountain node, discovery and letter writes are retryable and duplicates retain the original proof', () => {
  lake();
  const actions = [() => Journey.completeNode('mountain', 'mountain.signalLearned'), () => Journey.discover('mountain.sharedChime'),
    () => Journey.completeNode('mountain', 'mountain.passOpened'), () => Journey.deliver('mountain', 'mountain-saved')];
  for (const action of actions) {
    const state = Journey.getState(); const raw = entries.get(KEY);
    for (const silent of [true, false]) {
      globalThis.localStorage = { ...store, setItem() { if (!silent) throw Error('quota'); } };
      const result = action();
      assert.equal(result.saved, false); assert.equal(result.error, 'write-failed');
      assert.deepEqual(result.state, state); assert.equal(entries.get(KEY), raw);
    }
    globalThis.localStorage = store;
    assert.equal(action().saved, true);
  }
  const raw = entries.get(KEY); writes.length = 0;
  for (const action of actions) {
    const result = action(); assert.equal(result.saved, true); assert.equal(result.duplicate, true);
  }
  assert.equal(Journey.deliver('mountain', 'replacement-not-stored').duplicate, true);
  assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
  assert.equal(deriveMountainCheckpoint(Journey.getState()), 'mailbox');
});

test('failed mountain receipt readback does not claim success and a refreshed retry confirms its single stored proof', () => {
  lake(); Journey.completeNode('mountain', 'mountain.signalLearned'); Journey.completeNode('mountain', 'mountain.passOpened');
  const previous = Journey.getState(); writes.length = 0; let committed = false;
  globalThis.localStorage = { ...store,
    getItem(key) { if (committed) throw Error('readback denied'); return store.getItem(key); },
    setItem(key, value) { store.setItem(key, value); committed = true; },
  };
  const result = Journey.deliver('mountain', 'receipt-with-lost-ack');
  assert.equal(result.saved, false); assert.equal(result.error, 'write-failed'); assert.deepEqual(result.state, previous);
  globalThis.localStorage = store;
  assert.equal(Journey.deliver('mountain', 'receipt-with-lost-ack').duplicate, true);
  assert.equal(Journey.getState().deliveries.mountain.completionId, 'receipt-with-lost-ack');
  assert.deepEqual(writes, [KEY]);
});

test('concurrent v2, v3 and v4 writes are preserved and retried against the latest journey', () => {
  const state = lake();
  for (const version of [2, 3, 4]) {
    const old = { ...structuredClone(state), version }; entries.set(KEY, JSON.stringify(old));
    const incoming = structuredClone(old); incoming.optionalDiscoveries = ['lake.picnicCloth'];
    const incomingRaw = JSON.stringify(incoming, null, 2); let keyReads = 0; writes.length = 0;
    globalThis.localStorage = { ...store, getItem(key) {
      if (key === KEY && ++keyReads === 2) entries.set(KEY, incomingRaw);
      return store.getItem(key);
    } };
    const result = Journey.completeNode('mountain', 'mountain.signalLearned');
    assert.equal(result.saved, false); assert.equal(result.error, 'save-changed');
    assert.equal(entries.get(KEY), incomingRaw); assert.deepEqual(writes, []);
    globalThis.localStorage = store;
    assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').saved, true);
    assert.deepEqual(Journey.getState().optionalDiscoveries, ['lake.picnicCloth']);
    assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
  }
});

test('the v2 allowlist cannot smuggle later mountain progress into the current migration', () => {
  const old = { ...lake(), version: 2 };
  assert.equal(sanitizeJourneyState(old).version, 4);
  for (const mutate of [state => { state.regions.mountain.completedNodeIds = ['mountain.signalLearned']; },
    state => { state.deliveries.mountain = { completionId: 'forged-v2' }; },
    state => { state.optionalDiscoveries = ['mountain.sharedChime']; },
    state => { state.optionalDiscoveries = ['lake.picnicCloth', 'mountain.sharedChime']; }]) {
    const bad = structuredClone(old); mutate(bad); const raw = JSON.stringify(bad); entries.set(KEY, raw); writes.length = 0;
    assert.equal(sanitizeJourneyState(bad), null); assert.equal(Journey.getWriteProtection(), 'invalid-save');
    assert.equal(Journey.completeNode('mountain', 'mountain.signalLearned').saved, false);
    assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
  }
});

test('current sanitizer rejects mountain dependency, order and receipt forgeries while retaining only stable state', () => {
  lake(); Journey.completeNode('mountain', 'mountain.signalLearned'); Journey.completeNode('mountain', 'mountain.passOpened');
  Journey.deliver('mountain', 'valid-mountain'); Journey.discover('mountain.sharedChime');
  const valid = Journey.getState();
  for (const mutate of [state => { delete state.deliveries.lake; }, state => { delete state.deliveries.forest; },
    state => { state.regions.mountain.completedNodeIds = ['mountain.passOpened']; },
    state => { state.regions.mountain.completedNodeIds = ['mountain.signalLearned']; },
    state => { state.regions.mountain.completedNodeIds.push('mountain.passOpened'); },
    state => { state.deliveries.mountain.completionId = state.deliveries.forest.completionId; },
    state => { state.deliveries.mountain.completionId = state.deliveries.lake.completionId; },
    state => { state.deliveries.mountain.completionId = 'bad receipt'; },
    state => { state.deliveries.desert = { completionId: 'future-region' }; },
    state => { state.optionalDiscoveries.push('mountain.sharedChime'); }]) {
    const bad = structuredClone(valid); mutate(bad); assert.equal(sanitizeJourneyState(bad), null);
  }
  const extra = { ...valid, playerX: 14, playerY: 48, echoAt: { x: 7, y: 9 }, movingLift: 0.4 };
  extra.regions = structuredClone(valid.regions); extra.regions.mountain.platformPosition = 0.4;
  assert.deepEqual(sanitizeJourneyState(extra), valid);
});

test('a mountain postcard without the saved first relay is impossible even when a real lake receipt exists', () => {
  const valid = lake(); writes.length = 0;
  assert.equal(Journey.discover('mountain.sharedChime').error, 'missing-prerequisite');
  assert.deepEqual(writes, []);
  const forged = { ...valid, optionalDiscoveries: ['mountain.sharedChime'] };
  assert.equal(sanitizeJourneyState(forged), null);
  const raw = JSON.stringify(forged); entries.set(KEY, raw);
  assert.equal(Journey.getWriteProtection(), 'invalid-save');
  assert.equal(Journey.discover('mountain.sharedChime').saved, false);
  assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
});

test('valid v3 mountain progress remains byte-identical until a confirmed v4 desert save', () => {
  const state = mountain(); Journey.discover('mountain.sharedChime');
  const current = Journey.getState(), forestRaw = entries.get(OLD);
  const oldRaw = JSON.stringify({ ...current, version: 3 }, null, 2); entries.set(KEY, oldRaw); writes.length = 0;
  for (const legacyRaw of [null, '{broken', '{"version":99}']) {
    if (legacyRaw === null) entries.delete(OLD); else entries.set(OLD, legacyRaw);
    reads.length = 0;
    assert.equal(Journey.getWriteProtection(), null); assert.deepEqual(Journey.getState(), current);
    assert.equal(Journey.getState().version, 4); assert.equal(Journey.isRegionUnlocked('desert'), true);
    assert.ok(reads.every(key => key === KEY)); assert.equal(entries.get(KEY), oldRaw); assert.deepEqual(writes, []);
  }
  entries.set(OLD, forestRaw);
  for (const throwing of [true, false]) {
    globalThis.localStorage = { ...store, setItem() { if (throwing) throw Error('quota'); } };
    assert.equal(Journey.completeNode('desert', 'desert.coverLearned').error, 'write-failed');
    assert.equal(entries.get(KEY), oldRaw); assert.equal(Journey.getDesertCheckpoint(), 'trailhead');
  }
  globalThis.localStorage = store;
  assert.equal(Journey.completeNode('desert', 'desert.coverLearned').saved, true);
  assert.equal(JSON.parse(entries.get(KEY)).version, 4); assert.equal(entries.get(OLD), forestRaw);
  assert.deepEqual(Journey.getState().deliveries, state.deliveries); assert.deepEqual(writes, [KEY]);
});

test('an explicit v3 duplicate confirms migration once without replacing mountain or forest receipts', () => {
  const state = mountain(); const raw = JSON.stringify({ ...state, version: 3 }); entries.set(KEY, raw); writes.length = 0;
  const result = Journey.deliver('mountain', 'new-session-id');
  assert.equal(result.saved, true); assert.equal(result.duplicate, true); assert.equal(result.state.version, 4);
  assert.deepEqual(result.state.deliveries, state.deliveries);
  assert.equal(Journey.completeNode('mountain', 'mountain.passOpened').duplicate, true); assert.deepEqual(writes, [KEY]);
});

test('desert needs the actual mountain receipt, then three ordered nodes derive four safe checkpoints', () => {
  lake(); Journey.completeNode('mountain', 'mountain.signalLearned'); Journey.completeNode('mountain', 'mountain.passOpened');
  entries.set('shadowlegion_campaign_v1', JSON.stringify({ version: 1, highestUnlockedStage: 50 }));
  assert.equal(Journey.isRegionUnlocked('desert'), false);
  assert.equal(Journey.completeNode('desert', 'desert.coverLearned').error, 'region-locked');
  assert.equal(Journey.discover('desert.sixthCushion').error, 'region-locked');
  Journey.deliver('mountain', 'real-mountain-receipt');
  assert.equal(Journey.isRegionUnlocked('desert'), true); assert.equal(Journey.getDesertCheckpoint(), 'trailhead');
  for (const node of ['desert.courtyardAligned', 'desert.addressRead']) assert.equal(Journey.completeNode('desert', node).error, 'missing-prerequisite');
  for (const [node, checkpoint] of [['desert.coverLearned', 'stoneCamp'], ['desert.courtyardAligned', 'courtyard'], ['desert.addressRead', 'mailbox']]) {
    assert.equal(Journey.deliver('desert', 'real-desert-receipt').error, 'missing-prerequisite');
    assert.equal(Journey.discover('desert.sixthCushion').error, 'missing-prerequisite');
    assert.equal(Journey.completeNode('desert', node).saved, true);
    assert.equal(Journey.getDesertCheckpoint(), checkpoint); assert.equal(deriveDesertCheckpoint(Journey.getState()), checkpoint);
  }
  for (const receipt of ['real-forest-receipt', 'real-lake-receipt', 'real-mountain-receipt']) {
    assert.equal(Journey.deliver('desert', receipt).error, 'invalid-completion');
  }
  assert.deepEqual(Journey.getState().optionalDiscoveries, []);
  assert.equal(Journey.deliver('desert', 'real-desert-receipt').saved, true);
  assert.equal(Journey.discover('desert.sixthCushion').saved, true);
  assert.deepEqual(JOURNEY_REGION_IDS.map(id => Journey.isRegionUnlocked(id)), [true, true, true, true, false]);
  assert.equal(Journey.deliver('snow', 'not-yet-playable').error, 'region-locked');
});

test('every desert milestone, optional find and delivery retries refused writes and preserves its first receipt', () => {
  mountain();
  const actions = [() => Journey.completeNode('desert', 'desert.coverLearned'), () => Journey.completeNode('desert', 'desert.courtyardAligned'),
    () => Journey.completeNode('desert', 'desert.addressRead'), () => Journey.discover('desert.sixthCushion'), () => Journey.deliver('desert', 'desert-retry')];
  for (const action of actions) {
    const before = Journey.getState(), raw = entries.get(KEY);
    for (const throwing of [true, false]) {
      globalThis.localStorage = { ...store, setItem() { if (throwing) throw Error('quota'); } };
      const result = action(); assert.equal(result.saved, false); assert.equal(result.error, 'write-failed');
      assert.deepEqual(result.state, before); assert.equal(entries.get(KEY), raw);
    }
    globalThis.localStorage = store; assert.equal(action().saved, true);
  }
  const raw = entries.get(KEY); writes.length = 0;
  for (const action of actions) { const result = action(); assert.equal(result.saved, true); assert.equal(result.duplicate, true); }
  assert.equal(Journey.deliver('desert', 'different-session-receipt').duplicate, true);
  assert.equal(Journey.getState().deliveries.desert.completionId, 'desert-retry'); assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
});

test('lost readback on the final address or handover can confirm the actual durable desert result without a second write', () => {
  mountain(); Journey.completeNode('desert', 'desert.coverLearned'); Journey.completeNode('desert', 'desert.courtyardAligned');
  for (const action of [() => Journey.completeNode('desert', 'desert.addressRead'), () => Journey.deliver('desert', 'desert-lost-ack')]) {
    const before = Journey.getState(); writes.length = 0; let committed = false;
    globalThis.localStorage = { ...store, getItem(key) { if (committed) throw Error('lost ack'); return store.getItem(key); },
      setItem(key, value) { store.setItem(key, value); committed = true; } };
    const result = action(); assert.equal(result.saved, false); assert.deepEqual(result.state, before);
    globalThis.localStorage = store;
    const retry = action(); assert.equal(retry.saved, true); assert.equal(retry.duplicate, true); assert.deepEqual(writes, [KEY]);
  }
  assert.equal(Journey.getDesertCheckpoint(), 'mailbox'); assert.equal(Journey.getState().deliveries.desert.completionId, 'desert-lost-ack');
});

test('strict v2 and v3 historical allowlists reject later desert data instead of silently upgrading it', () => {
  const oldLake = lake(), oldMountain = mountain();
  for (const [version, prior] of [[2, oldLake], [3, oldMountain]]) {
    for (const change of [state => { state.regions.desert.completedNodeIds = ['desert.coverLearned']; },
      state => { state.deliveries.desert = { completionId: 'forged-old-receipt' }; },
      state => { state.optionalDiscoveries = ['desert.sixthCushion']; }]) {
      const invalid = { ...structuredClone(prior), version }; change(invalid);
      const raw = JSON.stringify(invalid); entries.set(KEY, raw); writes.length = 0;
      assert.equal(sanitizeJourneyState(invalid), null); assert.equal(Journey.getWriteProtection(), 'invalid-save');
      assert.equal(Journey.completeNode('desert', 'desert.coverLearned').saved, false);
      assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
    }
  }
});

test('v4 rejects impossible desert dependencies and transient state cannot become a saved position', () => {
  mountain(); Journey.completeNode('desert', 'desert.coverLearned'); Journey.completeNode('desert', 'desert.courtyardAligned');
  Journey.completeNode('desert', 'desert.addressRead'); Journey.deliver('desert', 'valid-desert'); Journey.discover('desert.sixthCushion');
  const valid = Journey.getState();
  for (const change of [state => { delete state.deliveries.mountain; }, state => { delete state.deliveries.lake; },
    state => { state.regions.desert.completedNodeIds = ['desert.courtyardAligned', 'desert.addressRead']; },
    state => { state.regions.desert.completedNodeIds = ['desert.coverLearned', 'desert.addressRead']; },
    state => { state.regions.desert.completedNodeIds = ['desert.coverLearned', 'desert.courtyardAligned']; delete state.deliveries.desert; },
    state => { state.regions.desert.completedNodeIds.push('desert.addressRead'); },
    state => { state.regions.desert.completedNodeIds = ['mountain.passOpened']; },
    state => { state.deliveries.desert.completionId = state.deliveries.mountain.completionId; },
    state => { state.deliveries.desert.completionId = 'unsafe receipt'; },
    state => { state.deliveries.snow = { completionId: 'unimplemented' }; },
    state => { state.version = 5; }]) {
    const invalid = structuredClone(valid); change(invalid); assert.equal(sanitizeJourneyState(invalid), null);
  }
  assert.deepEqual(sanitizeJourneyState({ ...valid, canopyAngle: 90, player: { x: 9, y: 8 }, heldCorner: 'left' }), valid);
});

test('desert writes detect a concurrent v3 or v4 update and keep its newly saved optional discovery on retry', () => {
  const valid = mountain();
  for (const version of [3, 4]) {
    const old = { ...structuredClone(valid), version }; entries.set(KEY, JSON.stringify(old));
    const incoming = structuredClone(old); incoming.optionalDiscoveries = ['mountain.sharedChime'];
    const raw = JSON.stringify(incoming, null, 2); let count = 0; writes.length = 0;
    globalThis.localStorage = { ...store, getItem(key) { if (key === KEY && ++count === 2) entries.set(KEY, raw); return store.getItem(key); } };
    assert.equal(Journey.completeNode('desert', 'desert.coverLearned').error, 'save-changed');
    assert.equal(entries.get(KEY), raw); assert.deepEqual(writes, []);
    globalThis.localStorage = store; assert.equal(Journey.completeNode('desert', 'desert.coverLearned').saved, true);
    assert.deepEqual(Journey.getState().optionalDiscoveries, ['mountain.sharedChime']);
  }
});
