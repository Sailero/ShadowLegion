import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_WIDTH, ARENA_HEIGHT, HERO_CFG, ENEMY_TYPES, WAVE_CFG } from '../config/gameConfig.ts';
import { CHAPTERS, getChapter, pointInRect } from '../data/chapters.ts';
import { LEVEL_WAVES } from '../data/enemies.ts';
import { OPERATIVES, getOperative } from '../data/operatives.ts';
import { SKILLS, getSkillStatsForLevel } from '../data/skills.ts';
import { WAVE_UPGRADES, LEVEL_UPGRADES, EVOLUTION_INFO } from '../data/upgrades.ts';
import { MetaProgressionManager as Meta, createDefaultMetaState, calculateRunReward, isFullCampaignVictory, WORKSHOP_MAX_RANK, workshopUpgradeCost } from '../systems/MetaProgressionManager.ts';
import { ScoreManager } from '../systems/ScoreManager.ts';
import { RunRecorder } from '../systems/RunRecorder.ts';

const storage = new Map();
const memoryStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
beforeEach(() => {
  storage.clear();
  globalThis.localStorage = memoryStorage;
});
const saveMeta = state => storage.set('shadowlegion_meta_v1', JSON.stringify(state));
const run = (build = 'nova', victory = true) => ({
  wave: WAVE_CFG.perLevel, level: WAVE_CFG.levels, kills: 180, durationSec: 840, victory, endless: false, build,
  profile: new RunRecorder().finish(build, HERO_CFG.maxHp),
});

test('every campaign chapter has complete finite spawn data and a final boss', () => {
  assert.equal(LEVEL_WAVES.length, WAVE_CFG.levels);
  const seen = new Set();
  for (const waves of LEVEL_WAVES) {
    assert.equal(waves.length, WAVE_CFG.perLevel);
    assert.ok(waves.at(-1).isBoss);
    assert.equal(waves.filter(wave => wave.isBoss).length, 1);
    for (const wave of waves) {
      assert.ok(wave.name && wave.hint);
      for (const spawn of wave.spawns) {
        assert.ok(ENEMY_TYPES[spawn.type], spawn.type);
        assert.ok(Number.isInteger(spawn.min) && spawn.min >= 1);
        assert.ok(Number.isInteger(spawn.max) && spawn.max >= spawn.min);
        seen.add(spawn.type);
      }
      if (wave.isBoss) assert.ok(ENEMY_TYPES[wave.bossType]);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(ENEMY_TYPES).sort());
  assert.ok(!LEVEL_WAVES[0].some(wave => wave.spawns.some(spawn => spawn.type === 'medic')));
});

test('maps keep lanes, cover and hazards inside the playable arena', () => {
  assert.equal(CHAPTERS.length, WAVE_CFG.levels);
  assert.ok(CHAPTERS.every(chapter => ['none', 'sand', 'tide', 'pulse'].includes(chapter.hazardKind)));
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.spawnPoints.length >= 2);
    assert.ok(chapter.coreHp > 0 && chapter.enemyHpScale >= 1);
    for (const point of chapter.spawnPoints) {
      assert.ok(point.x > 0 && point.x < ARENA_WIDTH);
      assert.ok(point.y > 0 && point.y < ARENA_HEIGHT);
    }
    for (const rect of [...chapter.obstacles, ...chapter.hazards]) {
      assert.ok(rect.width > 0 && rect.height > 0);
      assert.ok(rect.x - rect.width / 2 >= 0 && rect.x + rect.width / 2 <= ARENA_WIDTH);
      assert.ok(rect.y - rect.height / 2 >= 0 && rect.y + rect.height / 2 <= ARENA_HEIGHT);
      assert.ok(pointInRect(rect.x + rect.width / 2, rect.y, rect));
      assert.ok(!pointInRect(rect.x + rect.width / 2 + 1, rect.y, rect));
    }
  }
});

test('chapter boundaries and endless wrap resolve the intended maps', () => {
  assert.equal(getChapter(0).id, 1);
  assert.equal(getChapter(999).id, WAVE_CFG.levels);
  for (let level = 1; level <= WAVE_CFG.levels * 6; level++) assert.equal(getChapter(level, true).id, (level - 1) % WAVE_CFG.levels + 1);
});

test('all four operatives have distinct builds and real signature skills', () => {
  assert.equal(OPERATIVES.length, 4);
  assert.equal(new Set(OPERATIVES.map(item => item.path)).size, 4);
  for (const operative of OPERATIVES) {
    assert.ok(SKILLS.some(skill => skill.id === operative.signatureSkill));
    assert.ok(EVOLUTION_INFO[operative.path]);
    assert.ok(WAVE_UPGRADES.filter(upgrade => upgrade.path === operative.path).length >= 3);
  }
  assert.equal(getOperative('missing').id, 'ranger');
});

test('cards have unique IDs and resolvable skill prerequisites', () => {
  const all = [...WAVE_UPGRADES, ...LEVEL_UPGRADES];
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
  for (const card of all) {
    assert.ok(Number.isInteger(card.maxStacks) && card.maxStacks > 0);
    for (const id of [card.unlocksSkill, card.requiresSkill].filter(Boolean)) assert.ok(SKILLS.some(skill => skill.id === id));
    if (card.path) assert.ok(OPERATIVES.some(operative => operative.path === card.path));
  }
});

test('skill levels clamp at both ends without producing invalid combat stats', () => {
  for (const skill of SKILLS) {
    assert.deepEqual(getSkillStatsForLevel(skill.id, 0), getSkillStatsForLevel(skill.id, 1));
    assert.deepEqual(getSkillStatsForLevel(skill.id, 999), getSkillStatsForLevel(skill.id, skill.maxLevel));
    assert.deepEqual(getSkillStatsForLevel(skill.id, NaN), getSkillStatsForLevel(skill.id, 1));
    assert.deepEqual(getSkillStatsForLevel(skill.id, Infinity), getSkillStatsForLevel(skill.id, 1));
    assert.deepEqual(getSkillStatsForLevel(skill.id, 2.8), getSkillStatsForLevel(skill.id, 2));
    for (const level of skill.levels) assert.ok(level.damage >= 0 && level.radius >= 0);
  }
});

test('new saves grant the starting class without workshop power', () => {
  const state = Meta.getState();
  assert.equal(state.highestChapterUnlocked, 1);
  assert.deepEqual(state.unlockedOperatives, ['ranger']);
  assert.equal(state.shadowCores, 0);
  assert.deepEqual(Meta.getBonuses(state), { damageMult: 1, maxHpBonus: 0, startCharge: 0 });
});

test('chapter completion persists every earned unlock and is idempotent', () => {
  for (let chapter = 1; chapter <= WAVE_CFG.levels; chapter++) {
    assert.equal(Meta.recordChapterClear(chapter).firstClear, true);
    assert.equal(Meta.recordChapterClear(chapter).firstClear, false);
  }
  const state = Meta.getState();
  assert.equal(state.highestChapterUnlocked, WAVE_CFG.levels);
  assert.equal(state.clearedChapters.length, WAVE_CFG.levels);
  assert.deepEqual([...state.unlockedOperatives].sort(), OPERATIVES.map(item => item.id).sort());
  assert.deepEqual([...state.unlockedSkills].sort(), SKILLS.map(item => item.id).sort());
});

test('older partial saves restore unlocks from chapter progress', () => {
  saveMeta({ version: 1, highestChapterUnlocked: 4, unlockedOperatives: ['ranger'], unlockedSkills: ['burst'] });
  const state = Meta.getState();
  assert.equal(state.version, 3);
  assert.equal(state.unlockedOperatives.length, 4);
  assert.equal(state.unlockedSkills.length, 4);
});

test('corrupt JSON and unavailable storage recover without throwing', () => {
  storage.set('shadowlegion_meta_v1', '{bad json');
  assert.equal(Meta.getState().highestChapterUnlocked, 1);
  globalThis.localStorage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('quota'); } };
  assert.equal(Meta.getState().totalRuns, 0);
  assert.doesNotThrow(() => Meta.recordRun(run()));
  assert.deepEqual(ScoreManager.getScores(), []);
  assert.doesNotThrow(() => ScoreManager.saveScore({ score: 100, kills: 2, level: 1, wave: 1, endless: false }));
});

test('save sanitization caps workshop ranks and filters unknown unlocks', () => {
  saveMeta({ ...createDefaultMetaState(), modules: { arsenal: 999, armor: -4, reactor: 'oops' },
    shadowCores: -99, unlockedOperatives: ['ranger', 'hacker'], unlockedSkills: ['burst', 'missing'] });
  const state = Meta.getState();
  assert.deepEqual(state.modules, { arsenal: WORKSHOP_MAX_RANK, armor: 0, reactor: 0 });
  assert.equal(state.shadowCores, 0);
  assert.deepEqual(state.unlockedOperatives, ['ranger']);
  assert.deepEqual(state.unlockedSkills, ['burst']);
});

test('workshop rejects unaffordable purchases and charges exactly once per rank', () => {
  assert.equal(Meta.purchase('arsenal'), false);
  saveMeta({ ...createDefaultMetaState(), shadowCores: 100 });
  let spent = 0;
  for (let rank = 0; rank < WORKSHOP_MAX_RANK; rank++) {
    spent += workshopUpgradeCost(rank);
    assert.equal(Meta.purchase('arsenal'), true);
    assert.equal(Meta.getState().modules.arsenal, rank + 1);
    assert.equal(Meta.getState().shadowCores, 100 - spent);
  }
  assert.equal(Meta.purchase('arsenal'), false);
  assert.equal(Meta.getState().shadowCores, 100 - spent);
});

test('first-clear build bonus is paid once and fastest completion persists', () => {
  const first = Meta.recordRun(run('engineer'));
  const second = Meta.recordRun({ ...run('engineer'), durationSec: 960 });
  assert.equal(first.newBuildClear, true);
  assert.equal(second.newBuildClear, false);
  assert.equal(first.earned - second.earned, first.newBuildReward);
  assert.equal(Meta.getState().bestVictorySec, 840);
  assert.equal(Meta.getState().totalRuns, 2);
});

test('starting at a late chapter cannot farm progress or claim a full campaign achievement', () => {
  const fastLoss = calculateRunReward({ wave: 1, level: WAVE_CFG.levels, startLevel: WAVE_CFG.levels, victory: false, endless: false }, true);
  assert.equal(fastLoss.earned, 0);
  const shortcut = { ...run('engineer'), startLevel: WAVE_CFG.levels };
  assert.equal(isFullCampaignVictory(shortcut), false);
  const reward = Meta.recordRun(shortcut);
  assert.equal(reward.earned, 6);
  assert.equal(reward.newBuildClear, false);
  assert.deepEqual(Meta.getState().clearedBuilds, []);
  assert.equal(Meta.getState().bestVictorySec, null);
  assert.equal(isFullCampaignVictory({ ...run(), startLevel: 1 }), true);
  assert.equal(Meta.recordRun({ ...run(), startLevel: 1 }).earned, 13);
});

test('leaderboard persists every class, including engineer', () => {
  for (const operative of OPERATIVES) ScoreManager.saveScore({
    score: 100, kills: 10, level: 1, wave: 5, endless: false, build: operative.path,
  });
  assert.deepEqual(ScoreManager.getScores().map(item => item.build).sort(), OPERATIVES.map(item => item.path).sort());
});

test('leaderboard retains the ten highest scores and ignores malformed entries', () => {
  for (let score = 0; score < 15; score++) ScoreManager.saveScore({ score, kills: 1, level: 1, wave: 1, endless: false });
  assert.deepEqual(ScoreManager.getScores().map(item => item.score), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  storage.set('shadowlegion_scores', JSON.stringify([null, 'bad', { score: '999' }]));
  assert.deepEqual(ScoreManager.getScores(), []);
});

test('behavior profiles distinguish moving from stationary play within bounded metrics', () => {
  const mobile = new RunRecorder();
  const stationary = new RunRecorder();
  for (let i = 0; i < 600; i++) {
    mobile.recordFrame(100, true, true);
    stationary.recordFrame(100, false, false);
  }
  mobile.recordShot(240);
  for (let i = 0; i < 12; i++) mobile.recordDash();
  const active = mobile.finish('nova', 120);
  const calm = stationary.finish('rift', 155);
  assert.ok(active.mobility > calm.mobility);
  assert.ok(active.firepower > calm.firepower);
  assert.ok(active.reflex > calm.reflex);
  for (const profile of [active, calm, new RunRecorder().finish(null, 0)]) {
    for (const key of ['mobility', 'firepower', 'reflex', 'technique']) assert.ok(Number.isFinite(profile[key]) && profile[key] >= 0 && profile[key] <= 100);
  }
});
