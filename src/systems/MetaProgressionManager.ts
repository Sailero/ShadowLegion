import type { BuildPath } from '../data/upgrades';
import type { CombatProfile } from './RunRecorder';

export type WorkshopModuleId = 'arsenal' | 'armor' | 'reactor';

export interface WorkshopModuleDef {
  id: WorkshopModuleId;
  name: string;
  desc: string;
  color: number;
  perRank: string;
}

export interface MetaState {
  version: 1;
  shadowCores: number;
  modules: Record<WorkshopModuleId, number>;
  totalRuns: number;
  wins: number;
  totalKills: number;
  bestWave: number;
  bestVictorySec: number | null;
  clearedBuilds: BuildPath[];
  lastProfile: CombatProfile | null;
}

export interface RunSummary {
  wave: number;
  level: number;
  kills: number;
  durationSec: number;
  victory: boolean;
  endless: boolean;
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
  { id: 'arsenal', name: '武器校准', desc: '提高所有武器基础伤害', color: 0xf97316, perRank: '每级伤害 +3%' },
  { id: 'armor', name: '反应装甲', desc: '提高每次突围的初始生命', color: 0x22c55e, perRank: '每级生命 +5' },
  { id: 'reactor', name: '过载电池', desc: '开局携带更多技能能量', color: 0x818cf8, perRank: '每级初始能量 +8' },
];

const STORAGE_KEY = 'shadowlegion_meta_v1';
const VALID_BUILDS: BuildPath[] = ['nova', 'storm', 'rift'];

export function createDefaultMetaState(): MetaState {
  return {
    version: 1,
    shadowCores: 0,
    modules: { arsenal: 0, armor: 0, reactor: 0 },
    totalRuns: 0,
    wins: 0,
    totalKills: 0,
    bestWave: 0,
    bestVictorySec: null,
    clearedBuilds: [],
    lastProfile: null,
  };
}

export function workshopUpgradeCost(currentRank: number): number {
  const rank = Math.max(0, Math.min(WORKSHOP_MAX_RANK, Math.floor(currentRank)));
  return rank >= WORKSHOP_MAX_RANK ? 0 : rank + 2;
}

export function calculateRunReward(summary: Pick<RunSummary, 'wave' | 'level' | 'victory' | 'endless'>, isNewBuild: boolean): Omit<RunReward, 'total'> {
  const effectiveWave = summary.endless
    ? Math.max(1, (Math.max(1, summary.level) - 1) * 8 + summary.wave)
    : summary.wave;
  const progressReward = Math.min(6, Math.floor(Math.max(0, effectiveWave - 1) / 2));
  const victoryReward = summary.victory ? 4 : 0;
  const newBuildReward = summary.victory && isNewBuild ? 3 : 0;
  return {
    earned: progressReward + victoryReward + newBuildReward,
    progressReward, victoryReward, newBuildReward,
    newBuildClear: summary.victory && isNewBuild,
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

  static recordRun(summary: RunSummary): RunReward {
    const state = this.getState();
    const isNewBuild = Boolean(summary.build && !state.clearedBuilds.includes(summary.build));
    const reward = calculateRunReward(summary, isNewBuild);

    state.totalRuns++;
    state.wins += summary.victory ? 1 : 0;
    state.totalKills += Math.max(0, Math.round(summary.kills));
    state.bestWave = Math.max(state.bestWave, Math.max(0, Math.round(summary.wave)));
    state.lastProfile = summary.profile;
    if (summary.victory && summary.durationSec > 0) {
      state.bestVictorySec = state.bestVictorySec === null
        ? summary.durationSec
        : Math.min(state.bestVictorySec, summary.durationSec);
    }
    if (summary.victory && summary.build && !state.clearedBuilds.includes(summary.build)) {
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
    const bestVictorySec = typeof src.bestVictorySec === 'number' && src.bestVictorySec > 0
      ? Math.floor(src.bestVictorySec)
      : null;
    const lastProfile = typeof src.lastProfile === 'object' && src.lastProfile !== null
      ? src.lastProfile as CombatProfile
      : null;

    return {
      version: 1,
      shadowCores: num('shadowCores'),
      modules: { arsenal: clampRank('arsenal'), armor: clampRank('armor'), reactor: clampRank('reactor') },
      totalRuns: num('totalRuns'), wins: num('wins'), totalKills: num('totalKills'),
      bestWave: num('bestWave'), bestVictorySec, clearedBuilds, lastProfile,
    };
  }
}
