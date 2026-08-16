export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const ARENA_WIDTH = 1600;
export const ARENA_HEIGHT = 1200;

export const COLORS = {
  bg: 0x080c14,
  arenaBg: 0x0a0f1a,
  arenaGrid: 0x131d2e,
  arenaBorder: 0x1e3a5f,

  hero: 0x3b82f6,
  heroLight: 0x93c5fd,
  heroGun: 0xd1d5db,

  slime: 0x22c55e,
  slimeDark: 0x16a34a,
  bat: 0xa855f7,
  batDark: 0x7c3aed,
  archer: 0xf97316,
  archerDark: 0xea580c,
  tank: 0x6b7280,
  tankDark: 0x4b5563,
  eliteGlow: 0xef4444,

  bulletPlayer: 0xfbbf24,
  bulletGlow: 0xfef3c7,
  bulletEnemy: 0xef4444,
  xpGem: 0x818cf8,
  xpGemGlow: 0xc4b5fd,

  hpGreen: 0x22c55e,
  hpRed: 0xef4444,
  hpBg: 0x374151,
  chargeBar: 0xfbbf24,
  dashBar: 0x60a5fa,

  uiText: '#e2e8f0',
  uiDim: '#64748b',
  uiAccent: '#fbbf24',
  cardBg: 0x111827,
  cardBorder: 0x1e3a5f,
  cardHover: 0x1e293b,
  overlay: 0x000000,
};

export const HERO_CFG = {
  maxHp: 120,
  speed: 180,
  accel: 1000,
  decel: 800,
  bodyRadius: 10,

  fireRate: 180,
  bulletSpeed: 550,
  bulletDamage: 10,

  dashSpeed: 520,
  dashDuration: 160,
  dashCooldown: 1000,

  chargeMax: 100,
  chargePerKill: 15,

  invincibleMs: 400,
  magnetRadius: 120,
};

export interface EnemyType {
  key: string;
  name: string;
  color: number;
  colorDark: number;
  hp: number;
  speed: number;
  damage: number;
  bodyRadius: number;
  xp: number;
  score: number;
  ranged?: boolean;
  fireRate?: number;
  bulletSpeed?: number;
  bulletDamage?: number;
  keepDistance?: number;
}

export const ENEMY_TYPES: Record<string, EnemyType> = {
  slime: {
    key: 'slime', name: '史莱姆',
    color: 0x22c55e, colorDark: 0x16a34a,
    hp: 25, speed: 65, damage: 12, bodyRadius: 12,
    xp: 5, score: 10,
  },
  bat: {
    key: 'bat', name: '蝙蝠',
    color: 0xa855f7, colorDark: 0x7c3aed,
    hp: 16, speed: 120, damage: 10, bodyRadius: 8,
    xp: 4, score: 8,
  },
  archer: {
    key: 'archer', name: '弓箭手',
    color: 0xf97316, colorDark: 0xea580c,
    hp: 40, speed: 50, damage: 8, bodyRadius: 10,
    xp: 8, score: 15,
    ranged: true, fireRate: 1800, bulletSpeed: 260, bulletDamage: 14,
    keepDistance: 200,
  },
  tank: {
    key: 'tank', name: '重甲',
    color: 0x6b7280, colorDark: 0x4b5563,
    hp: 140, speed: 35, damage: 22, bodyRadius: 16,
    xp: 15, score: 25,
  },
};

export const ELITE = { hp: 2.0, speed: 1.25, damage: 1.4, xp: 3, score: 3 };

export const WAVE_CFG = {
  perLevel: 10,
  levels: 3,
  spawnMargin: 120,
  delayMs: 2000,
  spawnInterval: 120,
  bossHp: 6,
  bossSize: 1.7,
  bossDmg: 2.0,
  bossSpeed: 0.85,
};

export interface BehaviorRecordingConfig {
  enabled: boolean;
  recordInterval: number;
  stateVectorDim: number;
  actionDim: number;
}
