import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { LakeScene } = await import('../scenes/LakeScene.ts');
const { LakeVoyage, LAKE_DOCKS, LAKE_ANCHORS, LAKE_LEAVES, LAKE_ROUTES } = await import('../systems/LakeVoyage.ts');
const { JourneyProgressManager: Journey, JOURNEY_STORAGE_KEY: KEY } = await import('../systems/JourneyProgressManager.ts');
const { PostalJourneyManager: Forest, POSTAL_ADDRESS_IDS } = await import('../systems/PostalJourneyManager.ts');
const { SoundManager } = await import('../systems/SoundManager.ts');
const { LAKE_BOARDWALKS } = await import('../ui/lakePaint.ts');

// Real scene/controller methods, real voyage and real journey persistence.
// Only draw calls, animator celebration and audio output are bounded here.
// Position changes represent supplied world coordinates, not simulated physics,
// native input, water rendering or a claim of a completed graphical playthrough.
let entries, writes, failWrites, failNextReadback, readbackArmed, cues;
beforeEach(t => {
  entries = new Map(); writes = []; cues = [];
  failWrites = failNextReadback = readbackArmed = false;
  globalThis.localStorage = {
    getItem(key) {
      if (key === KEY && readbackArmed) { readbackArmed = false; throw new Error('injected readback failure'); }
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push({ key, value });
      if (key === KEY && failWrites) throw new Error('injected journey write refusal');
      entries.set(key, String(value));
      if (key === KEY && failNextReadback) { failNextReadback = false; readbackArmed = true; }
    },
    removeItem: key => entries.delete(key),
  };
  t.mock.method(SoundManager, 'get', () => ({ postalCue: cue => cues.push(cue) }));
  for (const id of POSTAL_ADDRESS_IDS) assert.equal(Forest.findAddress(id).saved, true);
  assert.equal(Forest.completeDelivery('lake-scene-real-forest').saved, true);
  writes.length = 0;
});

function textBoundary() {
  return { value: '', setText(value) { this.value = value; return this; }, setColor() { return this; } };
}
function graphicsBoundary(rectangles = []) {
  const g = new Proxy({}, { get: (_target, name) => (...args) => {
    if (name === 'fillRect') rectangles.push(args);
    return g;
  } });
  return g;
}
function sceneBoundary() {
  const s = new LakeScene();
  const notices = [], celebrations = { cat: 0, echo: 0 }, rectangles = [];
  s.state = Journey.getState(); s.pendingNode = null;
  s.voyage = new LakeVoyage(Journey.getLakeCheckpoint(s.state));
  s.receipt = 'lake-scene-delivery'; s.paintedState = '';
  s.cat = { ...LAKE_ANCHORS.start };
  s.echo = { x: 420, y: 930 }; s.echoStays = false;
  s.catAnimator = { celebrate: () => celebrations.cat++ };
  s.echoAnimator = { celebrate: () => celebrations.echo++ };
  s.say = (value, duration) => notices.push({ value, duration });
  s.boat = { x: 0, y: 0, setPosition(x, y) { this.x = x; this.y = y; return this; } };
  s.envelope = { visible: false, setVisible(value) { this.visible = value; return this; } };
  s.routeArt = graphicsBoundary(); s.anchorArt = graphicsBoundary(); s.bridgeArt = graphicsBoundary(rectangles);
  s.leafLabels = new Map([['west', textBoundary()], ['north', textBoundary()]]);
  s.picnicLabel = textBoundary(); s.objective = textBoundary(); s.hint = textBoundary();
  return { s, notices, celebrations, rectangles };
}
function putCat(s, point) { Object.assign(s.cat, point); }
function anchorScene(s, dock) {
  putCat(s, LAKE_ANCHORS[dock]);
  if (s.echoStays) s.command(); // The real command first recalls a previous assignment.
  s.command();
  assert.equal(s.echoStays, true);
  assert.deepEqual(s.voyage.getSnapshot().anchorTarget, LAKE_ANCHORS[dock]);
  Object.assign(s.echo, LAKE_ANCHORS[dock]);
  s.tickJourney(0);
  assert.equal(s.voyage.getSnapshot().anchored, true);
}
function beginFirstLeg(s) {
  anchorScene(s, 'start');
  s.interact(); assert.equal(s.voyage.getSnapshot().loaded, true);
  s.interact(); assert.equal(s.voyage.getSnapshot().phase, 'sailing');
}
function tickFor(s, duration) {
  while (duration > 0) { const delta = Math.min(100, duration); s.tickJourney(delta); duration -= delta; }
}
function dockAtMid(s) {
  beginFirstLeg(s); tickFor(s, LAKE_ROUTES['start-mid'].durationMs);
  assert.equal(s.voyage.getSnapshot().dock, 'mid');
}
function configureSecondLeg(s) {
  anchorScene(s, 'mid');
  putCat(s, LAKE_LEAVES.west); s.interact();
  putCat(s, LAKE_LEAVES.north); s.interact();
  assert.equal(s.voyage.getSnapshot().routeReady, true);
  putCat(s, LAKE_ANCHORS.mid); s.interact();
  assert.equal(s.voyage.getSnapshot().phase, 'sailing');
}
function dockAtMail(s) {
  dockAtMid(s); configureSecondLeg(s); tickFor(s, LAKE_ROUTES['mid-mail'].durationMs);
  assert.equal(s.voyage.getSnapshot().dock, 'mail');
}

test('real mid arrival retains pendingNode across persistent write failure and F cannot configure leaves or depart', () => {
  const { s, notices } = sceneBoundary();
  beginFirstLeg(s); failWrites = true;
  tickFor(s, LAKE_ROUTES['start-mid'].durationMs);
  assert.equal(s.pendingNode, 'lake.midDocked');
  assert.equal(s.voyage.getSnapshot().midDocked, true);
  assert.equal(Journey.getLakeCheckpoint(), 'start');
  assert.deepEqual(s.state.regions.lake.completedNodeIds, []);
  assert.equal(cues.filter(cue => cue === 'address').length, 0);
  assert.match(s.objective.value, /尚未确认/);
  const attempts = writes.filter(write => write.key === KEY).length;
  tickFor(s, 1000);
  assert.equal(writes.filter(write => write.key === KEY).length, attempts, 'one real arrival does not spam storage on later frames');
  anchorScene(s, 'mid');
  putCat(s, LAKE_LEAVES.west); s.interact();
  assert.equal(s.pendingNode, 'lake.midDocked');
  assert.equal(s.voyage.getSnapshot().leaves.west, 'west', 'F is consumed by the unresolved landing save');
  putCat(s, LAKE_ANCHORS.mid); s.interact();
  assert.equal(s.voyage.getSnapshot().phase, 'docked');
  assert.equal(s.pendingNode, 'lake.midDocked');
  assert.ok(notices.some(notice => /按 F 重试/.test(notice.value)));
});

test('F confirms the pending real mid landing once and only a later F may perform its normal local action', () => {
  const { s } = sceneBoundary();
  beginFirstLeg(s); failWrites = true;
  tickFor(s, LAKE_ROUTES['start-mid'].durationMs);
  anchorScene(s, 'mid'); putCat(s, LAKE_LEAVES.west);
  failWrites = false; s.interact();
  assert.equal(s.pendingNode, null);
  assert.equal(Journey.getLakeCheckpoint(), 'mid');
  assert.deepEqual(s.state.regions.lake.completedNodeIds, ['lake.midDocked']);
  assert.equal(s.voyage.getSnapshot().leaves.west, 'west', 'the retry does not also toggle the leaf under the player');
  assert.equal(cues.filter(cue => cue === 'address').length, 1);
  s.interact();
  assert.equal(s.voyage.getSnapshot().leaves.west, 'east');
  putCat(s, LAKE_LEAVES.north); s.interact();
  putCat(s, LAKE_ANCHORS.mid); s.interact();
  assert.equal(s.voyage.getSnapshot().destination, 'mail');
  assert.deepEqual(Journey.getState().regions.lake.completedNodeIds, ['lake.midDocked']);
});

test('write success followed by landing readback failure retries the durable real node without a second arrival', () => {
  const { s } = sceneBoundary();
  beginFirstLeg(s); failNextReadback = true;
  tickFor(s, LAKE_ROUTES['start-mid'].durationMs);
  assert.equal(s.pendingNode, 'lake.midDocked');
  assert.equal(Journey.getLakeCheckpoint(), 'mid', 'the injected failure follows a real persisted write');
  assert.equal(cues.filter(cue => cue === 'address').length, 0);
  const durable = entries.get(KEY), count = writes.filter(write => write.key === KEY).length;
  s.interact();
  assert.equal(s.pendingNode, null);
  assert.equal(cues.filter(cue => cue === 'address').length, 1);
  assert.equal(entries.get(KEY), durable);
  assert.equal(writes.filter(write => write.key === KEY).length, count, 'the real manager confirms a duplicate rather than writing it again');
  tickFor(s, 1000);
  assert.equal(cues.filter(cue => cue === 'address').length, 1);
});

test('visiting the mailbox before a real arrival cannot deliver, both before sailing and during the second leg', () => {
  const { s, notices, celebrations } = sceneBoundary();
  putCat(s, LAKE_ANCHORS.mail); s.interact();
  assert.equal(Journey.getState().deliveries.lake, undefined);
  assert.equal(entries.has(KEY), false);
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  dockAtMid(s); configureSecondLeg(s);
  tickFor(s, LAKE_ROUTES['mid-mail'].durationMs / 2);
  putCat(s, LAKE_ANCHORS.mail); s.interact();
  assert.equal(s.voyage.getSnapshot().mailDocked, false);
  assert.equal(Journey.getState().deliveries.lake, undefined);
  assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  assert.match(notices.at(-1).value, /在等叶舟/);
});

test('unconfirmed mail landing blocks delivery until F saves it, then a separate F actually hands over the letter', () => {
  const { s, celebrations } = sceneBoundary();
  dockAtMid(s); configureSecondLeg(s);
  failWrites = true; tickFor(s, LAKE_ROUTES['mid-mail'].durationMs);
  assert.equal(s.pendingNode, 'lake.mailDocked');
  assert.equal(s.voyage.getSnapshot().mailDocked, true);
  assert.equal(Journey.getLakeCheckpoint(), 'mid');
  putCat(s, LAKE_ANCHORS.mail); s.interact();
  assert.equal(s.pendingNode, 'lake.mailDocked');
  assert.equal(Journey.getState().deliveries.lake, undefined);
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  failWrites = false; s.interact();
  assert.equal(s.pendingNode, null);
  assert.equal(Journey.getLakeCheckpoint(), 'mail');
  assert.equal(Journey.getState().deliveries.lake, undefined, 'saving the landing does not silently complete the handover');
  s.interact();
  assert.equal(Journey.getState().deliveries.lake.completionId, s.receipt);
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
});

test('normal repeated delivery does not repeat celebrations, delivery audio, writes or envelope visibility', () => {
  const { s, celebrations } = sceneBoundary();
  dockAtMail(s); putCat(s, LAKE_ANCHORS.mail);
  s.interact(); s.tickJourney(0);
  const bytes = entries.get(KEY), count = writes.length;
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
  assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
  assert.equal(s.envelope.visible, false);
  for (let i = 0; i < 4; i++) { s.interact(); s.tickJourney(0); }
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
  assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
  assert.equal(writes.length, count);
  assert.equal(entries.get(KEY), bytes);
  assert.equal(s.envelope.visible, false);
});

test('a refused handover keeps the visible letter and retry can deliver without repeating already saved dock milestones', () => {
  const { s, celebrations } = sceneBoundary();
  dockAtMail(s); putCat(s, LAKE_ANCHORS.mail);
  failWrites = true; s.interact(); s.tickJourney(0);
  assert.equal(Journey.getState().deliveries.lake, undefined);
  assert.deepEqual(Journey.getState().regions.lake.completedNodeIds, ['lake.midDocked', 'lake.mailDocked']);
  assert.equal(s.envelope.visible, true);
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  failWrites = false; s.interact(); s.tickJourney(0);
  assert.equal(Journey.getState().deliveries.lake.completionId, s.receipt);
  assert.equal(s.envelope.visible, false);
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
  assert.equal(cues.filter(cue => cue === 'address').length, 2);
});

test('successful handover write with failed readback is confirmed on retry and celebrated once', () => {
  const { s, celebrations } = sceneBoundary();
  dockAtMail(s); putCat(s, LAKE_ANCHORS.mail);
  failNextReadback = true; s.interact();
  assert.equal(s.state.deliveries.lake, undefined);
  assert.equal(Journey.getState().deliveries.lake.completionId, s.receipt);
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  const bytes = entries.get(KEY), count = writes.length;
  s.interact(); s.interact();
  assert.equal(s.state.deliveries.lake.completionId, s.receipt);
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
  assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
  assert.equal(entries.get(KEY), bytes);
  assert.equal(writes.length, count);
});

test('real F refuses distant or unanchored departure and command must be followed by actual echo arrival', () => {
  const { s, notices } = sceneBoundary();
  putCat(s, { x: 340, y: 850 }); s.interact();
  assert.equal(s.voyage.getSnapshot().loaded, false);
  assert.match(notices.at(-1).value, /码头/);
  putCat(s, LAKE_ANCHORS.start); s.interact();
  assert.equal(s.voyage.getSnapshot().loaded, false);
  s.command(); s.interact();
  assert.equal(s.voyage.getSnapshot().loaded, false, 'issuing E is not an arrival');
  Object.assign(s.echo, LAKE_ANCHORS.start); s.interact();
  assert.equal(s.voyage.getSnapshot().loaded, true, 'F samples the actual echo through LakeVoyage.update(0)');
  putCat(s, { x: 340, y: 850 }); s.interact();
  assert.equal(s.voyage.getSnapshot().phase, 'docked');
  putCat(s, LAKE_ANCHORS.start); s.command(); s.interact();
  assert.equal(s.echoStays, false);
  assert.equal(s.voyage.getSnapshot().phase, 'docked', 'recalling the echo invalidates anchoring before F');
});

test('pure F at two leaves uses actual spatial separation and returning to mid is required to launch', () => {
  const { s } = sceneBoundary();
  dockAtMid(s); anchorScene(s, 'mid');
  s.interact();
  assert.equal(s.voyage.getSnapshot().routeReady, false);
  putCat(s, LAKE_LEAVES.west); s.interact();
  assert.equal(s.voyage.getSnapshot().leaves.west, 'east');
  assert.equal(s.voyage.getSnapshot().leaves.north, 'south');
  putCat(s, LAKE_LEAVES.north); s.interact();
  assert.equal(s.voyage.getSnapshot().routeReady, true);
  putCat(s, { x: 1070, y: 130 }); s.interact();
  assert.equal(s.voyage.getSnapshot().phase, 'docked');
  putCat(s, LAKE_ANCHORS.mid); s.interact();
  assert.equal(s.voyage.getSnapshot().destination, 'mail');
});

test('a safe mail checkpoint resumes without a new arrival event or automatic delivery', () => {
  const first = sceneBoundary(); dockAtMail(first.s);
  const count = writes.length;
  const { s, celebrations } = sceneBoundary();
  putCat(s, LAKE_ANCHORS.mail);
  assert.equal(s.voyage.getSnapshot().dock, 'mail');
  s.tickJourney(0); tickFor(s, 1000);
  assert.equal(s.pendingNode, null);
  assert.equal(writes.length, count);
  assert.equal(s.state.deliveries.lake, undefined);
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  s.interact();
  assert.equal(s.state.deliveries.lake.completionId, s.receipt);
});

test('isSafe matches usable bank and boardwalk approaches, with a full 12px margin at wet deck edges', () => {
  const { s } = sceneBoundary();
  for (const point of [{ x: 340, y: 1030 }, { x: 340, y: 130 }, ...Object.values(LAKE_ANCHORS), ...Object.values(LAKE_LEAVES)]) {
    assert.equal(s.isSafe(point), true, `reachable approach ${JSON.stringify(point)}`);
  }
  assert.equal(s.isSafe({ x: 1100, y: 900 }), false, 'open lake is not a walking surface');
  const cases = [
    [{ x: 924, y: 700 }, { x: 924.01, y: 700 }],
    [{ x: 800, y: 680 }, { x: 800, y: 679.99 }],
    [{ x: 800, y: 720 }, { x: 800, y: 720.01 }],
    [{ x: 1364, y: 340 }, { x: 1363.99, y: 340 }],
    [{ x: 1450, y: 362 }, { x: 1450, y: 362.01 }],
    [{ x: 680, y: 402 }, { x: 680, y: 401.99 }],
    [{ x: 708, y: 420 }, { x: 708.01, y: 420 }],
    [{ x: 1027, y: 255 }, { x: 1026.99, y: 255 }],
    [{ x: 1050, y: 273 }, { x: 1050, y: 273.01 }],
  ];
  for (const [safe, wet] of cases) {
    assert.equal(s.isSafe(safe), true, `12px safe edge ${JSON.stringify(safe)}`);
    assert.equal(s.isSafe(wet), false, `body outside deck ${JSON.stringify(wet)}`);
  }
});

test('the return bridge becomes walkable only after delivery and its 12px footprint has no artificial seam at x=936', () => {
  const { s, rectangles } = sceneBoundary();
  dockAtMail(s);
  assert.equal(s.isSafe({ x: 936, y: 700 }), false, 'arriving mail alone does not grant the return crossing');
  putCat(s, LAKE_ANCHORS.mail); s.interact(); s.tickJourney(0);
  assert.ok(rectangles.some(rect => assertArrayEqual(rect, [936, 668, 760, 64])), 'the actual world repaint draws the return deck');
  const mid = LAKE_BOARDWALKS.find(deck => deck.id === 'mid');
  assert.equal(mid.x + mid.width, 936, 'the tested seam is the real mid boardwalk endpoint');
  for (let x = 922; x <= 952; x++) {
    for (const y of [680, 700, 720]) assert.equal(s.isSafe({ x, y }), true, `continuous 12px footprint at ${x},${y}`);
  }
  for (const y of [679.99, 720.01]) assert.equal(s.isSafe({ x: 1000, y }), false, 'the union fixes the seam without removing side margins');
  assert.equal(s.isSafe({ x: 1100, y: 900 }), false);
  const restored = sceneBoundary().s;
  assert.equal(restored.isSafe({ x: 936, y: 700 }), true, 'durable delivery also opens the seam after re-entry');
});

function assertArrayEqual(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
