import { TerrainType } from '../config/gameConfig';

export class HexTile {
  readonly q: number;
  readonly r: number;
  terrain: TerrainType;
  unitId: string | null = null;
  buildingId: string | null = null;
  isRevealed: boolean = true;
  owner: 'player' | 'enemy' | null = null;

  constructor(q: number, r: number, terrain: TerrainType) {
    this.q = q;
    this.r = r;
    this.terrain = terrain;
  }

  get isPassable(): boolean {
    return this.terrain !== 'WATER';
  }

  get defenseBonus(): number {
    switch (this.terrain) {
      case 'HIGHLAND': return 0.3;
      case 'FOREST': return 0.15;
      default: return 0;
    }
  }

  get moveCostExtra(): number {
    switch (this.terrain) {
      case 'FOREST': return 1;
      case 'HIGHLAND': return 1;
      default: return 0;
    }
  }

  get isOccupied(): boolean {
    return this.unitId !== null || this.buildingId !== null;
  }
}
