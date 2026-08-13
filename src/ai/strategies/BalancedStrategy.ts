import { BaseStrategy, AIAction } from './BaseStrategy';
import { GameState } from '../../core/GameState';
import { UnitType } from '../../config/gameConfig';

export class BalancedStrategy extends BaseStrategy {
  readonly name = '均衡策略';
  readonly description = '根据局势灵活调整进攻和防守的比重';

  evaluate(state: GameState): number {
    const enemies = this.getPlayerUnits(state);
    const allies = this.getEnemyUnits(state);

    if (allies.length === 0) return 0;

    const allyPower = allies.reduce((sum, u) => sum + u.attack + u.defense, 0);
    const enemyPower = enemies.reduce((sum, u) => sum + u.attack + u.defense, 0);

    const balance = Math.abs(allyPower - enemyPower);
    return Math.max(1, 5 - balance);
  }

  generateActions(state: GameState): AIAction[] {
    const actions: AIAction[] = [];
    const enemies = this.getEnemyUnits(state);
    const playerUnits = this.getPlayerUnits(state);

    for (const unit of enemies) {
      if (unit.hasAttacked && unit.hasMoved) continue;

      const nearest = this.findNearestEnemy(unit, playerUnits, state.grid);
      if (!nearest) continue;

      const dist = state.grid.getDistance(
        { q: unit.q, r: unit.r },
        { q: nearest.q, r: nearest.r }
      );

      if (dist <= unit.attackRange && !unit.hasAttacked) {
        actions.push({ type: 'attack', unitId: unit.id, targetId: nearest.id });
      } else if (!unit.hasMoved && dist <= unit.moveRange + unit.attackRange) {
        const movePos = this.findBestMoveToward(unit, nearest, state);
        if (movePos) {
          actions.push({ type: 'move', unitId: unit.id, position: movePos });
        }
      }
    }

    if (state.enemyResources.energy >= 3) {
      const allTypes: UnitType[] = ['STRIKER', 'GUARDIAN', 'SNIPER', 'SCOUT', 'ENGINEER'];
      const chosen = allTypes[Math.floor(Math.random() * allTypes.length)];
      const spawnTiles = state.grid.getAllTiles()
        .filter(t => t.r >= 7 && t.isPassable && !t.unitId && !t.buildingId);

      if (spawnTiles.length > 0) {
        const tile = spawnTiles[Math.floor(Math.random() * spawnTiles.length)];
        actions.push({
          type: 'deploy',
          position: { q: tile.q, r: tile.r },
          unitType: chosen,
        });
      }
    }

    return actions;
  }
}
