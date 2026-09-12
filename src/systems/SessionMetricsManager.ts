import type { OperativeId } from '../data/operatives';

export interface WaveSample {
  chapter: number;
  wave: number;
  activeMs: number;
  operativeId: OperativeId;
  shadowTrial: boolean;
  coreRatio: number;
  recordedAt: string;
}
export interface ChapterTimingSummary { chapter: number; count: number; medianMs: number; p90Ms: number }
const KEY = 'sunlit_echoes_wave_metrics_v1';
const MAX_SAMPLES = 120;
const OPERATIVES = ['ranger', 'gunner', 'warden', 'engineer'];

function clean(value: unknown): WaveSample | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (typeof s.chapter !== 'number' || !Number.isInteger(s.chapter) || s.chapter < 1 || s.chapter > 10000) return null;
  if (typeof s.wave !== 'number' || !Number.isInteger(s.wave) || s.wave < 1 || s.wave > 5) return null;
  if (typeof s.activeMs !== 'number' || !Number.isFinite(s.activeMs) || s.activeMs <= 0 || s.activeMs > 86400000) return null;
  if (typeof s.coreRatio !== 'number' || !Number.isFinite(s.coreRatio) || s.coreRatio < 0 || s.coreRatio > 1) return null;
  if (!OPERATIVES.includes(s.operativeId as string) || typeof s.shadowTrial !== 'boolean') return null;
  if (typeof s.recordedAt !== 'string' || !Number.isFinite(Date.parse(s.recordedAt))) return null;
  return {
    chapter: s.chapter, wave: s.wave, activeMs: Math.max(1, Math.round(s.activeMs)),
    operativeId: s.operativeId as OperativeId, shadowTrial: s.shadowTrial,
    coreRatio: s.coreRatio, recordedAt: s.recordedAt,
  };
}

/** Local observation only: no network, no inferred population statistics. */
export class SessionMetricsManager {
  static getSamples(): WaveSample[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw || raw.length > 150000) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(clean).filter((sample): sample is WaveSample => sample !== null).slice(-MAX_SAMPLES);
    } catch { return []; }
  }

  static record(sample: Omit<WaveSample, 'recordedAt'>): boolean {
    const valid = clean({ ...sample, recordedAt: new Date().toISOString() });
    if (!valid) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.getSamples(), valid].slice(-MAX_SAMPLES)));
      return true;
    } catch { return false; }
  }

  /** Completed-wave durations, not chapter totals or measured full-run length. */
  static summary(): ChapterTimingSummary[] {
    const byChapter = new Map<number, number[]>();
    for (const sample of this.getSamples()) {
      const chapter = sample.chapter;
      const values = byChapter.get(chapter) ?? [];
      values.push(sample.activeMs);
      byChapter.set(chapter, values);
    }
    return [...byChapter.entries()].sort(([a], [b]) => a - b).map(([chapter, values]) => {
      values.sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      const medianMs = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      const p90Ms = values[Math.max(0, Math.ceil(values.length * 0.9) - 1)];
      return { chapter, count: values.length, medianMs: Math.round(medianMs), p90Ms };
    });
  }

  static clear(): boolean {
    try { localStorage.removeItem(KEY); return true; } catch { return false; }
  }
}
