export interface ScoreEntry {
  score: number;
  kills: number;
  level: number;
  wave: number;
  date: string;
  endless: boolean;
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

    const scores = this.getScores();
    scores.push(saved);
    scores.sort((a, b) => b.score - a.score);

    const trimmed = scores.slice(0, this.MAX_ENTRIES);
    localStorage.setItem(this.KEY, JSON.stringify(trimmed));

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
    localStorage.removeItem(this.KEY);
  }

  static formatScore(n: number): string {
    return n.toLocaleString('en-US');
  }

  private static isScoreEntry(value: unknown): value is ScoreEntry {
    if (typeof value !== 'object' || value === null) return false;

    const entry = value as Record<string, unknown>;
    return (
      typeof entry.score === 'number' &&
      typeof entry.kills === 'number' &&
      typeof entry.level === 'number' &&
      typeof entry.wave === 'number' &&
      typeof entry.date === 'string' &&
      typeof entry.endless === 'boolean'
    );
  }
}
