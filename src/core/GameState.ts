import { HexGrid } from './HexGrid';
import { Unit } from './Unit';
import { Building } from './Building';
import { GAME_CONFIG } from '../config/gameConfig';

export type GamePhase = 'deploy' | 'action' | 'enemy_turn' | 'settle';

export interface Resources {
  energy: number;
  tech: number;
  intel: number;
}

export class GameState {
  grid: HexGrid;
  units: Map<string, Unit> = new Map();
  buildings: Map<string, Building> = new Map();
  turn: number = 1;
  phase: GamePhase = 'deploy';
  currentPlayer: 'player' | 'enemy' = 'player';
  playerResources: Resources;
  enemyResources: Resources;
  gameOver: boolean = false;
  winner: 'player' | 'enemy' | null = null;

  private strategyLog: string[] = [];

  constructor() {
    this.grid = new HexGrid();
    this.playerResources = {
      energy: GAME_CONFIG.RESOURCES.INITIAL_ENERGY,
      tech: GAME_CONFIG.RESOURCES.INITIAL_TECH,
      intel: GAME_CONFIG.RESOURCES.INITIAL_INTEL,
    };
    this.enemyResources = {
      energy: GAME_CONFIG.RESOURCES.INITIAL_ENERGY,
      tech: GAME_CONFIG.RESOURCES.INITIAL_TECH,
      intel: GAME_CONFIG.RESOURCES.INITIAL_INTEL,
    };
  }

  initialize(): void {
    this.grid.initialize();
    this.units.clear();
    this.buildings.clear();
    this.turn = 1;
    this.phase = 'deploy';
    this.currentPlayer = 'player';
    this.gameOver = false;
    this.winner = null;
    this.strategyLog = [];
  }

  addUnit(unit: Unit): void {
    this.units.set(unit.id, unit);
    const tile = this.grid.getTile(unit.q, unit.r);
    if (tile) tile.unitId = unit.id;
  }

  removeUnit(unitId: string): void {
    const unit = this.units.get(unitId);
    if (unit) {
      const tile = this.grid.getTile(unit.q, unit.r);
      if (tile) tile.unitId = null;
      this.units.delete(unitId);
    }
  }

  addBuilding(building: Building): void {
    this.buildings.set(building.id, building);
    const tile = this.grid.getTile(building.q, building.r);
    if (tile) tile.buildingId = building.id;
  }

  removeBuilding(buildingId: string): void {
    const building = this.buildings.get(buildingId);
    if (building) {
      const tile = this.grid.getTile(building.q, building.r);
      if (tile) tile.buildingId = null;
      this.buildings.delete(buildingId);
    }
  }

  moveUnit(unitId: string, newQ: number, newR: number): boolean {
    const unit = this.units.get(unitId);
    if (!unit || unit.hasMoved) return false;

    const targetTile = this.grid.getTile(newQ, newR);
    if (!targetTile || !targetTile.isPassable || targetTile.unitId) return false;

    const oldTile = this.grid.getTile(unit.q, unit.r);
    if (oldTile) oldTile.unitId = null;

    unit.q = newQ;
    unit.r = newR;
    targetTile.unitId = unit.id;
    unit.hasMoved = true;

    return true;
  }

  attackUnit(attackerId: string, targetId: string): { damage: number; killed: boolean } | null {
    const attacker = this.units.get(attackerId);
    const target = this.units.get(targetId);
    if (!attacker || !target || attacker.hasAttacked) return null;

    const dist = this.grid.getDistance(
      { q: attacker.q, r: attacker.r },
      { q: target.q, r: target.r }
    );
    if (dist > attacker.attackRange) return null;

    const targetTile = this.grid.getTile(target.q, target.r);
    const terrainBonus = targetTile?.defenseBonus ?? 0;

    const damage = attacker.calculateDamage(target, terrainBonus);
    const killed = target.takeDamage(damage);

    attacker.hasAttacked = true;
    this.logStrategy(attacker.owner, 'attack');

    if (killed) {
      this.removeUnit(target.id);
      const resources = attacker.owner === 'player' ? this.playerResources : this.enemyResources;
      resources.tech += 1;
    }

    return { damage, killed };
  }

  nextPhase(): void {
    switch (this.phase) {
      case 'deploy':
        this.phase = 'action';
        break;
      case 'action':
        this.phase = 'enemy_turn';
        this.currentPlayer = 'enemy';
        break;
      case 'enemy_turn':
        this.phase = 'settle';
        break;
      case 'settle':
        this.settleTurn();
        this.turn++;
        this.phase = 'deploy';
        this.currentPlayer = 'player';
        this.resetAllUnits('player');
        this.resetAllUnits('enemy');
        this.replenishResources();
        break;
    }

    this.checkWinCondition();
  }

  private settleTurn(): void {
    for (const building of this.buildings.values()) {
      if (building.type !== 'TOWER') continue;

      const range = GAME_CONFIG.BUILDINGS.TOWER.range;
      const targets = this.getUnitsInRange(building.q, building.r, range)
        .filter(u => u.owner !== building.owner);

      if (targets.length > 0) {
        const target = targets[0];
        const damage = Math.max(1, 2);
        const killed = target.takeDamage(damage);
        if (killed) this.removeUnit(target.id);
      }
    }
  }

  private replenishResources(): void {
    const resourceTiles = this.grid.getAllTiles().filter(t => t.terrain === 'RESOURCE');

    let playerBonus = 0;
    let enemyBonus = 0;
    for (const tile of resourceTiles) {
      if (tile.owner === 'player') playerBonus++;
      else if (tile.owner === 'enemy') enemyBonus++;
    }

    this.playerResources.energy += GAME_CONFIG.RESOURCES.ENERGY_PER_TURN + playerBonus;
    this.enemyResources.energy += GAME_CONFIG.RESOURCES.ENERGY_PER_TURN + enemyBonus;
  }

  private resetAllUnits(owner: 'player' | 'enemy'): void {
    for (const unit of this.units.values()) {
      if (unit.owner === owner) unit.resetTurn();
    }
  }

  private checkWinCondition(): void {
    const playerUnits = [...this.units.values()].filter(u => u.owner === 'player');
    const enemyUnits = [...this.units.values()].filter(u => u.owner === 'enemy');

    if (playerUnits.length === 0 && this.turn > 1) {
      this.gameOver = true;
      this.winner = 'enemy';
    } else if (enemyUnits.length === 0 && this.turn > 1) {
      this.gameOver = true;
      this.winner = 'player';
    } else if (this.turn > 20) {
      this.gameOver = true;
      this.winner = playerUnits.length >= enemyUnits.length ? 'player' : 'enemy';
    }
  }

  getUnitsInRange(q: number, r: number, range: number): Unit[] {
    const coords = this.grid.getRange({ q, r }, range);
    const result: Unit[] = [];
    for (const coord of coords) {
      const tile = this.grid.getTile(coord.q, coord.r);
      if (tile?.unitId) {
        const unit = this.units.get(tile.unitId);
        if (unit) result.push(unit);
      }
    }
    return result;
  }

  getPlayerUnits(): Unit[] {
    return [...this.units.values()].filter(u => u.owner === 'player');
  }

  getEnemyUnits(): Unit[] {
    return [...this.units.values()].filter(u => u.owner === 'enemy');
  }

  private logStrategy(owner: 'player' | 'enemy', action: string): void {
    this.strategyLog.push(`${this.turn}:${owner}:${action}`);
  }

  getStrategyDiversity(owner: 'player' | 'enemy'): number {
    const ownerLogs = this.strategyLog.filter(l => l.includes(owner));
    const actions = ownerLogs.map(l => l.split(':')[2]);
    const unique = new Set(actions);
    return actions.length > 0 ? unique.size / actions.length : 0;
  }
}
