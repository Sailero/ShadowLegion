import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { MountainScene } = await import('../scenes/MountainScene.ts');
const { MOUNTAIN_STATIONS, MOUNTAIN_NPC, MOUNTAIN_GATE, MOUNTAIN_DISCOVERY, MOUNTAIN_CHECKPOINTS } = await import('../data/mountain.ts');
const { MOUNTAIN_NOTE_INTERVAL_MS } = await import('../systems/MountainRelay.ts');
const { JourneyProgressManager: Journey, JOURNEY_STORAGE_KEY: KEY } = await import('../systems/JourneyProgressManager.ts');
const { PostalJourneyManager: Forest, POSTAL_ADDRESS_IDS } = await import('../systems/PostalJourneyManager.ts');
const { SoundManager } = await import('../systems/SoundManager.ts');

// Actual MountainScene create/command/interact/tickJourney and inherited echo movement,
// with the real MountainRelay and JourneyProgressManager. Only Phaser construction,
// rendering, audio, actor coordinates and input setup are bounded. Supplying positions
// below is not simulated walking physics, native keyboard input or graphical acceptance.
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
  assert.equal(Forest.completeDelivery('mountain-scene-real-forest').saved, true);
  assert.equal(Journey.completeNode('lake', 'lake.midDocked').saved, true);
  assert.equal(Journey.completeNode('lake', 'lake.mailDocked').saved, true);
  assert.equal(Journey.deliver('lake', 'mountain-scene-real-lake').saved, true);
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
  const s = new MountainScene(), notices = [], starts = [], celebrations = { cat: 0, echo: 0 }, begins = [];
  s.scene = { start: (...args) => starts.push(args) };
  s.sys = { isActive: () => true }; s.game = { hasFocus: true };
  s.input = { keyboard: { resetKeys() {} } }; s.physics = { pause() {}, resume() {} };
  s.textures = { exists: () => true }; // Existing texture boundary avoids generating Canvas artwork in Node.
  s.add = { image: drawBoundary, graphics: drawBoundary, rectangle: drawBoundary, container: drawBoundary };
  s.cameras = { main: { setBackgroundColor() {} } };
  s.words = drawBoundary;
  s.say = (value, duration) => notices.push({ value, duration });
  s.beginWalk = (title, start, world) => {
    begins.push({ title, start, world }); s.cat = actor(start); s.echo = actor({ x: start.x - 26, y: start.y });
    s.catAnimator = { celebrate: () => celebrations.cat++, update() {}, dash() {}, resetTransient() {} };
    s.echoAnimator = { celebrate: () => celebrations.echo++, update() {}, dash() {}, resetTransient() {} };
    s.objective = drawBoundary(); s.hint = drawBoundary(); s.notice = drawBoundary();
    s.keys = Object.fromEntries(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(key => [key, { isDown: false }]));
    s.trail = [{ ...start }]; s.echoTarget = { x: s.echo.x, y: s.echo.y }; s.safePoint = { ...start };
  };
  s.create();
  return { s, notices, celebrations, starts, begins };
}
const putCat = (s, point) => s.cat.setPosition(point.x, point.y);
const putEcho = (s, point) => s.echo.setPosition(point.x, point.y);
function tickFor(s, duration) {
  while (duration > 0) { const delta = Math.min(50, duration); s.tickJourney(delta); duration -= delta; }
}
function observeAndAssign(s, id) {
  if (s.echoStays) s.command();
  const station = MOUNTAIN_STATIONS[id];
  putCat(s, station.instruction); s.interact();
  assert.equal(s.relay.getSnapshot().stations[id].observed, true);
  putCat(s, station.command); s.command();
  assert.equal(s.echoStays, true); assert.deepEqual(s.echoTarget, station.echo);
  assert.equal(s.relay.getSnapshot().phase, 'awaitingEcho');
}
function echoArrives(s, id) { putEcho(s, MOUNTAIN_STATIONS[id].echo); s.tickJourney(0); }
function firstReady(s) {
  observeAndAssign(s, 'lesson'); echoArrives(s, 'lesson');
  tickFor(s, 2 * MOUNTAIN_NOTE_INTERVAL_MS);
  assert.equal(s.relay.getSnapshot().playerWait, true);
  putCat(s, MOUNTAIN_STATIONS.lesson.playerBells.bell);
}
function finishFirst(s) {
  firstReady(s); s.interact();
  assert.equal(s.relay.getSnapshot().confirmed.lesson, true);
}
function secondReady(s) {
  observeAndAssign(s, 'pass'); echoArrives(s, 'pass'); tickFor(s, MOUNTAIN_NOTE_INTERVAL_MS);
  assert.equal(s.relay.getSnapshot().playerWait, true);
  putCat(s, MOUNTAIN_STATIONS.pass.playerBells.leaf);
}
function finishSecond(s) {
  finishFirst(s); secondReady(s); s.interact(); tickFor(s, MOUNTAIN_NOTE_INTERVAL_MS);
  assert.equal(s.relay.getSnapshot().confirmed.pass, true);
}
const gatePoint = { x: MOUNTAIN_GATE.x + MOUNTAIN_GATE.width / 2, y: MOUNTAIN_GATE.y + MOUNTAIN_GATE.height / 2 };
const bellCues = () => cues.filter(cue => cue.startsWith('bell-'));

test('E requires observing the local score and F cannot replace assignment or actual echo arrival', () => {
  const { s, notices } = sceneBoundary(); const station = MOUNTAIN_STATIONS.lesson;
  putCat(s, station.command); s.command();
  assert.equal(s.echoStays, false); assert.equal(s.relay.getSnapshot().stations.lesson.observed, false);
  assert.match(notices.at(-1).value, /先.*F/);
  putCat(s, station.instruction); s.interact();
  putCat(s, station.playerBells.bell); s.interact();
  assert.equal(s.relay.getSnapshot().played, 0); assert.equal(s.relay.getSnapshot().confirmed.lesson, false);
  putCat(s, station.command); s.command(); tickFor(s, 3000);
  assert.equal(s.relay.getSnapshot().played, 0, 'an E command alone is not physical arrival at the echo bell');
  putCat(s, station.playerBells.bell); s.interact();
  assert.equal(s.relay.getSnapshot().played, 0); assert.deepEqual(writes, []);
  echoArrives(s, 'lesson'); tickFor(s, 2 * MOUNTAIN_NOTE_INTERVAL_MS);
  assert.equal(s.relay.getSnapshot().played, 2);
  s.interact(); assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
});

test('actual inherited echo movement follows the assigned waypoints and arrival enables its timed notes', () => {
  const { s } = sceneBoundary(); const station = MOUNTAIN_STATIONS.lesson;
  putCat(s, station.instruction); s.interact();
  // World-coordinate boundary: both actors have reached the launch, but the echo has not reached its bell.
  putCat(s, station.command); putEcho(s, { x: station.command.x - 30, y: station.command.y });
  s.trail = [{ ...station.command }]; s.command();
  assert.equal(s.relay.getSnapshot().echoPresent, false);
  let travelled = 0;
  for (let i = 0; i < 70; i++) {
    const previous = { x: s.echo.x, y: s.echo.y }; s.update(0, 50);
    travelled += Math.hypot(s.echo.x - previous.x, s.echo.y - previous.y);
    assert.equal(s.isSafe(s.echo), true, 'the real inherited dispatch remains on the authored safe path');
  }
  assert.ok(travelled > 70); assert.deepEqual({ x: s.echo.x, y: s.echo.y }, station.echo);
  assert.equal(s.relay.getSnapshot().played, 2); assert.equal(s.relay.getSnapshot().playerWait, true);
  assert.equal(Journey.getMountainCheckpoint(), 'trailhead', 'the echo cannot finish the player response by itself');
});

test('wrong physical bells preserve the played prefix and only the requested symbol completes the first relay', () => {
  const { s } = sceneBoundary(); firstReady(s);
  for (const note of ['leaf', 'sun']) {
    putCat(s, MOUNTAIN_STATIONS.lesson.playerBells[note]); s.interact();
    assert.equal(s.relay.getSnapshot().played, 2); assert.equal(s.relay.getSnapshot().playerWait, true);
    assert.equal(Journey.getMountainCheckpoint(), 'trailhead');
  }
  assert.deepEqual(writes, []);
  putCat(s, MOUNTAIN_STATIONS.lesson.playerBells.bell); s.interact();
  assert.equal(Journey.getMountainCheckpoint(), 'relayCamp'); assert.equal(s.relay.getSnapshot().confirmed.lesson, true);
});

test('the echo bell draws the note just sounded during its feedback window rather than prematurely showing the next note', () => {
  const { s } = sceneBoundary(); observeAndAssign(s, 'lesson'); echoArrives(s, 'lesson');
  tickFor(s, MOUNTAIN_NOTE_INTERVAL_MS);
  assert.equal(s.ringing.note, 'leaf'); assert.equal(s.relay.getSnapshot().next.note, 'sun');
  const calls = [], point = MOUNTAIN_STATIONS.lesson.echo;
  const art = new Proxy({}, { get: (_target, name) => (...args) => { calls.push({ name, args }); return art; } });
  s.bellArt = art; s.drawBells();
  const glyphAtEcho = name => calls.some(call => call.name === name && call.args[0] === point.x && call.args[1] === point.y - 5);
  assert.equal(glyphAtEcho('strokeEllipse'), true, 'the real draw method uses the leaf shape at the ringing echo bell');
  assert.equal(glyphAtEcho('strokeCircle'), false);
  s.clock = s.ringing.until + 1; calls.length = 0; s.drawBells();
  assert.equal(glyphAtEcho('strokeCircle'), true, 'the next sun symbol may appear after the feedback window');
});

test('first matched write refusal stays pending; E cannot cancel it and F retries only the save', () => {
  const { s, notices, celebrations } = sceneBoundary(); firstReady(s); failWrites = true; s.interact();
  assert.equal(s.pendingStation, 'lesson'); assert.equal(s.relay.getSnapshot().phase, 'matchedPendingSave');
  assert.equal(s.relay.getSnapshot().confirmed.lesson, false); assert.equal(Journey.getMountainCheckpoint(), 'trailhead');
  assert.equal(s.isSafe(MOUNTAIN_DISCOVERY), false); assert.deepEqual(celebrations, { cat: 0, echo: 0 });
  const count = writes.length, notes = bellCues().length;
  tickFor(s, 2000); s.command();
  assert.equal(writes.length, count); assert.equal(s.pendingStation, 'lesson'); assert.equal(s.echoStays, true);
  assert.match(notices.at(-1).value, /按 F/);
  putCat(s, MOUNTAIN_DISCOVERY); s.interact(); assert.equal(s.pendingStation, 'lesson');
  failWrites = false; s.interact();
  assert.equal(s.pendingStation, null); assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
  assert.deepEqual(Journey.getState().optionalDiscoveries, [], 'retry cannot also collect the nearby optional postcard');
  assert.deepEqual(celebrations, { cat: 1, echo: 1 }); assert.equal(bellCues().length, notes);
  s.interact(); assert.deepEqual(Journey.getState().optionalDiscoveries, ['mountain.sharedChime']);
});

test('second match is emitted by update after the player reply and only confirmed persistence opens the gate', () => {
  const { s, celebrations } = sceneBoundary(); finishFirst(s); secondReady(s);
  assert.equal(s.isSafe(gatePoint), false); s.interact();
  assert.equal(s.relay.getSnapshot().played, 2); assert.equal(s.relay.getSnapshot().confirmed.pass, false);
  assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
  tickFor(s, MOUNTAIN_NOTE_INTERVAL_MS - 50); assert.equal(s.isSafe(gatePoint), false);
  failWrites = true; s.tickJourney(50);
  assert.equal(s.pendingStation, 'pass'); assert.equal(s.relay.getSnapshot().phase, 'matchedPendingSave');
  assert.equal(s.isSafe(gatePoint), false); assert.equal(Journey.getMountainCheckpoint(), 'relayCamp');
  const count = writes.length, notes = bellCues().length;
  tickFor(s, 2000); assert.equal(writes.length, count);
  putCat(s, MOUNTAIN_NPC); failWrites = false; s.interact();
  assert.equal(s.pendingStation, null); assert.equal(s.isSafe(gatePoint), true);
  assert.equal(Journey.getMountainCheckpoint(), 'mailbox'); assert.equal(Journey.getState().deliveries.mountain, undefined);
  assert.deepEqual(celebrations, { cat: 2, echo: 2 }); assert.equal(bellCues().length, notes);
  s.interact(); assert.equal(Journey.getState().deliveries.mountain.completionId, s.receipt);
});

test('a successful node write with failed readback keeps the gate closed until F confirms the durable node once', () => {
  const { s, celebrations } = sceneBoundary(); finishFirst(s); secondReady(s); s.interact();
  failNextReadback = true; tickFor(s, MOUNTAIN_NOTE_INTERVAL_MS);
  assert.equal(s.pendingStation, 'pass'); assert.equal(s.isSafe(gatePoint), false);
  assert.equal(Journey.getMountainCheckpoint(), 'mailbox', 'the injected failure is after the real write');
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
  const count = writes.length, raw = entries.get(KEY), notes = bellCues().length;
  s.interact(); tickFor(s, 1000);
  assert.equal(s.pendingStation, null); assert.equal(s.isSafe(gatePoint), true);
  assert.deepEqual(celebrations, { cat: 2, echo: 2 });
  assert.equal(writes.length, count); assert.equal(entries.get(KEY), raw); assert.equal(bellCues().length, notes);
});

test('visiting the recipient early never manufactures a delivery or bypasses either relay', () => {
  const { s, celebrations } = sceneBoundary(); putCat(s, MOUNTAIN_NPC); s.interact();
  assert.equal(Journey.getState().deliveries.mountain, undefined); assert.deepEqual(writes, []);
  finishFirst(s); putCat(s, MOUNTAIN_NPC); s.interact();
  assert.equal(Journey.getState().deliveries.mountain, undefined);
  assert.equal(cues.filter(cue => cue === 'delivery').length, 0); assert.deepEqual(celebrations, { cat: 1, echo: 1 });
});

test('refused handover can be retried without repeating nodes; subsequent chats never repeat its receipt or celebration', () => {
  const { s, celebrations } = sceneBoundary(); finishSecond(s); putCat(s, MOUNTAIN_NPC);
  failWrites = true; s.interact();
  assert.equal(s.state.deliveries.mountain, undefined); assert.equal(Journey.getState().deliveries.mountain, undefined);
  assert.equal(cues.filter(cue => cue === 'delivery').length, 0); assert.deepEqual(celebrations, { cat: 2, echo: 2 });
  failWrites = false; s.interact();
  assert.equal(Journey.getState().deliveries.mountain.completionId, s.receipt);
  const raw = entries.get(KEY), count = writes.length;
  for (let i = 0; i < 4; i++) { s.interact(); s.tickJourney(0); }
  assert.deepEqual(celebrations, { cat: 3, echo: 3 }); assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
  assert.equal(entries.get(KEY), raw); assert.equal(writes.length, count);
  assert.deepEqual(Journey.getState().regions.mountain.completedNodeIds, ['mountain.signalLearned', 'mountain.passOpened']);
});

test('handover readback failure stays visibly unconfirmed and retries the same real receipt without another write', () => {
  const { s, celebrations } = sceneBoundary(); finishSecond(s); putCat(s, MOUNTAIN_NPC);
  failNextReadback = true; s.interact();
  assert.equal(s.state.deliveries.mountain, undefined); assert.equal(Journey.getState().deliveries.mountain.completionId, s.receipt);
  assert.equal(cues.filter(cue => cue === 'delivery').length, 0); assert.deepEqual(celebrations, { cat: 2, echo: 2 });
  const raw = entries.get(KEY), count = writes.length;
  s.interact(); s.interact();
  assert.equal(s.state.deliveries.mountain.completionId, s.receipt);
  assert.deepEqual(celebrations, { cat: 3, echo: 3 }); assert.equal(cues.filter(cue => cue === 'delivery').length, 1);
  assert.equal(entries.get(KEY), raw); assert.equal(writes.length, count);
});

test('real create derives only confirmed safe checkpoints and never invents a handover on resume', () => {
  const start = sceneBoundary(); assert.deepEqual(start.begins[0].start, MOUNTAIN_CHECKPOINTS.start);
  finishFirst(start.s);
  const camp = sceneBoundary(); assert.deepEqual(camp.begins[0].start, MOUNTAIN_CHECKPOINTS.lesson);
  assert.deepEqual(camp.s.relay.getSnapshot().confirmed, { lesson: true, pass: false });
  secondReady(camp.s); camp.s.interact(); tickFor(camp.s, MOUNTAIN_NOTE_INTERVAL_MS);
  const count = writes.length;
  const mailbox = sceneBoundary(); assert.deepEqual(mailbox.begins[0].start, MOUNTAIN_CHECKPOINTS.pass);
  assert.deepEqual(mailbox.s.relay.getSnapshot().confirmed, { lesson: true, pass: true });
  tickFor(mailbox.s, 2000);
  assert.equal(writes.length, count); assert.equal(mailbox.s.state.deliveries.mountain, undefined);
  assert.deepEqual(mailbox.celebrations, { cat: 0, echo: 0 });
  putCat(mailbox.s, MOUNTAIN_NPC); mailbox.s.interact();
  const delivered = sceneBoundary(); putCat(delivered.s, MOUNTAIN_NPC); delivered.s.interact();
  assert.equal(delivered.s.receipt, mailbox.s.receipt); assert.deepEqual(delivered.celebrations, { cat: 0, echo: 0 });
});

test('optional cloud postcard requires the confirmed lesson and its failed save never plays collection feedback', () => {
  const { s, celebrations } = sceneBoundary(); putCat(s, MOUNTAIN_DISCOVERY); s.interact();
  assert.deepEqual(Journey.getState().optionalDiscoveries, []); assert.deepEqual(writes, []);
  finishFirst(s); putCat(s, MOUNTAIN_DISCOVERY); s.tickJourney(0);
  assert.match(s.hint.value, /明信片/, 'the nearby F collectible is described ahead of the surrounding optional wind shortcut');
  failWrites = true; s.interact();
  assert.deepEqual(Journey.getState().optionalDiscoveries, []); assert.equal(cues.filter(cue => cue === 'address').length, 0);
  assert.deepEqual(celebrations, { cat: 1, echo: 1 });
  failWrites = false; s.interact(); const count = writes.length; s.interact();
  assert.deepEqual(Journey.getState().optionalDiscoveries, ['mountain.sharedChime']);
  assert.equal(Journey.getState().deliveries.mountain, undefined);
  assert.equal(cues.filter(cue => cue === 'address').length, 1); assert.deepEqual(celebrations, { cat: 2, echo: 1 });
  assert.equal(writes.length, count);
});

test('real scene create refuses locked or future-format journeys before creating a playable walk', () => {
  entries.delete(KEY);
  const locked = sceneBoundary(); assert.deepEqual(locked.starts, [['JourneyMapScene']]); assert.deepEqual(locked.begins, []);
  entries.set(KEY, '{"version":99,"future":"preserve"}');
  const protectedScene = sceneBoundary(); assert.deepEqual(protectedScene.starts, [['JourneyMapScene']]); assert.deepEqual(protectedScene.begins, []);
  assert.equal(entries.get(KEY), '{"version":99,"future":"preserve"}'); assert.deepEqual(writes, []);
});
