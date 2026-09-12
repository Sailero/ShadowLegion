import type { BuildPath } from '../data/upgrades';

export interface ScoreEntry {
  score: number;
  kills: number;
  level: number;
  wave: number;
  date: string;
  endless: boolean;
  durationSec?: number;
  build?: BuildPath | null;
}

export class ScoreManager {
  private static readonly KEY = 'shadowlegion_scores';
  private static readonly MAX_ENTRIES = 10;

  static getScores(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return [];

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const entries = parsed.filter((item): item is ScoreEntry => this.isScoreEntry(item));
      return entries.sort((a, b) => b.score - a.score);
    } catch {
      return [];
    }
  }

  static saveScore(entry: Omit<ScoreEntry, 'date'>): ScoreEntry {
    const saved: ScoreEntry = {
      ...entry,
      date: new Date().toISOString(),
    };

    try {
      const scores = this.getScores();
      scores.push(saved);
      scores.sort((a, b) => b.score - a.score);
      const trimmed = scores.slice(0, this.MAX_ENTRIES);
      localStorage.setItem(this.KEY, JSON.stringify(trimmed));
    } catch { /* storage full or disabled */ }

    return saved;
  }

  static getHighScore(): number {
    const scores = this.getScores();
    return scores.length > 0 ? scores[0].score : 0;
  }

  static isNewHighScore(score: number): boolean {
    return score > this.getHighScore();
  }

  static clearScores(): void {
    try { localStorage.removeItem(this.KEY); } catch { /* noop */ }
  }

  static formatScore(n: number): string {
    return n.toLocaleString('en-US');
  }

  private static isScoreEntry(value: unknown): value is ScoreEntry {
    if (typeof value !== 'object' || value === null) return false;

    const entry = value as Record<string, unknown>;
    return (
      typeof entry.score === 'number' && Number.isFinite(entry.score) && entry.score >= 0 &&
      typeof entry.kills === 'number' && Number.isFinite(entry.kills) && entry.kills >= 0 &&
      typeof entry.level === 'number' && Number.isFinite(entry.level) && entry.level >= 1 &&
      typeof entry.wave === 'number' && Number.isFinite(entry.wave) && entry.wave >= 0 &&
      typeof entry.date === 'string' &&
      typeof entry.endless === 'boolean' &&
      (entry.durationSec === undefined || (typeof entry.durationSec === 'number' && Number.isFinite(entry.durationSec) && entry.durationSec >= 0)) &&
      (entry.build === undefined || entry.build === null || ['nova', 'storm', 'rift', 'engineer'].includes(entry.build as string))
    );
  }
}
