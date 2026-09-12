import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { ArenaScene } = await import('../scenes/ArenaScene.ts');

function clearedBuildScene() {
  const events = [], registry = new Map(), scheduled = [];
  let inputClears = 0;
  const scene = Object.assign(Object.create(ArenaScene.prototype), {
    dead: false, upgrading: false, paused: false, openingDrafts: 0,
    currentLevel: 46, endless: true, operativeId: 'engineer', score: 1234, kills: 67,
    elapsedBeforeChapterMs: 90000, activeRunMs: 12000, combatTime: 12000,
    defenseHp: 100, defenseMaxHp: 100, hero: { clearActionInput() { inputClears++; } },
    input: { keyboard: { resetKeys() {} } },
    time: { paused: false, delayedCall: (delay, callback) => scheduled.push({ delay, callback }) },
    tweens: { resumeAll() {} },
    physics: { pause: () => events.push('pause'), resume: () => events.push('resume') },
    registry: { set: (key, value) => registry.set(key, value) },
    scene: { start: (key, data) => events.push({ key, data }) },
    upgradeMgr: { pickThree: () => [], getAppliedIds: () => ['damage', 'sentry'] },
    waveMgr: { wave: 5, startNextWave: () => events.push('start-wave'), scheduleNextWave: () => events.push('schedule-wave') },
  });
  return { scene, events, registry, scheduled, inputClears: () => inputClears };
}

test('an exhausted upgrade pool consumes all opening drafts and starts combat once', () => {
  const { scene, events, scheduled, inputClears } = clearedBuildScene();
  scene.openingDrafts = 2;
  scene.waveMgr.wave = 0;
  scene.combatTime = 0;
  scene.showUpgradeUI('wave');
  assert.equal(scene.openingDrafts, 0);
  assert.equal(scene.upgrading, false);
  assert.equal(scene.time.paused, false);
  assert.deepEqual(events, ['resume', 'start-wave']);
  assert.equal(scheduled.length, 0);
  assert.equal(inputClears(), 2, 'both skipped drafts cancel discrete combat input');
});

test('an exhausted station reward preserves the endless run instead of opening a fresh draft', () => {
  const { scene, events, registry, scheduled, inputClears } = clearedBuildScene();
  scene.showUpgradeUI('level');
  assert.equal(scene.paused, true);
  assert.equal(inputClears(), 1, 'station transition clears pending actions');
  assert.deepEqual(registry.get('appliedUpgrades'), ['damage', 'sentry']);
  assert.equal(scheduled.length, 1);
  scheduled[0].callback();
  assert.deepEqual(events, ['pause', { key: 'ArenaScene', data: {
    level: 47, score: 1234, kills: 67, endless: true, operativeId: 'engineer',
    elapsedMs: 102000, mode: 'endless', freshRun: false,
  } }]);
});
