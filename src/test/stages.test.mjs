import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_WIDTH, ARENA_HEIGHT, ENEMY_TYPES, WAVE_CFG } from '../config/gameConfig.ts';
import { CHAPTERS } from '../data/chapters.ts';
import { STAGES, getStage, getStageChapter, getStageWaves, getStagesForChapter, getNextStage, stageIdFor, calculateStageStars } from '../data/stages.ts';
import { shadowLineBlocked } from '../systems/ShadowDirector.ts';

test('campaign contains five chapters of ten stable, individually named stages', () => {
  assert.equal(CHAPTERS.length, 5);
  assert.equal(STAGES.length, 50);
  assert.equal(new Set(STAGES.map(stage => stage.name)).size, 50);
  assert.deepEqual(STAGES.map(stage => stage.id), Array.from({ length: 50 }, (_, index) => index + 1));
  for (let chapter = 1; chapter <= 5; chapter++) {
    const stages = getStagesForChapter(chapter);
    assert.equal(stages.length, 10);
    assert.deepEqual(stages.map(stage => stage.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(stages[4].kind, 'elite');
    assert.equal(stages[9].kind, 'boss');
    const mini = stages[4].waves.at(-1), leader = stages[9].waves.at(-1);
    if (chapter === 2 || chapter === 3) {
      const miniHp = ENEMY_TYPES[mini.bossType].hp * WAVE_CFG.bossHp * getStageChapter(stages[4].id).enemyHpScale * mini.bossHpScale;
      const leaderHp = ENEMY_TYPES[leader.bossType].hp * WAVE_CFG.bossHp * getStageChapter(stages[9].id).enemyHpScale * leader.bossHpScale;
      assert.ok(miniHp >= 300 && miniHp <= 360, `chapter ${chapter}: mini boss exposure`);
      assert.ok(leaderHp >= 450 && leaderHp <= 500, `chapter ${chapter}: chapter boss exposure`);
    } else {
      assert.equal(mini.bossHpScale, .65);
      assert.equal(leader.bossHpScale, 1);
    }
  }
  assert.equal(stageIdFor(5, 10), 50);
  assert.equal(getNextStage(49).id, 50);
  assert.equal(getNextStage(50), null);
  assert.equal(getStage(Infinity).id, 1);
});

test('all fifty stages have real encounter and route differences with valid enemies', () => {
  const signatures = new Set();
  for (const stage of STAGES) {
    assert.equal(stage.waves.length, stage.index % 5 === 0 ? 3 : 2);
    const map = getStageChapter(stage.id);
    for (const wave of stage.waves) {
      assert.ok(wave.lanes.length > 0);
      assert.ok(wave.lanes.every(index => Number.isInteger(index) && index >= 0 && index < map.spawnPoints.length));
      assert.ok(wave.spawnIntervalMs >= 600 && wave.spawnIntervalMs <= 1100);
      for (const spawn of wave.spawns) {
        assert.ok(ENEMY_TYPES[spawn.type], `${stage.label}: ${spawn.type}`);
        assert.ok(Number.isInteger(spawn.min) && spawn.min > 0 && spawn.max >= spawn.min);
      }
      if (wave.isBoss) assert.ok(ENEMY_TYPES[wave.bossType]);
    }
    signatures.add(JSON.stringify(stage.waves.map(wave => ({ lanes: wave.lanes, spawns: wave.spawns, boss: wave.bossType }))));
  }
  assert.equal(signatures.size, 50);
});

test('every stage map has distinct geometry and all declared approaches fit a boss', () => {
  for (let chapter = 1; chapter <= 5; chapter++) {
    const geometry = new Set();
    for (const stage of getStagesForChapter(chapter)) {
      const map = getStageChapter(stage.id);
      assert.ok(map.obstacles.length >= 2, stage.label);
      for (const rect of [...map.obstacles, ...map.hazards]) {
        assert.ok(rect.x - rect.width / 2 >= 0 && rect.x + rect.width / 2 <= ARENA_WIDTH, stage.label);
        assert.ok(rect.y - rect.height / 2 >= 0 && rect.y + rect.height / 2 <= ARENA_HEIGHT, stage.label);
      }
      const expanded = map.obstacles.map(rect => ({ ...rect, width: rect.width + 70, height: rect.height + 70 }));
      for (const lane of map.spawnPoints) for (let jitter = -70; jitter <= 70; jitter += 10) {
        const verticalEdge = lane.x < 100 || lane.x > ARENA_WIDTH - 100;
        const arrival = { x: lane.x + (verticalEdge ? 0 : jitter), y: lane.y + (verticalEdge ? jitter : 0) };
        assert.equal(shadowLineBlocked(arrival, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, expanded), false, `${stage.label} ${lane.label} offset ${jitter}`);
      }
      geometry.add(JSON.stringify({ obstacles: map.obstacles, hazards: map.hazards }));
    }
    assert.equal(geometry.size, 10, `chapter ${chapter}`);
  }
});

test('stage objectives only request terrain and enemy roles that occur in that stage', () => {
  const priority = new Set(['archer', 'medic', 'summoner', 'bomber']);
  for (const stage of STAGES) {
    const total = stage.waves.reduce((sum, wave) => sum + wave.spawns.reduce((count, spawn) => count + spawn.min, 0) + Number(Boolean(wave.isBoss)), 0);
    const supports = stage.waves.reduce((sum, wave) => sum + wave.spawns.filter(spawn => priority.has(spawn.type)).reduce((count, spawn) => count + spawn.min, 0) + Number(priority.has(wave.bossType)), 0);
    for (const goal of [stage.objective, stage.bonusObjective]) {
      assert.ok(goal.label.length > 0 && goal.target > 0, stage.label);
      if (goal.kind === 'terrain') {
        const map = getStageChapter(stage.id);
        assert.ok(map.hazards.length > 0, stage.label);
        assert.ok(stage.waves.some(wave => wave.lanes.some(index => shadowLineBlocked(map.spawnPoints[index], { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, map.hazards))), `${stage.label}: no arrival crosses its terrain`);
      }
      if (goal.kind === 'priority') {
        assert.ok(supports >= goal.target + 2, `${stage.label}: needs at least two missed-target allowance`);
        assert.ok(goal.target / supports <= .72, `${stage.label}: interception requirement too tight`);
      }
      if (goal.kind === 'skill') assert.ok(Math.floor((total - 1) / 7) >= goal.target, `${stage.label}: skill stamp should not require collecting gems`);
      if (goal.kind === 'intercept') assert.ok(total >= goal.target, stage.label);
      if (goal.kind === 'core') assert.ok(goal.target <= 1);
    }
  }
  assert.equal(getStage(1).objective.kind, 'command');
});

test('stars are earned independently and a failed stage never earns a star', () => {
  const stage = getStage(1);
  assert.equal(calculateStageStars(stage, { victory: false, durationSec: 100, coreRatio: 1, commands: 99 }), 0);
  assert.equal(calculateStageStars(stage, { victory: true, durationSec: 100, coreRatio: .3, commands: 0 }), 1);
  assert.equal(calculateStageStars(stage, { victory: true, durationSec: 100, coreRatio: .9, commands: 0 }), 2);
  assert.equal(calculateStageStars(stage, { victory: true, durationSec: 100, coreRatio: .3, commands: 1 }), 2);
  assert.equal(calculateStageStars(stage, { victory: true, durationSec: 100, coreRatio: .9, commands: 1 }), 3);
  assert.equal(calculateStageStars(stage, { victory: true, durationSec: NaN, coreRatio: NaN, commands: Infinity }), 1);
});

test('map and encounter getters return independent objects for scene mutations', () => {
  const map = getStageChapter(12);
  const original = getStageChapter(12);
  map.obstacles[0].x = 0;
  map.colors.ground = 0;
  map.hazards[0].width = 1;
  assert.deepEqual(getStageChapter(12), original);
  const waves = getStageWaves(12);
  waves[0].spawns[0].min = 9999;
  waves[0].lanes.push(99);
  assert.notEqual(getStageWaves(12)[0].spawns[0].min, 9999);
  assert.ok(!getStageWaves(12)[0].lanes.includes(99));
});
