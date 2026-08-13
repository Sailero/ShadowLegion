import { GAME_CONFIG, UnitType, COUNTER_TABLE } from '../config/gameConfig';

let unitIdCounter = 0;

export class Unit {
  readonly id: string;
  readonly type: UnitType;
  readonly owner: 'player' | 'enemy';
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  moveRange: number;
  attackRange: number;
  hasMoved: boolean = false;
  hasAttacked: boolean = false;

  constructor(type: UnitType, owner: 'player' | 'enemy', q: number, r: number) {
    this.id = `unit_${unitIdCounter++}`;
    this.type = type;
    this.owner = owner;
    this.q = q;
    this.r = r;

    const stats = GAME_CONFIG.UNITS[type];
    this.attack = stats.attack;
    this.defense = stats.defense;
    this.moveRange = stats.move;
    this.attackRange = stats.range;
    this.maxHp = stats.defense * 3 + 2;
    this.hp = this.maxHp;
  }

  get name(): string {
    return GAME_CONFIG.UNITS[this.type].name;
  }

  get cost(): number {
    return GAME_CONFIG.UNITS[this.type].cost;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  get hpPercent(): number {
    return this.hp / this.maxHp;
  }

  resetTurn(): void {
    this.hasMoved = false;
    this.hasAttacked = false;
  }

  calculateDamage(target: Unit, terrainDefenseBonus: number = 0): number {
    let multiplier = 1.0;

    if (COUNTER_TABLE[this.type] === target.type) {
      multiplier = 1.5;
    } else if (COUNTER_TABLE[target.type] === this.type) {
      multiplier = 0.6;
    }

    const effectiveDefense = target.defense * (1 + terrainDefenseBonus);
    const rawDamage = Math.max(1, this.attack * multiplier - effectiveDefense * 0.5);

    const variance = 0.8 + Math.random() * 0.4;
    return Math.round(rawDamage * variance);
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    return !this.isAlive;
  }
}
