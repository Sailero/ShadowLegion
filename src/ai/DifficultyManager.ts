import { AIAction } from './strategies/BaseStrategy';

export class DifficultyManager {
  private _difficulty: number;
  private playerWinRate: number = 0.5;
  private matchHistory: boolean[] = [];

  constructor(difficulty: number = 0.5) {
    this._difficulty = Math.max(0, Math.min(1, difficulty));
  }

  get difficulty(): number {
    return this._difficulty;
  }

  get explorationRate(): number {
    return Math.max(0.05, 0.4 * (1 - this._difficulty));
  }

  filterActions(actions: AIAction[]): AIAction[] {
    if (this._difficulty >= 0.9) return actions;

    return actions.filter(() => Math.random() < this._difficulty + 0.3);
  }

  recordMatchResult(playerWon: boolean): void {
    this.matchHistory.push(playerWon);
    if (this.matchHistory.length > 10) {
      this.matchHistory.shift();
    }
    this.playerWinRate = this.matchHistory.filter(w => w).length / this.matchHistory.length;
    this.adjustDifficulty();
  }

  private adjustDifficulty(): void {
    const targetWinRate = 0.5;
    const adjustment = (this.playerWinRate - targetWinRate) * 0.1;
    this._difficulty = Math.max(0.1, Math.min(0.95, this._difficulty + adjustment));
  }

  getDifficultyLabel(): string {
    if (this._difficulty < 0.3) return '简单';
    if (this._difficulty < 0.6) return '普通';
    if (this._difficulty < 0.8) return '困难';
    return '大师';
  }
}
