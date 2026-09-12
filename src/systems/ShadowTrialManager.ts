import { getShadowTrial } from '../data/modes';

const KEY = 'sunlit_shadow_trials_v1';
export interface ShadowTrialRecord { tier: number; wins: number; bestTimeSec: number; }
export interface ShadowTrialResult { tier: number; firstClear: boolean; bestTimeSec: number; newBest: boolean; }
export class ShadowTrialManager {
  static getRecords(): ShadowTrialRecord[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw || raw.length > 8192) return [];
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values)) return [];
      return [1, 2, 3, 4, 5].flatMap(tier => {
        const record = values.find(item => item?.tier === tier);
        return record && Number.isInteger(record.wins) && record.wins > 0 && Number.isFinite(record.bestTimeSec) && record.bestTimeSec > 0
          ? [{ tier, wins: Math.min(1000000, record.wins), bestTimeSec: Math.min(86400, record.bestTimeSec) }] : [];
      });
    } catch { return []; }
  }
  static recordVictory(tier: number, durationSec: number): ShadowTrialResult | null {
    if (!Number.isInteger(tier) || tier < 1 || tier > 5 || !Number.isFinite(durationSec) || durationSec <= 0) return null;
    const records = this.getRecords();
    const previous = records.find(item => item.tier === tier);
    const bestTimeSec = Math.min(previous?.bestTimeSec ?? Infinity, durationSec);
    const result = { tier: getShadowTrial(tier).tier, firstClear: !previous, bestTimeSec, newBest: !previous || durationSec < previous.bestTimeSec };
    const next = { tier, wins: (previous?.wins ?? 0) + 1, bestTimeSec };
    try { localStorage.setItem(KEY, JSON.stringify([...records.filter(item => item.tier !== tier), next])); } catch { /* This session remains playable. */ }
    return result;
  }
}
