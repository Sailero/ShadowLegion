import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_CFG } from '../config/gameConfig.ts';
import { sanitizeCombatProfile, deriveShadowTemperament, shadowLineBlocked, chooseShadowTarget } from '../systems/ShadowDirector.ts';
import { JourneyDirector } from '../systems/JourneyDirector.ts';

const profile = overrides => ({
  style: '突击者', mobility: 60, firepower: 60, reflex: 60, technique: 60,
  shots: 100, dashes: 10, skills: 3, damageTaken: 10, build: 'nova',
  createdAt: '2026-09-12T00:00:00.000Z', ...overrides,
});

test('new players get a useful training companion without a saved profile', () => {
  const shadow = deriveShadowTemperament(null);
  assert.equal(shadow.source, 'training');
  assert.equal(shadow.mode, 'guard');
  assert.ok(shadow.damage > 0 && shadow.range > 0);
});

test('hostile or damaged profile fields never create nonfinite combat values', () => {
  assert.equal(sanitizeCombatProfile(null), null);
  assert.equal(sanitizeCombatProfile({ style: 'unknown' }), null);
  const cleaned = sanitizeCombatProfile(profile({
    mobility: NaN, firepower: Infinity, technique: -80, reflex: 1000,
    shots: -1, dashes: '9999', createdAt: 'bad date', build: 'hacked',
  }));
  assert.equal(cleaned.build, null);
  for (const field of ['mobility', 'firepower', 'technique', 'reflex']) assert.ok(Number.isFinite(cleaned[field]) && cleaned[field] >= 0 && cleaned[field] <= 100);
  const shadow = deriveShadowTemperament(cleaned);
  for (const field of ['speed', 'range', 'fireIntervalMs', 'damage', 'orbitRadius']) assert.ok(Number.isFinite(shadow[field]) && shadow[field] > 0);
});

test('recorded play styles create different companion behavior with capped firepower', () => {
  const guard = deriveShadowTemperament(profile({ style: '坚守者', mobility: 10 }));
  const mobile = deriveShadowTemperament(profile({ style: '游猎者', mobility: 100 }));
  const strongest = deriveShadowTemperament(profile({ style: '火力手', firepower: 100 }));
  assert.equal(guard.mode, 'guard');
  assert.equal(mobile.mode, 'follow');
  assert.ok(mobile.speed > guard.speed);
  assert.equal(strongest.source, 'previous-run');
  const shadowDps = strongest.damage * 1000 / strongest.fireIntervalMs;
  const playerDps = HERO_CFG.bulletDamage * 1000 / HERO_CFG.fireRate;
  assert.ok(shadowDps <= playerDps * 0.2, `${shadowDps} exceeds companion budget`);
});

test('shadow cover blocks crossed, parallel-edge and embedded segments symmetrically', () => {
  const cover = [{ x: 50, y: 50, width: 20, height: 20 }];
  const cases = [
    [{ x: 0, y: 50 }, { x: 100, y: 50 }, true],
    [{ x: 0, y: 40 }, { x: 100, y: 40 }, true],
    [{ x: 0, y: 39 }, { x: 100, y: 39 }, false],
    [{ x: 0, y: 0 }, { x: 30, y: 30 }, false],
    [{ x: 50, y: 50 }, { x: 50, y: 50 }, true],
    [{ x: 50, y: 0 }, { x: 50, y: 100 }, true],
  ];
  for (const [from, to, blocked] of cases) {
    assert.equal(shadowLineBlocked(from, to, cover), blocked);
    assert.equal(shadowLineBlocked(to, from, cover), blocked);
  }
});

test('shadow targeting ignores dead, distant and covered enemies', () => {
  const position = { x: 0, y: 0 };
  const core = { x: 100, y: 100 };
  const temperament = deriveShadowTemperament(null);
  const living = { x: 0, y: 120, active: true, cfg: { key: 'slime' } };
  const hidden = { x: 100, y: 0, active: true, cfg: { key: 'tank' } };
  const dead = { x: 1, y: 1, active: false, cfg: { key: 'slime' } };
  const far = { x: 999, y: 999, active: true, cfg: { key: 'medic' } };
  const cover = [{ x: 50, y: 0, width: 20, height: 20 }];
  assert.equal(chooseShadowTarget(position, core, [hidden, dead, far, living], temperament, 'guard', cover), living);
  assert.equal(chooseShadowTarget(position, core, [hidden, dead, far], temperament, 'guard', cover), null);
});

test('tactician prioritizes support roles while a nearby camp threat wins priority', () => {
  const temperament = deriveShadowTemperament(profile({ style: '战术家' }));
  const position = { x: 0, y: 0 };
  const core = { x: 300, y: 0 };
  const slime = { x: 70, y: 0, active: true, cfg: { key: 'slime' } };
  const medic = { x: 100, y: 0, active: true, cfg: { key: 'medic' } };
  assert.equal(chooseShadowTarget(position, core, [slime, medic], temperament, 'follow', []), medic);
  const leak = { x: 285, y: 0, active: true, cfg: { key: 'tank' } };
  assert.equal(chooseShadowTarget(position, core, [slime, leak], deriveShadowTemperament(null), 'guard', []), leak);
});

test('chapter objectives teach commands, core defense and local terrain with one-time rewards', () => {
  const journey = new JourneyDirector(4);
  assert.equal(journey.getObjectives().length, 3);
  assert.equal(journey.claimRewards(), 0);
  journey.record('command');
  assert.equal(journey.claimRewards(), 1);
  assert.equal(journey.claimRewards(), 0);
  for (let i = 0; i < 5; i++) journey.record('terrainHit');
  assert.equal(journey.claimRewards(), 1);
  for (let i = 0; i < 3; i++) journey.finishWave(0.8);
  assert.equal(journey.completedCount, 3);
  assert.equal(journey.claimRewards(), 1);
  journey.record('command');
  journey.record('terrainHit');
  journey.finishWave(1);
  assert.equal(journey.claimRewards(), 0);
});

test('shadow trial replaces the chapter exercise and cannot complete from ordinary kills', () => {
  const journey = new JourneyDirector(1, true);
  for (let i = 0; i < 10; i++) journey.record('dash');
  assert.equal(journey.claimRewards(), 0);
  journey.record('shadowDefeat');
  assert.equal(journey.claimRewards(), 1);
  journey.record('shadowDefeat');
  assert.equal(journey.claimRewards(), 0);
});
