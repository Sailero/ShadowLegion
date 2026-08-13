import { BaseStrategy, AIAction } from './BaseStrategy';
import { GameState } from '../../core/GameState';
import { UnitType } from '../../config/gameConfig';

export class DefensiveStrategy extends BaseStrategy {
  readonly name = '防守策略';
  readonly description = '优先部署防御单位，建造防御建筑，保持阵地';

  evaluate(state: GameState): number {
    const enemies = this.getPlayerUnits(state);
    const allies = this.getEnemyUnits(state);

    if (allies.length === 0) return 0;

    const defensePower = allies.reduce((sum, u) => sum + u.defense, 0);
    const enemyAttack = enemies.reduce((sum, u) => sum + u.attack, 0);

    const ratio = defensePower / Math.max(1, enemyAttack);
    return ratio < 1 ? 8 : ratio * 3;
  }

  generateActions(state: GameState): AIAction[] {
    const actions: AIAction[] = [];
    const enemies = this.getEnemyUnits(state);
    const playerUnits = this.getPlayerUnits(state);

    for (const unit of enemies) {
      if (unit.hasAttacked && unit.hasMoved) continue;

      const nearbyThreats = playerUnits.filter(pu => {
        const dist = state.grid.getDistance(
          { q: unit.q, r: unit.r },
          { q: pu.q, r: pu.r }
        );
        return dist <= unit.attackRange;
      });

      if (nearbyThreats.length > 0 && !unit.hasAttacked) {
        const target = nearbyThreats.reduce((best, t) =>
          t.hp < best.hp ? t : best
        );
        actions.push({ type: 'attack', unitId: unit.id, targetId: target.id });
      }
    }

    if (state.enemyResources.energy >= 4) {
      const deployTypes: UnitType[] = ['GUARDIAN', 'GUARDIAN', 'SNIPER'];
      const chosen = deployTypes[Math.floor(Math.random() * deployTypes.length)];
      const spawnTiles = state.grid.getAllTiles()
        .filter(t => t.r >= 8 && t.isPassable && !t.unitId && !t.buildingId);

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
