import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LakeVoyage, LAKE_WORLD, LAKE_DOCKS, LAKE_ANCHORS, LAKE_LEAVES, LAKE_ROUTES,
  LAKE_INTERACTION_RADIUS, LAKE_LEAF_RADIUS, LAKE_ANCHOR_RADIUS, LAKE_MAX_DELTA_MS,
} from '../systems/LakeVoyage.ts';

const playerAt = dock => ({ ...LAKE_ANCHORS[dock] });
function anchor(model, dock) {
  const result = model.command(playerAt(dock));
  assert.equal(result.ok, true);
  assert.deepEqual(result.target, LAKE_ANCHORS[dock]);
  assert.equal(model.getSnapshot().anchored, false);
  assert.deepEqual(model.update(0, LAKE_ANCHORS[dock], true), []);
  assert.equal(model.getSnapshot().anchored, true);
}
function firstDeparture() {
  const model = new LakeVoyage();
  anchor(model, 'start');
  assert.equal(model.loadLetter(playerAt('start')).ok, true);
  assert.equal(model.depart(playerAt('start')).ok, true);
  return model;
}
function advance(model, milliseconds, echo = LAKE_ANCHORS.start, stays = false) {
  const events = [];
  while (milliseconds > 0) {
    const step = Math.min(milliseconds, LAKE_MAX_DELTA_MS);
    events.push(...model.update(step, echo, stays));
    milliseconds -= step;
  }
  return events;
}
function configureLeaves(model) {
  assert.equal(model.setLeaf('west', 'east', LAKE_LEAVES.west).ok, true);
  assert.equal(model.setLeaf('north', 'north', LAKE_LEAVES.north).ok, true);
}

test('the model publishes one bounded three-dock route with bank-side anchors and two distinct leaf choices', () => {
  assert.deepEqual(LAKE_DOCKS.start, { x: 565, y: 950 });
  assert.deepEqual(LAKE_ANCHORS.start, { x: 470, y: 930 });
  assert.deepEqual(LAKE_DOCKS.mid, { x: 900, y: 700 });
  assert.deepEqual(LAKE_DOCKS.mail, { x: 1390, y: 340 });
  for (const [id, route] of Object.entries(LAKE_ROUTES)) {
    assert.ok(route.durationMs >= 4000 && route.durationMs <= 7000, id);
    assert.deepEqual(route.waypoints[0], LAKE_DOCKS[route.from]);
    assert.deepEqual(route.waypoints.at(-1), LAKE_DOCKS[route.to]);
    assert.ok(route.waypoints.length >= 3 && route.waypoints.length <= 5);
    for (const p of route.waypoints) assert.ok(p.x >= 0 && p.x <= LAKE_WORLD.width && p.y >= 0 && p.y <= LAKE_WORLD.height);
  }
  for (const id of ['start', 'mid', 'mail']) assert.ok(Math.hypot(LAKE_DOCKS[id].x - LAKE_ANCHORS[id].x,
    LAKE_DOCKS[id].y - LAKE_ANCHORS[id].y) < LAKE_INTERACTION_RADIUS);
  for (const leaf of Object.values(LAKE_LEAVES)) {
    assert.equal(leaf.directions.length, 2);
    assert.ok(leaf.directions.includes(leaf.required));
    assert.ok(Math.hypot(leaf.x - LAKE_DOCKS.mid.x, leaf.y - LAKE_DOCKS.mid.y) > LAKE_LEAF_RADIUS + LAKE_INTERACTION_RADIUS,
      'leaf interaction and mid departure cannot be performed from the same place');
  }
});

test('issuing a command or placing an uncommanded echo near the boat cannot load or launch a letter', () => {
  const model = new LakeVoyage();
  model.update(16, LAKE_ANCHORS.start, true);
  assert.equal(model.getSnapshot().anchored, false, 'the current dock must be explicitly assigned');
  assert.equal(model.loadLetter(playerAt('start')).error, 'not-anchored');
  model.command(playerAt('start'));
  assert.equal(model.loadLetter(playerAt('start')).error, 'not-anchored');
  model.update(16, { x: 340, y: 1030 }, true);
  assert.equal(model.getSnapshot().anchored, false, 'an echo still travelling to the anchor has not arrived');
  model.update(16, LAKE_ANCHORS.start, false);
  assert.equal(model.depart(playerAt('start')).error, 'not-anchored');
  model.update(16, LAKE_ANCHORS.start, true);
  assert.equal(model.depart(playerAt('start')).error, 'no-letter');
  assert.equal(model.loadLetter(playerAt('start')).ok, true);
  assert.deepEqual(model.loadLetter(playerAt('start')), { ok: true, duplicate: true });
  assert.equal(model.getSnapshot().midDocked, false);
});

test('dock actions reject a distant player and check the interaction boundary independently of scene input', () => {
  const model = new LakeVoyage();
  const far = { x: 340, y: 1030 };
  assert.equal(model.command(far).error, 'far-from-dock');
  assert.equal(model.getSnapshot().anchorTarget, null);
  anchor(model, 'start');
  assert.equal(model.loadLetter(far).error, 'far-from-dock');
  assert.equal(model.getSnapshot().loaded, false);
  const edge = { x: LAKE_DOCKS.start.x - LAKE_INTERACTION_RADIUS, y: LAKE_DOCKS.start.y };
  assert.equal(model.loadLetter(edge).ok, true);
  assert.equal(model.depart({ ...edge, x: edge.x - .01 }).error, 'far-from-dock');
  assert.equal(model.depart(edge).ok, true);
});

test('anchoring requires the actual echo within 24px and staying, with no stale proof after it leaves', () => {
  const model = new LakeVoyage();
  anchor(model, 'start');
  const edge = { x: LAKE_ANCHORS.start.x + LAKE_ANCHOR_RADIUS, y: LAKE_ANCHORS.start.y };
  model.update(0, edge, true);
  assert.equal(model.getSnapshot().anchored, true);
  model.update(0, { ...edge, x: edge.x + .01 }, true);
  assert.equal(model.getSnapshot().anchored, false);
  assert.equal(model.loadLetter(playerAt('start')).error, 'not-anchored');
  model.update(0, LAKE_ANCHORS.start, 'true');
  assert.equal(model.getSnapshot().anchored, false);
  model.update(0, LAKE_ANCHORS.start, true);
  model.update(0, LAKE_ANCHORS.start, false);
  assert.equal(model.getSnapshot().anchored, false);
});

test('the first voyage really moves through the route and emits midDocked only at its exact final arrival', () => {
  const model = firstDeparture();
  const duration = LAKE_ROUTES['start-mid'].durationMs;
  assert.equal(model.getSnapshot().phase, 'sailing');
  assert.equal(model.getSnapshot().dock, null);
  assert.equal(model.getSnapshot().destination, 'mid');
  assert.deepEqual(advance(model, duration / 2), []);
  const half = model.getSnapshot();
  assert.equal(half.progress, .5);
  assert.notDeepEqual(half.boat, LAKE_DOCKS.start);
  assert.notDeepEqual(half.boat, LAKE_DOCKS.mid);
  assert.equal(half.midDocked, false);
  assert.ok(Number.isFinite(half.heading));
  assert.deepEqual(advance(model, duration / 2 - 1), []);
  assert.equal(model.getSnapshot().phase, 'sailing');
  assert.deepEqual(model.update(1, LAKE_ANCHORS.start, false), ['midDocked']);
  const arrived = model.getSnapshot();
  assert.equal(arrived.phase, 'docked');
  assert.equal(arrived.dock, 'mid');
  assert.equal(arrived.progress, 1);
  assert.equal(arrived.anchored, false, 'a start anchor cannot automatically hold the mid dock');
  assert.deepEqual(arrived.boat, LAKE_DOCKS.mid);
  assert.deepEqual(advance(model, 10000), [], 'there is no repeated arrival or automatic next voyage');
});

test('transit rejects loading, commands, re-departure and leaf changes without changing the ongoing route', () => {
  const model = firstDeparture();
  advance(model, 700);
  const before = model.getSnapshot();
  assert.equal(model.loadLetter(playerAt('start')).error, 'sailing');
  assert.equal(model.command(playerAt('mid')).error, 'sailing');
  assert.equal(model.depart(playerAt('mid')).error, 'sailing');
  assert.equal(model.setLeaf('west', 'east', LAKE_LEAVES.west).error, 'sailing');
  assert.deepEqual(model.getSnapshot(), before);
});

test('the two leaves cannot be preconfigured from start or manipulated remotely at the mid dock', () => {
  const start = new LakeVoyage();
  anchor(start, 'start');
  assert.equal(start.setLeaf('west', 'east', LAKE_LEAVES.west).error, 'wrong-dock');
  const mid = new LakeVoyage('mid');
  assert.equal(mid.setLeaf('west', 'east', LAKE_LEAVES.west).error, 'not-anchored');
  anchor(mid, 'mid');
  assert.equal(mid.loadLetter(playerAt('mid')).error, 'wrong-dock');
  assert.equal(mid.setLeaf('west', 'east', playerAt('mid')).error, 'far-from-leaf');
  assert.equal(mid.setLeaf('north', 'north', playerAt('mid')).error, 'far-from-leaf');
  const westEdge = { x: LAKE_LEAVES.west.x - LAKE_LEAF_RADIUS, y: LAKE_LEAVES.west.y };
  assert.equal(mid.setLeaf('west', 'east', { ...westEdge, x: westEdge.x - .01 }).error, 'far-from-leaf');
  assert.equal(mid.setLeaf('west', 'east', westEdge).ok, true);
});

test('both correct directions are required, and revising a correct leaf to the wrong direction closes the route again', () => {
  const model = new LakeVoyage('mid');
  anchor(model, 'mid');
  assert.equal(model.depart(playerAt('mid')).error, 'route-not-ready');
  assert.equal(model.setLeaf('west', 'east', LAKE_LEAVES.west).ok, true);
  assert.equal(model.depart(playerAt('mid')).error, 'route-not-ready');
  assert.equal(model.setLeaf('north', 'north', LAKE_LEAVES.north).ok, true);
  assert.equal(model.getSnapshot().routeReady, true);
  assert.deepEqual(model.setLeaf('north', 'north', LAKE_LEAVES.north), { ok: true, duplicate: true });
  assert.equal(model.setLeaf('west', 'west', LAKE_LEAVES.west).ok, true);
  assert.equal(model.getSnapshot().routeReady, false);
  assert.equal(model.depart(playerAt('mid')).error, 'route-not-ready');
});

test('after spatially separated leaf work, the player must return to mid and the echo must still hold there', () => {
  const model = new LakeVoyage('mid');
  anchor(model, 'mid');
  configureLeaves(model);
  assert.equal(model.depart(LAKE_LEAVES.north).error, 'far-from-dock');
  assert.equal(model.depart(playerAt('start')).error, 'far-from-dock');
  model.update(0, LAKE_LEAVES.north, true);
  assert.equal(model.depart(playerAt('mid')).error, 'not-anchored');
  assert.equal(model.setLeaf('west', 'west', LAKE_LEAVES.west).error, 'not-anchored');
  model.update(0, LAKE_ANCHORS.mid, true);
  assert.equal(model.getSnapshot().routeReady, true, 'losing the anchor does not silently reset the chosen directions');
  assert.equal(model.depart(playerAt('mid')).ok, true);
});

test('a full two-leg journey emits exactly one event per real dock and cannot depart again from the mailbox', () => {
  const model = firstDeparture();
  const events = advance(model, LAKE_ROUTES['start-mid'].durationMs);
  anchor(model, 'mid'); configureLeaves(model);
  assert.equal(model.depart(playerAt('mid')).ok, true);
  assert.deepEqual(advance(model, LAKE_ROUTES['mid-mail'].durationMs - 1), []);
  assert.equal(model.getSnapshot().mailDocked, false);
  events.push(...model.update(1, LAKE_ANCHORS.mid, true));
  assert.deepEqual(events, ['midDocked', 'mailDocked']);
  assert.equal(model.getSnapshot().dock, 'mail');
  assert.deepEqual(model.getSnapshot().boat, LAKE_DOCKS.mail);
  assert.equal(model.getSnapshot().midDocked, true);
  assert.equal(model.getSnapshot().mailDocked, true);
  assert.equal(model.command(playerAt('mail')).error, 'finished');
  assert.equal(model.loadLetter(playerAt('mail')).error, 'finished');
  assert.equal(model.depart(playerAt('mail')).error, 'finished');
  assert.equal(model.setLeaf('west', 'west', LAKE_LEAVES.west).error, 'finished');
  assert.deepEqual(advance(model, 20000), []);
});

test('safe-dock resume restores ownership and completed arrivals without inventing events or restoring unsafe transient state', () => {
  const mid = new LakeVoyage('mid');
  const resumed = mid.getSnapshot();
  assert.equal(resumed.dock, 'mid');
  assert.equal(resumed.loaded, true);
  assert.equal(resumed.midDocked, true);
  assert.equal(resumed.mailDocked, false);
  assert.equal(resumed.anchored, false);
  assert.equal(resumed.routeReady, false);
  assert.deepEqual(resumed.leaves, { west: 'west', north: 'south' });
  assert.deepEqual(advance(mid, 10000), []);
  const mail = new LakeVoyage('mail');
  assert.equal(mail.getSnapshot().mailDocked, true);
  assert.equal(mail.getSnapshot().loaded, true);
  assert.deepEqual(advance(mail, 10000), []);
  for (const invalid of [undefined, null, {}, 'sailing', 'midDocked', NaN, 2]) {
    const fresh = new LakeVoyage(invalid).getSnapshot();
    assert.equal(fresh.dock, 'start');
    assert.equal(fresh.loaded, false);
    assert.equal(fresh.midDocked, false);
  }
});

test('zero or invalid delta never sails; a huge frame is bounded and cannot manufacture an arrival', () => {
  const model = firstDeparture();
  const initial = model.getSnapshot();
  for (const invalid of [0, -1, -Infinity, Infinity, NaN, undefined, null, '5600']) {
    assert.deepEqual(model.update(invalid, LAKE_ANCHORS.start, true), []);
    assert.deepEqual(model.getSnapshot(), initial);
  }
  assert.deepEqual(model.update(1e12, LAKE_ANCHORS.start, true), []);
  assert.equal(model.getSnapshot().progress, LAKE_MAX_DELTA_MS / LAKE_ROUTES['start-mid'].durationMs);
  assert.equal(model.getSnapshot().midDocked, false);
});

test('malformed actor coordinates or delta fail closed instead of reusing an old anchor proof', () => {
  const model = new LakeVoyage();
  const invalidPoints = [undefined, null, [], {}, { x: NaN, y: 930 }, { x: 470, y: Infinity },
    { x: '470', y: 930 }, { x: -1, y: 930 }, { x: 1801, y: 930 }, { x: 470, y: 1301 }];
  for (const invalid of invalidPoints) {
    assert.equal(model.command(invalid).error, 'invalid-position');
    assert.equal(model.loadLetter(invalid).error, 'invalid-position');
    assert.equal(model.depart(invalid).error, 'invalid-position');
    assert.equal(model.setLeaf('west', 'east', invalid).error, 'invalid-position');
    anchor(model, 'start');
    model.update(0, invalid, true);
    assert.equal(model.getSnapshot().anchored, false);
  }
  anchor(model, 'start');
  model.update(NaN, LAKE_ANCHORS.start, true);
  assert.equal(model.loadLetter(playerAt('start')).error, 'not-anchored');
});

test('unknown leaf identifiers and impossible directions cannot set a ready route', () => {
  const model = new LakeVoyage('mid');
  anchor(model, 'mid');
  const before = model.getSnapshot();
  for (const id of ['start', 'mail', '__proto__', null, undefined]) {
    assert.equal(model.setLeaf(id, 'east', LAKE_LEAVES.west).error, 'invalid-leaf');
  }
  for (const direction of ['north', 'south', 'correct', null, undefined, 1]) {
    assert.equal(model.setLeaf('west', direction, LAKE_LEAVES.west).error, 'invalid-direction');
  }
  for (const direction of ['east', 'west']) assert.equal(model.setLeaf('north', direction, LAKE_LEAVES.north).error, 'invalid-direction');
  assert.deepEqual(model.getSnapshot(), before);
});

test('snapshots and shared route points are deeply readonly and cannot mutate later voyage behavior', () => {
  const model = new LakeVoyage('mid');
  anchor(model, 'mid');
  const snapshot = model.getSnapshot();
  for (const mutation of [() => { snapshot.dock = 'mail'; }, () => { snapshot.boat.x = 0; },
    () => { snapshot.anchorTarget.x = 0; }, () => { snapshot.leaves.west = 'east'; },
    () => { LAKE_ROUTES['start-mid'].waypoints[1].x = 0; },
    () => { LAKE_LEAVES.west.directions.push('north'); }]) assert.throws(mutation, TypeError);
  assert.deepEqual(model.getSnapshot(), snapshot);
  assert.equal(model.getSnapshot().routeReady, false);
});

test('different valid frame partitions reach the same intermediate boat position and pause does not advance it', () => {
  const a = firstDeparture(), b = firstDeparture();
  assert.deepEqual(advance(a, 1600), []);
  for (let i = 0; i < 100; i++) assert.deepEqual(b.update(16, LAKE_ANCHORS.start, false), []);
  assert.deepEqual(a.getSnapshot().boat, b.getSnapshot().boat);
  assert.equal(a.getSnapshot().progress, b.getSnapshot().progress);
  const parked = a.getSnapshot();
  for (let i = 0; i < 100; i++) assert.deepEqual(a.update(0, LAKE_ANCHORS.start, false), []);
  assert.deepEqual(a.getSnapshot(), parked, 'a scene that omits positive updates while paused cannot finish a voyage');
});
