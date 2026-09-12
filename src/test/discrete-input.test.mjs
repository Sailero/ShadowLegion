import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';

// Use real installed Phaser Key/KeyboardPlugin methods for input transitions.
// Only Sprite/Scene construction is replaced; no browser or renderer is simulated.
const require = createRequire(import.meta.url);
const Key = require('../../node_modules/phaser/src/input/keyboard/keys/Key.js');
const JustDown = require('../../node_modules/phaser/src/input/keyboard/keys/JustDown.js');
const KeyboardPlugin = require('../../node_modules/phaser/src/input/keyboard/KeyboardPlugin.js');
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { Hero } = await import('../entities/Hero.ts');
const { ArenaScene } = await import('../scenes/ArenaScene.ts');

const event = (timeStamp, repeat = false) => ({ timeStamp, repeat, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, location: 0 });
const tap = (key, time = 20) => { key.onDown(event(time)); key.onUp(event(time + 8)); };

function setup() {
  const events = [];
  const velocity = { x: 0, y: 0, length() { return Math.hypot(this.x, this.y); } };
  const keys = Object.fromEntries(Object.entries({ W: 87, A: 65, S: 83, D: 68, SHIFT: 16, SPACE: 32, Q: 81,
    UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39 }).map(([name, code]) => [name, new Key(null, code)]));
  const hero = Object.assign(Object.create(Hero.prototype), {
    hp: 120, maxHp: 120, charge: 100, chargeMax: 100, skillLevels: { burst: 1, barrage: 1 },
    activeSkillId: 'burst', unlockedSkills: ['burst', 'barrage'], keys,
    lastDash: -10000, dashCooldown: 900, dashSpd: 500, dashDur: 150, dashing: false, dashEnd: 0,
    x: 20, y: 20, aimAngle: 0, fireRate: 200, lastFire: 0, atkSpdMult: 1,
    moveSpeed: 200, speedMult: 1, terrainSpeedMult: 1, accel: 1000, decel: 1000,
    body: { velocity, setVelocity(x, y) { velocity.x = x; velocity.y = y; } },
    setAlpha() { return this; }, setFlipX() { return this; },
    scene: {
      events: { emit: (name, data) => events.push({ name, data }) },
      data: { get: () => 0 },
      input: { activePointer: { x: 100, y: 20, isDown: false, rightButtonDown: () => false } },
      cameras: { main: { getWorldPoint: (x, y) => ({ x, y }) } },
    },
  });
  let sceneActive = true;
  const keyboard = { keys: Object.values(keys), resetKeys() { KeyboardPlugin.prototype.resetKeys.call(this); } };
  const arena = Object.assign(Object.create(ArenaScene.prototype), {
    hero, input: { keyboard }, game: { hasFocus: true }, sys: { isActive: () => sceneActive },
    dead: false, paused: false, upgrading: false, tutorial: { isActive: false },
    waveMgr: { wave: 1, allWavesDone: false },
  });
  hero.configureActionInput(() => arena.canAcceptCombatAction());
  return { hero, arena, keys, events, count: name => events.filter(event => event.name === name).length,
    setSceneActive: value => { sceneActive = value; } };
}

test('real Phaser 8ms key taps survive keyup and execute once in the actual Hero tick', () => {
  const { hero, keys, count } = setup();
  for (const name of ['SHIFT', 'SPACE', 'Q']) {
    tap(keys[name]);
    assert.equal(JustDown(keys[name]), false, 'the original polling path has already lost this press');
  }
  hero.tick(100, 50);
  assert.equal(count('heroDash'), 1);
  assert.equal(count('heroSkill'), 1);
  assert.equal(count('skillSwitch'), 1);
  assert.equal(hero.charge, 0);
  hero.tick(150, 50);
  assert.equal(count('heroDash'), 1);
  assert.equal(count('heroSkill'), 1);
  assert.equal(count('skillSwitch'), 1);
});

test('holding a real Key and OS repeats do not queue another discrete action', () => {
  const { hero, keys, count } = setup();
  keys.SHIFT.onDown(event(20));
  hero.tick(100, 50);
  keys.SHIFT.onDown(event(600, true));
  hero.tick(2000, 50);
  assert.equal(count('heroDash'), 1, 'an expired cooldown must not turn a held key into another dash');
  keys.SHIFT.onUp(event(2010));
  tap(keys.SHIFT, 2020);
  hero.tick(2100, 50);
  assert.equal(count('heroDash'), 2);
});

test('multiple complete taps between ticks keep at most one request per action', () => {
  const { hero, keys, count } = setup();
  tap(keys.Q, 20); tap(keys.Q, 30); tap(keys.Q, 40);
  hero.tick(100, 50);
  assert.equal(count('skillSwitch'), 1);
  assert.equal(hero.activeSkillId, 'barrage');
  hero.tick(200, 50);
  assert.equal(count('skillSwitch'), 1);
});

test('insufficient charge consumes the press rather than casting after later charge gain', () => {
  const { hero, keys, count } = setup();
  hero.charge = 0;
  tap(keys.SPACE);
  hero.tick(100, 50);
  assert.equal(count('heroSkill'), 0);
  assert.equal(count('actionUnavailable'), 1);
  hero.charge = 100;
  hero.tick(200, 50);
  assert.equal(count('heroSkill'), 0);
  tap(keys.SPACE, 220);
  hero.tick(300, 50);
  assert.equal(count('heroSkill'), 1);
});

test('a press during dash cooldown is consumed and does not fire when cooldown expires', () => {
  const { hero, keys, count } = setup();
  hero.lastDash = 0;
  tap(keys.SHIFT);
  hero.tick(100, 50);
  hero.tick(2000, 50);
  assert.equal(count('heroDash'), 0);
});

for (const boundary of ['pause', 'blur', 'tutorial', 'upgrade', 'death', 'levelComplete', 'shutdown', 'openingDraft']) {
  test(`the actual Arena gate and reset cancel requests across ${boundary}`, () => {
    const { hero, arena, keys, count, setSceneActive } = setup();
    tap(keys.SHIFT); tap(keys.SPACE); tap(keys.Q);
    const enter = {
      pause: () => { arena.paused = true; }, blur: () => { arena.game.hasFocus = false; },
      tutorial: () => { arena.tutorial.isActive = true; }, upgrade: () => { arena.upgrading = true; },
      death: () => { arena.dead = true; }, levelComplete: () => { arena.waveMgr.allWavesDone = true; },
      shutdown: () => setSceneActive(false), openingDraft: () => { arena.waveMgr.wave = 0; },
    };
    enter[boundary]();
    assert.equal(arena.canAcceptCombatAction(), false);
    arena.resetCombatInput();
    tap(keys.SHIFT, 50); tap(keys.SPACE, 50); tap(keys.Q, 50);
    arena.paused = arena.upgrading = arena.dead = arena.tutorial.isActive = arena.waveMgr.allWavesDone = false;
    arena.game.hasFocus = true; arena.waveMgr.wave = 1; setSceneActive(true);
    assert.equal(arena.canAcceptCombatAction(), true);
    hero.tick(100, 50);
    assert.equal(count('heroDash') + count('heroSkill') + count('skillSwitch'), 0);
    tap(keys.SHIFT, 120);
    hero.tick(200, 50);
    assert.equal(count('heroDash'), 1, 'a genuinely new combat press still works');
  });
}

test('a held key reset by pause cannot create a new action from an OS repeat after resume', () => {
  const { hero, arena, keys, count } = setup();
  keys.SHIFT.onDown(event(20));
  arena.paused = true;
  arena.resetCombatInput();
  arena.paused = false;
  keys.SHIFT.onDown(event(400, true));
  hero.tick(500, 50);
  assert.equal(count('heroDash'), 0);
  keys.SHIFT.onUp(event(510));
  tap(keys.SHIFT, 520);
  hero.tick(600, 50);
  assert.equal(count('heroDash'), 1);
});

test('destroying action input clears pending work and detaches real Key listeners', () => {
  const { hero, keys, count } = setup();
  tap(keys.SHIFT);
  assert.equal(keys.SHIFT.listenerCount('down'), 1);
  hero.destroyActionInput();
  assert.equal(keys.SHIFT.listenerCount('down'), 0);
  assert.equal(keys.SPACE.listenerCount('down'), 0);
  assert.equal(keys.Q.listenerCount('down'), 0);
  tap(keys.SHIFT, 50);
  hero.tick(100, 50);
  assert.equal(count('heroDash'), 0);
});

test('the actual paused-to-running transition clears a pre-pause request before resuming', () => {
  const { hero, arena, keys, count } = setup();
  tap(keys.SPACE);
  Object.assign(arena, {
    paused: true, pauseUI: [{}], clearPauseUI() {},
    time: { paused: true }, tweens: { resumeAll() {} }, physics: { resume() {} },
  });
  arena.togglePause();
  assert.equal(arena.paused, false);
  hero.tick(100, 50);
  assert.equal(count('heroSkill'), 0);
});

test('the actual tutorial update clears a request even when the Hero tick is skipped', () => {
  const { hero, arena, keys, count } = setup();
  tap(keys.SHIFT);
  Object.assign(arena, {
    physics: { world: { timeScale: 1 } }, updateUI() {}, updateMapHazards() {}, updateBgParticles() {},
  });
  arena.tutorial.isActive = true;
  arena._updateInner(100, 50);
  arena.tutorial.isActive = false;
  hero.tick(200, 50);
  assert.equal(count('heroDash'), 0);
});
