import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { MountainScene } = await import('../scenes/MountainScene.ts');
const { MountainRelay } = await import('../systems/MountainRelay.ts');
const { MOUNTAIN_WORLD, MOUNTAIN_DISCOVERY } = await import('../data/mountain.ts');
const { createJourneyState } = await import('../data/journey.ts');
const { SoundManager } = await import('../systems/SoundManager.ts');
const { SettingsManager } = await import('../systems/SettingsManager.ts');
const require = createRequire(import.meta.url);
const Key = require('../../node_modules/phaser/src/input/keyboard/keys/Key.js');
const KeyCodes = require('../../node_modules/phaser/src/input/keyboard/keys/KeyCodes.js');
const KeyboardPlugin = require('../../node_modules/phaser/src/input/keyboard/KeyboardPlugin.js');
const EventEmitter = require('eventemitter3');
const CoreEvents = require('../../node_modules/phaser/src/core/events');
(await import('./fixtures/phaser-scene.mjs')).default.Core = { Events: CoreEvents };

// Actual MountainScene input bindings, PostalWalkScene.update, geometry, recovery,
// relay and HUD/flag drawing methods. The body boundary integrates the velocity
// emitted by the previous update, then calls the next scene update. This is a
// deterministic coordinate boundary, not Arcade-world or browser performance QA.
function drawable() {
  const value = { text: '', calls: [], destroyed: false,
    setText(text) { this.text = text; return proxy; },
    clear() { this.calls.length = 0; return proxy; },
    destroy() { this.destroyed = true; },
  };
  const proxy = new Proxy(value, { get: (target, name) => name in target ? target[name] : (...args) => { target.calls.push([name, ...args]); return proxy; } });
  return proxy;
}
function actor(point, recoveries) {
  const value = { ...point, flipX: false,
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setVelocity(x, y) { this.body.velocity.x = x; this.body.velocity.y = y; return this; },
    setFlipX(flip) { this.flipX = flip; return this; },
  };
  value.body = {
    velocity: { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } },
    reset(x, y) { recoveries.push({ x, y }); value.setPosition(x, y); value.setVelocity(0, 0); },
  };
  return value;
}
function fixture(t, { point = { x: 1080, y: 920 }, clock = 0, learned = true } = {}) {
  const calls = { dashes: 0, resets: 0, pauses: 0, resumes: 0, recoveries: [], cues: [], transitions: [] };
  t.mock.method(SoundManager, 'get', () => ({ postalCue: cue => calls.cues.push(cue) }));
  t.mock.method(SettingsManager, 'get', () => ({ reducedMotion: true }));
  const input = new EventEmitter(), events = new EventEmitter(), registered = new Map();
  const addKey = name => {
    if (!registered.has(name)) registered.set(name, new Key(null, KeyCodes[name]));
    return registered.get(name);
  };
  input.keyboard = {
    addKey, addKeys: names => Object.fromEntries(names.split(',').map(name => [name, addKey(name)])),
    resetKeys() { KeyboardPlugin.prototype.resetKeys.call({ keys: [...registered.values()] }); },
  };
  input.mouse = { disableContextMenu() {} };
  const state = createJourneyState();
  // Loaded checkpoint fixture; no tests here fake a save callback or write storage.
  state.deliveries.forest = { completionId: 'wind-forest' }; state.deliveries.lake = { completionId: 'wind-lake' };
  state.regions.forest.completedNodeIds = ['forest.recipient', 'forest.address', 'forest.landmark'];
  state.regions.lake.completedNodeIds = ['lake.midDocked', 'lake.mailDocked'];
  if (learned) state.regions.mountain.completedNodeIds = ['mountain.signalLearned'];
  let physicsPaused = false;
  const animation = () => ({ resetTransient() { calls.resets++; }, dash() { calls.dashes++; }, update() {}, celebrate() {} });
  const scene = Object.assign(new MountainScene(), {
    cat: actor(point, calls.recoveries), echo: actor({ x: point.x - 26, y: point.y }, []),
    catAnimator: animation(), echoAnimator: animation(), input, clock, state,
    relay: new MountainRelay(learned ? 'lesson' : 'start'), receipt: 'wind-mountain',
    worldSize: MOUNTAIN_WORLD, safePoint: { ...point }, trail: [{ ...point }], echoTarget: { ...point },
    marker: drawable(), notice: drawable(), noticeUntil: Infinity,
    objective: drawable(), hint: drawable(), staticChanges: drawable(), bellArt: drawable(), flags: drawable(),
    discoveryLabel: drawable(), stationLabels: new Map([['lesson', drawable()], ['pass', drawable()]]),
    game: { events, hasFocus: true }, sys: { isActive: () => !scene.closed },
    physics: { pause() { physicsPaused = true; calls.pauses++; }, resume() { physicsPaused = false; calls.resumes++; } },
    cameras: { main: { getWorldPoint: (x, y) => ({ x, y }) } },
    add: { text: drawable, rectangle: drawable, container: drawable },
    scene: { start: name => calls.transitions.push(name) },
  });
  scene.bindControls();
  let eventTime = 100;
  const down = name => registered.get(name).onDown({ repeat: false, timeStamp: eventTime++ });
  const up = name => registered.get(name).onUp({ timeStamp: eventTime++ });
  const tap = name => { down(name); up(name); };
  function frame(delta = 16) {
    assert.ok(delta >= 0 && delta <= 50, 'physics boundary uses ordinary bounded frame steps');
    if (!physicsPaused) {
      const velocity = scene.cat.body.velocity;
      scene.cat.setPosition(scene.cat.x + velocity.x * delta / 1000, scene.cat.y + velocity.y * delta / 1000);
    }
    scene.update(scene.clock + delta, delta);
  }
  function run(ms, delta = 16) { while (ms > 0) { const step = Math.min(delta, ms); frame(step); ms -= step; } }
  t.after(() => scene.closeWalk());
  return { scene, calls, events, input, keys: registered, down, up, tap, frame, run };
}

test('normal keyboard walking on the wide mountain road is unaffected throughout a windy phase', t => {
  const { scene, down, frame, run, calls } = fixture(t, { point: { x: 1640, y: 900 }, clock: 1500 });
  down('W'); frame(0); const start = { x: scene.cat.x, y: scene.cat.y };
  run(200);
  assert.equal(scene.cat.x, start.x); assert.ok(scene.cat.y < start.y - 40);
  assert.equal(scene.cat.body.velocity.x, 0); assert.equal(scene.cat.body.velocity.y, -220);
  assert.deepEqual(calls.recoveries, []);
});

test('the real flag drawing warns before side force begins, and a stationary exposed cat is then moved by that force', t => {
  const { scene, frame, run, calls } = fixture(t, { clock: 700 });
  frame(50);
  assert.equal(scene.clock, 750); assert.equal(scene.cat.body.velocity.x, 0);
  assert.ok(scene.flags.calls.some(call => call[0] === 'fillStyle' && call[1] === 0xebcb7a));
  assert.match(scene.hint.text, /侧风将至/);
  run(749, 50);
  assert.equal(scene.clock, 1499); assert.equal(scene.cat.x, 1080);
  frame(1);
  assert.equal(scene.clock, 1500); assert.ok(scene.cat.body.velocity.x > 0);
  assert.ok(scene.flags.calls.some(call => call[0] === 'fillStyle' && call[1] === 0xd2a174));
  frame(50);
  assert.ok(scene.cat.x > 1088 && scene.cat.x < 1089);
  assert.equal(scene.cat.y, 920); assert.equal(calls.dashes, 0); assert.deepEqual(calls.recoveries, []);
});

test('the force ends with the gust and the flag cycle resets without retaining a phantom wind velocity', t => {
  const gust = fixture(t, { clock: 3399 });
  gust.frame(0); assert.ok(gust.scene.cat.body.velocity.x > 0);
  gust.frame(1);
  assert.equal(gust.scene.clock, 3400); assert.equal(gust.scene.cat.body.velocity.x, 0);
  assert.ok(gust.scene.flags.calls.some(call => call[0] === 'fillStyle' && call[1] === 0xa7cbb7));
  const calm = fixture(t, { clock: 6399 });
  calm.frame(1); assert.equal(calm.scene.clock, 6400); assert.equal(calm.scene.cat.body.velocity.x, 0);
  calm.run(750, 50);
  assert.match(calm.scene.hint.text, /侧风将至/); assert.equal(calm.scene.cat.body.velocity.x, 0);
});

test('a real Shift tap reduces sideways drift while its northward dash still executes exactly once', t => {
  const walking = fixture(t, { point: { x: 1080, y: 950 }, clock: 1500 });
  const dashing = fixture(t, { point: { x: 1080, y: 950 }, clock: 1500 });
  walking.down('W'); dashing.down('W'); dashing.tap('SHIFT');
  walking.frame(0); dashing.frame(0);
  walking.run(64); dashing.run(64);
  assert.ok(walking.scene.cat.x - 1080 > 10);
  assert.ok(dashing.scene.cat.x - 1080 > 0 && dashing.scene.cat.x - 1080 < 2);
  assert.ok(dashing.scene.cat.y < walking.scene.cat.y - 15, 'the reduced drift must not disable the intended dash');
  assert.equal(dashing.calls.dashes, 1); assert.equal(walking.calls.dashes, 0);
  assert.equal(dashing.scene.isDashing(), true);
  assert.deepEqual(dashing.calls.recoveries, []);
});

test('holding the opposite movement key can actively resist the exposed side wind without a dash', t => {
  const { scene, down, frame, run, calls } = fixture(t, { clock: 1500 });
  down('A'); frame(0); run(160);
  assert.ok(scene.cat.x < 1080); assert.ok(scene.cat.body.velocity.x < 0);
  assert.equal(calls.dashes, 0); assert.deepEqual(calls.recoveries, []);
});

test('a flag is recorded through actual walking, then an exposed gust restores that visited flag instead of an unvisited lookout', t => {
  const { scene, calls, down, up, frame, run } = fixture(t, { point: { x: 1080, y: 990 }, clock: 900 });
  frame(0); assert.deepEqual(scene.windFlag, { x: 1080, y: 990 });
  down('W'); frame(0); run(400); up('W'); frame(0);
  assert.ok(scene.cat.y < 905 && scene.cat.y > 895);
  assert.equal(scene.wasInWind, true);
  assert.deepEqual(scene.windFlag, { x: 1080, y: 990 }, 'the unvisited middle flag must not be selected by proximity to a path');
  for (let i = 0; i < 150 && !calls.recoveries.length; i++) frame(16);
  assert.deepEqual(calls.recoveries, [{ x: 1080, y: 990 }]);
  assert.deepEqual({ x: scene.cat.x, y: scene.cat.y }, { x: 1080, y: 990 });
  assert.equal(scene.cat.body.velocity.length(), 0); assert.equal(scene.requests.size, 0);
  assert.equal(scene.walkTarget, null); assert.ok(scene.isSafe(scene.cat));
  assert.match(scene.notice.text, /信和已经完成的接力都在/);
});

test('without a visited wind flag, leaving the edge uses the actual last safe footstep instead of inventing a checkpoint', t => {
  const { scene, calls, frame } = fixture(t, { clock: 1500 });
  frame(0); assert.equal(scene.windFlag, null);
  let lastSafe = { ...scene.safePoint };
  for (let i = 0; i < 100 && !calls.recoveries.length; i++) { lastSafe = { ...scene.safePoint }; frame(16); }
  assert.deepEqual(calls.recoveries, [lastSafe]);
  assert.notDeepEqual(lastSafe, { x: 1080, y: 990 });
  assert.ok(scene.isSafe(scene.cat));
});

test('an unconfirmed lesson cannot open the wind path, register its flags or apply side force', t => {
  const { scene, frame, calls } = fixture(t, { point: { x: 1180, y: 1100 }, clock: 1500, learned: false });
  assert.equal(scene.isSafe({ x: 1080, y: 920 }), false);
  assert.equal(scene.isSafe(MOUNTAIN_DISCOVERY), false);
  // A coordinate outside the confirmed walkable map is rejected by the actual
  // update and restored to the last legal ground, not turned into a shortcut.
  scene.cat.setPosition(1080, 920); frame(0);
  assert.deepEqual(calls.recoveries, [{ x: 1180, y: 1100 }]);
  assert.equal(scene.cat.body.velocity.length(), 0); assert.equal(scene.windFlag, null);
  assert.equal(scene.state.regions.mountain.completedNodeIds.length, 0);
});

for (const pauseBy of ['escape', 'blur', 'hidden']) {
  test(`${pauseBy} freezes the real wind clock, clears held motion and queued dash, and cannot resume while unfocused`, t => {
    const { scene, calls, down, tap, events, frame, run, keys } = fixture(t, { clock: 1500 });
    down('W'); frame(0); assert.ok(scene.cat.body.velocity.x > 0);
    tap('SHIFT');
    if (pauseBy === 'escape') tap('ESC');
    else { scene.game.hasFocus = false; events.emit(pauseBy === 'blur' ? CoreEvents.BLUR : CoreEvents.HIDDEN); }
    const before = { x: scene.cat.x, y: scene.cat.y, clock: scene.clock };
    run(1000, 50);
    assert.equal(scene.paused, true); assert.equal(scene.cat.body.velocity.length(), 0);
    assert.deepEqual({ x: scene.cat.x, y: scene.cat.y, clock: scene.clock }, before);
    assert.equal(keys.get('W').isDown, false); assert.equal(scene.requests.size, 0); assert.equal(calls.dashes, 0);
    if (pauseBy !== 'escape') { tap('ENTER'); frame(16); assert.equal(scene.paused, true); }
    scene.game.hasFocus = true; tap('ENTER');
    assert.equal(scene.paused, false); assert.equal(scene.cat.body.velocity.length(), 0);
    frame(0);
    assert.ok(scene.cat.body.velocity.x > 0, 'only current environmental wind returns');
    assert.equal(scene.cat.body.velocity.y, 0, 'the pre-pause held walk cannot return');
    assert.equal(scene.isDashing(), false); assert.deepEqual(calls.transitions, []);
  });
}

test('the implemented 60px lookout shelter permits a genuine stationary rest through two complete wind cycles', t => {
  for (const point of [MOUNTAIN_DISCOVERY, { x: MOUNTAIN_DISCOVERY.x + 60, y: MOUNTAIN_DISCOVERY.y }]) {
    const { scene, calls, frame, run } = fixture(t, { point, clock: 1500 });
    frame(0); run(12800, 50);
    assert.deepEqual({ x: scene.cat.x, y: scene.cat.y }, { x: point.x, y: point.y });
    assert.equal(scene.cat.body.velocity.length(), 0); assert.ok(scene.isSafe(scene.cat));
    assert.deepEqual(calls.recoveries, []);
    assert.match(scene.hint.text, /F.*云纹明信片/);
  }
});

test('the shelter is a real bounded rest area, while its exposed outer rim still responds to the wind', t => {
  const { scene, frame } = fixture(t, { point: { x: MOUNTAIN_DISCOVERY.x + 60.01, y: MOUNTAIN_DISCOVERY.y }, clock: 1500 });
  assert.ok(scene.isSafe(scene.cat), 'this is still within the drawn platform and 12px safe footprint');
  frame(0); assert.ok(scene.cat.body.velocity.x > 0);
  assert.equal(scene.wasInWind, true);
});
