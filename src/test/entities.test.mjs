import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The actual entity methods execute against a small math/Sprite boundary.
// All rendering, Arcade collision, browser input and asset tests remain separate.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-math.mjs', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { Enemy } = await import('../entities/Enemy.ts');
const { Hero } = await import('../entities/Hero.ts');
const { Projectile } = await import('../entities/Projectile.ts');
const { UpgradeManager } = await import('../systems/UpgradeManager.ts');
const { WAVE_UPGRADES, LEVEL_UPGRADES } = await import('../data/upgrades.ts');
const { SKILLS } = await import('../data/skills.ts');

test('entity method: knockback safely ignores an enemy destroyed by the triggering hit', () => {
  const enemy = Object.assign(Object.create(Enemy.prototype), { active: false, _dying: true, body: undefined, x: 30, y: 30 });
  assert.doesNotThrow(() => enemy.knockback(0, 0, 200));
});

test('entity method: a live enemy still receives directional knockback', () => {
  const velocity = { x: 0, y: 5 };
  const enemy = Object.assign(Object.create(Enemy.prototype), { active: true, _dying: false, body: { velocity }, x: 30, y: 0 });
  enemy.knockback(0, 0, 200);
  assert.equal(velocity.x, 200);
  assert.equal(velocity.y, 5);
});

test('entity method: enemy tick stops after AI destroys itself during an explosion', () => {
  const enemy = Object.assign(Object.create(Enemy.prototype), {
    active: true, _dying: false, cfg: { key: 'bomber' }, eliteGlow: null, isBoss: false,
    isDodging: true, dodgeEnd: 9999,
    body: { velocity: { x: 1, y: 1 } },
    bomberAI() { this.active = false; this._dying = true; this.body = undefined; this.scene = undefined; },
  });
  assert.doesNotThrow(() => enemy.tick(1000, 16, 100, 100));
});

function heroWithShield() {
  let clock = 1000;
  const events = [];
  const hero = Object.assign(Object.create(Hero.prototype), {
    hp: 120, shieldStacks: 2, invUntil: 0, dashing: false, dodgeChance: 0,
    active: true, x: 0, y: 0,
    scene: { data: { get: () => clock }, time: { now: 900000 }, events: { emit: (...args) => events.push(args) } },
  });
  return { hero, events, advance: () => { clock += 300; } };
}

test('entity method: zero or invalid damage does not spend shields', () => {
  const { hero, events } = heroWithShield();
  for (const amount of [0, -5, NaN, Infinity]) assert.equal(hero.takeDamage(amount), false);
  assert.equal(hero.shieldStacks, 2);
  assert.equal(hero.hp, 120);
  assert.equal(events.length, 0);
});

test('entity method: shield grant of brief invulnerability prevents multiple hits consuming all shields', () => {
  const { hero, events, advance } = heroWithShield();
  assert.equal(hero.takeDamage(20), false);
  assert.equal(hero.shieldStacks, 1);
  assert.equal(hero.takeDamage(20), false);
  assert.equal(hero.shieldStacks, 1);
  assert.equal(hero.hp, 120);
  assert.equal(events.filter(([event]) => event === 'shieldBreak').length, 1);
  advance();
  assert.equal(hero.takeDamage(20), false);
  assert.equal(hero.shieldStacks, 0);
});

test('entity method: homing piercing projectile skips targets already hit', () => {
  let velocity;
  const hit = { active: true, x: 20, y: 0, body: null };
  const next = { active: true, x: 0, y: 50, body: null };
  const projectile = Object.assign(Object.create(Projectile.prototype), {
    active: true, x: 0, y: 0, spd: 100, hitSet: new Set([hit]),
    body: { setVelocity: (x, y) => { velocity = { x, y }; } },
  });
  projectile.tryHomeToward([hit, next]);
  assert.ok(Math.abs(velocity.x) < 0.00001);
  assert.equal(velocity.y, 100);
});

function rangerBuild() {
  const manager = new UpgradeManager(['burst']);
  const hero = { hp: 120, maxHp: 120, critChance: 0, dashCooldown: 1000, explosiveShot: 0, skillLevels: {}, unlockedSkills: [] };
  manager.initializeOperative(hero, 'ranger');
  return { manager, hero };
}

test('upgrade method: a signature appearing in two pools still yields three unique choices', () => {
  const { manager, hero } = rangerBuild();
  const choices = manager.pickThree('wave', hero);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.ok(choices.some(choice => choice.id === 'skill_burst_up'));
});

test('upgrade method: exhausted skill levels disappear and injured camp can still receive repair', () => {
  const { manager, hero } = rangerBuild();
  hero.skillLevels.burst = SKILLS.find(skill => skill.id === 'burst').maxLevel;
  assert.ok(!manager.pickThree('wave', hero).some(choice => choice.requiresSkill === 'burst'));
  // Arrange an exhausted card collection to isolate repair eligibility.
  for (const upgrade of WAVE_UPGRADES) if (upgrade.id !== 'heal') manager.stacks.set(upgrade.id, upgrade.maxStacks);
  assert.deepEqual(manager.pickThree('wave', hero, 1), []);
  assert.deepEqual(manager.pickThree('wave', hero, 0.5).map(choice => choice.id), ['heal']);
});

test('upgrade method: chapter recovery card grants persistent regeneration with a three-stack cap', () => {
  const card = LEVEL_UPGRADES.find(upgrade => upgrade.id === 'veteran_repair');
  const freshHero = () => Object.assign(Object.create(Hero.prototype), {
    hp: 60, maxHp: 120, regenPerSec: 0, scene: { events: { emit() {} } },
  });
  const hero = freshHero();
  const manager = new UpgradeManager();
  manager.apply(hero, card);
  assert.equal(hero.hp, 120);
  assert.equal(hero.regenPerSec, 1);
  manager.apply(hero, card); manager.apply(hero, card); manager.apply(hero, card);
  assert.equal(hero.regenPerSec, 3);
  assert.equal(manager.getAppliedIds().length, 3);
  const restoredHero = freshHero();
  const restored = new UpgradeManager();
  for (const id of manager.getAppliedIds()) restored.applyById(restoredHero, id);
  assert.equal(restoredHero.regenPerSec, 3);
});
