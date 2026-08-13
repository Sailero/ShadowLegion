import { BaseStrategy, AIAction } from './BaseStrategy';
import { GameState } from '../../core/GameState';
import { UnitType } from '../../config/gameConfig';

export class AggressiveStrategy extends BaseStrategy {
  readonly name = '进攻策略';
  readonly description = '优先部署进攻单位，积极寻找并攻击敌方';

  evaluate(state: GameState): number {
    const enemies = this.getPlayerUnits(state);
    const allies = this.getEnemyUnits(state);

    if (allies.length === 0) return 0;
    if (enemies.length === 0) return 10;

    const attackPower = allies.reduce((sum, u) => sum + u.attack, 0);
    const enemyHp = enemies.reduce((sum, u) => sum + u.hp, 0);

    return attackPower / Math.max(1, enemyHp) * 5;
  }

  generateActions(state: GameState): AIAction[] {
    const actions: AIAction[] = [];
    const enemies = this.getEnemyUnits(state);
    const playerUnits = this.getPlayerUnits(state);

    if (playerUnits.length === 0) return actions;

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
      } else if (!unit.hasMoved) {
        const movePos = this.findBestMoveToward(unit, nearest, state);
        if (movePos) {
          actions.push({ type: 'move', unitId: unit.id, position: movePos });
        }
      }
    }

    if (state.enemyResources.energy >= 3) {
      const deployTypes: UnitType[] = ['STRIKER', 'STRIKER', 'SCOUT'];
      const chosen = deployTypes[Math.floor(Math.random() * deployTypes.length)];
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
