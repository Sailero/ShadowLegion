import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const phaserFixture = new URL('./fixtures/phaser-scene.mjs', import.meta.url).href;
const phaserBoundary = `data:text/javascript,${encodeURIComponent(`import phaser from ${JSON.stringify(phaserFixture)};
  export default { ...phaser, Math: { ...phaser.Math, Vector2: class { constructor(x, y) { this.x = x; this.y = y; } } } };`)}`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: phaserBoundary, shortCircuit: true };
  return next(specifier, context);
} });
const { DesertScene } = await import('../scenes/DesertScene.ts');
const { DESERT_ANCHORS: ANCHORS, DESERT_NPC: NPC, DESERT_DISCOVERY: DISCOVERY, DESERT_CHECKPOINTS: CHECKPOINTS } = await import('../data/desert.ts');
const { JourneyProgressManager: Journey, JOURNEY_STORAGE_KEY: KEY } = await import('../systems/JourneyProgressManager.ts');
const { PostalJourneyManager: Forest, POSTAL_ADDRESS_IDS } = await import('../systems/PostalJourneyManager.ts');
const { SoundManager } = await import('../systems/SoundManager.ts');

// Real DesertScene lifecycle/actions, inherited PostalWalkScene.update, PairedCover
// and Journey persistence. Only Phaser construction/rendering, sound, input setup
// and actor-coordinate boundaries are substituted. Four-pixel pose sequences are
// supplied to the actual model; they are not browser input or simulated physics.
let entries, writes, failWrites, failNextReadback, readbackArmed, cues;
beforeEach(t => {
  entries = new Map(); writes = []; cues = [];
  failWrites = failNextReadback = readbackArmed = false;
  globalThis.localStorage = {
    getItem(key) {
      if (key === KEY && readbackArmed) { readbackArmed = false; throw Error('injected readback failure'); }
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push({ key, value });
      if (key === KEY && failWrites) throw Error('injected journey refusal');
      entries.set(key, String(value));
      if (key === KEY && failNextReadback) { failNextReadback = false; readbackArmed = true; }
    },
    removeItem: key => entries.delete(key),
  };
  t.mock.method(SoundManager, 'get', () => ({ postalCue: cue => cues.push(cue) }));
  for (const id of POSTAL_ADDRESS_IDS) assert.equal(Forest.findAddress(id).saved, true);
  assert.equal(Forest.completeDelivery('desert-scene-real-forest').saved, true);
  for (const node of ['lake.midDocked', 'lake.mailDocked']) assert.equal(Journey.completeNode('lake', node).saved, true);
  assert.equal(Journey.deliver('lake', 'desert-scene-real-lake').saved, true);
  for (const node of ['mountain.signalLearned', 'mountain.passOpened']) assert.equal(Journey.completeNode('mountain', node).saved, true);
  assert.equal(Journey.deliver('mountain', 'desert-scene-real-mountain').saved, true);
  writes.length = 0;
});

function drawBoundary() {
  const value = { value: '', setText(text) { this.value = text; return proxy; } };
  const proxy = new Proxy(value, { get: (target, name) => name in target ? target[name] : () => proxy });
  return proxy;
}
function actor(point) {
  const value = { ...point, body: { velocity: { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } } },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setVelocity(x, y) { this.body.velocity.x = x; this.body.velocity.y = y; return this; },
    setFlipX() { return this; } };
  value.body.reset = (x, y) => value.setPosition(x, y);
  return value;
}
function sceneBoundary() {
  const s = new DesertScene(), notices = [], starts = [], begins = [], celebrations = { cat: 0, echo: 0 };
  s.scene = { start: (...args) => starts.push(args) };
  s.sys = { isActive: () => true }; s.game = { hasFocus: true };
  s.input = { keyboard: { resetKeys() {} } }; s.physics = { pause() {}, resume() {} };
  s.textures = { exists: () => true }; // Cached texture boundary avoids Canvas generation in Node.
  s.add = { image: drawBoundary, graphics: drawBoundary, rectangle: drawBoundary, container: drawBoundary };
  s.cameras = { main: { setBackgroundColor() {} } }; s.words = drawBoundary;
  s.say = (value, duration) => notices.push({ value, duration });
  s.beginWalk = (title, start, world) => {
    begins.push({ title, start, world }); s.cat = actor(start); s.echo = actor({ x: start.x - 26, y: start.y });
    const animator = who => ({ holding: false, setHolding(value) { this.holding = value; },
      celebrate: () => celebrations[who]++, update() {}, dash() {}, resetTransient() {} });
    s.catAnimator = animator('cat'); s.echoAnimator = animator('echo');
    s.objective = drawBoundary(); s.hint = drawBoundary(); s.notice = drawBoundary(); s.marker = drawBoundary();
    s.keys = Object.fromEntries(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(key => [key, { isDown: false }]));
    s.trail = [{ ...start }]; s.echoTarget = { x: s.echo.x, y: s.echo.y }; s.safePoint = { ...start };
  };
  s.create();
  return { s, notices, starts, begins, celebrations };
}
const putCat = (s, point) => s.cat.setPosition(point.x, point.y);
const putEcho = (s, point) => s.echo.setPosition(point.x, point.y);
const successful = { lesson: { x: 740, y: 1200 }, 'stones-east': { x: 1660, y: 740 }, courtyard: { x: 1990, y: 500 } };
function smallSteps(s, to, inherited = false) {
  const from = { x: s.cat.x, y: s.cat.y }, steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
  for (let i = 1; i <= steps; i++) {
    putCat(s, { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps });
    assert.equal(s.isSafe(s.cat), true, 'supplied cat poses stay on real safe geometry');
    if (inherited) { s.update(0, 16); assert.equal(s.isSafe(s.echo), true, 'the inherited follower stays on the actual route'); }
    else s.tickJourney(16);
  }
}
function assign(s, id, actualArrival = false) {
  if (s.echoStays) s.command();
  const anchor = ANCHORS[id];
  // The actors have reached this launch at the world-coordinate boundary.
  putCat(s, anchor.command); putEcho(s, { x: anchor.command.x - 26, y: anchor.command.y });
  s.trail = [{ ...anchor.command }]; s.command();
  assert.equal(s.cover.getSnapshot().activeAnchor, id); assert.equal(s.echoStays, true);
  if (actualArrival) return;
  putEcho(s, anchor.echo); s.tickJourney(0);
}
function pickUp(s, id) {
  assign(s, id); putCat(s, ANCHORS[id].foldedGrip); s.interact();
  assert.equal(s.cover.getSnapshot().playerHolding, true);
  assert.equal(s.catAnimator.holding, true); assert.equal(s.echoAnimator.holding, true);
}
function ready(s, id) {
  pickUp(s, id); smallSteps(s, successful[id]);
  assert.equal(s.cover.getSnapshot().playerHolding, true);
  assert.ok(Object.values(s.cover.getSnapshot().coveredTargets).every(Boolean));
}
function finish(s, id) {
  ready(s, id); s.interact();
  assert.equal(s.cover.getSnapshot().confirmed[ANCHORS[id].puzzle], true);
}
function finishAll(s) { for (const id of ['lesson', 'stones-east', 'courtyard']) finish(s, id); }
function frames(s, count = 80) {
  let distance = 0;
  for (let i = 0; i < count; i++) {
    const before = { x: s.echo.x, y: s.echo.y }; s.update(0, 50);
    distance += Math.hypot(s.echo.x - before.x, s.echo.y - before.y);
    assert.equal(s.isSafe(s.echo), true, 'actual inherited echo positions remain outside the stones and sand boundary');
  }
  return distance;
}

test('F cannot replace E assignment or actual arrival at the cloth anchor', () => {
  const { s, notices } = sceneBoundary();
  putCat(s, ANCHORS.lesson.foldedGrip); s.interact();
  putCat(s, successful.lesson); s.interact();
  assert.equal(s.cover.getSnapshot().activeAnchor, null); assert.equal(s.cover.getSnapshot().playerHolding, false);
  assert.match(notices.at(-1).value, /先.*E/);
  assign(s, 'lesson', true); putCat(s, ANCHORS.lesson.foldedGrip);
  for (let i = 0; i < 60; i++) s.tickJourney(50);
  s.interact(); assert.equal(s.cover.getSnapshot().echoPresent, false); assert.equal(s.cover.getSnapshot().playerHolding, false);
  assert.match(notices.at(-1).value, /站稳/); assert.deepEqual(writes, []);
  putEcho(s, ANCHORS.lesson.echo); s.tickJourney(0); s.interact();
  assert.equal(s.cover.getSnapshot().playerHolding, true); assert.deepEqual(writes, []);
});

test('actual inherited update walks the echo to its anchor and arrival alone never takes or completes the cloth', () => {
  const { s } = sceneBoundary(); assign(s, 'lesson', true);
  assert.equal(s.cover.getSnapshot().echoPresent, false);
  assert.ok(frames(s) > 100); assert.deepEqual({ x: s.echo.x, y: s.echo.y }, ANCHORS.lesson.echo);
  assert.equal(s.cover.getSnapshot().echoPresent, true); assert.equal(s.cover.getSnapshot().playerHolding, false);
  assert.equal(Journey.getDesertCheckpoint(), 'trailhead'); assert.deepEqual(writes, []);
});

test('ground pickup and continuous small-step unfolding only save after a separate F read', () => {
  const { s, celebrations } = sceneBoundary(); pickUp(s, 'lesson');
  assert.equal(s.cover.getSnapshot().taut, false); assert.deepEqual(writes, []);
  smallSteps(s, successful.lesson);
  assert.equal(s.cover.getSnapshot().coveredTargets['lesson-sign'], true);
  assert.equal(Journey.getDesertCheckpoint(), 'trailhead'); assert.deepEqual(writes, []);
  s.tickJourney(50); assert.deepEqual(writes, []); s.interact();
  assert.equal(Journey.getDesertCheckpoint(), 'stoneCamp'); assert.equal(writes.length, 1);
  assert.equal(s.cover.getSnapshot().playerHolding, false); assert.equal(s.catAnimator.holding, false);
  assert.equal(s.echoAnimator.holding, false); assert.deepEqual(celebrations, { cat: 1, echo: 1 });
});

test('an overstretch discovered by F drops the corner without reading or immediately picking it back up', t => {
  const { s, notices } = sceneBoundary(); ready(s, 'lesson');
  const grip = t.mock.method(s.cover, 'grip'), read = t.mock.method(s.cover, 'read');
  putCat(s, { x: 762, y: 1200 }); s.interact();
  assert.equal(s.cover.getSnapshot().reason, 'overstretched'); assert.equal(s.cover.getSnapshot().playerHolding, false);
  assert.deepEqual(s.cover.getSnapshot().grip, successful.lesson);
  assert.equal(grip.mock.callCount(), 0); assert.equal(read.mock.callCount(), 0); assert.deepEqual(writes, []);
  assert.match(notices.at(-1).value, /松开/); assert.equal(s.catAnimator.holding, false);
});

test('a stone collision discovered by F drops the nearby corner without a same-press pickup or read', t => {
  const { s } = sceneBoundary(); finish(s, 'lesson'); ready(s, 'stones-east');
  smallSteps(s, { x: 1660, y: 820 });
  const count = writes.length, grip = t.mock.method(s.cover, 'grip'), read = t.mock.method(s.cover, 'read');
  putCat(s, { x: 1658, y: 843 }); assert.equal(s.isSafe(s.cat), true); s.interact();
  assert.equal(s.cover.getSnapshot().reason, 'obstructed'); assert.equal(s.cover.getSnapshot().playerHolding, false);
  assert.deepEqual(s.cover.getSnapshot().grip, { x: 1660, y: 820 });
  assert.equal(grip.mock.callCount(), 0); assert.equal(read.mock.callCount(), 0); assert.equal(writes.length, count);
  assert.equal(Journey.getDesertCheckpoint(), 'stoneCamp');
});

test('a fallen corner beside the sign is picked up before attempting its read and does not trap F in not-holding', () => {
  const { s } = sceneBoundary(); ready(s, 'lesson');
  putCat(s, { x: 762, y: 1200 }); s.interact();
  putCat(s, successful.lesson); s.tickJourney(0); assert.match(s.hint.value, /拿起布角/);
  s.interact(); assert.equal(s.cover.getSnapshot().playerHolding, true);
  assert.equal(Journey.getDesertCheckpoint(), 'trailhead'); assert.deepEqual(writes, []);
  s.interact(); assert.equal(Journey.getDesertCheckpoint(), 'stoneCamp');
});

test('E cancels and lays down the model before recalling the actual echo', t => {
  const { s } = sceneBoundary(); pickUp(s, 'lesson'); smallSteps(s, { x: 650, y: 1200 });
  const actualRecall = s.recallEcho, observations = [];
  t.mock.method(s, 'recallEcho', function (...args) { observations.push(this.cover.getSnapshot()); return actualRecall.apply(this, args); });
  s.command();
  assert.equal(observations.length, 1); assert.equal(observations[0].activeAnchor, null);
  assert.equal(observations[0].playerHolding, false); assert.equal(s.echoStays, false);
  assert.deepEqual(s.cover.getSnapshot().grips.lesson, { x: 650, y: 1200 });
  assert.equal(s.catAnimator.holding, false); assert.equal(s.echoAnimator.holding, false); assert.deepEqual(writes, []);
});

test('wrong west assignment can be recalled and redispatched east along real safe walking paths', () => {
  const { s } = sceneBoundary(); finish(s, 'lesson'); assign(s, 'stones-west', true); frames(s);
  assert.deepEqual({ x: s.echo.x, y: s.echo.y }, ANCHORS['stones-west'].echo);
  smallSteps(s, ANCHORS['stones-west'].foldedGrip, true); s.interact();
  assert.equal(s.cover.getSnapshot().playerHolding, true); s.command();
  assert.equal(s.cover.getSnapshot().activeAnchor, null); assert.equal(s.echoStays, false);
  smallSteps(s, ANCHORS['stones-west'].command, true); smallSteps(s, ANCHORS['stones-east'].command, true);
  s.command(); assert.equal(s.cover.getSnapshot().activeAnchor, 'stones-east');
  frames(s, 140); assert.deepEqual({ x: s.echo.x, y: s.echo.y }, ANCHORS['stones-east'].echo);
  assert.equal(s.cover.getSnapshot().echoPresent, true);
  assert.deepEqual(s.cover.getSnapshot().grip, ANCHORS['stones-east'].foldedGrip);
  smallSteps(s, { x: 1300, y: 700 }, true); smallSteps(s, ANCHORS['stones-east'].foldedGrip, true);
  s.interact(); smallSteps(s, successful['stones-east'], true); s.interact();
  assert.equal(Journey.getDesertCheckpoint(), 'courtyard');
});

test('refused node save remains matched pending: E cannot cancel and ticks never retry writes automatically', () => {
  const { s, notices, celebrations } = sceneBoundary(); ready(s, 'lesson'); failWrites = true; s.interact();
  assert.equal(s.pendingPuzzle, 'lesson'); assert.equal(s.cover.getSnapshot().phase, 'matchedPendingSave');
  assert.equal(s.cover.getSnapshot().confirmed.lesson, false); assert.equal(Journey.getDesertCheckpoint(), 'trailhead');
  assert.deepEqual(celebrations, { cat: 0, echo: 0 }); assert.equal(cues.filter(cue => cue === 'address').length, 0);
  const count = writes.length;
  for (let i = 0; i < 80; i++) s.tickJourney(50);
  s.command(); assert.equal(s.pendingPuzzle, 'lesson'); assert.equal(s.echoStays, true);
  assert.equal(writes.length, count); assert.match(notices.at(-1).value, /按 F/);
  failWrites = false; s.interact();
  assert.equal(s.pendingPuzzle, null); assert.equal(s.cover.getSnapshot().confirmed.lesson, true);
  assert.equal(Journey.getDesertCheckpoint(), 'stoneCamp'); assert.equal(writes.length, count + 1);
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
});

test('retrying the last pending node at the recipient only saves that node, never delivers on the same F', () => {
  const { s } = sceneBoundary(); finish(s, 'lesson'); finish(s, 'stones-east'); ready(s, 'courtyard');
  failWrites = true; s.interact(); assert.equal(s.pendingPuzzle, 'courtyard');
  putCat(s, NPC); failWrites = false; s.interact();
  assert.equal(s.pendingPuzzle, null); assert.equal(Journey.getDesertCheckpoint(), 'mailbox');
  assert.equal(Journey.getState().deliveries.desert, undefined); assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  s.interact(); assert.equal(Journey.getState().deliveries.desert.completionId, s.receipt);
});

test('a refused match lays down its cloth: walking away never draws a long polygon and F still retries only the pending save', () => {
  const { s, celebrations } = sceneBoundary(); finish(s, 'lesson'); finish(s, 'stones-east'); ready(s, 'courtyard');
  const calls = [];
  const art = new Proxy({}, { get: (_target, name) => (...args) => { calls.push({ name, args }); return art; } });
  s.clothArt = art; s.drawCover();
  assert.ok(calls.some(call => call.name === 'fillPoints'));
  assert.ok(calls.some(call => call.name === 'strokePoints'), 'the recording boundary observes the real held-cloth drawing calls');
  const matchedGrip = { x: s.cat.x, y: s.cat.y };
  failWrites = true; s.interact(); calls.length = 0;
  assert.equal(s.pendingPuzzle, 'courtyard'); assert.equal(s.cover.getSnapshot().playerHolding, false);
  assert.deepEqual(s.cover.getSnapshot().grips.courtyard, matchedGrip);
  const count = writes.length;
  putCat(s, NPC);
  for (let i = 0; i < 20; i++) s.tickJourney(50);
  const pending = s.cover.getSnapshot();
  assert.equal(pending.phase, 'matchedPendingSave'); assert.equal(pending.playerHolding, false);
  assert.deepEqual(pending.shadowPolygon, []); assert.deepEqual(pending.grips.courtyard, matchedGrip);
  assert.equal(s.catAnimator.holding, false); assert.equal(s.echoAnimator.holding, false);
  assert.equal(calls.some(call => call.name === 'fillPoints' || call.name === 'strokePoints'), false,
    'actual drawCover must not connect the saved match position to the distant cat with a stretched cloth');
  assert.match(s.objective.value, /F.*重试/); assert.match(s.hint.value, /只重试保存/);
  assert.match(s.gripLabels.get('courtyard').value, /确认保存/);
  assert.match(s.targetLabels.get('courtyard-sign').value, /待保存/);
  assert.equal(writes.length, count); assert.deepEqual(celebrations, { cat: 2, echo: 2 });
  failWrites = false; s.interact();
  assert.equal(s.pendingPuzzle, null); assert.equal(Journey.getDesertCheckpoint(), 'mailbox');
  assert.equal(Journey.getState().deliveries.desert, undefined); assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  assert.equal(writes.length, count + 1); assert.deepEqual(celebrations, { cat: 3, echo: 3 });
});

test('lost node readback retains pending feedback until F confirms the durable node without writing again', () => {
  const { s, celebrations } = sceneBoundary(); ready(s, 'lesson'); failNextReadback = true; s.interact();
  assert.equal(s.pendingPuzzle, 'lesson'); assert.equal(s.cover.getSnapshot().confirmed.lesson, false);
  assert.equal(Journey.getDesertCheckpoint(), 'stoneCamp', 'the injected readback failure happens after the actual write');
  assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  const raw = entries.get(KEY), count = writes.length; s.interact(); s.tickJourney(1000);
  assert.equal(s.pendingPuzzle, null); assert.equal(s.cover.getSnapshot().confirmed.lesson, true);
  assert.deepEqual(celebrations, { cat: 1, echo: 1 }); assert.equal(cues.filter(cue => cue === 'address').length, 1);
  assert.equal(entries.get(KEY), raw); assert.equal(writes.length, count);
});

test('early NPC interactions never skip any of the three confirmed nodes', () => {
  const { s } = sceneBoundary();
  for (const next of ['lesson', 'stones-east', 'courtyard']) {
    putCat(s, NPC); const count = writes.length; s.interact();
    assert.equal(Journey.getState().deliveries.desert, undefined); assert.equal(writes.length, count);
    finish(s, next);
  }
  assert.equal(Journey.getState().deliveries.desert, undefined); assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  putCat(s, NPC); s.interact(); assert.equal(Journey.getState().deliveries.desert.completionId, s.receipt);
});

test('handover write refusal retries the same receipt and later chats never duplicate its save or feedback', () => {
  const { s, celebrations } = sceneBoundary(); finishAll(s); putCat(s, NPC);
  failWrites = true; s.interact();
  assert.equal(s.state.deliveries.desert, undefined); assert.equal(Journey.getState().deliveries.desert, undefined);
  assert.deepEqual(celebrations, { cat: 3, echo: 3 }); assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  const receipt = s.receipt; failWrites = false; s.interact();
  assert.equal(Journey.getState().deliveries.desert.completionId, receipt);
  const raw = entries.get(KEY), count = writes.length;
  for (let i = 0; i < 4; i++) { s.interact(); s.tickJourney(0); }
  assert.equal(entries.get(KEY), raw); assert.equal(writes.length, count);
  assert.deepEqual(celebrations, { cat: 4, echo: 4 }); assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
});

test('lost handover readback does not claim saved; retry confirms the same receipt with no extra write', () => {
  const { s, celebrations } = sceneBoundary(); finishAll(s); putCat(s, NPC); failNextReadback = true; s.interact();
  assert.equal(s.state.deliveries.desert, undefined); assert.equal(Journey.getState().deliveries.desert.completionId, s.receipt);
  assert.deepEqual(celebrations, { cat: 3, echo: 3 }); assert.equal(cues.filter(cue => cue === 'delivery').length, 0);
  const raw = entries.get(KEY), count = writes.length; s.interact(); s.interact();
  assert.equal(s.state.deliveries.desert.completionId, s.receipt);
  assert.deepEqual(celebrations, { cat: 4, echo: 4 }); assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
  assert.equal(entries.get(KEY), raw); assert.equal(writes.length, count);
});

test('create restores four safe checkpoints from confirmed nodes without inventing a delivered letter', () => {
  const first = sceneBoundary(); assert.deepEqual(first.begins[0].start, CHECKPOINTS.start);
  finish(first.s, 'lesson');
  const camp = sceneBoundary(); assert.deepEqual(camp.begins[0].start, CHECKPOINTS.lesson);
  assert.deepEqual(camp.s.cover.getSnapshot().confirmed, { lesson: true, stones: false, courtyard: false });
  finish(camp.s, 'stones-east');
  const court = sceneBoundary(); assert.deepEqual(court.begins[0].start, CHECKPOINTS.stones);
  assert.deepEqual(court.s.cover.getSnapshot().confirmed, { lesson: true, stones: true, courtyard: false });
  finish(court.s, 'courtyard'); const count = writes.length;
  const mailbox = sceneBoundary(); assert.deepEqual(mailbox.begins[0].start, CHECKPOINTS.courtyard);
  assert.deepEqual(mailbox.s.cover.getSnapshot().confirmed, { lesson: true, stones: true, courtyard: true });
  for (let i = 0; i < 20; i++) mailbox.s.tickJourney(50);
  assert.equal(writes.length, count); assert.equal(mailbox.s.state.deliveries.desert, undefined);
  assert.deepEqual(mailbox.celebrations, { cat: 0, echo: 0 });
  putCat(mailbox.s, NPC); mailbox.s.interact();
  const delivered = sceneBoundary(); putCat(delivered.s, NPC); delivered.s.interact();
  assert.equal(delivered.s.receipt, mailbox.s.receipt); assert.deepEqual(delivered.celebrations, { cat: 0, echo: 0 });
});

test('the optional cushion requires all main nodes and its refused save never creates delivery or collection feedback', () => {
  const { s, celebrations } = sceneBoundary();
  for (const next of ['lesson', 'stones-east', 'courtyard']) {
    putCat(s, DISCOVERY); const count = writes.length; s.interact();
    assert.deepEqual(Journey.getState().optionalDiscoveries, []); assert.equal(writes.length, count);
    finish(s, next);
  }
  putCat(s, DISCOVERY); failWrites = true; s.interact();
  assert.deepEqual(Journey.getState().optionalDiscoveries, []); assert.deepEqual(celebrations, { cat: 3, echo: 3 });
  assert.equal(cues.filter(cue => cue === 'address').length, 3);
  failWrites = false; s.interact(); const count = writes.length; s.interact();
  assert.deepEqual(Journey.getState().optionalDiscoveries, ['desert.sixthCushion']);
  assert.equal(Journey.getState().deliveries.desert, undefined); assert.deepEqual(celebrations, { cat: 4, echo: 3 });
  assert.equal(cues.filter(cue => cue === 'address').length, 4); assert.equal(writes.length, count);
});

test('locked or future-format journeys cannot create the desert walk or overwrite stored bytes', () => {
  entries.delete(KEY);
  const locked = sceneBoundary(); assert.deepEqual(locked.starts, [['JourneyMapScene']]); assert.deepEqual(locked.begins, []);
  const future = '{"version":99,"future":"preserve desert"}'; entries.set(KEY, future);
  const protectedScene = sceneBoundary(); assert.deepEqual(protectedScene.starts, [['JourneyMapScene']]); assert.deepEqual(protectedScene.begins, []);
  assert.equal(entries.get(KEY), future); assert.deepEqual(writes, []);
});

test('a future save appearing in another tab is preserved when the active scene reaches a real match', () => {
  const { s, celebrations } = sceneBoundary(); ready(s, 'lesson');
  const future = '{"version":99,"future":"changed in another tab"}'; entries.set(KEY, future); s.interact();
  assert.equal(s.pendingPuzzle, 'lesson'); assert.equal(s.cover.getSnapshot().confirmed.lesson, false);
  s.command(); s.interact(); s.tickJourney(1000);
  assert.equal(entries.get(KEY), future); assert.deepEqual(writes, []); assert.deepEqual(celebrations, { cat: 0, echo: 0 });
});
