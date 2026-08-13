import { GameState, GamePhase } from './GameState';

export type TurnCallback = (phase: GamePhase, turn: number) => void;

export class TurnManager {
  private state: GameState;
  private onPhaseChange?: TurnCallback;

  constructor(state: GameState, onPhaseChange?: TurnCallback) {
    this.state = state;
    this.onPhaseChange = onPhaseChange;
  }

  advancePhase(): void {
    this.state.nextPhase();
    this.onPhaseChange?.(this.state.phase, this.state.turn);
  }

  get currentPhase(): GamePhase {
    return this.state.phase;
  }

  get currentTurn(): number {
    return this.state.turn;
  }

  get isPlayerTurn(): boolean {
    return this.state.currentPlayer === 'player';
  }

  get isGameOver(): boolean {
    return this.state.gameOver;
  }
}
