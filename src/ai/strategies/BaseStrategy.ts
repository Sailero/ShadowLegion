import { GameState } from '../../core/GameState';
import { Unit } from '../../core/Unit';
import { HexGrid } from '../../core/HexGrid';

export interface AIAction {
  type: 'move' | 'attack' | 'deploy' | 'build' | 'skip';
  unitId?: string;
  targetId?: string;
  position?: { q: number; r: number };
  unitType?: string;
}

export abstract class BaseStrategy {
  abstract readonly name: string;
  abstract readonly description: string;

  abstract evaluate(state: GameState): number;
  abstract generateActions(state: GameState): AIAction[];

  protected getEnemyUnits(state: GameState): Unit[] {
    return state.getEnemyUnits();
  }

  protected getPlayerUnits(state: GameState): Unit[] {
    return state.getPlayerUnits();
  }

  protected findNearestEnemy(unit: Unit, targets: Unit[], grid: HexGrid): Unit | null {
    let nearest: Unit | null = null;
    let minDist = Infinity;

    for (const target of targets) {
      const dist = grid.getDistance(
        { q: unit.q, r: unit.r },
        { q: target.q, r: target.r }
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = target;
      }
    }

    return nearest;
  }

  protected findBestMoveToward(
    unit: Unit,
    target: { q: number; r: number },
    state: GameState
  ): { q: number; r: number } | null {
    const blocked = new Set<string>();
    for (const u of state.units.values()) {
      if (u.id !== unit.id) blocked.add(HexGrid.coordKey(u.q, u.r));
    }

    const reachable = state.grid.getReachable(
      { q: unit.q, r: unit.r },
      unit.moveRange,
      blocked
    );

    let bestPos: { q: number; r: number } | null = null;
    let bestDist = Infinity;

    for (const pos of reachable) {
      if (pos.q === unit.q && pos.r === unit.r) continue;
      const key = HexGrid.coordKey(pos.q, pos.r);
      if (blocked.has(key)) continue;

      const dist = state.grid.getDistance(pos, target);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = pos;
      }
    }

    return bestPos;
  }
}
