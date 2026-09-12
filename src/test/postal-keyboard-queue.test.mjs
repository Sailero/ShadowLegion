import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { PostalWalkScene } = await import('../scenes/PostalWalkScene.ts');
const { DeliveryScene } = await import('../scenes/DeliveryScene.ts');
const boundary = (await import('./fixtures/phaser-scene.mjs')).default;
const require = createRequire(import.meta.url);
const KeyboardManager = require('../../node_modules/phaser/src/input/keyboard/KeyboardManager.js');
const KeyboardPlugin = require('../../node_modules/phaser/src/input/keyboard/KeyboardPlugin.js');
const KeyCodes = require('../../node_modules/phaser/src/input/keyboard/keys/KeyCodes.js');
const CoreEvents = require('../../node_modules/phaser/src/core/events');
const EventEmitter = require('eventemitter3');
boundary.Core = { Events: CoreEvents };

// Run the installed Phaser DOM listener -> global queue -> scene plugin -> Key
// path. Only the DOM target, rendering, physics and scene transition are bounded;
// no copied keyboard dispatch/reset logic and no claim of browser rendering QA.
function display() {
  const result = { destroyed: false };
  for (const method of ['setOrigin', 'setInteractive', 'setScrollFactor', 'setDepth', 'setVisible', 'on']) result[method] = () => result;
  result.destroy = () => { result.destroyed = true; };
  return result;
}
function fixture(t, region) {
  const nativeListeners = new Map(), calls = { pause: 0, resume: 0, transitions: [], escEvents: [] };
  const game = { events: new EventEmitter(), hasFocus: true };
  const target = {
    addEventListener: (name, callback) => nativeListeners.set(name, callback),
    removeEventListener: name => nativeListeners.delete(name),
  };
  const inputManager = { events: new EventEmitter(), game,
    config: { inputKeyboard: true, inputKeyboardEventTarget: target, inputKeyboardCapture: [] } };
  const manager = new KeyboardManager(inputManager);
  inputManager.keyboard = manager;
  manager.boot();
  const input = new EventEmitter();
  const scene = Object.assign(Object.create(region === 'forest' ? DeliveryScene.prototype : PostalWalkScene.prototype), {
    input, game, closed: false, paused: false, requests: new Set(), bindings: [],
    keyBindings: [], marker: display(), walkMarker: display(), cat: { body: {}, setVelocity() {} },
    catAnimator: { resetTransient() {} }, echoAnimator: { resetTransient() {} },
    physics: { pause: () => calls.pause++, resume: () => calls.resume++ },
    add: { text: display, rectangle: display, container: display },
    scene: { start: name => calls.transitions.push(name) },
  });
  scene.sys = { settings: { input: {} }, events: new EventEmitter(), canInput: () => !scene.closed, isActive: () => !scene.closed };
  Object.assign(input, { scene, systems: { game }, manager: inputManager, pluginEvents: new EventEmitter(),
    mouse: { disableContextMenu() {} } });
  input.keyboard = new KeyboardPlugin(input);
  input.keyboard.boot(); input.keyboard.start();
  if (region === 'forest') scene.bindInput(); else scene.bindControls();
  input.keyboard.keys[KeyCodes.ESC].on('down', (_key, event) => calls.escEvents.push(event));
  let time = 100;
  function dispatch(type, name, repeat = false) {
    const event = { type, keyCode: KeyCodes[name], timeStamp: time++, repeat, defaultPrevented: false,
      altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, location: 0,
      preventDefault() { this.defaultPrevented = true; } };
    nativeListeners.get(type)(event);
    return event;
  }
  const frame = () => game.events.emit(CoreEvents.POST_STEP);
  t.after(() => {
    if (region === 'forest') scene.closeInput(); else scene.closeWalk();
    input.keyboard.shutdown(); manager.stopListeners();
  });
  return { scene, calls, game, manager, keyboard: input.keyboard, dispatch, frame };
}

for (const region of ['lake', 'forest']) {
const exitScene = region === 'forest' ? 'MenuScene' : 'JourneyMapScene';

test(`${region}: an isolated Escape tap pauses and a next-frame Enter tap resumes with the real Phaser queue`, t => {
  const { scene, calls, dispatch, frame, manager } = fixture(t, region);
  dispatch('keydown', 'ESC'); dispatch('keyup', 'ESC');
  assert.equal(scene.paused, true); assert.equal(calls.pause, 1); assert.deepEqual(calls.transitions, []);
  assert.equal(manager.queue.length, 2);
  frame(); assert.equal(manager.queue.length, 0);
  dispatch('keydown', 'ENTER'); dispatch('keyup', 'ENTER');
  assert.equal(scene.paused, false); assert.equal(calls.resume, 1); assert.deepEqual(calls.transitions, []);
});

test(`${region}: Escape then Enter within one frame consumes the old Escape event once despite resetKeys`, t => {
  const { scene, calls, dispatch } = fixture(t, region);
  const esc = dispatch('keydown', 'ESC'); dispatch('keyup', 'ESC');
  dispatch('keydown', 'ENTER'); dispatch('keyup', 'ENTER');
  assert.ok(calls.escEvents.filter(event => event === esc).length > 1, 'Phaser really rescans the identical DOM event');
  assert.deepEqual(calls.transitions, [], 'a replay of the pause event must not take the paused exit branch');
  assert.equal(scene.closed, false); assert.equal(scene.paused, false);
  assert.equal(calls.pause, 1); assert.equal(calls.resume, 1);
});

test(`${region}: one Escape tap while walking cannot leave when an earlier movement event remains queued`, t => {
  const { scene, calls, dispatch } = fixture(t, region);
  dispatch('keydown', 'W');
  dispatch('keydown', 'ESC'); dispatch('keyup', 'ESC');
  assert.equal(scene.paused, true); assert.equal(scene.closed, false);
  assert.deepEqual(calls.transitions, []); assert.equal(calls.pause, 1);
});

test(`${region}: OS repeats and unrelated queued key events cannot convert a held pause key into an exit`, t => {
  const { scene, calls, dispatch, frame } = fixture(t, region);
  dispatch('keydown', 'ESC'); frame();
  dispatch('keydown', 'ESC', true); dispatch('keydown', 'F'); dispatch('keyup', 'F');
  dispatch('keyup', 'ESC');
  assert.equal(scene.paused, true); assert.deepEqual(calls.transitions, []);
  assert.equal(scene.requests.size, 0);
});

test(`${region}: a genuinely new Escape tap on the paused panel still exits once`, t => {
  const { scene, calls, dispatch } = fixture(t, region);
  dispatch('keydown', 'ESC'); dispatch('keyup', 'ESC');
  dispatch('keydown', 'ESC'); dispatch('keyup', 'ESC');
  assert.equal(scene.closed, true); assert.deepEqual(calls.transitions, [exitScene]);
});

test(`${region}: an already blurred scene takes the paused Escape branch without any queue replay`, t => {
  const { scene, calls, game, dispatch, frame } = fixture(t, region);
  game.hasFocus = false; game.events.emit(CoreEvents.BLUR);
  assert.equal(scene.paused, true);
  frame(); game.hasFocus = true;
  dispatch('keydown', 'ESC');
  assert.equal(calls.escEvents.length, 1);
  assert.equal(scene.closed, true); assert.deepEqual(calls.transitions, [exitScene]);
});

test(`${region}: Enter after a blur resumes safely and clears movement without executing queued interactions`, t => {
  const { scene, calls, game, dispatch, frame, keyboard } = fixture(t, region);
  dispatch('keydown', 'W'); dispatch('keydown', 'F');
  game.hasFocus = false; game.events.emit(CoreEvents.BLUR);
  frame(); game.hasFocus = true;
  dispatch('keydown', 'ENTER'); dispatch('keyup', 'ENTER');
  assert.equal(scene.paused, false); assert.deepEqual(calls.transitions, []);
  assert.equal(keyboard.keys[KeyCodes.W].isDown, false); assert.equal(scene.requests.size, 0);
});
}
