export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const ARENA_WIDTH = 1600;
export const ARENA_HEIGHT = 1200;

export const COLORS = {
  bg: 0x0a0e17,
  arenaBg: 0x111827,
  arenaGrid: 0x1a2232,
  arenaBorder: 0x374151,

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

  uiText: '#ffffff',
  uiDim: '#9ca3af',
  uiAccent: '#fbbf24',
  cardBg: 0x1e293b,
  cardBorder: 0x475569,
  cardHover: 0x334155,
  overlay: 0x000000,
};

export const HERO_CFG = {
  maxHp: 100,
  speed: 170,
  accel: 900,
  decel: 700,
  bodyRadius: 10,

  fireRate: 200,
  bulletSpeed: 520,
  bulletDamage: 12,

  dashSpeed: 500,
  dashDuration: 180,
  dashCooldown: 1200,

  chargeMax: 100,
  chargePerKill: 12,
  chargeBlastRadius: 140,
  chargeBlastDamage: 50,

  invincibleMs: 350,
  magnetRadius: 110,
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
    hp: 35, speed: 75, damage: 15, bodyRadius: 12,
    xp: 5, score: 10,
  },
  bat: {
    key: 'bat', name: '蝙蝠',
    color: 0xa855f7, colorDark: 0x7c3aed,
    hp: 22, speed: 140, damage: 12, bodyRadius: 8,
    xp: 4, score: 8,
  },
  archer: {
    key: 'archer', name: '弓箭手',
    color: 0xf97316, colorDark: 0xea580c,
    hp: 50, speed: 55, damage: 10, bodyRadius: 10,
    xp: 8, score: 15,
    ranged: true, fireRate: 1400, bulletSpeed: 300, bulletDamage: 18,
    keepDistance: 220,
  },
  tank: {
    key: 'tank', name: '重甲',
    color: 0x6b7280, colorDark: 0x4b5563,
    hp: 180, speed: 38, damage: 28, bodyRadius: 16,
    xp: 15, score: 25,
  },
};

export const ELITE = { hp: 2.2, speed: 1.35, damage: 1.6, xp: 3, score: 3 };

export const WAVE_CFG = {
  perLevel: 10,
  levels: 3,
  spawnMargin: 100,
  delayMs: 1500,
  spawnInterval: 100,
  bossHp: 7,
  bossSize: 1.8,
  bossDmg: 2.5,
  bossSpeed: 0.9,
};

export interface BehaviorRecordingConfig {
  enabled: boolean;
  recordInterval: number;
  stateVectorDim: number;
  actionDim: number;
}
