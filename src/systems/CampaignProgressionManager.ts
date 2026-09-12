import { OPERATIVES, type OperativeId } from '../data/operatives';
import {
  CAMPAIGN_STAGE_COUNT, STAGES_PER_CHAPTER, calculateStageStars, getNextStage,
  getStage, getStagesForChapter, type StageDef, type StageMetrics,
} from '../data/stages';
import { MetaProgressionManager, type ProgressReward } from './MetaProgressionManager';

export interface StageRecord {
  stars: number;
  clears: number;
  attempts: number;
  bestTimeSec: number | null;
  bestCoreRatio: number;
  lastPlayedAt: string;
  migrated?: boolean;
}
export interface StageReceipt {
  id: string;
  stageId: number;
  operativeId: OperativeId;
  stars: number;
  victory: boolean;
}
export interface CampaignState {
  version: 1;
  highestUnlockedStage: number;
  stageResults: Record<number, StageRecord>;
  totalStars: number;
  recentCompletions: StageReceipt[];
  pendingRewards: StageReceipt[];
}
export interface StageCompletion extends StageMetrics {
  completionId: string;
  operativeId: OperativeId;
}
export type CampaignWriteProtection = 'future-save-version' | 'storage-unavailable';
export interface StageResultReward {
  stageId: number;
  stars: number;
  newStars: number;
  firstClear: boolean;
  nextStageId: number | null;
  chapterCompleted: boolean;
  campaignCompleted: boolean;
  earned: number;
  total: number;
  masteryXp: number;
  unlocks: string[];
  duplicate: boolean;
  saved: boolean;
  routeSaved: boolean;
  error?: 'invalid-result' | 'locked-stage' | 'pending-reward-capacity' | CampaignWriteProtection;
}
export interface PendingRewardResult {
  saved: boolean; pending: number; earned: number; total: number; masteryXp: number; unlocks: string[];
}

const STORAGE_KEY = 'shadowlegion_campaign_v1';
const MAX_SAVE_LENGTH = 100000;
const MAX_RECEIPTS = 100;
export const MAX_PENDING_CAMPAIGN_REWARDS = 256;
const RECEIPT_ID = /^[A-Za-z0-9:_-]{1,120}$/;
const finite = (value: unknown, fallback = 0, max = 1000000): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
const validStageId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= CAMPAIGN_STAGE_COUNT;
const date = (value: unknown): string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
  ? value : '1970-01-01T00:00:00.000Z';
const emptyRecord = (): StageRecord => ({ stars: 0, clears: 0, attempts: 0, bestTimeSec: null, bestCoreRatio: 0, lastPlayedAt: '1970-01-01T00:00:00.000Z' });

function readReceipt(raw: unknown): StageReceipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const receipt = raw as Record<string, unknown>;
  if (typeof receipt.id !== 'string' || !RECEIPT_ID.test(receipt.id) || !validStageId(receipt.stageId) ||
    !OPERATIVES.some(item => item.id === receipt.operativeId) || typeof receipt.victory !== 'boolean') return null;
  return { id: receipt.id, stageId: receipt.stageId, operativeId: receipt.operativeId as OperativeId,
    victory: receipt.victory, stars: receipt.victory ? Math.max(1, Math.floor(finite(receipt.stars, 1, 3))) : 0 };
}

/** Recover only demonstrably unpaid old receipts, never infer a replay reward. */
function lacksMetaProgress(receipt: StageReceipt, legacyMeta: unknown): boolean {
  if (!receipt.victory) return false;
  const meta = legacyMeta && typeof legacyMeta === 'object' ? legacyMeta as Record<string, unknown> : {};
  if (Array.isArray(meta.rewardReceipts) && meta.rewardReceipts.includes(`stage:${receipt.id}`)) return false;
  const stages = meta.stageProgress && typeof meta.stageProgress === 'object' ? meta.stageProgress as Record<string, unknown> : {};
  const raw = stages[receipt.stageId];
  if (!raw || typeof raw !== 'object') return true;
  const progress = raw as Record<string, unknown>;
  if (Array.isArray(progress.rewardIds) && progress.rewardIds.includes(receipt.id)) return false;
  const mastery = progress.masteryStars && typeof progress.masteryStars === 'object' ? progress.masteryStars as Record<string, unknown> : {};
  return finite(progress.stars, 0, 3) < receipt.stars || finite(mastery[receipt.operativeId], 0, 3) < receipt.stars;
}

function recalculate(state: CampaignState): CampaignState {
  state.totalStars = Object.values(state.stageResults).reduce((sum, item) => sum + item.stars, 0);
  let next = 1;
  while (next < CAMPAIGN_STAGE_COUNT && (state.stageResults[next]?.stars ?? 0) > 0) next++;
  state.highestUnlockedStage = next;
  return state;
}

/** Old chapter clears become one-star route access, never fabricated three-star records. */
export function createDefaultCampaignState(legacyMeta?: unknown): CampaignState {
  const state: CampaignState = { version: 1, highestUnlockedStage: 1, stageResults: {}, totalStars: 0, recentCompletions: [], pendingRewards: [] };
  if (!legacyMeta || typeof legacyMeta !== 'object') return state;
  const source = legacyMeta as Record<string, unknown>;
  if (source.stageProgress && typeof source.stageProgress === 'object') {
    for (const [id, raw] of Object.entries(source.stageProgress as Record<string, unknown>)) {
      const stageId = Number(id);
      if (!validStageId(stageId) || !raw || typeof raw !== 'object') continue;
      const progress = raw as Record<string, unknown>;
      const stars = Math.floor(finite(progress.stars, 0, 3));
      if (stars > 0) state.stageResults[stageId] = { ...emptyRecord(), stars, clears: 1, attempts: 1, migrated: progress.migrated === true };
    }
  } else {
    const cleared = Array.isArray(source.clearedChapters)
      ? source.clearedChapters.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4) : [];
    const unlockedChapter = Math.max(1, Math.floor(finite(source.highestChapterUnlocked, 1, 5)));
    const completedChapter = Math.max(unlockedChapter - 1, ...cleared, 0);
    for (let stageId = 1; stageId <= Math.min(40, completedChapter * STAGES_PER_CHAPTER); stageId++) {
      state.stageResults[stageId] = { ...emptyRecord(), stars: 1, clears: 1, attempts: 1, migrated: true };
    }
  }
  return recalculate(state);
}

/** Decode only known fields; reconstruct unlocks from contiguous clear records. */
export function sanitizeCampaignState(value: unknown, legacyMeta?: unknown): CampaignState {
  const state = createDefaultCampaignState(legacyMeta);
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return state;
  const source = value as Record<string, unknown>;
  if (source.stageResults && typeof source.stageResults === 'object') {
    for (const [id, raw] of Object.entries(source.stageResults as Record<string, unknown>)) {
      const stageId = Number(id);
      if (!validStageId(stageId) || !raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const recovered = state.stageResults[stageId];
      const stars = Math.max(recovered?.stars ?? 0, Math.floor(finite(record.stars, 0, 3)));
      const clears = Math.max(stars > 0 ? 1 : 0, Math.floor(finite(record.clears)));
      const attempts = Math.max(clears, Math.floor(finite(record.attempts)));
      state.stageResults[stageId] = {
        stars, clears, attempts,
        bestTimeSec: typeof record.bestTimeSec === 'number' && Number.isFinite(record.bestTimeSec) && record.bestTimeSec > 0
          ? Math.min(86400, record.bestTimeSec) : null,
        bestCoreRatio: finite(record.bestCoreRatio, 0, 1), lastPlayedAt: date(record.lastPlayedAt),
        ...(record.migrated === true || recovered?.migrated ? { migrated: true } : {}),
      };
    }
  }
  if (Array.isArray(source.recentCompletions)) {
    const seen = new Set<string>();
    for (const raw of source.recentCompletions.slice(-MAX_RECEIPTS)) {
      const receipt = readReceipt(raw);
      if (!receipt || seen.has(receipt.id)) continue;
      seen.add(receipt.id);
      state.recentCompletions.push(receipt);
    }
  }
  if (Array.isArray(source.pendingRewards)) {
    const seen = new Set<string>();
    // Never truncate valid unpaid receipts when the display-history window rolls.
    // New submissions enforce the queue limit before writing anything.
    for (const raw of source.pendingRewards) {
      const receipt = readReceipt(raw);
      if (!receipt?.victory || seen.has(receipt.id)) continue;
      const route = state.stageResults[receipt.stageId];
      if (!route || route.stars < receipt.stars) continue;
      const recent = state.recentCompletions.find(item => item.id === receipt.id);
      if (recent && (recent.stageId !== receipt.stageId || recent.operativeId !== receipt.operativeId || recent.stars !== receipt.stars || !recent.victory)) continue;
      seen.add(receipt.id);
      state.pendingRewards.push(receipt);
    }
  } else if (source.pendingRewards === undefined) {
    state.pendingRewards = state.recentCompletions.filter(receipt =>
      (state.stageResults[receipt.stageId]?.stars ?? 0) >= receipt.stars && lacksMetaProgress(receipt, legacyMeta));
  }
  return recalculate(state);
}

export class CampaignProgressionManager {
  /** A fallback route view never grants permission to replace a newer save. */
  static getWriteProtection(): CampaignWriteProtection | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const version = (value as { version?: unknown }).version;
          if (typeof version === 'number' && version > 1) return 'future-save-version';
        }
      } catch { /* Keep the existing recovery path for malformed older JSON. */ }
      return null;
    } catch { return 'storage-unavailable'; }
  }

  static getState(): CampaignState {
    const meta = MetaProgressionManager.getState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw.length > MAX_SAVE_LENGTH) return createDefaultCampaignState(meta);
      return sanitizeCampaignState(JSON.parse(raw) as unknown, meta);
    } catch { return createDefaultCampaignState(meta); }
  }

  static isStageUnlocked(stageId: number, state = this.getState()): boolean {
    return validStageId(stageId) && stageId <= state.highestUnlockedStage;
  }

  static getStageRecord(stageId: number, state = this.getState()): StageRecord {
    return { ...(state.stageResults[stageId] ?? emptyRecord()) };
  }

  static getNextUnlockedStage(state = this.getState()): StageDef { return getStage(state.highestUnlockedStage); }

  /** Safe on menu entry or reload. Each reward keeps its original durable ID. */
  static reconcilePendingRewards(): PendingRewardResult {
    const state = this.getState();
    const empty = this.pendingResult(state.pendingRewards.length);
    if (this.getWriteProtection()) return empty;
    if (!state.pendingRewards.length) return { ...empty, saved: true };
    // This also persists recovered rc.2 receipts before the wallet is touched.
    if (!this.save(state)) return empty;
    return this.settlePersistedRewards(state).result;
  }

  static recordStageResult(stageId: number, result: StageCompletion): StageResultReward {
    const state = this.getState();
    const empty = (error?: StageResultReward['error']): StageResultReward => ({
      stageId, stars: 0, newStars: 0, firstClear: false, nextStageId: null,
      chapterCompleted: false, campaignCompleted: false, earned: 0,
      total: MetaProgressionManager.getState().shadowCores, masteryXp: 0, unlocks: [], duplicate: false, saved: false, routeSaved: false,
      ...(error ? { error } : {}),
    });
    const protection = this.getWriteProtection();
    if (protection) return empty(protection);
    if (!validStageId(stageId) || !result || typeof result !== 'object' ||
      typeof result.completionId !== 'string' || !RECEIPT_ID.test(result.completionId) ||
      !OPERATIVES.some(item => item.id === result.operativeId) ||
      !MetaProgressionManager.isOperativeUnlocked(result.operativeId) || typeof result.victory !== 'boolean' ||
      !Number.isFinite(result.durationSec) || result.durationSec < 0 || result.durationSec > 86400 ||
      !Number.isFinite(result.coreRatio) || result.coreRatio < 0 || result.coreRatio > 1 ||
      (result.hpRatio !== undefined && (!Number.isFinite(result.hpRatio) || result.hpRatio < 0 || result.hpRatio > 1)) ||
      (result.victory && (result.coreRatio <= 0 || result.hpRatio === 0))) return empty('invalid-result');
    if (!this.isStageUnlocked(stageId, state)) return empty('locked-stage');

    const priorReceipt = state.recentCompletions.find(receipt => receipt.id === result.completionId)
      ?? state.pendingRewards.find(receipt => receipt.id === result.completionId);
    if (priorReceipt && (priorReceipt.stageId !== stageId || priorReceipt.operativeId !== result.operativeId || priorReceipt.victory !== result.victory)) return empty('invalid-result');
    const stage = getStage(stageId);
    const previous = this.getStageRecord(stageId, state);
    const stars = priorReceipt?.stars ?? calculateStageStars(stage, result);
    const newStars = priorReceipt ? 0 : Math.max(0, stars - previous.stars);
    const firstClear = !priorReceipt && result.victory && previous.clears === 0;
    const receipt: StageReceipt = priorReceipt ?? { id: result.completionId, stageId, operativeId: result.operativeId, stars, victory: result.victory };
    const needsQueue = result.victory && !state.pendingRewards.some(item => item.id === receipt.id) &&
      (!priorReceipt || lacksMetaProgress(receipt, MetaProgressionManager.getState()));
    if (needsQueue && state.pendingRewards.length >= MAX_PENDING_CAMPAIGN_REWARDS) return empty('pending-reward-capacity');
    if (!priorReceipt) {
      state.stageResults[stageId] = {
        stars: Math.max(previous.stars, stars), clears: previous.clears + Number(result.victory), attempts: previous.attempts + 1,
        bestTimeSec: result.victory && result.durationSec > 0
          ? Math.min(previous.bestTimeSec ?? Infinity, result.durationSec) : previous.bestTimeSec,
        bestCoreRatio: result.victory ? Math.max(previous.bestCoreRatio, result.coreRatio) : previous.bestCoreRatio,
        lastPlayedAt: new Date().toISOString(),
        ...(previous.migrated ? { migrated: true } : {}),
      };
      state.recentCompletions.push(receipt);
      state.recentCompletions = state.recentCompletions.slice(-MAX_RECEIPTS);
      recalculate(state);
    }
    if (needsQueue) state.pendingRewards.push(receipt);
    const routeSaved = this.save(state);
    // Another tab may have supplied a newer route since the first read. Surface
    // the write-time protection and never issue a wallet reward for that result.
    const lateProtection = routeSaved ? null : this.getWriteProtection();
    if (lateProtection) return empty(lateProtection);
    const settlement = routeSaved ? this.settlePersistedRewards(state) : null;
    const reward = settlement?.receipts.get(receipt.id);
    const settled = settlement?.result;
    return {
      stageId, stars, newStars, firstClear,
      nextStageId: result.victory ? getNextStage(stageId)?.id ?? null : null,
      chapterCompleted: getStagesForChapter(stage.chapter).every(item => (state.stageResults[item.id]?.stars ?? 0) > 0),
      campaignCompleted: state.totalStars >= CAMPAIGN_STAGE_COUNT && Object.values(state.stageResults).filter(item => item.stars > 0).length === CAMPAIGN_STAGE_COUNT,
      earned: reward?.earned ?? 0, total: settled?.total ?? MetaProgressionManager.getState().shadowCores,
      masteryXp: reward?.masteryXp ?? 0, unlocks: settled?.unlocks ?? [],
      duplicate: Boolean(priorReceipt) && (reward?.duplicate ?? !state.pendingRewards.some(item => item.id === receipt.id)),
      saved: routeSaved && (settled?.saved ?? false), routeSaved,
    };
  }

  private static pendingResult(pending: number): PendingRewardResult {
    return { saved: false, pending, earned: 0, total: MetaProgressionManager.getState().shadowCores, masteryXp: 0, unlocks: [] };
  }

  private static settlePersistedRewards(state: CampaignState): { result: PendingRewardResult; receipts: Map<string, ProgressReward> } {
    const result = this.pendingResult(state.pendingRewards.length);
    const receipts = new Map<string, ProgressReward>();
    if (!state.pendingRewards.length) return { result: { ...result, saved: true }, receipts };
    const original = [...state.pendingRewards];
    let paid = 0;
    for (const receipt of original) {
      const reward = MetaProgressionManager.recordStageProgress({ completionId: receipt.id, stageId: receipt.stageId,
        operativeId: receipt.operativeId, stars: receipt.stars, mode: 'campaign' });
      receipts.set(receipt.id, reward);
      if (!reward.saved) break;
      paid++;
      result.earned += reward.earned;
      result.masteryXp += reward.masteryXp;
      result.total = reward.total;
      result.unlocks.push(...reward.unlocks);
    }
    if (paid > 0) {
      state.pendingRewards = original.slice(paid);
      if (!this.save(state)) state.pendingRewards = original;
    }
    result.pending = state.pendingRewards.length;
    result.saved = result.pending === 0;
    result.total = MetaProgressionManager.getState().shadowCores;
    result.unlocks = [...new Set(result.unlocks)];
    return { result, receipts };
  }

  private static save(state: CampaignState): boolean {
    try {
      if (this.getWriteProtection()) return false;
      const serialized = JSON.stringify(state);
      if (serialized.length > MAX_SAVE_LENGTH) return false;
      localStorage.setItem(STORAGE_KEY, serialized);
      return localStorage.getItem(STORAGE_KEY) === serialized;
    } catch { return false; }
  }
}
