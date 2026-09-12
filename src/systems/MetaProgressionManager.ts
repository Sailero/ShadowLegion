import type { BuildPath } from '../data/upgrades';
import type { CombatProfile } from './RunRecorder';
import type { OperativeId } from '../data/operatives';
import { WAVE_CFG } from '../config/gameConfig';
import { sanitizeCombatProfile } from './ShadowDirector';

export type WorkshopModuleId = 'arsenal' | 'armor' | 'reactor';

export interface WorkshopModuleDef {
  id: WorkshopModuleId;
  name: string;
  desc: string;
  color: number;
  perRank: string;
}

export interface MetaState {
  version: 2;
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
}

export interface ChapterUnlockResult {
  chapter: number;
  firstClear: boolean;
  nextChapter: number;
  operative?: OperativeId;
  skill?: string;
}

export interface RunSummary {
  wave: number;
  level: number;
  kills: number;
  durationSec: number;
  victory: boolean;
  endless: boolean;
  startLevel?: number;
  build: BuildPath | null;
  profile: CombatProfile;
}

export interface RunReward {
  earned: number;
  total: number;
  progressReward: number;
  victoryReward: number;
  newBuildReward: number;
  newBuildClear: boolean;
}

export const WORKSHOP_MAX_RANK = 5;

export const WORKSHOP_MODULES: WorkshopModuleDef[] = [
  { id: 'arsenal', name: '花火调校', desc: '给弹丸添一点暖意，提高基础伤害', color: 0xd59067, perRank: '每级伤害 +3%' },
  { id: 'armor', name: '软绒背心', desc: '出发时多带一点安心，提高初始生命', color: 0x6c9b7c, perRank: '每级生命 +5' },
  { id: 'reactor', name: '灵感便当', desc: '开局携带更多灵感，更快使出拿手技能', color: 0xa292bc, perRank: '每级初始灵感 +8' },
];

const STORAGE_KEY = 'shadowlegion_meta_v1';
const VALID_BUILDS: BuildPath[] = ['nova', 'storm', 'rift', 'engineer'];
const VALID_OPERATIVES: OperativeId[] = ['ranger', 'gunner', 'warden', 'engineer'];
const VALID_SKILLS = ['burst', 'barrage', 'timerift', 'sentry'];

export function createDefaultMetaState(): MetaState {
  return {
    version: 2,
    shadowCores: 0,
    modules: { arsenal: 0, armor: 0, reactor: 0 },
    totalRuns: 0,
    wins: 0,
    totalKills: 0,
    bestWave: 0,
    bestVictorySec: null,
    clearedBuilds: [],
    highestChapterUnlocked: 1,
    clearedChapters: [],
    unlockedOperatives: ['ranger'],
    unlockedSkills: ['burst'],
    lastProfile: null,
  };
}

export function workshopUpgradeCost(currentRank: number): number {
  const rank = Math.max(0, Math.min(WORKSHOP_MAX_RANK, Math.floor(currentRank)));
  return rank >= WORKSHOP_MAX_RANK ? 0 : rank + 2;
}

export function isFullCampaignVictory(summary: Pick<RunSummary, 'level' | 'victory' | 'endless' | 'startLevel'>): boolean {
  return summary.victory && !summary.endless && (summary.startLevel ?? 1) === 1 && summary.level === WAVE_CFG.levels;
}

export function calculateRunReward(summary: Pick<RunSummary, 'wave' | 'level' | 'victory' | 'endless' | 'startLevel'>, isNewBuild: boolean): Omit<RunReward, 'total'> {
  const level = Number.isFinite(summary.level) ? Math.max(1, Math.floor(summary.level)) : 1;
  const startLevel = Number.isFinite(summary.startLevel)
    ? Math.max(1, Math.min(level, Math.floor(summary.startLevel!))) : 1;
  const wave = Number.isFinite(summary.wave) ? Math.max(0, Math.min(WAVE_CFG.perLevel, Math.floor(summary.wave))) : 0;
  const effectiveWave = Math.max(1, (level - startLevel) * WAVE_CFG.perLevel + wave);
  const progressReward = Math.min(6, Math.floor(Math.max(0, effectiveWave - 1) / 2));
  const victoryReward = summary.victory ? 4 : 0;
  const newBuildReward = isFullCampaignVictory(summary) && isNewBuild ? 3 : 0;
  return {
    earned: progressReward + victoryReward + newBuildReward,
    progressReward, victoryReward, newBuildReward,
    newBuildClear: isFullCampaignVictory(summary) && isNewBuild,
  };
}

export class MetaProgressionManager {
  static getState(): MetaState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultMetaState();
      return this.sanitize(JSON.parse(raw) as unknown);
    } catch {
      return createDefaultMetaState();
    }
  }

  static getBonuses(state = this.getState()) {
    return {
      damageMult: 1 + state.modules.arsenal * 0.03,
      maxHpBonus: state.modules.armor * 5,
      startCharge: state.modules.reactor * 8,
    };
  }

  static getWorkshopLevel(state = this.getState()): number {
    return state.modules.arsenal + state.modules.armor + state.modules.reactor;
  }

  static recordChapterClear(chapter: number): ChapterUnlockResult {
    const state = this.getState();
    const cleared = Math.max(1, Math.min(WAVE_CFG.levels, Math.floor(chapter)));
    const firstClear = !state.clearedChapters.includes(cleared);
    if (firstClear) state.clearedChapters.push(cleared);
    state.highestChapterUnlocked = Math.max(state.highestChapterUnlocked, Math.min(WAVE_CFG.levels, cleared + 1));

    const result: ChapterUnlockResult = {
      chapter: cleared,
      firstClear,
      nextChapter: state.highestChapterUnlocked,
    };
    const unlocks: Partial<Record<number, { operative: OperativeId; skill: string }>> = {
      1: { operative: 'gunner', skill: 'barrage' },
      2: { operative: 'warden', skill: 'timerift' },
      3: { operative: 'engineer', skill: 'sentry' },
    };
    const unlock = unlocks[cleared];
    if (unlock) {
      if (!state.unlockedOperatives.includes(unlock.operative)) state.unlockedOperatives.push(unlock.operative);
      if (!state.unlockedSkills.includes(unlock.skill)) state.unlockedSkills.push(unlock.skill);
      if (firstClear) {
        result.operative = unlock.operative;
        result.skill = unlock.skill;
      }
    }
    this.save(state);
    return result;
  }

  static isOperativeUnlocked(id: OperativeId, state = this.getState()): boolean {
    return state.unlockedOperatives.includes(id);
  }

  static recordRun(summary: RunSummary): RunReward {
    const state = this.getState();
    const isNewBuild = Boolean(summary.build && !state.clearedBuilds.includes(summary.build));
    const reward = calculateRunReward(summary, isNewBuild);

    state.totalRuns++;
    state.wins += summary.victory ? 1 : 0;
    state.totalKills += Math.max(0, Math.round(summary.kills));
    state.bestWave = Math.max(state.bestWave, Math.max(0, Math.round(summary.wave)));
    state.lastProfile = sanitizeCombatProfile(summary.profile);
    if (isFullCampaignVictory(summary) && summary.durationSec > 0) {
      state.bestVictorySec = state.bestVictorySec === null
        ? summary.durationSec
        : Math.min(state.bestVictorySec, summary.durationSec);
    }
    if (isFullCampaignVictory(summary) && summary.build && !state.clearedBuilds.includes(summary.build)) {
      state.clearedBuilds.push(summary.build);
    }
    state.shadowCores += reward.earned;
    this.save(state);

    return { ...reward, total: state.shadowCores };
  }

  static purchase(id: WorkshopModuleId): boolean {
    const state = this.getState();
    const rank = state.modules[id];
    const cost = workshopUpgradeCost(rank);
    if (cost <= 0 || state.shadowCores < cost) return false;
    state.shadowCores -= cost;
    state.modules[id] = Math.min(WORKSHOP_MAX_RANK, rank + 1);
    this.save(state);
    return true;
  }

  private static save(state: MetaState): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }

  private static sanitize(value: unknown): MetaState {
    const fallback = createDefaultMetaState();
    if (typeof value !== 'object' || value === null) return fallback;
    const src = value as Record<string, unknown>;
    const moduleSrc = typeof src.modules === 'object' && src.modules !== null
      ? src.modules as Record<string, unknown>
      : {};
    const clampRank = (id: WorkshopModuleId) => {
      const raw = moduleSrc[id];
      return typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.min(WORKSHOP_MAX_RANK, Math.floor(raw)))
        : 0;
    };
    const num = (key: string) => typeof src[key] === 'number' && Number.isFinite(src[key])
      ? Math.max(0, Math.floor(src[key] as number))
      : 0;
    const clearedBuilds = Array.isArray(src.clearedBuilds)
      ? [...new Set(src.clearedBuilds.filter((item): item is BuildPath => VALID_BUILDS.includes(item as BuildPath)))]
      : [];
    const highestChapterUnlocked = typeof src.highestChapterUnlocked === 'number' && Number.isFinite(src.highestChapterUnlocked)
      ? Math.max(1, Math.min(WAVE_CFG.levels, Math.floor(src.highestChapterUnlocked)))
      : (num('wins') > 0 ? 2 : 1);
    const clearedChapters = Array.isArray(src.clearedChapters)
      ? [...new Set(src.clearedChapters.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= WAVE_CFG.levels))]
      : [];
    const unlockedOperatives = Array.isArray(src.unlockedOperatives)
      ? [...new Set(src.unlockedOperatives.filter((item): item is OperativeId => VALID_OPERATIVES.includes(item as OperativeId)))]
      : ['ranger'] as OperativeId[];
    const unlockedSkills = Array.isArray(src.unlockedSkills)
      ? [...new Set(src.unlockedSkills.filter((item): item is string => VALID_SKILLS.includes(item as string)))]
      : ['burst'];
    if (!unlockedOperatives.includes('ranger')) unlockedOperatives.unshift('ranger');
    if (!unlockedSkills.includes('burst')) unlockedSkills.unshift('burst');
    // Progress is the source of truth during v1 -> v2 migration. This also repairs
    // partially written saves without ever taking an earned unlock away.
    const earnedOperatives: OperativeId[] = ['ranger'];
    const earnedSkills = ['burst'];
    if (highestChapterUnlocked >= 2) { earnedOperatives.push('gunner'); earnedSkills.push('barrage'); }
    if (highestChapterUnlocked >= 3) { earnedOperatives.push('warden'); earnedSkills.push('timerift'); }
    if (highestChapterUnlocked >= 4) { earnedOperatives.push('engineer'); earnedSkills.push('sentry'); }
    earnedOperatives.forEach(id => { if (!unlockedOperatives.includes(id)) unlockedOperatives.push(id); });
    earnedSkills.forEach(id => { if (!unlockedSkills.includes(id)) unlockedSkills.push(id); });
    const bestVictorySec = typeof src.bestVictorySec === 'number' && Number.isFinite(src.bestVictorySec) && src.bestVictorySec > 0
      ? Math.floor(src.bestVictorySec)
      : null;
    const lastProfile = sanitizeCombatProfile(src.lastProfile);

    return {
      version: 2,
      shadowCores: num('shadowCores'),
      modules: { arsenal: clampRank('arsenal'), armor: clampRank('armor'), reactor: clampRank('reactor') },
      totalRuns: num('totalRuns'), wins: num('wins'), totalKills: num('totalKills'),
      bestWave: num('bestWave'), bestVictorySec, clearedBuilds,
      highestChapterUnlocked, clearedChapters, unlockedOperatives, unlockedSkills, lastProfile,
    };
  }
}
