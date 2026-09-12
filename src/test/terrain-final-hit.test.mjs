import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: new URL('./fixtures/phaser-scene.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { ArenaScene } = await import('../scenes/ArenaScene.ts');
const { Enemy } = await import('../entities/Enemy.ts');
const { WaveManager } = await import('../systems/WaveManager.ts');
const { RunRecorder } = await import('../systems/RunRecorder.ts');
const { CampaignProgressionManager: Campaign, createDefaultCampaignState } = await import('../systems/CampaignProgressionManager.ts');
const { getStage, getStageChapter } = await import('../data/stages.ts');

// Keep the real damage, synchronous death listener, Arena update ordering,
// WaveManager poll, completion handlers, campaign scoring and Map persistence.
// Rendering, physics movement, input and visual/sound effects are boundaries.
function finalEnemyScenario(stageId, source) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  globalThis.window = { location: { search: '?renderqa=1' } };
  const prior = createDefaultCampaignState();
  for (let id = 1; id < stageId; id++) prior.stageResults[id] = {
    stars: 1, clears: 1, attempts: 1, bestTimeSec: 30, bestCoreRatio: 1,
    lastPlayedAt: '2026-09-12T00:00:00.000Z', migrated: true,
  };
  storage.set('shadowlegion_campaign_v1', JSON.stringify(prior));
  const stage = getStage(stageId), chapter = getStageChapter(stageId);
  assert.equal(stage.objective.kind, 'terrain');
  assert.equal(stage.bonusObjective.kind, 'core');
  const target = stage.objective.target, order = [], delayed = [], returned = [];
  const events = new EventEmitter(), noop = () => {};
  const zone = chapter.hazards[0];
  const time = chapter.hazardKind === 'pulse' ? 5200 : 1000;
  const last = Object.assign(Object.create(Enemy.prototype), {
    active: true, _dying: false, hp: 5, maxHp: 5, x: zone.x, y: zone.y,
    isDodging: false, canSplit: false, isBoss: false, isElite: false, eliteGlow: null,
    cfg: { key: 'slime', color: 0x79a568 }, xpVal: 4, scoreVal: 8,
    scene: { events, time: { delayedCall: noop } }, body: { velocity: { x: 0, y: 0 } },
    getData: () => false, setTintFill: noop,
  });
  const enemies = { getChildren: () => [last], countActive: () => Number(last.active) };
  const a = Object.assign(Object.create(ArenaScene.prototype), {
    events, enemies, stage, chapter, mode: 'campaign', operativeId: 'ranger',
    completionId: `final-terrain-${stageId}-${source}`, currentLevel: chapter.id,
    dead: false, paused: false, upgrading: false, openingDrafts: 0, hitlagUntil: 0,
    combatTime: time - 16, activeRunMs: 30000, pulseDamageAt: 0,
    kills: 0, score: 0, shadowTrial: false, defenseHp: 100, defenseMaxHp: 100,
    defenseCore: { x: 1100, y: 800 }, stageStats: {
      dashes: 0, skills: 0, commands: 0, terrainHits: target - 1, intercepts: 0, priorityKills: 0,
    },
    hero: { x: 1100, y: 800, hp: 100, maxHp: 100, alpha: 1, isDashing: false, isInvincible: false,
      body: { velocity: { length: () => 0 } }, chargePerKill: 6, addCharge: noop,
      tick: noop, clearActionInput: noop, takeDamage: noop },
    runRecorder: new RunRecorder(), upgradeMgr: { getBuildPath: () => null },
    physics: { world: { timeScale: 1 }, pause: noop }, tutorial: { isActive: false, destroy: noop },
    registry: { get: () => chapter.id }, data: { set: noop },
    input: { activePointer: { isDown: false, rightButtonDown: () => false } },
    shadow: { update: noop }, enemyBullets: { getChildren: () => [] },
    journey: { record: event => order.push(event), finishWave: noop, claimRewards: () => 0 },
    snd: { kill: noop, victory: noop }, time: { delayedCall: (delay, callback) => delayed.push({ delay, callback }) },
    scene: { start: (scene, data) => returned.push({ scene, data }) },
    canAcceptCombatAction: () => true, updateUI: noop, updateBgParticles: noop, updateMapHazards: noop,
    updateEnemies: noop, magnetXpGems: noop, resetCombatInput: noop, deathParticles: noop,
    spawnXpGem: noop, addCombo: noop, feedbackShake: noop, feedbackFlash: noop, throttledShake: noop,
    hitlag: noop, slowMoFinish: noop, announce: noop, showDmgNum: noop,
  });
  // The renderer boundary supplies the final collision; real damage is not mocked.
  a.updateBullets = () => { if (source !== 'pulse') a.damageEnemy(last, 5, source); };
  const manager = new WaveManager(a, chapter.id, enemies, false, { mode: 'campaign', stageId });
  Object.assign(manager, { wave: manager.totalWaves, waveActive: true, spawning: false, pendingSpawns: [] });
  a.waveMgr = manager;
  events.on('enemyDeath', event => {
    order.push('enemyDeath');
    assert.equal(a.stageStats.terrainHits, target - 1, 'death fires synchronously before damageEnemy credits the confirmed HP loss');
    ArenaScene.prototype.onEnemyDeath.call(a, event);
    assert.equal(a.dead, false, 'the death handler does not finish the stage');
    assert.equal(manager.allWavesDone, false, 'WaveManager has not polled completion yet');
  });
  events.on('waveComplete', event => {
    order.push('waveComplete');
    assert.equal(a.stageStats.terrainHits, target, 'the poll sees the final damage credit');
    ArenaScene.prototype.onWaveComplete.call(a, event);
  });
  a.onLevelComplete = event => { order.push('levelComplete'); ArenaScene.prototype.onLevelComplete.call(a, event); };
  a.finishFiniteRun = () => { order.push('finishFiniteRun'); ArenaScene.prototype.finishFiniteRun.call(a); };
  return { a, last, manager, order, delayed, returned, target, stageId };
}

for (const [stageId, source] of [[11, 'hero'], [11, 'shadow'], [21, 'hero'], [21, 'shadow'], [31, 'pulse']]) {
  test(`stage ${stageId} final ${source} terrain hit reaches its goal before the real wave event saves three stars`, () => {
    const { a, last, manager, order, delayed, returned, target } = finalEnemyScenario(stageId, source);
    a._updateInner(90000, 16);
    assert.deepEqual(order, ['enemyDeath', 'terrainHit', 'waveComplete', 'levelComplete', 'finishFiniteRun']);
    assert.equal(last.active, false);
    assert.equal(a.kills, 1);
    assert.equal(a.stageStats.terrainHits, target);
    assert.equal(manager.allWavesDone, true);
    assert.equal(Campaign.getStageRecord(stageId).stars, 3);
    assert.equal(Campaign.getStageRecord(stageId).clears, 1);
    const transition = delayed.find(item => item.delay === 1900);
    assert.ok(transition, 'the actual finite completion scheduled the result scene');
    transition.callback();
    assert.equal(returned[0].scene, 'GameOverScene');
    assert.equal(returned[0].data.stageCompletion.terrainHits, target);
    assert.equal(returned[0].data.stageResult.stars, 3);
    assert.equal(returned[0].data.stageResult.saved, true);
    manager.update(90016, 16);
    assert.equal(Campaign.getStageRecord(stageId).clears, 1, 'no duplicate wave completion after the terminal poll');
  });
}
