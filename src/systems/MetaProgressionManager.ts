import type { BuildPath } from '../data/upgrades';
import type { CombatProfile } from './RunRecorder';
import type { OperativeId } from '../data/operatives';
import type { Hero } from '../entities/Hero';
import { WAVE_CFG, MAX_ENDLESS_WAVE } from '../config/gameConfig';
import { sanitizeCombatProfile } from './ShadowDirector';
import {
  CAMPAIGN_STAGE_COUNT, MASTERY_XP_THRESHOLDS, MASTERY_TITLES, MAX_MASTERY_XP,
  MAX_STAGE_REPLAY_REWARDS, PROGRESSION_MILESTONES, RESEARCH_NODES, SPECIALIZATIONS,
  createBaseCombatBonuses,
} from '../data/progression';
import type { CombatBonuses } from '../data/progression';

export type WorkshopModuleId = 'arsenal' | 'armor' | 'reactor';
export interface WorkshopModuleDef { id: WorkshopModuleId; name: string; desc: string; color: number; perRank: string }
export interface StageMetaProgress {
  stars: number;
  replayRewards: number;
  masteryStars: Partial<Record<OperativeId, number>>;
  /** At most one first-clear, two star improvements and three replay payments. Never evicted. */
  rewardIds?: string[];
  migrated?: boolean;
}
export interface MetaState {
  version: 3;
  shadowCores: number;
  modules: Record<WorkshopModuleId, number>;
  totalRuns: number;
  wins: number;
  totalKills: number;
  bestWave: number;
  bestVictorySec: number | null;
  clearedBuilds: BuildPath[];
  highestChapterUnlocked: number;
  clearedChapters: number[];
  unlockedOperatives: OperativeId[];
  unlockedSkills: string[];
  lastProfile: CombatProfile | null;
  research: string[];
  masteryXp: Record<OperativeId, number>;
  specializations: string[];
  equippedSpecializations: Record<OperativeId, string | null>;
  stageProgress: Record<string, StageMetaProgress>;
  modeProgress: {
    shadowBestTier: number;
    endlessBestWave: number;
    shadowMasteryTiers: Record<OperativeId, number>;
    endlessMasteryMilestones: Record<OperativeId, number>;
  };
  rewardReceipts: string[];
}
export interface ChapterUnlockResult {
  chapter: number; firstClear: boolean; nextChapter: number; operative?: OperativeId; skill?: string;
}
export interface RunSummary {
  wave: number; level: number; kills: number; durationSec: number; victory: boolean;
  endless: boolean; startLevel?: number; build: BuildPath | null; profile: CombatProfile;
  mode?: 'campaign' | 'shadow' | 'endless'; stageId?: number; operativeId?: OperativeId;
  completionId?: string;
  /** Independent stage/mode rewards have already been recorded by their director. */
  recordOnly?: boolean;
}
export interface RunReward {
  earned: number; total: number; progressReward: number; victoryReward: number;
  newBuildReward: number; newBuildClear: boolean;
}
export interface StageProgressInput {
  completionId: string; stageId: number; operativeId: OperativeId; stars: number; mode?: 'campaign';
}
export interface ModeProgressInput {
  completionId: string; mode: 'shadow' | 'endless'; operativeId: OperativeId; tier?: number; wave?: number;
}
export interface ProgressReward {
  earned: number; total: number; masteryXp: number; firstClear: boolean;
  unlocks: string[]; duplicate: boolean; saved: boolean;
}
export interface MasteryView { xp: number; rank: number; title: string; nextRankXp: number | null; progress: number }
type CombatBonusTarget = Pick<Hero, 'damageMult' | 'maxHp' | 'hp' | 'charge' | 'chargeMax' |
  'speedMult' | 'atkSpdMult' | 'dashCooldown' | 'chargePerKill' | 'magnetRadius' | 'shieldStacks' |
  'regenPerSec' | 'critChance' | 'explosiveShot' | 'ricochetShot' | 'bulletPiercing' | 'bulletHoming'>;

export const WORKSHOP_MAX_RANK = 5;
export const WORKSHOP_MODULES: WorkshopModuleDef[] = [
  { id: 'arsenal', name: '花火调校', desc: '给弹丸添一点暖意，提高基础伤害', color: 0xd59067, perRank: '每级伤害 +3%' },
  { id: 'armor', name: '软绒背心', desc: '出发时多带一点安心，提高初始生命', color: 0x6c9b7c, perRank: '每级生命 +5' },
  { id: 'reactor', name: '灵感便当', desc: '开局携带更多灵感，更快使出拿手技能', color: 0xa292bc, perRank: '每级初始灵感 +8' },
];
const STORAGE_KEY = 'shadowlegion_meta_v1';
const MAX_RECEIPTS = 2048;
const MAX_CURRENCY = 1_000_000;
const MAX_STAT = 1_000_000_000;
const VALID_BUILDS: BuildPath[] = ['nova', 'storm', 'rift', 'engineer'];
const VALID_OPERATIVES: OperativeId[] = ['ranger', 'gunner', 'warden', 'engineer'];
const VALID_SKILLS = ['burst', 'barrage', 'timerift', 'sentry'];
const UNLOCK_NAMES: Record<string, string> = {
  gunner: '爆米花炮手', warden: '抱抱守卫', engineer: '蜜蜂工匠',
  barrage: '爆米花雨', timerift: '慢悠悠茶会', sentry: '蜜蜂小帮手',
};
const int = (value: unknown, max = MAX_STAT, min = 0): number => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(min, Math.min(max, Math.floor(value))) : min;
const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const operativeRecord = <T>(value: T): Record<OperativeId, T> => ({ ranger: value, gunner: value, warden: value, engineer: value });
const validCompletion = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
const validStage = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= CAMPAIGN_STAGE_COUNT;
const zeroRun = (): Omit<RunReward, 'total'> => ({ earned: 0, progressReward: 0, victoryReward: 0, newBuildReward: 0, newBuildClear: false });

export function createDefaultMetaState(): MetaState {
  return {
    version: 3, shadowCores: 0, modules: { arsenal: 0, armor: 0, reactor: 0 },
    totalRuns: 0, wins: 0, totalKills: 0, bestWave: 0, bestVictorySec: null, clearedBuilds: [],
    highestChapterUnlocked: 1, clearedChapters: [], unlockedOperatives: ['ranger'], unlockedSkills: ['burst'], lastProfile: null,
    research: [], masteryXp: operativeRecord(0), specializations: [], equippedSpecializations: operativeRecord(null),
    stageProgress: {}, modeProgress: { shadowBestTier: 0, endlessBestWave: 0, shadowMasteryTiers: operativeRecord(0), endlessMasteryMilestones: operativeRecord(0) },
    rewardReceipts: [],
  };
}
export function workshopUpgradeCost(currentRank: number): number {
  const rank = int(currentRank, WORKSHOP_MAX_RANK);
  return rank >= WORKSHOP_MAX_RANK ? 0 : rank + 2;
}
type CampaignSummary = Pick<RunSummary, 'level' | 'victory' | 'endless' | 'startLevel' | 'stageId' | 'mode'>;
export function isFullCampaignVictory(summary: CampaignSummary): boolean {
  return summary.victory && !summary.endless && summary.stageId === undefined &&
    (!summary.mode || summary.mode === 'campaign') && (summary.startLevel ?? 1) === 1 && summary.level === WAVE_CFG.levels;
}
export function calculateRunReward(summary: CampaignSummary & Pick<RunSummary, 'wave' | 'recordOnly'>, isNewBuild: boolean): Omit<RunReward, 'total'> {
  if (summary.recordOnly || summary.endless || summary.stageId !== undefined || summary.mode === 'shadow' || summary.mode === 'endless') return zeroRun();
  const level = int(summary.level, WAVE_CFG.levels, 1);
  const startLevel = int(summary.startLevel, level, 1);
  const wave = int(summary.wave, WAVE_CFG.perLevel);
  const effectiveWave = Math.max(1, (level - startLevel) * WAVE_CFG.perLevel + wave);
  const progressReward = Math.min(6, Math.floor(Math.max(0, effectiveWave - 1) / 2));
  const victoryReward = summary.victory ? 4 : 0;
  const newBuildReward = isFullCampaignVictory(summary) && isNewBuild ? 3 : 0;
  return { earned: progressReward + victoryReward + newBuildReward, progressReward, victoryReward, newBuildReward,
    newBuildClear: isFullCampaignVictory(summary) && isNewBuild };
}

export class MetaProgressionManager {
  static getState(): MetaState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw.length > 512 * 1024) return createDefaultMetaState();
      return this.sanitize(JSON.parse(raw));
    } catch { return createDefaultMetaState(); }
  }
  static getBonuses(state = this.getState()) {
    return { damageMult: 1 + int(state.modules.arsenal, 5) * 0.03, maxHpBonus: int(state.modules.armor, 5) * 5, startCharge: int(state.modules.reactor, 5) * 8 };
  }
  static getWorkshopLevel(state = this.getState()): number {
    return Object.values(state.modules).reduce((sum, rank) => sum + int(rank, 5), 0);
  }
  static getMastery(operativeId: OperativeId, state = this.getState()): MasteryView {
    const xp = int(state.masteryXp[operativeId], MAX_MASTERY_XP);
    let index = 0;
    while (index + 1 < MASTERY_XP_THRESHOLDS.length && xp >= MASTERY_XP_THRESHOLDS[index + 1]) index++;
    const nextRankXp = MASTERY_XP_THRESHOLDS[index + 1] ?? null;
    return { xp, rank: index + 1, title: MASTERY_TITLES[index], nextRankXp,
      progress: nextRankXp === null ? 1 : (xp - MASTERY_XP_THRESHOLDS[index]) / (nextRankXp - MASTERY_XP_THRESHOLDS[index]) };
  }
  static getProgressionOverview(state = this.getState()) {
    return { clearedStages: Object.keys(state.stageProgress).length, totalStages: CAMPAIGN_STAGE_COUNT,
      researchOwned: state.research.length, researchTotal: RESEARCH_NODES.length,
      mastery: Object.fromEntries(VALID_OPERATIVES.map(id => [id, this.getMastery(id, state)])) as Record<OperativeId, MasteryView> };
  }
  static getResearchNodes(state = this.getState()) {
    const clears = this.getProgressionOverview(state).clearedStages;
    return RESEARCH_NODES.map(node => {
      const purchased = state.research.includes(node.id);
      const unlocked = clears >= node.requiredClears;
      return { ...node, purchased, unlocked, canPurchase: unlocked && !purchased && state.shadowCores >= node.cost };
    });
  }
  static getSpecializations(operativeId: OperativeId, state = this.getState()) {
    const rank = this.getMastery(operativeId, state).rank;
    return SPECIALIZATIONS.filter(spec => spec.operativeId === operativeId).map(spec => {
      const purchased = state.specializations.includes(spec.id);
      const unlocked = this.isOperativeUnlocked(operativeId, state) && rank >= spec.requiredRank;
      return { ...spec, purchased, unlocked, equipped: state.equippedSpecializations[operativeId] === spec.id,
        canPurchase: unlocked && !purchased && state.shadowCores >= spec.cost };
    });
  }
  static getCombatBonuses(operativeId: OperativeId, state = this.getState()): CombatBonuses {
    const bonuses = { ...createBaseCombatBonuses(), ...this.getBonuses(state) };
    const factors = new Set(['damageMult', 'speedMult', 'attackSpeedMult', 'dashCooldownMult']);
    const merge = (effect: Partial<CombatBonuses>) => {
      for (const key of Object.keys(effect) as (keyof CombatBonuses)[]) {
        if (key === 'piercing' || key === 'homing') bonuses[key] ||= effect[key] === true;
        else bonuses[key] = factors.has(key) ? bonuses[key] * (effect[key] as number) : bonuses[key] + (effect[key] as number);
      }
    };
    RESEARCH_NODES.filter(node => state.research.includes(node.id)).forEach(node => merge(node.bonuses));
    const equipped = this.getSpecializations(operativeId, state).find(spec => spec.equipped && spec.purchased && spec.unlocked);
    if (equipped) merge(equipped.bonuses);
    return bonuses;
  }
  /** Call exactly once per fresh Hero, after its operative is initialized. Includes base workshop effects. */
  static applyCombatBonuses(hero: CombatBonusTarget, operativeId: OperativeId, state = this.getState()): CombatBonuses {
    const b = this.getCombatBonuses(operativeId, state);
    hero.damageMult *= b.damageMult;
    hero.maxHp = Math.max(1, hero.maxHp + b.maxHpBonus);
    hero.hp = Math.max(1, Math.min(hero.maxHp, hero.hp + b.maxHpBonus));
    hero.charge = Math.min(hero.chargeMax, hero.charge + b.startCharge);
    hero.speedMult *= b.speedMult;
    hero.atkSpdMult *= b.attackSpeedMult;
    hero.dashCooldown *= b.dashCooldownMult;
    hero.chargePerKill += b.chargePerKillBonus;
    hero.magnetRadius += b.magnetRadiusBonus;
    hero.shieldStacks += b.shieldBonus;
    hero.regenPerSec += b.regenPerSec;
    hero.critChance = Math.min(1, hero.critChance + b.critChanceBonus);
    hero.explosiveShot += b.explosiveBonus;
    hero.ricochetShot += b.ricochetBonus;
    hero.bulletPiercing ||= b.piercing;
    hero.bulletHoming ||= b.homing;
    return b;
  }
  static purchase(id: WorkshopModuleId): boolean {
    const state = this.getState();
    if (!WORKSHOP_MODULES.some(module => module.id === id)) return false;
    const rank = state.modules[id];
    const cost = workshopUpgradeCost(rank);
    if (cost <= 0 || state.shadowCores < cost) return false;
    state.shadowCores -= cost;
    state.modules[id] = rank + 1;
    return this.save(state);
  }
  static purchaseResearch(id: string): boolean {
    const state = this.getState();
    const node = this.getResearchNodes(state).find(item => item.id === id && item.canPurchase);
    if (!node) return false;
    state.shadowCores -= node.cost;
    state.research.push(id);
    return this.save(state);
  }
  static purchaseSpecialization(id: string): boolean {
    const state = this.getState();
    const def = SPECIALIZATIONS.find(spec => spec.id === id);
    if (!def || !this.getSpecializations(def.operativeId, state).some(spec => spec.id === id && spec.canPurchase)) return false;
    state.shadowCores -= def.cost;
    state.specializations.push(id);
    return this.save(state);
  }
  static equipSpecialization(operativeId: OperativeId, id: string | null): boolean {
    const state = this.getState();
    if (!VALID_OPERATIVES.includes(operativeId) || !this.isOperativeUnlocked(operativeId, state)) return false;
    if (id !== null && !this.getSpecializations(operativeId, state).some(spec => spec.id === id && spec.purchased && spec.unlocked)) return false;
    state.equippedSpecializations[operativeId] = id;
    return this.save(state);
  }
  static isOperativeUnlocked(id: OperativeId, state = this.getState()): boolean { return state.unlockedOperatives.includes(id); }
  static recordChapterClear(chapter: number): ChapterUnlockResult {
    const state = this.getState();
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > WAVE_CFG.levels) return { chapter: 0, firstClear: false, nextChapter: state.highestChapterUnlocked };
    const firstClear = !state.clearedChapters.includes(chapter);
    if (firstClear) state.clearedChapters.push(chapter);
    state.highestChapterUnlocked = Math.max(state.highestChapterUnlocked, Math.min(WAVE_CFG.levels, chapter + 1));
    const result: ChapterUnlockResult = { chapter, firstClear, nextChapter: state.highestChapterUnlocked };
    const legacyUnlock = PROGRESSION_MILESTONES[chapter - 1];
    if (legacyUnlock) {
      this.unlock(state, legacyUnlock.operativeId, legacyUnlock.skillId);
      if (firstClear) { result.operative = legacyUnlock.operativeId; result.skill = legacyUnlock.skillId; }
    }
    if (!this.save(state)) result.firstClear = false;
    return result;
  }
  static recordStageProgress(input: StageProgressInput): ProgressReward {
    const state = this.getState();
    const none = this.emptyReward(state);
    if (!validCompletion(input.completionId) || !validStage(input.stageId) || !Number.isInteger(input.stars) ||
      input.stars < 1 || input.stars > 3 || (input.mode && input.mode !== 'campaign') || !this.isOperativeUnlocked(input.operativeId, state)) return none;
    const receipt = `stage:${input.completionId}`;
    if (state.rewardReceipts.includes(receipt)) return { ...none, duplicate: true, saved: true };
    const old = state.stageProgress[input.stageId];
    if (old?.rewardIds?.includes(input.completionId)) return { ...none, duplicate: true, saved: true };
    const firstClear = !old;
    const entry: StageMetaProgress = old ?? { stars: 0, replayRewards: 0, masteryStars: {} };
    const newStars = Math.max(0, input.stars - entry.stars);
    let earned = firstClear ? 3 + input.stars : newStars;
    if (!firstClear && newStars === 0 && entry.replayRewards < MAX_STAGE_REPLAY_REWARDS) { earned++; entry.replayRewards++; }
    if (earned > 0) entry.rewardIds = [...(entry.rewardIds ?? []), input.completionId].slice(-6);
    const roleStars = entry.masteryStars[input.operativeId] ?? 0;
    const xp = roleStars === 0 ? 4 + input.stars * 2 : Math.max(0, input.stars - roleStars) * 2;
    const masteryXp = this.addMastery(state, input.operativeId, xp);
    entry.stars = Math.max(entry.stars, input.stars);
    entry.masteryStars[input.operativeId] = Math.max(roleStars, input.stars);
    state.stageProgress[input.stageId] = entry;
    const unlocks: string[] = [];
    for (const milestone of PROGRESSION_MILESTONES) {
      if (state.stageProgress[milestone.stageId]) unlocks.push(...this.unlock(state, milestone.operativeId, milestone.skillId));
    }
    for (let chapter = 1; chapter <= WAVE_CFG.levels; chapter++) {
      if (Array.from({ length: 10 }, (_, index) => (chapter - 1) * 10 + index + 1).every(id => state.stageProgress[id])) {
        if (!state.clearedChapters.includes(chapter)) state.clearedChapters.push(chapter);
        state.highestChapterUnlocked = Math.max(state.highestChapterUnlocked, Math.min(WAVE_CFG.levels, chapter + 1));
      }
    }
    earned = this.addCurrency(state, earned);
    this.receipt(state, receipt);
    if (!this.save(state)) return none;
    return { earned, total: state.shadowCores, masteryXp, firstClear, unlocks, duplicate: false, saved: true };
  }
  static recordModeProgress(input: ModeProgressInput): ProgressReward {
    const state = this.getState();
    const none = this.emptyReward(state);
    if (!validCompletion(input.completionId) || !this.isOperativeUnlocked(input.operativeId, state)) return none;
    const receipt = `mode:${input.completionId}`;
    if (state.rewardReceipts.includes(receipt)) return { ...none, duplicate: true, saved: true };
    let earned = 0;
    let xp = 0;
    let firstClear = false;
    if (input.mode === 'shadow') {
      if (!Number.isInteger(input.tier) || input.tier! < 1 || input.tier! > 5) return none;
      const tier = input.tier!;
      firstClear = tier > state.modeProgress.shadowBestTier;
      if (firstClear) {
        // The mode director owns tier access. A higher cleared tier also recovers
        // preceding rewards whose separate localStorage write failed.
        for (let value = state.modeProgress.shadowBestTier + 1; value <= tier; value++) earned += 4 + value * 2;
        state.modeProgress.shadowBestTier = tier;
      }
      const oldTier = state.modeProgress.shadowMasteryTiers[input.operativeId];
      for (let value = oldTier + 1; value <= tier; value++) xp += 10 + value * 2;
      state.modeProgress.shadowMasteryTiers[input.operativeId] = Math.max(oldTier, tier);
    } else if (input.mode === 'endless') {
      if (!Number.isInteger(input.wave) || input.wave! < 1 || input.wave! > MAX_ENDLESS_WAVE) return none;
      const wave = input.wave!;
      const milestone = Math.min(20, Math.floor(wave / 5));
      const oldMilestone = Math.min(20, Math.floor(state.modeProgress.endlessBestWave / 5));
      firstClear = milestone > oldMilestone;
      earned = Math.max(0, milestone - oldMilestone) * 2;
      xp = Math.max(0, milestone - state.modeProgress.endlessMasteryMilestones[input.operativeId]) * 3;
      state.modeProgress.endlessBestWave = Math.max(state.modeProgress.endlessBestWave, wave);
      state.modeProgress.endlessMasteryMilestones[input.operativeId] = Math.max(state.modeProgress.endlessMasteryMilestones[input.operativeId], milestone);
    } else return none;
    const masteryXp = this.addMastery(state, input.operativeId, xp);
    earned = this.addCurrency(state, earned);
    this.receipt(state, receipt);
    if (!this.save(state)) return none;
    return { earned, total: state.shadowCores, masteryXp, firstClear, unlocks: [], duplicate: false, saved: true };
  }
  static recordRun(summary: RunSummary): RunReward {
    const state = this.getState();
    const receipt = summary.completionId ? `run:${summary.completionId}` : null;
    if (summary.completionId && (!validCompletion(summary.completionId) || state.rewardReceipts.includes(receipt!))) return { ...zeroRun(), total: state.shadowCores };
    const isNewBuild = Boolean(summary.build && VALID_BUILDS.includes(summary.build) && !state.clearedBuilds.includes(summary.build));
    const reward = calculateRunReward(summary, isNewBuild);
    state.totalRuns = int(state.totalRuns + 1);
    state.wins = int(state.wins + (summary.victory ? 1 : 0));
    state.totalKills = int(state.totalKills + int(summary.kills));
    state.bestWave = Math.max(state.bestWave, int(summary.wave, MAX_ENDLESS_WAVE));
    state.lastProfile = sanitizeCombatProfile(summary.profile);
    const fullVictory = isFullCampaignVictory(summary);
    if (fullVictory && Number.isFinite(summary.durationSec) && summary.durationSec > 0) {
      state.bestVictorySec = state.bestVictorySec === null ? Math.min(604800, summary.durationSec) : Math.min(state.bestVictorySec, summary.durationSec);
    }
    const operativeBuilds: Record<OperativeId, BuildPath> = { ranger: 'nova', gunner: 'storm', warden: 'rift', engineer: 'engineer' };
    const completedAtlas = summary.victory && summary.mode !== 'shadow' && !summary.endless && validStage(summary.stageId) &&
      summary.operativeId !== undefined && operativeBuilds[summary.operativeId] === summary.build &&
      Array.from({ length: CAMPAIGN_STAGE_COUNT }, (_, i) => i + 1).every(id => (state.stageProgress[id]?.masteryStars[summary.operativeId!] ?? 0) > 0);
    if ((fullVictory || completedAtlas) && isNewBuild) state.clearedBuilds.push(summary.build!);
    reward.earned = this.addCurrency(state, reward.earned);
    if (receipt) this.receipt(state, receipt);
    if (!this.save(state)) return { ...zeroRun(), total: this.getState().shadowCores };
    return { ...reward, total: state.shadowCores };
  }
  private static emptyReward(state: MetaState): ProgressReward {
    return { earned: 0, total: state.shadowCores, masteryXp: 0, firstClear: false, unlocks: [], duplicate: false, saved: false };
  }
  private static addCurrency(state: MetaState, amount: number): number {
    const added = Math.min(MAX_CURRENCY - state.shadowCores, int(amount, MAX_CURRENCY));
    state.shadowCores += added;
    return added;
  }
  private static addMastery(state: MetaState, id: OperativeId, amount: number): number {
    const added = Math.min(MAX_MASTERY_XP - state.masteryXp[id], int(amount, MAX_MASTERY_XP));
    state.masteryXp[id] += added;
    return added;
  }
  private static unlock(state: MetaState, operativeId: OperativeId, skillId: string): string[] {
    const names: string[] = [];
    if (!state.unlockedOperatives.includes(operativeId)) { state.unlockedOperatives.push(operativeId); names.push(UNLOCK_NAMES[operativeId]); }
    if (!state.unlockedSkills.includes(skillId)) { state.unlockedSkills.push(skillId); names.push(UNLOCK_NAMES[skillId]); }
    return names;
  }
  private static receipt(state: MetaState, id: string): void {
    state.rewardReceipts.push(id);
    if (state.rewardReceipts.length > MAX_RECEIPTS) state.rewardReceipts.splice(0, state.rewardReceipts.length - MAX_RECEIPTS);
  }
  private static save(state: MetaState): boolean {
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) {
        try {
          const version = object(JSON.parse(previous)).version;
          if (typeof version === 'number' && version > 3) return false;
        } catch { /* A malformed older save can be replaced by valid progress. */ }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch { return false; }
  }
  static sanitize(value: unknown): MetaState {
    const state = createDefaultMetaState();
    const src = object(value);
    if (src.version !== undefined && src.version !== 1 && src.version !== 2 && src.version !== 3) return state;
    const modules = object(src.modules);
    state.modules = { arsenal: int(modules.arsenal, 5), armor: int(modules.armor, 5), reactor: int(modules.reactor, 5) };
    state.shadowCores = int(src.shadowCores, MAX_CURRENCY);
    for (const key of ['totalRuns', 'wins', 'totalKills'] as const) state[key] = int(src[key]);
    state.bestWave = int(src.bestWave, MAX_ENDLESS_WAVE);
    state.bestVictorySec = typeof src.bestVictorySec === 'number' && Number.isFinite(src.bestVictorySec) && src.bestVictorySec > 0 ? Math.min(604800, Math.floor(src.bestVictorySec)) : null;
    const filter = <T extends string>(value: unknown, allowed: readonly T[]): T[] => Array.isArray(value) ? [...new Set(value.filter((id): id is T => allowed.includes(id as T)))] : [];
    state.clearedBuilds = filter(src.clearedBuilds, VALID_BUILDS);
    state.highestChapterUnlocked = typeof src.highestChapterUnlocked === 'number' && Number.isFinite(src.highestChapterUnlocked)
      ? int(src.highestChapterUnlocked, WAVE_CFG.levels, 1) : state.wins > 0 && src.version !== 3 ? 2 : 1;
    state.clearedChapters = Array.isArray(src.clearedChapters) ? [...new Set(src.clearedChapters.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= WAVE_CFG.levels))] : [];
    state.unlockedOperatives = [...new Set<OperativeId>(['ranger', ...filter(src.unlockedOperatives, VALID_OPERATIVES)])];
    state.unlockedSkills = [...new Set(['burst', ...filter(src.unlockedSkills, VALID_SKILLS)])];
    state.lastProfile = sanitizeCombatProfile(src.lastProfile);
    const progress = object(src.stageProgress);
    for (let stageId = 1; stageId <= CAMPAIGN_STAGE_COUNT; stageId++) {
      const raw = object(progress[stageId]);
      const stars = int(raw.stars, 3);
      if (!stars) continue;
      const masteryStars: Partial<Record<OperativeId, number>> = {};
      const rawMastery = object(raw.masteryStars);
      for (const id of VALID_OPERATIVES) if (int(rawMastery[id], 3)) masteryStars[id] = int(rawMastery[id], 3);
      const rewardIds = Array.isArray(raw.rewardIds) ? [...new Set(raw.rewardIds.filter(validCompletion))].slice(-6) : [];
      state.stageProgress[stageId] = { stars, replayRewards: int(raw.replayRewards, MAX_STAGE_REPLAY_REWARDS), masteryStars, rewardIds, ...(raw.migrated === true ? { migrated: true } : {}) };
    }
    if (src.version !== 3) {
      const legacyChapters = new Set([...state.clearedChapters, ...Array.from({ length: state.highestChapterUnlocked - 1 }, (_, i) => i + 1)]);
      for (const chapter of legacyChapters) for (let offset = 1; offset <= 10; offset++) {
        const stageId = (chapter - 1) * 10 + offset;
        if (stageId <= CAMPAIGN_STAGE_COUNT && !state.stageProgress[stageId]) state.stageProgress[stageId] = { stars: 1, replayRewards: 0, masteryStars: {}, migrated: true };
      }
      PROGRESSION_MILESTONES.forEach((milestone, index) => {
        if (state.highestChapterUnlocked >= index + 2) this.unlock(state, milestone.operativeId, milestone.skillId);
      });
    }
    for (const milestone of PROGRESSION_MILESTONES) if (state.stageProgress[milestone.stageId]) this.unlock(state, milestone.operativeId, milestone.skillId);
    state.research = filter(src.research, RESEARCH_NODES.map(node => node.id));
    state.specializations = filter(src.specializations, SPECIALIZATIONS.map(spec => spec.id));
    const mastery = object(src.masteryXp);
    const equipped = object(src.equippedSpecializations);
    for (const id of VALID_OPERATIVES) {
      state.masteryXp[id] = int(mastery[id], MAX_MASTERY_XP);
      const spec = SPECIALIZATIONS.find(item => item.id === equipped[id] && item.operativeId === id);
      if (spec && state.specializations.includes(spec.id) && state.unlockedOperatives.includes(id) && this.getMastery(id, state).rank >= spec.requiredRank) state.equippedSpecializations[id] = spec.id;
    }
    const modes = object(src.modeProgress);
    state.modeProgress.shadowBestTier = int(modes.shadowBestTier, 5);
    state.modeProgress.endlessBestWave = int(modes.endlessBestWave, MAX_ENDLESS_WAVE);
    for (const id of VALID_OPERATIVES) {
      state.modeProgress.shadowMasteryTiers[id] = int(object(modes.shadowMasteryTiers)[id], 5);
      state.modeProgress.endlessMasteryMilestones[id] = int(object(modes.endlessMasteryMilestones)[id], 20);
    }
    state.rewardReceipts = Array.isArray(src.rewardReceipts) ? [...new Set(src.rewardReceipts.filter((id): id is string =>
      typeof id === 'string' && /^(stage|mode|run):[A-Za-z0-9:_-]{1,120}$/.test(id)))].slice(-MAX_RECEIPTS) : [];
    return state;
  }
}
