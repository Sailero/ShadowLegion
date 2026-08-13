import { GAME_CONFIG, BuildingType } from '../config/gameConfig';

let buildingIdCounter = 0;

export class Building {
  readonly id: string;
  readonly type: BuildingType;
  readonly owner: 'player' | 'enemy';
  readonly q: number;
  readonly r: number;
  hp: number;
  maxHp: number;

  constructor(type: BuildingType, owner: 'player' | 'enemy', q: number, r: number) {
    this.id = `bld_${buildingIdCounter++}`;
    this.type = type;
    this.owner = owner;
    this.q = q;
    this.r = r;

    const stats = GAME_CONFIG.BUILDINGS[type];
    this.maxHp = stats.defense * 3;
    this.hp = this.maxHp;
  }

  get name(): string {
    return GAME_CONFIG.BUILDINGS[this.type].name;
  }

  get cost(): number {
    return GAME_CONFIG.BUILDINGS[this.type].cost;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    return !this.isAlive;
  }
}
