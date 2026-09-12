import { OPERATIVES, type OperativeId } from '../data/operatives';
import {
  CAMPAIGN_STAGE_COUNT, STAGES_PER_CHAPTER, calculateStageStars, getNextStage,
  getStage, getStagesForChapter, type StageDef, type StageMetrics,
} from '../data/stages';
import { MetaProgressionManager } from './MetaProgressionManager';

export interface StageRecord {
  stars: number;
  clears: number;
  attempts: number;
  bestTimeSec: number | null;
  bestCoreRatio: number;
  lastPlayedAt: string;
  migrated?: boolean;
}
interface StageReceipt {
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
}
export interface StageCompletion extends StageMetrics {
  completionId: string;
  operativeId: OperativeId;
}
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
  error?: 'invalid-result' | 'locked-stage';
}

const STORAGE_KEY = 'shadowlegion_campaign_v1';
const MAX_SAVE_LENGTH = 100000;
const MAX_RECEIPTS = 100;
const RECEIPT_ID = /^[A-Za-z0-9:_-]{1,120}$/;
const finite = (value: unknown, fallback = 0, max = 1000000): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
const validStageId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= CAMPAIGN_STAGE_COUNT;
const date = (value: unknown): string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
  ? value : '1970-01-01T00:00:00.000Z';
const emptyRecord = (): StageRecord => ({ stars: 0, clears: 0, attempts: 0, bestTimeSec: null, bestCoreRatio: 0, lastPlayedAt: '1970-01-01T00:00:00.000Z' });

function recalculate(state: CampaignState): CampaignState {
  state.totalStars = Object.values(state.stageResults).reduce((sum, item) => sum + item.stars, 0);
  let next = 1;
  while (next < CAMPAIGN_STAGE_COUNT && (state.stageResults[next]?.stars ?? 0) > 0) next++;
  state.highestUnlockedStage = next;
  return state;
}

/** Old chapter clears become one-star route access, never fabricated three-star records. */
export function createDefaultCampaignState(legacyMeta?: unknown): CampaignState {
  const state: CampaignState = { version: 1, highestUnlockedStage: 1, stageResults: {}, totalStars: 0, recentCompletions: [] };
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
      if (!raw || typeof raw !== 'object') continue;
      const receipt = raw as Record<string, unknown>;
      if (typeof receipt.id !== 'string' || !RECEIPT_ID.test(receipt.id) || seen.has(receipt.id)) continue;
      if (!validStageId(receipt.stageId) || !OPERATIVES.some(item => item.id === receipt.operativeId) || typeof receipt.victory !== 'boolean') continue;
      seen.add(receipt.id);
      state.recentCompletions.push({
        id: receipt.id, stageId: receipt.stageId, operativeId: receipt.operativeId as OperativeId,
        victory: receipt.victory, stars: receipt.victory ? Math.max(1, Math.floor(finite(receipt.stars, 1, 3))) : 0,
      });
    }
  }
  return recalculate(state);
}

export class CampaignProgressionManager {
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

  static recordStageResult(stageId: number, result: StageCompletion): StageResultReward {
    const state = this.getState();
    const empty = (error?: StageResultReward['error']): StageResultReward => ({
      stageId, stars: 0, newStars: 0, firstClear: false, nextStageId: null,
      chapterCompleted: false, campaignCompleted: false, earned: 0,
      total: MetaProgressionManager.getState().shadowCores, masteryXp: 0, unlocks: [], duplicate: false, saved: false,
      ...(error ? { error } : {}),
    });
    if (!validStageId(stageId) || !result || typeof result !== 'object' ||
      typeof result.completionId !== 'string' || !RECEIPT_ID.test(result.completionId) ||
      !OPERATIVES.some(item => item.id === result.operativeId) ||
      !MetaProgressionManager.isOperativeUnlocked(result.operativeId) || typeof result.victory !== 'boolean' ||
      !Number.isFinite(result.durationSec) || result.durationSec < 0 || result.durationSec > 86400 ||
      !Number.isFinite(result.coreRatio) || result.coreRatio < 0 || result.coreRatio > 1 ||
      (result.hpRatio !== undefined && (!Number.isFinite(result.hpRatio) || result.hpRatio < 0 || result.hpRatio > 1)) ||
      (result.victory && (result.coreRatio <= 0 || result.hpRatio === 0))) return empty('invalid-result');
    if (!this.isStageUnlocked(stageId, state)) return empty('locked-stage');

    const priorReceipt = state.recentCompletions.find(receipt => receipt.id === result.completionId);
    if (priorReceipt && (priorReceipt.stageId !== stageId || priorReceipt.operativeId !== result.operativeId || priorReceipt.victory !== result.victory)) return empty('invalid-result');
    const stage = getStage(stageId);
    const previous = this.getStageRecord(stageId, state);
    const stars = priorReceipt?.stars ?? calculateStageStars(stage, result);
    const newStars = priorReceipt ? 0 : Math.max(0, stars - previous.stars);
    const firstClear = !priorReceipt && result.victory && previous.clears === 0;
    if (!priorReceipt) {
      state.stageResults[stageId] = {
        stars: Math.max(previous.stars, stars), clears: previous.clears + Number(result.victory), attempts: previous.attempts + 1,
        bestTimeSec: result.victory && result.durationSec > 0
          ? Math.min(previous.bestTimeSec ?? Infinity, result.durationSec) : previous.bestTimeSec,
        bestCoreRatio: result.victory ? Math.max(previous.bestCoreRatio, result.coreRatio) : previous.bestCoreRatio,
        lastPlayedAt: new Date().toISOString(),
        ...(previous.migrated ? { migrated: true } : {}),
      };
      state.recentCompletions.push({ id: result.completionId, stageId, operativeId: result.operativeId, stars, victory: result.victory });
      state.recentCompletions = state.recentCompletions.slice(-MAX_RECEIPTS);
      recalculate(state);
    }
    const routeSaved = this.save(state);
    // Meta is the only wallet writer. Retrying the same receipt may repair a
    // previous failed wallet write without counting another clear or granting twice.
    // A wallet receipt must never outlive an unwritten route receipt. This keeps
    // a later retry from counting the same clear twice after a partial failure.
    const reward = result.victory && routeSaved ? MetaProgressionManager.recordStageProgress({
      completionId: result.completionId, stageId, operativeId: result.operativeId, stars, mode: 'campaign',
    }) : { earned: 0, total: MetaProgressionManager.getState().shadowCores, masteryXp: 0, unlocks: [], duplicate: Boolean(priorReceipt), saved: true };
    return {
      stageId, stars, newStars, firstClear,
      nextStageId: result.victory ? getNextStage(stageId)?.id ?? null : null,
      chapterCompleted: getStagesForChapter(stage.chapter).every(item => (state.stageResults[item.id]?.stars ?? 0) > 0),
      campaignCompleted: state.totalStars >= CAMPAIGN_STAGE_COUNT && Object.values(state.stageResults).filter(item => item.stars > 0).length === CAMPAIGN_STAGE_COUNT,
      earned: reward.earned, total: reward.total, masteryXp: reward.masteryXp, unlocks: reward.unlocks,
      duplicate: Boolean(priorReceipt) && reward.duplicate, saved: routeSaved && reward.saved,
    };
  }

  private static save(state: CampaignState): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch { return false; }
  }
}
