import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyProgressManager as Journey, JOURNEY_STORAGE_KEY as KEY, MAX_JOURNEY_BYTES, sanitizeJourneyState } from '../systems/JourneyProgressManager.ts';
import { createJourneyState, deriveLakeCheckpoint, JOURNEY_REGION_IDS } from '../data/journey.ts';
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
  const originalV2 = JSON.stringify(createJourneyState(), null, 2); entries.set(KEY, originalV2);
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

test('a durable v2 forest receipt is independent of missing, corrupt or future v1 records', () => {
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
  assert.deepEqual(JOURNEY_REGION_IDS.slice(2).map(id => Journey.isRegionUnlocked(id)), [false, false, false]);
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
  for (const raw of ['{"version":3,"future":"keep"}', '{broken', JSON.stringify({ ...createJourneyState(), regions: {} }), ' '.repeat(MAX_JOURNEY_BYTES + 1)]) {
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

test('write-before-read comparison detects a changing legacy proof or a newly arrived future v2', () => {
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
  for (const change of [state => { state.version = 3; }, state => { delete state.deliveries.forest; },
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
