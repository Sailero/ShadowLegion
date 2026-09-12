import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { PostalWalkScene } = await import('../scenes/PostalWalkScene.ts');
const { SoundManager } = await import('../systems/SoundManager.ts');
const { SettingsManager } = await import('../systems/SettingsManager.ts');
const boundary = (await import('./fixtures/phaser-scene.mjs')).default;
const require = createRequire(import.meta.url);
const Key = require('../../node_modules/phaser/src/input/keyboard/keys/Key');
const KeyCodes = require('../../node_modules/phaser/src/input/keyboard/keys/KeyCodes');
const EventEmitter = require('eventemitter3');
boundary.Core = { Events: require('../../node_modules/phaser/src/core/events') };

// Actual scene methods and actual Phaser Key instances, with only rendering,
// audio and physics body boundaries substituted. No graphical or full-world QA.
function display() {
  const d = { visible: true, text: '', destroyed: false };
  for (const method of ['setOrigin', 'setInteractive', 'setScrollFactor', 'setDepth', 'on', 'setPosition']) d[method] = () => d;
  d.setVisible = value => { d.visible = value; return d; };
  d.setText = value => { d.text = value; return d; };
  d.destroy = () => { d.destroyed = true; };
  return d;
}
function actor(x, y) {
  const a = { x, y, flipX: false };
  a.body = { velocity: { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } }, reset(x, y) { a.x = x; a.y = y; } };
  a.setVelocity = (x, y) => { a.body.velocity.x = x; a.body.velocity.y = y; return a; };
  a.setPosition = (x, y) => { a.x = x; a.y = y; return a; };
  a.setFlipX = value => { a.flipX = value; return a; };
  return a;
}
function fixture(t, { cat = { x: 100, y: 100 }, echo = { x: 70, y: 100 }, isSafe = () => true } = {}) {
  const events = new EventEmitter(), input = new EventEmitter(), keys = new Map();
  const calls = { command: 0, interact: 0, dash: 0, pauses: 0, resumes: 0, resets: 0, journey: [], transitions: [] };
  t.mock.method(SoundManager.get(), 'postalCue', () => false);
  t.mock.method(SettingsManager, 'get', () => ({ volume: 0, reducedMotion: false, autoFire: false }));
  const addKey = name => { if (!keys.has(name)) keys.set(name, new Key(null, KeyCodes[name])); return keys.get(name); };
  input.keyboard = { addKey, addKeys: names => Object.fromEntries(names.split(',').map(name => [name, addKey(name)])),
    resetKeys: () => { for (const key of keys.values()) key.reset(); } };
  input.mouse = { disableContextMenu() {} };
  const animation = () => ({ resetTransient() { calls.resets++; }, dash() { calls.dash++; }, update() {} });
  const scene = Object.assign(Object.create(PostalWalkScene.prototype), {
    cat: actor(cat.x, cat.y), echo: actor(echo.x, echo.y), catAnimator: animation(), echoAnimator: animation(),
    closed: false, paused: false, echoStays: false, echoTarget: { ...echo }, clock: 1000,
    worldSize: { width: 1800, height: 1300 }, safePoint: { ...cat }, facing: { x: 1, y: 0 },
    dashVelocity: { x: 0, y: 0 }, dashUntil: 0, nextDashAt: 0,
    keys: {}, requests: new Set(), bindings: [], walkTarget: null, marker: display(),
    lastDistance: Infinity, stalledMs: 0, trail: [{ ...cat }], echoApproach: [],
    notice: display(), noticeUntil: Infinity, input,
    sys: { isActive: () => true }, game: { events, hasFocus: true },
    cameras: { main: { getWorldPoint: (x, y) => ({ x, y }) } },
    physics: { pause: () => { calls.pauses++; }, resume: () => { calls.resumes++; } },
    add: { text: display, rectangle: display, container: display },
    scene: { start: name => calls.transitions.push(name) },
    isSafe, interact: () => { calls.interact++; }, command: () => { calls.command++; },
    tickJourney: delta => calls.journey.push(delta),
  });
  scene.bindControls();
  return { scene, calls, keys, input, events };
}
function tap(key, time = 100) { key.onDown({ repeat: false, timeStamp: time }); key.onUp({ timeStamp: time + 8 }); }
const pointer = (x = 350, y = 300, right = false) => ({ x, y, rightButtonDown: () => right, leftButtonDown: () => !right });

test('postal walk retains actual Phaser 8ms action taps exactly once and holding cannot repeat them', t => {
  const { scene, keys, calls } = fixture(t);
  for (const name of ['SHIFT', 'E', 'F']) tap(keys.get(name));
  scene.update(0, 16); scene.update(16, 16);
  assert.equal(calls.dash, 1); assert.equal(calls.command, 1); assert.equal(calls.interact, 1);
  const held = keys.get('E'); held.onDown({ repeat: false, timeStamp: 200 });
  scene.update(32, 16);
  for (let i = 0; i < 20; i++) { held.onDown({ repeat: true, timeStamp: 210 + i }); scene.update(48 + i * 16, 16); }
  assert.equal(calls.command, 2);
  held.onUp({ timeStamp: 250 }); tap(held, 300); scene.update(400, 16);
  assert.equal(calls.command, 3);
});

test('postal pause clears pending taps, click destinations, held movement and transient animation before resuming', t => {
  const { scene, keys, calls, input } = fixture(t);
  input.emit('pointerdown', pointer()); tap(keys.get('F')); tap(keys.get('SHIFT'));
  keys.get('W').onDown({ repeat: false, timeStamp: 100 });
  scene.pauseWalk();
  assert.equal(scene.paused, true); assert.equal(calls.pauses, 1); assert.equal(calls.resets, 2);
  assert.equal(scene.walkTarget, null); assert.equal(scene.requests.size, 0); assert.equal(keys.get('W').isDown, false);
  for (const name of ['SHIFT', 'E', 'F']) tap(keys.get(name), 200);
  scene.update(0, 50); scene.resumeWalk(); scene.update(0, 50);
  assert.deepEqual([calls.dash, calls.command, calls.interact], [0, 0, 0]);
  assert.equal(scene.paused, false); assert.equal(calls.resumes, 1);
  tap(keys.get('F'), 300); scene.update(0, 16); assert.equal(calls.interact, 1);
});

test('actual blur and hidden handlers clear controls and cannot resume while the game remains unfocused', t => {
  for (const event of [boundary.Core.Events.BLUR, boundary.Core.Events.HIDDEN]) {
    const { scene, keys, input, events, calls } = fixture(t);
    input.emit('pointerdown', pointer()); tap(keys.get('E'));
    scene.game.hasFocus = false; events.emit(event);
    tap(keys.get('ENTER')); input.emit('pointerdown', pointer()); scene.update(0, 50);
    assert.equal(scene.paused, true); assert.equal(scene.requests.size, 0); assert.equal(scene.walkTarget, null);
    assert.equal(calls.command, 0); assert.equal(calls.journey.length, 0);
    scene.game.hasFocus = true; scene.resumeWalk(); scene.update(0, 16);
    assert.equal(calls.command, 0);
  }
});

test('postal pointer input filters HUD and interactive UI, and keyboard movement cancels point walking', t => {
  const { scene, keys, input } = fixture(t);
  input.emit('pointerdown', pointer(300, 40)); input.emit('pointerdown', pointer(300, 700));
  input.emit('pointerdown', pointer(), [{ input: { enabled: true } }]);
  assert.equal(scene.walkTarget, null);
  input.emit('pointerdown', pointer()); assert.deepEqual(scene.walkTarget, { x: 350, y: 300 });
  keys.get('A').onDown({ repeat: false, timeStamp: 100 }); keys.get('D').onDown({ repeat: false, timeStamp: 100 });
  scene.update(0, 16);
  assert.equal(scene.walkTarget, null); assert.equal(scene.cat.body.velocity.length(), 0);
});

test('postal closure detaches the real key, pointer and visibility listeners and cannot consume later input', t => {
  const { scene, keys, input, events, calls } = fixture(t);
  tap(keys.get('F')); scene.closeWalk();
  assert.equal(scene.requests.size, 0); assert.deepEqual(scene.trail, []); assert.deepEqual(scene.echoApproach, []);
  for (const name of ['SHIFT', 'E', 'F', 'ESC', 'ENTER']) assert.equal(keys.get(name).listenerCount('down'), 0);
  assert.equal(input.listenerCount('pointerdown'), 0); assert.equal(events.eventNames().length, 0);
  tap(keys.get('F'), 300); scene.update(0, 50); assert.equal(calls.interact, 0);
});

test('postal nonfinite or negative frame deltas never advance clock, companion distance or region simulation time', t => {
  const { scene, calls } = fixture(t, { cat: { x: 300, y: 300 }, echo: { x: 100, y: 100 } });
  scene.trail = [{ x: 100, y: 300 }, { x: 300, y: 300 }];
  for (const delta of [NaN, Infinity, -Infinity, -50, undefined]) {
    const before = { x: scene.echo.x, y: scene.echo.y, clock: scene.clock };
    scene.update(0, delta);
    assert.deepEqual({ x: scene.echo.x, y: scene.echo.y, clock: scene.clock }, before);
    assert.equal(calls.journey.at(-1), 0);
  }
  scene.update(0, 10000);
  assert.equal(scene.clock, 1050); assert.equal(calls.journey.at(-1), 50);
  assert.ok(Math.hypot(scene.echo.x - 100, scene.echo.y - 100) <= 15.5 + 1e-8);
});

// A U-shaped dry route around a square pond. Player samples below follow only
// dry segments; the actual base-scene follower must preserve those same turns.
const shoreSafe = p => !(p.x > 120 && p.x < 280 && p.y > 120 && p.y < 280);
function advanceEcho(scene, ticks = 250) {
  const points = [];
  for (let i = 0; i < ticks; i++) { scene.update(i * 16, 16); points.push({ x: scene.echo.x, y: scene.echo.y }); }
  return points;
}

test('postal follower reaches a nearby player by actual queued shoreline footsteps instead of a direct water shortcut', t => {
  const { scene } = fixture(t, { cat: { x: 300, y: 300 }, echo: { x: 100, y: 100 }, isSafe: shoreSafe });
  scene.trail = [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 300, y: 300 }];
  const points = advanceEcho(scene);
  assert.ok(points.every(shoreSafe));
  assert.ok(Math.hypot(scene.echo.x - scene.cat.x, scene.echo.y - scene.cat.y) <= 38.01);
});

test('postal sendEcho preserves a distant companions old approach to an anchor without cutting across water', t => {
  const { scene } = fixture(t, { cat: { x: 300, y: 300 }, echo: { x: 100, y: 100 }, isSafe: shoreSafe });
  scene.trail = [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 300, y: 300 }];
  const anchor = { x: 325, y: 300 };
  scene.sendEcho(anchor);
  assert.deepEqual(scene.echoApproach, [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 300, y: 300 }, anchor]);
  const points = advanceEcho(scene);
  assert.ok(points.every(shoreSafe)); assert.equal(scene.echoStays, true);
  assert.ok(Math.hypot(scene.echo.x - anchor.x, scene.echo.y - anchor.y) < 1);
});

test('postal recall during an unfinished approach retains both the old approach and the players newly walked return route', t => {
  const { scene } = fixture(t, { cat: { x: 300, y: 300 }, echo: { x: 100, y: 100 }, isSafe: shoreSafe });
  scene.trail = [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 300, y: 300 }];
  scene.sendEcho({ x: 325, y: 300 }); advanceEcho(scene, 15);
  scene.cat.setPosition(300, 100);
  scene.trail = [{ x: 325, y: 300 }, { x: 300, y: 300 }, { x: 300, y: 100 }];
  const pending = structuredClone(scene.echoApproach);
  scene.recallEcho();
  assert.deepEqual(scene.trail.slice(0, pending.length), pending);
  assert.deepEqual(scene.echoApproach, []);
  assert.ok(advanceEcho(scene).every(shoreSafe));
  assert.ok(Math.hypot(scene.echo.x - scene.cat.x, scene.echo.y - scene.cat.y) <= 38.01);
});

test('postal staying companion remembers the players real detour before following again', t => {
  const { scene } = fixture(t, { cat: { x: 100, y: 100 }, echo: { x: 100, y: 100 }, isSafe: shoreSafe });
  scene.sendEcho({ x: 100, y: 100 }); advanceEcho(scene, 3);
  const walkSegment = target => {
    while (Math.hypot(target.x - scene.cat.x, target.y - scene.cat.y) > 0) {
      const dx = target.x - scene.cat.x, dy = target.y - scene.cat.y, d = Math.hypot(dx, dy), move = Math.min(d, 5);
      scene.cat.setPosition(scene.cat.x + dx / d * move, scene.cat.y + dy / d * move); scene.update(0, 16);
      assert.equal(shoreSafe(scene.cat), true);
    }
  };
  walkSegment({ x: 100, y: 300 }); walkSegment({ x: 300, y: 300 });
  assert.deepEqual({ x: scene.echo.x, y: scene.echo.y }, { x: 100, y: 100 });
  scene.recallEcho(); assert.ok(advanceEcho(scene).every(shoreSafe));
  assert.ok(Math.hypot(scene.echo.x - 300, scene.echo.y - 300) <= 38.01);
});

test('postal long staying walk compresses closed detours without discarding a necessary shoreline corner', t => {
  const { scene } = fixture(t, { cat: { x: 100, y: 100 }, echo: { x: 100, y: 100 }, isSafe: shoreSafe });
  scene.sendEcho({ x: 100, y: 100 }); advanceEcho(scene, 3);
  const followCat = points => { for (const point of points) { assert.equal(shoreSafe(point), true); scene.cat.setPosition(point.x, point.y); scene.update(0, 16); } };
  // Every adjacent pair is dry. This walk would have exceeded the old 600-point
  // truncation branch; safe closed-detour compression should keep it compact.
  followCat(Array.from({ length: 8 }, (_, i) => ({ x: 100, y: 125 + i * 25 })));
  followCat(Array.from({ length: 8 }, (_, i) => ({ x: 125 + i * 25, y: 300 })));
  for (let i = 0; i < 310; i++) followCat([{ x: 300, y: 325 }, { x: 300, y: 300 }]);
  assert.ok(scene.trail.length < 20, 'repeated local loops do not accumulate an unbounded history');
  scene.recallEcho();
  const points = advanceEcho(scene, 100);
  assert.ok(points.every(shoreSafe), 'a bounded footstep history must not turn a dry U-shaped route into a diagonal through the pond');
});

test('postal safeSegment tests the interior and rejects a water shortcut even when both endpoints are dry', t => {
  const { scene } = fixture(t, { isSafe: shoreSafe });
  assert.equal(scene.safeSegment({ x: 100, y: 100 }, { x: 300, y: 300 }), false);
  assert.equal(scene.safeSegment({ x: 100, y: 100 }, { x: 100, y: 300 }), true);
  assert.equal(scene.safeSegment({ x: 100, y: 300 }, { x: 300, y: 300 }), true);
});

test('postal fallback compression over 600 pending points preserves the only dry corner in its prefix', t => {
  const { scene } = fixture(t, { cat: { x: 350, y: 300 }, echo: { x: 100, y: 100 }, isSafe: shoreSafe });
  // A pre-existing long pending history: every segment is dry but replacing the
  // earliest corner with any later point would cross the square pond.
  scene.trail = [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 300, y: 300 },
    ...Array.from({ length: 600 }, (_, i) => ({ x: 300, y: i % 2 ? 300 : 325 }))];
  scene.update(0, 16);
  assert.deepEqual(scene.trail[0], { x: 100, y: 300 });
  assert.ok(advanceEcho(scene, 120).every(shoreSafe));
});

test('postal normal following after long straight-line compression settles within the footstep interval plus follow gap', t => {
  const { scene } = fixture(t);
  for (let x = 105; x <= 595; x += 5) { scene.cat.setPosition(x, 100); scene.update(0, 16); }
  scene.cat.setPosition(599, 100);
  advanceEcho(scene, 120);
  const gap = Math.hypot(scene.cat.x - scene.echo.x, scene.cat.y - scene.echo.y);
  assert.ok(gap >= 38 - 1e-8 && gap < 63, `the final 25px footstep interval permits a gap of ${gap}px`);
  assert.ok(scene.trail.length <= 2);
  scene.sendEcho({ x: 620, y: 100 }); advanceEcho(scene, 80);
  assert.ok(Math.hypot(scene.echo.x - 620, scene.echo.y - 100) < 1, 'a command still reaches the real anchor exactly');
});
