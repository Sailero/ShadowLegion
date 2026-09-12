import { getShadowTrial } from '../data/modes';

const KEY = 'sunlit_shadow_trials_v1';
const MAX_RECORD_BYTES = 8192;
const validCompletionId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
const recentCompletionIds = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter(validCompletionId).reverse())].slice(0, 8).reverse() : [];
export interface ShadowTrialRecord { tier: number; wins: number; bestTimeSec: number; completionIds?: string[]; }
export interface ShadowTrialResult { tier: number; firstClear: boolean; bestTimeSec: number; newBest: boolean; saved: boolean; }
export class ShadowTrialManager {
  static getRecords(): ShadowTrialRecord[] {
    return this.readRecords() ?? [];
  }
  /** Null distinguishes an unavailable/damaged record from a genuinely fresh save. */
  private static readRecords(): ShadowTrialRecord[] | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) return [];
      if (!raw || raw.length > MAX_RECORD_BYTES) return null;
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values)) return null;
      return [1, 2, 3, 4, 5].flatMap(tier => {
        const record = values.find(item => item?.tier === tier);
        const completionIds = recentCompletionIds(record?.completionIds);
        return record && Number.isInteger(record.wins) && record.wins > 0 && Number.isFinite(record.bestTimeSec) && record.bestTimeSec > 0
          ? [{ tier, wins: Math.min(1000000, record.wins), bestTimeSec: Math.min(86400, record.bestTimeSec),
            ...(completionIds.length ? { completionIds } : {}) }] : [];
      });
    } catch { return null; }
  }
  static recordVictory(tier: number, durationSec: number, completionId?: string): ShadowTrialResult | null {
    if (!Number.isInteger(tier) || tier < 1 || tier > 5 || !Number.isFinite(durationSec) || durationSec <= 0 ||
      (completionId !== undefined && !validCompletionId(completionId))) return null;
    const records = this.readRecords();
    if (!records) return { tier, firstClear: false, bestTimeSec: 0, newBest: false, saved: false };
    const previous = records.find(item => item.tier === tier);
    // A previous write may have committed even when its verification read failed.
    // Its durable ID confirms this retry without counting another victory or time.
    if (completionId && previous?.completionIds?.includes(completionId)) {
      return { tier, firstClear: false, bestTimeSec: previous.bestTimeSec, newBest: false, saved: true };
    }
    const bestTimeSec = Math.min(previous?.bestTimeSec ?? Infinity, durationSec, 86400);
    const completionIds = completionId ? [...(previous?.completionIds ?? []), completionId].slice(-8) : previous?.completionIds ?? [];
    const next = { tier, wins: Math.min(1000000, (previous?.wins ?? 0) + 1), bestTimeSec,
      ...(completionIds.length ? { completionIds } : {}) };
    const serialized = JSON.stringify([...records.filter(item => item.tier !== tier), next]);
    let saved = false;
    try {
      if (serialized.length <= MAX_RECORD_BYTES) {
        localStorage.setItem(KEY, serialized);
        saved = localStorage.getItem(KEY) === serialized;
      }
    } catch { /* The independent wallet result is not affected by this record. */ }
    return {
      tier: getShadowTrial(tier).tier,
      firstClear: saved && !previous,
      bestTimeSec: saved ? bestTimeSec : previous?.bestTimeSec ?? 0,
      newBest: saved && (!previous || bestTimeSec < previous.bestTimeSec),
      saved,
    };
  }
}
