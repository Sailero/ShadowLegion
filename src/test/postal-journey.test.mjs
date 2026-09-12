import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { PostalJourneyManager as Postal, POSTAL_JOURNEY_STORAGE_KEY as KEY, POSTAL_ADDRESS_IDS as IDS, sanitizePostalJourney } from '../systems/PostalJourneyManager.ts';

function storage(options = {}) {
  const values = new Map();
  const writes = [];
  const reads = [];
  globalThis.localStorage = {
    getItem(key) { reads.push(key); if (options.readFails?.()) throw Error('read refused'); return values.get(key) ?? null; },
    setItem(key, value) {
      writes.push(key);
      if (options.writeFails?.()) throw Error('write refused');
      if (!options.silent?.()) values.set(key, value);
    },
  };
  return { values, writes, reads };
}
const complete = () => { for (const id of IDS) assert.equal(Postal.findAddress(id).saved, true); return Postal.completeDelivery('forest-letter-1'); };

test('postal state persists every address fragment before idempotent delivery and never reads another game domain', () => {
  const { values, writes, reads } = storage();
  values.set('shadowlegion_meta_v1', 'untouched');
  assert.deepEqual(Postal.getState(), { version: 1, foundAddressIds: [], deliveryCompleted: false, completionId: null });
  assert.equal(Postal.completeDelivery('too-early').error, 'incomplete-address');
  for (const [index, id] of IDS.entries()) {
    assert.equal(Postal.findAddress(id).saved, true);
    assert.equal(JSON.parse(values.get(KEY)).foundAddressIds.length, index + 1);
  }
  assert.equal(Postal.completeDelivery('forest-letter-1').saved, true);
  const firstBytes = values.get(KEY);
  assert.equal(Postal.completeDelivery('forest-letter-1').duplicate, true);
  assert.equal(Postal.completeDelivery('a-later-scene').duplicate, true);
  assert.equal(Postal.findAddress(IDS[0]).duplicate, true);
  assert.equal(values.get(KEY), firstBytes);
  assert.deepEqual(writes, [KEY, KEY, KEY, KEY]);
  assert.ok(reads.every(key => key === KEY));
  assert.equal(values.get('shadowlegion_meta_v1'), 'untouched');
});

test('postal sanitizer rejects fabricated completions, unknown versions and invalid domain fields', () => {
  const valid = { version: 1, foundAddressIds: [...IDS], deliveryCompleted: true, completionId: 'forest-letter-1' };
  assert.deepEqual(sanitizePostalJourney(valid), valid);
  for (const value of [null, {}, [], { ...valid, version: 2 }, { ...valid, foundAddressIds: IDS.slice(1) },
    { ...valid, completionId: null }, { ...valid, completionId: 'bad id' }, { ...valid, foundAddressIds: ['unknown'] },
    { ...valid, deliveryCompleted: 1 }, { ...valid, deliveryCompleted: false }, { ...valid, foundAddressIds: [IDS[0], IDS[0], IDS[1]] }]) {
    assert.equal(sanitizePostalJourney(value), null);
  }
});

test('postal storage failure and silent refusal retain visible retryable fragments', () => {
  let fail = true;
  storage({ writeFails: () => fail });
  assert.equal(Postal.findAddress(IDS[0]).saved, false);
  assert.deepEqual(Postal.getState().foundAddressIds, []);
  fail = false;
  assert.equal(Postal.findAddress(IDS[0]).saved, true);
  let silent = true;
  storage({ silent: () => silent });
  assert.equal(Postal.findAddress(IDS[0]).error, 'write-failed');
  silent = false;
  assert.equal(Postal.findAddress(IDS[0]).saved, true);
});

test('postal failed final write never claims delivery; same receipt can be retried', () => {
  let fail = false;
  const { values } = storage({ writeFails: () => fail });
  for (const id of IDS) Postal.findAddress(id);
  fail = true;
  const attempt = Postal.completeDelivery('retained-receipt');
  assert.equal(attempt.saved, false);
  assert.equal(attempt.state.deliveryCompleted, false);
  assert.equal(JSON.parse(values.get(KEY)).completionId, null);
  fail = false;
  assert.equal(Postal.completeDelivery('retained-receipt').saved, true);
  assert.equal(Postal.getState().completionId, 'retained-receipt');
});

test('postal committed write with failed readback is confirmed by a duplicate retry without another write', () => {
  let failRead = false;
  const { values, writes } = storage({ readFails: () => failRead });
  for (const id of IDS) Postal.findAddress(id);
  globalThis.localStorage.setItem = (key, value) => { writes.push(key); values.set(key, value); failRead = true; };
  assert.equal(Postal.completeDelivery('uncertain-readback').saved, false);
  failRead = false;
  const retry = Postal.completeDelivery('uncertain-readback');
  assert.equal(retry.saved, true);
  assert.equal(retry.duplicate, true);
  assert.equal(writes.length, 4);
});

test('postal future version, malformed storage and unavailable reads are protected from writes', () => {
  const { values, writes } = storage();
  for (const raw of ['{"version":2,"newStory":"keep"}', '{broken', JSON.stringify({ version: 1, foundAddressIds: [], deliveryCompleted: true, completionId: 'fake' })]) {
    values.set(KEY, raw);
    assert.equal(Postal.findAddress(IDS[0]).saved, false);
    assert.equal(Postal.completeDelivery('new').saved, false);
    assert.equal(values.get(KEY), raw);
  }
  assert.deepEqual(writes, []);
  storage({ readFails: () => true });
  assert.equal(Postal.findAddress(IDS[0]).error, 'storage-unavailable');
});

test('postal invalid action input cannot change an otherwise valid story record', () => {
  const { values, writes } = storage();
  assert.equal(Postal.findAddress('injected').error, 'invalid-address');
  assert.equal(Postal.completeDelivery('').error, 'invalid-completion');
  assert.equal(Postal.completeDelivery('x'.repeat(121)).saved, false);
  assert.equal(values.has(KEY), false);
  assert.deepEqual(writes, []);
});

test('postal returning to a fresh scene reads delivery and return shortcut from the single durable record', () => {
  storage();
  assert.equal(complete().saved, true);
  assert.deepEqual(Postal.getState(), { version: 1, foundAddressIds: [...IDS], deliveryCompleted: true, completionId: 'forest-letter-1' });
});

test('postal read-before-write protection preserves a future version arriving during an action', () => {
  const { values, writes } = storage();
  let reads = 0;
  globalThis.localStorage.getItem = key => {
    if (++reads === 2) values.set(KEY, '{"version":2,"newStory":"arrived"}');
    return values.get(key) ?? null;
  };
  assert.equal(Postal.findAddress(IDS[0]).error, 'future-version');
  assert.equal(writes.length, 0);
  assert.equal(values.get(KEY), '{"version":2,"newStory":"arrived"}');
});

// Exercise the actual scene's interaction/bridge state methods, replacing only
// drawing and Sprite/Scene construction. These are not real collision or UI QA.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { DeliveryScene } = await import('../scenes/DeliveryScene.ts');
const { CatAnimator } = await import('../systems/CatAnimator.ts');
const { SoundManager } = await import('../systems/SoundManager.ts');
const ink = () => new Proxy({}, { get: (object, key) => object[key] ?? (() => object.proxy), set: (object, key, value) => { object[key] = value; return true; } });
function graphics() { const result = ink(); result.proxy = result; return result; }
function deliveryScene(state = Postal.getState()) {
  const notices = [], visibility = new Map();
  const scene = Object.assign(Object.create(DeliveryScene.prototype), {
    state, cat: { x: 355, y: 810 }, echo: { x: 620, y: 620 }, echoStays: false,
    bridgeBlocker: { body: { enable: true } }, bridgeArt: graphics(), shortcutArt: graphics(), bellArt: graphics(),
    pieceIcons: new Map(IDS.map(id => [id, { setVisible: value => visibility.set(id, value) }])),
    catAnimator: { celebrate() {}, resetTransient() {} }, echoAnimator: { celebrate() {}, resetTransient() {} },
    completionId: 'scene-letter-1', say: message => notices.push(message),
  });
  return { scene, notices, visibility };
}

test('postal bridge collider stays enabled until the waiting companion actually reaches the bell stone', () => {
  storage();
  const { scene } = deliveryScene();
  scene.updateBridge();
  assert.equal(scene.bridgeBlocker.body.enable, true);
  scene.echoStays = true;
  scene.updateBridge();
  assert.equal(scene.bridgeBlocker.body.enable, true, 'the instruction alone cannot open the bridge from far away');
  scene.echo.x = 660;
  scene.updateBridge();
  assert.equal(scene.bridgeOpen, true);
  assert.equal(scene.bridgeBlocker.body.enable, false);
  scene.echoStays = false;
  scene.updateBridge();
  assert.equal(scene.bridgeBlocker.body.enable, true, 'recalling the companion closes real collision access');
});

test('postal bridge drawing only rebuilds on state changes while its actual collision enable is refreshed every tick', () => {
  storage();
  const { scene } = deliveryScene();
  let draws = 0;
  scene.bridgeArt.clear = () => { draws++; return scene.bridgeArt; };
  scene.updateBridge();
  assert.equal(draws, 1);
  for (let i = 0; i < 60; i++) {
    scene.bridgeBlocker.body.enable = false;
    scene.updateBridge();
    assert.equal(scene.bridgeBlocker.body.enable, true);
  }
  assert.equal(draws, 1);
  scene.echoStays = true; scene.echo.x = 660; scene.updateBridge();
  assert.equal(draws, 2); assert.equal(scene.bridgeBlocker.body.enable, false);
  scene.echoStays = false; scene.updateBridge();
  assert.equal(draws, 3); assert.equal(scene.bridgeBlocker.body.enable, true);
  scene.paintedBridgeOpen = undefined; scene.updateBridge();
  assert.equal(draws, 4, 'a recreated scene renders its initial bridge again');
});

test('postal scene keeps a refused fragment visible and silent until an F interaction confirms storage', t => {
  const cues = [];
  t.mock.method(SoundManager.get(), 'postalCue', kind => { cues.push(kind); return true; });
  let reject = true;
  storage({ silent: () => reject });
  const { scene, notices, visibility } = deliveryScene();
  scene.syncSavedWorld();
  scene.interact();
  assert.equal(visibility.get('recipient'), true);
  assert.equal(scene.state.foundAddressIds.length, 0);
  assert.match(notices.at(-1), /没有确认保存/);
  assert.deepEqual(cues, []);
  reject = false;
  scene.interact();
  assert.equal(visibility.get('recipient'), false);
  assert.deepEqual(scene.state.foundAddressIds, ['recipient']);
  assert.match(notices.at(-1), /已保存/);
  scene.interact();
  assert.deepEqual(cues, ['address'], 'a saved fragment cannot emit another success cue on repeated F');
});

test('postal scene unlocks its return shortcut and plays success only after the actual delivery write succeeds', t => {
  const cues = [];
  t.mock.method(SoundManager.get(), 'postalCue', kind => { cues.push(kind); return true; });
  let reject = false;
  storage({ writeFails: () => reject });
  for (const id of IDS) Postal.findAddress(id);
  const { scene, notices } = deliveryScene();
  scene.cat = { x: 1240, y: 650 };
  reject = true;
  scene.interact();
  assert.equal(scene.state.deliveryCompleted, false);
  assert.match(notices.at(-1), /没有确认保存/);
  assert.deepEqual(cues, []);
  reject = false;
  scene.interact();
  assert.equal(scene.state.deliveryCompleted, true);
  assert.equal(Postal.getState().completionId, 'scene-letter-1');
  assert.match(notices.at(-1), /回信已保存/);
  scene.interact();
  assert.deepEqual(cues, ['delivery'], 'revisiting the squirrel is conversation, not another delivery sound');
});

function movementScene() {
  const result = deliveryScene();
  const { scene } = result;
  Object.assign(scene, {
    closed: false, paused: false, sys: { isActive: () => true }, game: { hasFocus: true }, clock: 100, dashUntil: 0,
    requests: new Set(), walkTarget: null, lastTargetDistance: Infinity, targetStallMs: 0,
    keys: Object.fromEntries(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(name => [name, { isDown: false }])),
    cameras: { main: { getWorldPoint: (x, y) => ({ x: x + 600, y: y + 100 }) } },
    input: { keyboard: { resetKeys() {} } },
  });
  return result;
}
const pointer = (x = 200, y = 300, right = false) => ({ x, y, rightButtonDown: () => right, leftButtonDown: () => !right });

test('postal ground clicking creates a world-space walking target; right click only requests a short dash', () => {
  storage();
  const { scene } = movementScene();
  scene.handlePointerDown(pointer());
  assert.deepEqual(scene.walkTarget, { x: 800, y: 400 });
  assert.ok(scene.movementIntent(50).x > 0);
  scene.clearWalkTarget();
  scene.handlePointerDown(pointer(200, 300, true));
  assert.equal(scene.walkTarget, null);
  assert.deepEqual([...scene.requests], ['dash']);
});

test('postal HUD, interactive UI, pause, loss of focus and closed scene never create mouse movement', () => {
  storage();
  const { scene } = movementScene();
  scene.handlePointerDown(pointer(200, 80));
  scene.handlePointerDown(pointer(200, 710));
  scene.handlePointerDown(pointer(), [{ input: { enabled: true } }]);
  scene.paused = true; scene.handlePointerDown(pointer()); scene.paused = false;
  scene.game.hasFocus = false; scene.handlePointerDown(pointer()); scene.game.hasFocus = true;
  scene.closed = true; scene.handlePointerDown(pointer());
  assert.equal(scene.walkTarget, null);
  assert.equal(scene.requests.size, 0);
});

test('postal keyboard movement immediately cancels a click target, including opposing held directions', () => {
  storage();
  const { scene } = movementScene();
  scene.handlePointerDown(pointer());
  scene.keys.D.isDown = true;
  assert.deepEqual(scene.movementIntent(50), { x: 1, y: 0 });
  assert.equal(scene.walkTarget, null);
  scene.handlePointerDown(pointer());
  scene.keys.A.isDown = true;
  assert.deepEqual(scene.movementIntent(50), { x: 0, y: 0 });
  assert.equal(scene.walkTarget, null);
});

test('postal point walking stops at its destination or after 400ms without approach; it never routes through obstacles', () => {
  storage();
  const { scene, notices } = movementScene();
  scene.walkTarget = { x: scene.cat.x + 4, y: scene.cat.y };
  assert.deepEqual(scene.movementIntent(50), { x: 0, y: 0 });
  assert.equal(scene.walkTarget, null);
  scene.walkTarget = { x: scene.cat.x + 200, y: scene.cat.y };
  scene.movementIntent(50); // first sample establishes distance
  for (let i = 0; i < 7; i++) assert.deepEqual(scene.movementIntent(50), { x: 1, y: 0 });
  assert.deepEqual(scene.movementIntent(50), { x: 0, y: 0 });
  assert.equal(scene.walkTarget, null);
  assert.match(notices.at(-1), /被挡住/);
});

test('postal clearing input removes mouse target and action requests before stopping movement', () => {
  storage();
  const { scene } = movementScene();
  let stopped = false;
  scene.cat.body = {};
  scene.cat.setVelocity = (x, y) => { stopped = x === 0 && y === 0; };
  scene.handlePointerDown(pointer()); scene.requests.add('interact');
  scene.clearInput();
  assert.equal(scene.walkTarget, null);
  assert.equal(scene.requests.size, 0);
  assert.equal(stopped, true);
});

test('postal actual update emits one command and one accepted dash cue, with no cooldown or later auto-repeat cue', t => {
  storage();
  const cues = [];
  t.mock.method(SoundManager.get(), 'postalCue', kind => { cues.push(kind); return false; });
  const { scene } = movementScene();
  const velocity = { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } };
  scene.cat.body = { velocity };
  scene.cat.setVelocity = (x, y) => { velocity.x = x; velocity.y = y; };
  scene.cat.setFlipX = () => {};
  scene.echo.setPosition = (x, y) => { scene.echo.x = x; scene.echo.y = y; };
  scene.echo.setFlipX = () => {};
  scene.catAnimator.update = scene.echoAnimator.update = () => {};
  scene.catAnimator.dash = () => {};
  scene.updateHint = () => {};
  scene.facing = { x: 1, y: 0 }; scene.nextDashAt = 0;
  scene.requests.add('dash'); scene.requests.add('dash'); scene.requests.add('command');
  scene.update(0, 16);
  assert.deepEqual(cues, ['command', 'dash']);
  assert.equal(scene.echoStays, true);
  assert.equal(velocity.x, 490, 'an unavailable cue does not block the real dash velocity');
  scene.requests.add('dash'); scene.update(16, 16);
  for (let i = 0; i < 20; i++) scene.update(i * 50, 50);
  assert.deepEqual(cues, ['command', 'dash'], 'a refused cooldown request is consumed, never delayed until charged');
  scene.requests.add('command'); scene.update(1100, 16);
  assert.deepEqual(cues, ['command', 'dash', 'command']);
  assert.equal(scene.echoStays, false);
});

test('postal audio initialization failure never interrupts a confirmed letter save', t => {
  storage();
  for (const id of IDS) Postal.findAddress(id);
  const { scene } = deliveryScene(); scene.cat = { x: 1240, y: 650 };
  t.mock.method(SoundManager.get(), 'ensureCtx', () => { throw Error('audio unavailable'); });
  assert.doesNotThrow(() => scene.interact());
  assert.equal(scene.state.deliveryCompleted, true);
  assert.equal(Postal.getState().deliveryCompleted, true);
});

test('postal pause and departure input clearing cancel the actual cat and echo transient animation states', () => {
  storage();
  const { scene } = movementScene();
  const sprite = () => ({
    scene: { textures: { exists: () => true } }, texture: { key: '' }, frame: { name: '' },
    setTexture(key, name) { this.texture.key = key; this.frame.name = name; },
  });
  const cat = sprite(), echo = sprite();
  scene.catAnimator = new CatAnimator(cat, 'ranger'); scene.echoAnimator = new CatAnimator(echo, 'echo');
  scene.catAnimator.dash(170); scene.echoAnimator.celebrate();
  scene.catAnimator.update(50, { speed: 490 }); scene.echoAnimator.update(50, { speed: 0 });
  assert.match(cat.frame.name, /^dash-/); assert.match(echo.frame.name, /^celebrate-/);
  scene.clearInput();
  assert.equal(cat.frame.name, 'idle-0'); assert.equal(echo.frame.name, 'idle-0');
  scene.catAnimator.update(50, { speed: 0 }); scene.echoAnimator.update(50, { speed: 0 });
  assert.match(cat.frame.name, /^idle-/); assert.match(echo.frame.name, /^idle-/);
});

test('postal bindings preserve an actual Phaser Key 8ms tap, ignore paused presses and detach on shutdown', () => {
  const require = createRequire(import.meta.url);
  const Key = require('../../node_modules/phaser/src/input/keyboard/keys/Key.js');
  const KeyCodes = require('../../node_modules/phaser/src/input/keyboard/keys/KeyCodes.js');
  const EventEmitter = require('eventemitter3');
  const boundary = require('../../node_modules/phaser/src/core/events');
  // Only the framework constants are added to the renderer-free scene boundary.
  PhaserBoundary.Core = { Events: boundary };
  storage();
  const { scene } = movementScene();
  const registered = new Map();
  const addKey = name => { if (!registered.has(name)) registered.set(name, new Key(null, KeyCodes[name])); return registered.get(name); };
  const inputEvents = new EventEmitter();
  scene.keyBindings = [];
  scene.game.events = new EventEmitter();
  scene.input = { on: (...args) => inputEvents.on(...args), off: (...args) => inputEvents.off(...args), keyboard: {
    addKey, addKeys: names => Object.fromEntries(names.split(',').map(name => [name, addKey(name)])),
    resetKeys: () => { for (const key of registered.values()) key.reset(); },
  } };
  scene.bindInput();
  const shift = registered.get('SHIFT');
  shift.onDown({ timeStamp: 100, repeat: false }); shift.onUp({ timeStamp: 108 });
  assert.equal(scene.requests.delete('dash'), true);
  assert.equal(scene.requests.delete('dash'), false);
  scene.paused = true;
  const interact = registered.get('F');
  interact.onDown({ timeStamp: 120, repeat: false }); interact.onUp({ timeStamp: 128 });
  assert.equal(scene.requests.has('interact'), false);
  scene.paused = false;
  shift.reset(); shift.onDown({ timeStamp: 150, repeat: true });
  assert.equal(scene.requests.has('dash'), false);
  scene.closeInput();
  assert.equal(shift.listenerCount('down'), 0);
  assert.equal(interact.listenerCount('down'), 0);
  assert.equal(inputEvents.listenerCount('pointerdown'), 0);
  assert.equal(scene.game.events.eventNames().length, 0);
});

const PhaserBoundary = (await import('./fixtures/phaser-scene.mjs')).default;
