import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { CatMotionClock, CAT_FRAME_COUNTS, getCatPose } from '../data/catMotion.ts';
import { CatAnimator, catAtlasKey } from '../systems/CatAnimator.ts';
import { deriveShadowTemperament } from '../systems/ShadowDirector.ts';

// Only the Phaser constructor/math boundary is replaced for the actual companion
// update/draw methods below. These tests do not simulate a renderer or physics world.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { ShadowCompanion } = await import('../systems/ShadowCompanion.ts');

function spriteBoundary() {
  return {
    scene: { textures: { exists: key => key.startsWith('mailcat-') } },
    body: { radius: 12, velocity: { x: 0, y: 0 } }, texture: { key: 'hero' }, frame: { name: '__BASE' },
    setTexture(key, name) { this.texture = { key }; this.frame = { name }; return this; },
  };
}

test('walking uses alternating limbs and delayed tail/bag poses, not a whole-sprite wobble', () => {
  assert.deepEqual(CAT_FRAME_COUNTS, { idle: 4, run: 8, dash: 4, celebrate: 6 });
  const leftContact = getCatPose('run', 2), rightContact = getCatPose('run', 6);
  assert.ok(leftContact.leftLeg > 0 && leftContact.rightLeg < 0);
  assert.ok(rightContact.leftLeg < 0 && rightContact.rightLeg > 0);
  assert.ok(leftContact.leftArm < 0 && leftContact.rightArm > 0);
  assert.ok(leftContact.leftFootY < 0 && leftContact.rightFootY === 0);
  assert.notEqual(getCatPose('run', 0).tail, 0);
  assert.notEqual(getCatPose('run', 0).bag, 0);
  assert.equal(getCatPose('idle', 2).blink, true);
  assert.ok(getCatPose('celebrate', 2).leftArm > 2);
  assert.ok(getCatPose('celebrate', 2).rightArm < -2);
  for (const [motion, count] of Object.entries(CAT_FRAME_COUNTS)) {
    for (let frame = 0; frame < count; frame++) {
      assert.ok(Object.values(getCatPose(motion, frame)).every(value => typeof value === 'boolean' || Number.isFinite(value)));
    }
  }
});

test('locomotion switches without threshold jitter and freezes its frame while paused', () => {
  const clock = new CatMotionClock();
  assert.equal(clock.update(16, { speed: 12 }).motion, 'idle');
  const run = clock.update(85, { speed: 170 });
  assert.deepEqual(run, { motion: 'run', frame: 1 });
  assert.equal(clock.update(16, { speed: 12 }).motion, 'run');
  const held = clock.update(0, { speed: 12 });
  for (let i = 0; i < 30; i++) assert.deepEqual(clock.update(100, { speed: 0, paused: true }), held);
  assert.deepEqual(clock.update(16, { speed: 0 }), { motion: 'idle', frame: 0 });
});

test('dash and celebration finish once before returning to the appropriate locomotion state', () => {
  const clock = new CatMotionClock();
  clock.dash(200);
  assert.deepEqual(clock.update(0, { speed: 400 }), { motion: 'dash', frame: 0 });
  assert.deepEqual(clock.update(100, { speed: 400 }), { motion: 'dash', frame: 2 });
  assert.deepEqual(clock.update(100, { speed: 400 }), { motion: 'run', frame: 0 });
  clock.celebrate();
  for (let i = 0; i < 9; i++) assert.equal(clock.update(100, { speed: 0 }).motion, 'celebrate');
  assert.deepEqual(clock.update(100, { speed: 0 }), { motion: 'idle', frame: 0 });
  assert.equal(clock.update(100, { speed: 0 }).motion, 'idle');
});

test('intentional movement immediately interrupts celebration, without reviving it after stopping', () => {
  const clock = new CatMotionClock();
  clock.celebrate();
  assert.equal(clock.update(100, { speed: 18 }).motion, 'celebrate', 'small drift does not end the gesture');
  assert.equal(clock.update(16, { speed: 215 }).motion, 'run');
  assert.deepEqual(clock.update(16, { speed: 0 }), { motion: 'idle', frame: 0 });
  for (let i = 0; i < 12; i++) assert.equal(clock.update(100, { speed: 0 }).motion, 'idle');
  clock.dash(170);
  assert.equal(clock.update(50, { speed: 490 }).motion, 'dash', 'movement retains real dash feedback');
});

test('resetting after a paused dash or rescue clears transient pose and locomotion hysteresis', () => {
  for (const motion of ['dash', 'celebrate']) {
    const clock = new CatMotionClock();
    if (motion === 'dash') clock.dash(170); else clock.celebrate();
    const beforePause = clock.update(50, { speed: motion === 'dash' ? 490 : 0 });
    assert.deepEqual(clock.update(100, { speed: 215, paused: true }), beforePause);
    clock.resetTransient();
    assert.deepEqual(clock.update(100, { speed: 490, paused: true }), { motion: 'idle', frame: 0 });
    assert.equal(clock.update(16, { speed: 12 }).motion, 'idle', 'old movement hysteresis was cleared');
    assert.equal(clock.update(16, { speed: 215 }).motion, 'run');
  }
});

test('actual animator reset changes the visible frame immediately without modifying movement', () => {
  const sprite = spriteBoundary(), animator = new CatAnimator(sprite, 'ranger');
  sprite.body.velocity.x = 215;
  animator.celebrate();
  animator.update(16, { speed: sprite.body.velocity.x });
  assert.match(sprite.frame.name, /^run-/);
  assert.equal(sprite.body.velocity.x, 215, 'a cosmetic state must not lock the player');
  animator.dash(170); animator.update(50, { speed: 490 });
  assert.equal(sprite.frame.name, 'dash-1');
  animator.resetTransient();
  assert.equal(sprite.frame.name, 'idle-0');
  assert.equal(sprite.body.velocity.x, 215, 'the scene owns velocity cancellation');
  animator.update(100, { speed: 0, paused: true });
  animator.update(16, { speed: 0 });
  assert.equal(sprite.frame.name, 'idle-0');
  // Scene shutdown can have destroyed the sprite before clearing scene input.
  sprite.scene = undefined;
  assert.doesNotThrow(() => animator.resetTransient());
});

test('reduced motion suppresses idle flourishes while keeping actual running and dash feedback', () => {
  const clock = new CatMotionClock();
  for (let i = 0; i < 30; i++) assert.deepEqual(clock.update(100, { speed: 0, reducedMotion: true }), { motion: 'idle', frame: 0 });
  assert.equal(clock.update(100, { speed: 180, reducedMotion: true }).motion, 'run');
  clock.dash(180);
  assert.equal(clock.update(50, { speed: 400, reducedMotion: true }).motion, 'dash');
});

test('the actual animator changes only frame texture, retains body/scale, and keeps echo/mirror atlases distinct', () => {
  const body = { radius: 12, offset: { x: 16, y: 16 } }, applied = [];
  const sprite = {
    scene: { textures: { exists: key => key.startsWith('mailcat-') } },
    body, scaleX: 1, scaleY: 1, rotation: 0, texture: { key: 'hero' }, frame: { name: '__BASE' },
    setTexture(key, name) { applied.push([key, name]); this.texture = { key }; this.frame = { name }; return this; },
  };
  const animator = new CatAnimator(sprite, 'warden');
  animator.update(85, { speed: 170 });
  assert.deepEqual(applied.at(-1), [catAtlasKey('warden'), 'run-1']);
  const count = applied.length;
  animator.update(100, { speed: 170, paused: true });
  assert.equal(applied.length, count);
  assert.strictEqual(sprite.body, body);
  assert.deepEqual(body, { radius: 12, offset: { x: 16, y: 16 } });
  assert.equal(sprite.scaleX, 1); assert.equal(sprite.scaleY, 1); assert.equal(sprite.rotation, 0);
  animator.setAppearance('echo');
  assert.equal(sprite.texture.key, 'mailcat-echo');
  animator.setAppearance('mirror');
  assert.equal(sprite.texture.key, 'mailcat-mirror');
  assert.notEqual(catAtlasKey('echo'), catAtlasKey('mirror'));
});

test('actual shadow follow faces movement without a target, preserves idle direction, and still aims at enemies', () => {
  const graphic = { active: true };
  for (const name of ['clear', 'setPosition', 'fillStyle', 'fillEllipse', 'lineStyle', 'strokeCircle']) graphic[name] = function() { return this; };
  const portrait = { flipX: false, setPosition() { return this; }, setFlipX(value) { this.flipX = value; return this; } };
  const label = { setPosition() { return this; }, setText() { return this; } };
  const shots = [];
  const shadow = Object.assign(Object.create(ShadowCompanion.prototype), {
    temperament: deriveShadowTemperament(null), mode: 'follow', body: graphic, portrait, label,
    position: { x: 500, y: 500 }, facingAngle: 0, lastFire: 0, shots: 0, commandUntil: 0,
    options: { core: { x: 500, y: 500 }, chapter: { hazards: [], obstacles: [] }, onFire: shot => shots.push(shot) },
  });
  const hero = { active: true, x: 100, y: 456 };
  shadow.update(100, 50, hero, []);
  assert.ok(shadow.position.x < 500);
  assert.equal(portrait.flipX, true, 'leftward follow must face left');
  shadow.update(150, 50, { ...hero, x: shadow.position.x + 56 }, []);
  assert.equal(portrait.flipX, true, 'stopping must retain the last facing');
  shadow.update(3000, 50, hero, [{ active: true, x: 700, y: 500, cfg: { key: 'slime' } }]);
  assert.equal(portrait.flipX, false, 'combat aim has priority over leftward movement');
  assert.equal(shots.length, 1);
  assert.equal(shots[0].angle, 0);
  shadow.update(3050, 50, hero, []);
  assert.equal(portrait.flipX, true, 'follow direction resumes when the target disappears');
});
