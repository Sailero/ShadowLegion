import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';

// Execute real scene and entity methods against the existing renderer boundary.
// These checks do not model Arcade collision or claim browser/render evidence.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { ArenaScene } = await import('../scenes/ArenaScene.ts');
const { Enemy } = await import('../entities/Enemy.ts');
const { ShadowRival } = await import('../systems/ShadowCompanion.ts');
const { STAGES, getStageChapter } = await import('../data/stages.ts');

function scene(kind = 'sand', time = 1000) {
  const records = [];
  const a = Object.assign(Object.create(ArenaScene.prototype), {
    dead: false, combatTime: time, pulseDamageAt: 0,
    chapter: { hazardKind: kind, hazards: [{ x: 100, y: 100, width: 100, height: 100, phase: 0 }] },
    stageStats: { terrainHits: 0 }, journey: { record: event => records.push(event) },
    enemies: { getChildren: () => [] },
    hero: { x: 500, y: 500, takeDamage() {}, pierceRetain: .6 },
    showDmgNum() {}, hitParticles() {}, feedbackFlash() {}, feedbackShake() {}, throttledShake() {}, announce() {},
    snd: { hit() {} }, cameras: { main: { width: 1024, height: 768 } }, activeParticleCount: Infinity,
    time: { delayedCall() {} }, tweens: { add() {} },
  });
  // Visual objects only implement a fluent boundary; damage logic stays real.
  const shape = new Proxy({}, { get: () => () => shape });
  a.add = { circle: () => shape, line: () => shape, graphics: () => shape };
  return { a, records };
}

function enemy(overrides = {}, prototype = Enemy.prototype) {
  const events = new EventEmitter();
  const e = Object.assign(Object.create(prototype), {
    active: true, _dying: false, hp: 100, maxHp: 100, x: 100, y: 100,
    isDodging: false, canSplit: false, isBoss: false, isElite: false, eliteGlow: null,
    xpVal: 4, scoreVal: 8, cfg: { key: 'slime', color: 0x79a568 },
    scene: { events, time: { delayedCall() {} } }, body: { velocity: { x: 0, y: 0 } },
    getData() { return prototype === ShadowRival.prototype; }, setTintFill() { return this; },
    ...overrides,
  });
  return { e, events };
}

test('hero and companion damage each receive one terrain credit only when an active zone loses real enemy HP', () => {
  for (const kind of ['sand', 'tide']) for (const source of ['hero', 'shadow']) {
    const { a, records } = scene(kind);
    const { e } = enemy();
    assert.equal(a.damageEnemy(e, 7, source), false);
    assert.equal(e.hp, 93);
    assert.equal(a.stageStats.terrainHits, 1);
    assert.deepEqual(records, ['terrainHit']);
  }
  const { a } = scene('tide', 5000);
  a.damageEnemy(enemy().e, 7);
  assert.equal(a.stageStats.terrainHits, 0, 'the phase-0 water is inactive after five seconds');
  a.damageEnemy(enemy({ x: 500 }).e, 7);
  assert.equal(a.stageStats.terrainHits, 0);
});

test('invalid hits, dead targets and dodge-rounded zero damage never add terrain credit', () => {
  const { a } = scene();
  const { e } = enemy();
  for (const amount of [0, -1, NaN, Infinity]) assert.equal(a.damageEnemy(e, amount), false);
  assert.equal(e.hp, 100);
  assert.equal(a.damageEnemy(enemy({ active: false }).e, 20), false);
  assert.equal(a.damageEnemy(enemy({ hp: 0 }).e, 20), false);
  assert.equal(a.damageEnemy(enemy({ _dying: true }).e, 20), false);
  const dodging = enemy({ isDodging: true }).e;
  assert.equal(a.damageEnemy(dodging, 1), false);
  assert.equal(dodging.hp, 100, 'actual Enemy.takeDamage rounds one damage to zero while dodging');
  assert.equal(a.stageStats.terrainHits, 0);
});

test('lethal damage preserves entity death effects and credits the position before synchronous death listeners move it', () => {
  const { a, records } = scene();
  const { e, events } = enemy({ hp: 5 });
  const deaths = [];
  events.on('enemyDeath', event => { deaths.push(event); e.x = 5000; e.y = 5000; });
  assert.equal(a.damageEnemy(e, 20), true);
  assert.equal(e.active, false);
  assert.equal(deaths.length, 1);
  assert.deepEqual([deaths[0].x, deaths[0].y, deaths[0].xp, deaths[0].score], [100, 100, 4, 8]);
  assert.equal(a.stageStats.terrainHits, 1);
  assert.deepEqual(records, ['terrainHit']);
  assert.equal(a.damageEnemy(e, 20), false);
  assert.equal(deaths.length, 1);
  const outsider = enemy({ x: 500, hp: 5 });
  outsider.events.on('enemyDeath', () => { outsider.e.x = 100; });
  a.damageEnemy(outsider.e, 20);
  assert.equal(a.stageStats.terrainHits, 1, 'a death listener cannot move an outside hit into eligibility');
});

test('ShadowRival retains shadowDefeated then enemyDeath exactly once through the common damage entry', () => {
  const { a } = scene();
  const { e, events } = enemy({ hp: 5 }, ShadowRival.prototype);
  const order = [];
  events.on('shadowDefeated', () => order.push('shadowDefeated'));
  events.on('enemyDeath', () => order.push('enemyDeath'));
  assert.equal(a.damageEnemy(e, 5), true);
  assert.equal(a.damageEnemy(e, 5), false);
  assert.deepEqual(order, ['shadowDefeated', 'enemyDeath']);
  assert.equal(a.stageStats.terrainHits, 1);
});

test('pulse terrain only credits its own active damaging pulses, never hero or companion hits in the lane', () => {
  const { a } = scene('pulse', 5200);
  const target = enemy().e;
  a.damageEnemy(target, 10, 'hero');
  a.damageEnemy(target, 10, 'shadow');
  assert.equal(target.hp, 80);
  assert.equal(a.stageStats.terrainHits, 0);
  a.enemies.getChildren = () => [target];
  a.applyPulseDamage(5200);
  assert.equal(target.hp, 60);
  assert.equal(a.stageStats.terrainHits, 1);
  a.applyPulseDamage(5300);
  assert.equal(a.stageStats.terrainHits, 1, 'the unchanged 650ms pulse throttle still applies');
  a.combatTime = 5900; a.applyPulseDamage(5900);
  assert.equal(a.stageStats.terrainHits, 2);
  a.combatTime = 6100; a.applyPulseDamage(6100);
  assert.equal(a.stageStats.terrainHits, 2, 'inactive phases do not damage or score');
  const warning = scene('pulse', 4500).a;
  warning.damageEnemy(enemy().e, 20, 'pulse');
  assert.equal(warning.stageStats.terrainHits, 0, 'the warning is not an active damage window');
});

test('all formerly omitted direct attack paths now credit effective terrain damage', () => {
  for (const path of ['burst', 'timerift', 'explosion', 'ricochet', 'thorns', 'dash']) {
    const { a } = scene();
    const target = enemy().e;
    a.enemies.getChildren = () => [target];
    if (path === 'burst') a.doSkillBurst(100, 100, 10, 0);
    if (path === 'timerift') a.doSkillTimeRift(100, 100, 10, 200, 1000, 0);
    if (path === 'explosion') a.doExplosion(100, 100, 200, 10);
    if (path === 'ricochet') a.doRicochetChain(100, 100, 10, enemy().e, 1);
    if (path === 'thorns') a.doThorns(100, 100, 10);
    if (path === 'dash') {
      Object.assign(a.hero, { x: 95, y: 100, isDashing: true, dashDamageMult: 1, bulletDamage: 10, damageMult: 1 });
      a.onHeroTouchEnemy(a.hero, target);
    }
    assert.equal(target.hp, 90, path);
    assert.equal(a.stageStats.terrainHits, 1, path);
  }
});

test('real projectile handling rejects zero-damage seventh piercing hits and keeps shadow shots outside player on-hit bonuses', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ reducedMotion: true }) };
  const { a } = scene();
  const target = enemy().e;
  const bullet = { active: true, piercing: true, hitSet: new Set(Array.from({ length: 6 }, () => ({}))), damage: 10, source: 'hero', owner: 'player', x: 99, y: 100 };
  a.onBulletHitEnemy(bullet, target);
  assert.equal(target.hp, 100);
  assert.equal(a.stageStats.terrainHits, 0);
  let heals = 0;
  Object.assign(a.hero, { lifesteal: 5, hp: 10, maxHp: 100, heal: () => heals++ });
  a.onBulletHitEnemy({ ...bullet, source: 'shadow', hitSet: new Set() }, target);
  assert.equal(target.hp, 90);
  assert.equal(a.stageStats.terrainHits, 1);
  assert.equal(heals, 0);
});

test('the 19 terrain objectives retain their thresholds and only the five pulse stages advertise lamp damage', () => {
  const terrain = STAGES.flatMap(stage => [stage.objective, stage.bonusObjective].filter(goal => goal.kind === 'terrain').map(goal => ({ stage, goal })));
  assert.equal(terrain.length, 19);
  const pulses = terrain.filter(({ stage }) => getStageChapter(stage.id).hazardKind === 'pulse');
  assert.deepEqual(pulses.map(({ stage, goal }) => [stage.label, goal.target]), [['4-1', 8], ['4-3', 10], ['4-5', 12], ['4-6', 18], ['4-10', 16]]);
  for (const { stage, goal } of terrain) {
    const kind = getStageChapter(stage.id).hazardKind;
    assert.equal(goal.label.includes('灯带'), kind === 'pulse');
    const { a } = scene(kind);
    assert.equal(a.formatStageGoal(goal).includes('借灯带伤到对手'), kind === 'pulse');
  }
});
