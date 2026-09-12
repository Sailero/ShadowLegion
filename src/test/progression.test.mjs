import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MetaProgressionManager as Meta, createDefaultMetaState, isFullCampaignVictory, workshopUpgradeCost } from '../systems/MetaProgressionManager.ts';
import { MAX_MASTERY_XP, RESEARCH_NODES, SPECIALIZATIONS, CAMPAIGN_STAGE_COUNT } from '../data/progression.ts';
import { RunRecorder } from '../systems/RunRecorder.ts';
import { WAVE_CFG } from '../config/gameConfig.ts';

const key = 'shadowlegion_meta_v1';
const entries = new Map();
const storage = { getItem: id => entries.get(id) ?? null, setItem: (id, value) => entries.set(id, String(value)) };
beforeEach(() => { entries.clear(); globalThis.localStorage = storage; });
const save = state => entries.set(key, JSON.stringify(state));
const clear = (stageId, options = {}) => Meta.recordStageProgress({ completionId: `clear-${stageId}`, stageId, operativeId: 'ranger', stars: 3, ...options });
const seed = overrides => { const state = { ...createDefaultMetaState(), ...overrides }; save(state); return state; };
const hero = () => ({ damageMult: 1, maxHp: 100, hp: 100, charge: 0, chargeMax: 100, speedMult: 1, atkSpdMult: 1,
  dashCooldown: 1000, chargePerKill: 4, magnetRadius: 70, shieldStacks: 0, regenPerSec: 0, critChance: 0,
  explosiveShot: 0, ricochetShot: 0, bulletPiercing: false, bulletHoming: false });

test('first clears, higher stars and capped replays pay once with role-specific mastery', () => {
  const first = clear(1, { stars: 1 });
  assert.equal(first.earned, 4);
  assert.equal(first.masteryXp, 6);
  assert.equal(first.firstClear, true);
  assert.equal(clear(1, { stars: 1 }).duplicate, true);
  assert.equal(Meta.getState().shadowCores, 4);
  const improve = clear(1, { completionId: 'improve', stars: 3 });
  assert.equal(improve.earned, 2);
  assert.equal(improve.masteryXp, 4);
  assert.equal(improve.firstClear, false);
  let repeats = 0;
  for (let i = 0; i < 12; i++) {
    const reward = clear(1, { completionId: `replay-${i}` });
    repeats += reward.earned;
    assert.equal(reward.masteryXp, 0);
  }
  assert.equal(repeats, 3);
  assert.equal(Meta.getState().masteryXp.ranger, 10);
  assert.equal(Meta.getState().stageProgress[1].replayRewards, 3);
});

test('fixed stage milestones unlock three characters and skills at 3, 8 and 15', () => {
  for (let stage = 1; stage <= 15; stage++) {
    const reward = clear(stage);
    const state = Meta.getState();
    assert.equal(state.unlockedOperatives.includes('gunner'), stage >= 3);
    assert.equal(state.unlockedOperatives.includes('warden'), stage >= 8);
    assert.equal(state.unlockedOperatives.includes('engineer'), stage >= 15);
    assert.equal(reward.unlocks.length, [3, 8, 15].includes(stage) ? 2 : 0);
  }
  assert.deepEqual(Meta.getState().unlockedSkills, ['burst', 'barrage', 'timerift', 'sentry']);
  assert.equal(Meta.getState().highestChapterUnlocked, 2);
  assert.deepEqual(Meta.getState().clearedChapters, [1]);
});

test('research requires distinct clears, spends exact currency and cannot be purchased twice', () => {
  seed({ shadowCores: 50 });
  assert.equal(Meta.purchaseResearch('tidy_satchel'), false);
  clear(1); clear(2);
  const before = Meta.getState().shadowCores;
  assert.equal(Meta.purchaseResearch('tidy_satchel'), true);
  assert.equal(Meta.getState().shadowCores, before - 6);
  assert.equal(Meta.purchaseResearch('tidy_satchel'), false);
  assert.equal(Meta.purchaseResearch('unknown'), false);
  assert.equal(Meta.purchaseResearch('__proto__'), false);
  assert.equal(Meta.getResearchNodes().find(node => node.id === 'tidy_satchel').purchased, true);
  assert.equal(Meta.getCombatBonuses('ranger').magnetRadiusBonus, 30);
});

test('specializations require earned mastery and currency, then equip one with a real tradeoff', () => {
  seed({ shadowCores: 100 });
  assert.equal(Meta.purchaseSpecialization('ranger_roamer'), false);
  clear(1); clear(2);
  assert.equal(Meta.getMastery('ranger').rank, 2);
  const before = Meta.getState().shadowCores;
  assert.equal(Meta.purchaseSpecialization('ranger_roamer'), true);
  assert.equal(Meta.getState().shadowCores, before - 8);
  assert.equal(Meta.equipSpecialization('ranger', 'ranger_roamer'), true);
  assert.equal(Meta.equipSpecialization('gunner', 'ranger_roamer'), false);
  assert.equal(Meta.purchaseSpecialization('ranger_blossom'), false);
  for (let i = 3; i <= 6; i++) clear(i);
  assert.equal(Meta.purchaseSpecialization('ranger_blossom'), true);
  assert.equal(Meta.equipSpecialization('ranger', 'ranger_blossom'), true);
  assert.equal(Meta.getSpecializations('ranger').filter(spec => spec.equipped).length, 1);
  const b = Meta.getCombatBonuses('ranger');
  assert.equal(b.speedMult, 1);
  assert.equal(b.damageMult, 1);
  assert.equal(b.explosiveBonus, 1);
  assert.equal(b.dashCooldownMult, 1.15);
  const currency = Meta.getState().shadowCores;
  assert.equal(Meta.equipSpecialization('ranger', null), true);
  assert.equal(Meta.getCombatBonuses('ranger').explosiveBonus, 0);
  assert.equal(Meta.getState().shadowCores, currency);
});

test('each operative earns mastery independently across distinct stages with a hard ceiling', () => {
  for (let stage = 1; stage <= CAMPAIGN_STAGE_COUNT; stage++) clear(stage);
  assert.equal(Meta.getState().masteryXp.ranger, MAX_MASTERY_XP);
  assert.equal(Meta.getMastery('ranger').rank, 7);
  assert.equal(Meta.getMastery('ranger').nextRankXp, null);
  assert.equal(Meta.getMastery('ranger').progress, 1);
  assert.equal(Meta.getState().masteryXp.gunner, 0);
  const reward = clear(1, { completionId: 'gunner-1', operativeId: 'gunner' });
  assert.equal(reward.masteryXp, 10);
  assert.equal(reward.firstClear, false);
  assert.equal(Meta.getState().masteryXp.gunner, 10);
  assert.equal(clear(1, { completionId: 'gunner-1-again', operativeId: 'gunner' }).masteryXp, 0);
});

test('battle application modifies the real Hero field contract including workshop and selected tradeoff', () => {
  const state = seed({ shadowCores: 100, modules: { arsenal: 5, armor: 5, reactor: 5 },
    research: RESEARCH_NODES.map(node => node.id), unlockedOperatives: ['ranger', 'warden'],
    masteryXp: { ranger: 220, gunner: 0, warden: 220, engineer: 0 },
    specializations: ['warden_rescue'], equippedSpecializations: { ranger: null, gunner: null, warden: 'warden_rescue', engineer: null } });
  const target = hero();
  target.maxHp = target.hp = 135; // operative's +35 HP has already been applied.
  target.shieldStacks = 2;
  const b = Meta.applyCombatBonuses(target, 'warden', state);
  assert.equal(target.damageMult, 1.15);
  assert.equal(target.maxHp, 145);
  assert.equal(target.hp, 145);
  assert.equal(target.charge, 40);
  assert.equal(target.dashCooldown, 820);
  assert.equal(target.speedMult, 1.04);
  assert.equal(target.chargePerKill, 5);
  assert.equal(target.magnetRadius, 100);
  assert.equal(target.shieldStacks, 3);
  assert.equal(target.regenPerSec, 1);
  assert.equal(b.coreHpBonus, 35);
});

test('all twelve specializations retain a cost or drawback and affect supported combat fields', () => {
  assert.equal(SPECIALIZATIONS.length, 12);
  for (const spec of SPECIALIZATIONS) {
    const state = createDefaultMetaState();
    state.unlockedOperatives = ['ranger', 'gunner', 'warden', 'engineer'];
    state.masteryXp[spec.operativeId] = 220;
    state.specializations = [spec.id];
    state.equippedSpecializations[spec.operativeId] = spec.id;
    const target = hero();
    Meta.applyCombatBonuses(target, spec.operativeId, state);
    assert.notDeepEqual(target, hero(), spec.id);
    assert.ok(Object.entries(spec.bonuses).some(([key, value]) => typeof value === 'number' &&
      (key === 'dashCooldownMult' ? value > 1 : ['damageMult', 'speedMult', 'attackSpeedMult'].includes(key) ? value < 1 : value < 0)), spec.id);
    assert.ok(spec.cost > 0);
  }
});

test('v2 migration preserves purchased ranks and currency, marks completed stages without first-clear grants', () => {
  save({ version: 2, shadowCores: 17, modules: { arsenal: 3, armor: 2, reactor: 1 },
    highestChapterUnlocked: 3, clearedChapters: [1, 2], totalRuns: 4, totalKills: 300, wins: 2,
    unlockedOperatives: ['ranger', 'gunner', 'warden'], unlockedSkills: ['burst', 'barrage', 'timerift'], clearedBuilds: ['nova'] });
  const migrated = Meta.getState();
  assert.equal(migrated.version, 3);
  assert.equal(migrated.shadowCores, 17);
  assert.equal(Object.keys(migrated.stageProgress).length, 20);
  assert.equal(migrated.stageProgress[1].migrated, true);
  assert.deepEqual(migrated.modules, { arsenal: 3, armor: 2, reactor: 1 });
  assert.equal(migrated.totalKills, 300);
  assert.deepEqual(migrated.clearedBuilds, ['nova']);
  assert.equal(clear(1, { stars: 1 }).firstClear, false);
  assert.equal(Meta.getState().shadowCores, 18);
  assert.equal(Meta.getState().masteryXp.ranger, 6);
});

test('malformed and future saves, invalid IDs and nonfinite numbers never create spendable values', () => {
  save({ version: 999, shadowCores: 900 });
  assert.equal(Meta.getState().shadowCores, 0);
  save({ ...createDefaultMetaState(), shadowCores: -50, modules: { arsenal: 99, armor: -3, reactor: 'five' },
    masteryXp: { ranger: 999999, gunner: -9, warden: '220', engineer: null },
    research: ['tidy_satchel', 'tidy_satchel', 'hacked'], specializations: ['ranger_roamer', 'wrong'],
    equippedSpecializations: { ranger: 'gunner_thread', gunner: 'ranger_roamer' },
    stageProgress: { 0: { stars: 3 }, 51: { stars: 3 }, 2: { stars: '3' }, 1: { stars: 3, replayRewards: 999, masteryStars: { ranger: 100 } } } });
  const state = Meta.getState();
  assert.equal(state.shadowCores, 0);
  assert.deepEqual(state.modules, { arsenal: 5, armor: 0, reactor: 0 });
  assert.deepEqual(state.masteryXp, { ranger: 220, gunner: 0, warden: 0, engineer: 0 });
  assert.deepEqual(state.research, ['tidy_satchel']);
  assert.equal(state.equippedSpecializations.ranger, null);
  assert.deepEqual(Object.keys(state.stageProgress), ['1']);
  for (const options of [{ stageId: NaN }, { stageId: 51 }, { stars: Infinity }, { stars: 1.5 }, { operativeId: '__proto__' }, { completionId: '../x' }, { completionId: 'x'.repeat(121) }]) {
    assert.equal(clear(1, options).saved, false);
  }
  assert.equal(Meta.purchase('missing'), false);
  assert.equal(Number.isFinite(workshopUpgradeCost(NaN)), true);
});

test('a refused localStorage write grants nothing, consumes nothing, and the same completion retries safely', () => {
  seed({ shadowCores: 40, masteryXp: { ranger: 20, gunner: 0, warden: 0, engineer: 0 },
    stageProgress: { 1: { stars: 3, replayRewards: 0, masteryStars: {} }, 2: { stars: 3, replayRewards: 0, masteryStars: {} } } });
  const before = entries.get(key);
  globalThis.localStorage = { ...storage, setItem() { throw new Error('quota'); } };
  assert.equal(Meta.purchase('arsenal'), false);
  assert.equal(Meta.purchaseResearch('tidy_satchel'), false);
  assert.equal(Meta.purchaseSpecialization('ranger_roamer'), false);
  const failed = clear(3);
  assert.equal(failed.saved, false);
  assert.equal(failed.earned, 0);
  assert.equal(failed.masteryXp, 0);
  assert.equal(entries.get(key), before);
  globalThis.localStorage = storage;
  const retry = clear(3);
  assert.equal(retry.saved, true);
  assert.equal(retry.firstClear, true);
  assert.equal(retry.earned, 6);
  assert.equal(clear(3).duplicate, true);
});

test('shadow and endless milestone rewards use durable records and capped role mastery', () => {
  const mode = options => Meta.recordModeProgress({ completionId: 'shadow-1', mode: 'shadow', operativeId: 'ranger', tier: 1, ...options });
  assert.equal(mode({}).earned, 6);
  assert.equal(mode({}).duplicate, true);
  assert.equal(mode({ completionId: 'shadow-repeat' }).earned, 0);
  assert.equal(mode({ completionId: 'shadow-repeat2' }).masteryXp, 0);
  let shadowTotal = 6;
  for (let tier = 2; tier <= 5; tier++) shadowTotal += mode({ tier, completionId: `tier-${tier}` }).earned;
  assert.equal(shadowTotal, 50);
  assert.equal(mode({ tier: 6, completionId: 'tier-6' }).saved, false);
  const endless = wave => mode({ mode: 'endless', wave, completionId: `endless-${wave}` });
  assert.equal(endless(4).earned, 0);
  assert.equal(endless(5).earned, 2);
  assert.equal(endless(14).earned, 2);
  assert.equal(endless(9).earned, 0);
  assert.equal(endless(1000).earned, 36);
  assert.equal(endless(2000).earned, 0);
  assert.equal(Meta.getState().shadowCores, 90);
  assert.equal(Meta.getState().masteryXp.ranger, 140);
});

test('a failed shadow reward remains retryable without charging it to another tier', () => {
  const input = { completionId: 'tier-1', mode: 'shadow', operativeId: 'ranger', tier: 1 };
  globalThis.localStorage = { ...storage, setItem() { throw new Error('quota'); } };
  assert.equal(Meta.recordModeProgress(input).earned, 0);
  globalThis.localStorage = storage;
  const recovered = Meta.recordModeProgress({ ...input, completionId: 'tier-2', tier: 2 });
  assert.equal(recovered.earned, 8);
  assert.equal(Meta.recordModeProgress(input).earned, 6);
  assert.equal(Meta.recordModeProgress(input).earned, 0);
});

test('stage/profile statistics share completion IDs without double currency or false full-campaign wins', () => {
  const reward = clear(1);
  const summary = { wave: 5, level: WAVE_CFG.levels, victory: true, endless: false, build: 'nova', kills: 30,
    durationSec: 30, profile: new RunRecorder().finish('nova', 100), recordOnly: true, mode: 'campaign',
    stageId: 1, operativeId: 'ranger', completionId: 'clear-1' };
  assert.equal(Meta.recordRun(summary).earned, 0);
  assert.equal(Meta.recordRun(summary).earned, 0);
  const state = Meta.getState();
  assert.equal(state.totalRuns, 1);
  assert.equal(state.totalKills, 30);
  assert.equal(state.shadowCores, reward.earned);
  assert.deepEqual(state.clearedBuilds, []);
  assert.equal(state.bestVictorySec, null);
  assert.equal(isFullCampaignVictory(summary), false);
  assert.equal(isFullCampaignVictory({ ...summary, stageId: undefined, mode: 'shadow' }), false);
  assert.equal(state.lastProfile?.build, 'nova');
});

test('finite campaign economy funds meaningful choices without requiring repeated easy-stage farming', () => {
  for (let stage = 1; stage <= 50; stage++) clear(stage, { stars: 1 });
  assert.equal(Meta.getState().shadowCores, 200);
  assert.equal(Meta.getProgressionOverview().clearedStages, 50);
  const allFoundationCost = 3 * [0, 1, 2, 3, 4].reduce((sum, rank) => sum + workshopUpgradeCost(rank), 0);
  const allResearchCost = RESEARCH_NODES.reduce((sum, node) => sum + node.cost, 0);
  const oneRoleAllSpecializations = SPECIALIZATIONS.filter(spec => spec.operativeId === 'ranger').reduce((sum, spec) => sum + spec.cost, 0);
  assert.equal(allFoundationCost + allResearchCost + oneRoleAllSpecializations, 164);
  for (const node of RESEARCH_NODES) assert.equal(Meta.purchaseResearch(node.id), true);
  for (const spec of SPECIALIZATIONS.filter(item => item.operativeId === 'ranger')) assert.equal(Meta.purchaseSpecialization(spec.id), true);
  for (const module of ['arsenal', 'armor', 'reactor']) for (let rank = 0; rank < 5; rank++) assert.equal(Meta.purchase(module), true);
  assert.equal(Meta.getState().shadowCores, 36);
  assert.equal(Meta.purchase('arsenal'), false);
});

test('an endless defeat cannot obtain legacy run rewards when a caller omits the new mode field', () => {
  const summary = { wave: 5, level: 12, victory: false, endless: true, build: 'nova', kills: 99,
    durationSec: 500, profile: new RunRecorder().finish('nova', 100) };
  assert.equal(Meta.recordRun(summary).earned, 0);
  assert.equal(Meta.getState().shadowCores, 0);
  assert.equal(Meta.getState().totalKills, 99);
});

test('atlas build achievements require that operative to clear every stage, and never use one-stage time', () => {
  for (let stage = 1; stage <= 50; stage++) clear(stage);
  const summary = { wave: 3, level: 5, victory: true, endless: false, build: 'engineer', kills: 10,
    durationSec: 70, profile: new RunRecorder().finish('engineer', 100), recordOnly: true, mode: 'campaign',
    stageId: 50, operativeId: 'engineer', completionId: 'engineer-finale' };
  Meta.recordRun(summary);
  assert.deepEqual(Meta.getState().clearedBuilds, []);
  Meta.recordRun({ ...summary, build: 'nova', operativeId: 'ranger', completionId: 'ranger-finale' });
  assert.deepEqual(Meta.getState().clearedBuilds, ['nova']);
  assert.equal(Meta.getState().bestVictorySec, null);
});

test('an unknown future save is left intact even if an older client tries to record a stage', () => {
  save({ version: 999, shadowCores: 900, futureFeature: { owned: true } });
  const before = entries.get(key);
  assert.equal(clear(1).saved, false);
  assert.equal(entries.get(key), before);
});

test('paid stage receipts remain idempotent after the global recent-event window is evicted', () => {
  clear(1, { stars: 1 });
  const state = Meta.getState();
  state.rewardReceipts = Array.from({ length: 2048 }, (_, i) => `mode:later-${i}`);
  save(state);
  const repeated = clear(1, { stars: 1 });
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.earned, 0);
  assert.equal(Meta.getState().stageProgress[1].replayRewards, 0);
  assert.equal(clear(1, { completionId: 'real-replay', stars: 1 }).earned, 1);
});
