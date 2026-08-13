import { GameState } from '../core/GameState';
import { Unit } from '../core/Unit';
import { BaseStrategy, AIAction } from './strategies/BaseStrategy';
import { AggressiveStrategy } from './strategies/AggressiveStrategy';
import { DefensiveStrategy } from './strategies/DefensiveStrategy';
import { BalancedStrategy } from './strategies/BalancedStrategy';
import { DifficultyManager } from './DifficultyManager';
import { UnitType, GAME_CONFIG } from '../config/gameConfig';

export class AIController {
  private strategies: BaseStrategy[];
  private currentStrategy: BaseStrategy;
  private difficultyManager: DifficultyManager;
  private actionQueue: AIAction[] = [];

  constructor(difficulty: number = 0.5) {
    this.strategies = [
      new AggressiveStrategy(),
      new DefensiveStrategy(),
      new BalancedStrategy(),
    ];
    this.currentStrategy = this.strategies[2];
    this.difficultyManager = new DifficultyManager(difficulty);
  }

  selectStrategy(state: GameState): void {
    let bestScore = -Infinity;
    let bestStrategy = this.strategies[0];

    for (const strategy of this.strategies) {
      const score = strategy.evaluate(state);
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    if (Math.random() < this.difficultyManager.explorationRate) {
      this.currentStrategy = this.strategies[Math.floor(Math.random() * this.strategies.length)];
    } else {
      this.currentStrategy = bestStrategy;
    }
  }

  planTurn(state: GameState): AIAction[] {
    this.selectStrategy(state);
    const actions = this.currentStrategy.generateActions(state);
    this.actionQueue = this.difficultyManager.filterActions(actions);
    return this.actionQueue;
  }

  async executeTurn(state: GameState, onAction?: (action: AIAction) => Promise<void>): Promise<void> {
    const actions = this.planTurn(state);

    for (const action of actions) {
      await this.executeAction(action, state);
      if (onAction) await onAction(action);
    }
  }

  private async executeAction(action: AIAction, state: GameState): Promise<void> {
    switch (action.type) {
      case 'move':
        if (action.unitId && action.position) {
          state.moveUnit(action.unitId, action.position.q, action.position.r);
        }
        break;

      case 'attack':
        if (action.unitId && action.targetId) {
          state.attackUnit(action.unitId, action.targetId);
        }
        break;

      case 'deploy':
        if (action.position && action.unitType) {
          const cost = GAME_CONFIG.UNITS[action.unitType as UnitType].cost;
          if (state.enemyResources.energy >= cost) {
            const unit = new Unit(action.unitType as UnitType, 'enemy', action.position.q, action.position.r);
            state.addUnit(unit);
            state.enemyResources.energy -= cost;
          }
        }
        break;
    }
  }

  get strategyName(): string {
    return this.currentStrategy.name;
  }
}
