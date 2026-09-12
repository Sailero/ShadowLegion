export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;
export const ARENA_WIDTH = 1600;
export const ARENA_HEIGHT = 1200;

export const COLORS = {
  bg: 0xf6f0df,
  arenaBg: 0xe3ead1,
  arenaGrid: 0xc6d6b2,
  arenaBorder: 0x72866a,

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
  ninja: 0x14b8a6,
  ninjaDark: 0x0d9488,
  summoner: 0xec4899,
  summonerDark: 0xdb2777,
  bomber: 0xf43f5e,
  bomberDark: 0x9f1239,
  medic: 0x06b6d4,
  medicDark: 0x0e7490,
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

  uiText: '#35483e',
  uiDim: '#65705c',
  uiAccent: '#9a582c',
  cardBg: 0xfffbef,
  cardBorder: 0xceceb6,
  cardHover: 0xf1e9cb,
  overlay: 0x58654c,
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

  invincibleMs: 250,
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
    key: 'slime', name: '叶团团',
    color: 0x22c55e, colorDark: 0x16a34a,
    hp: 30, speed: 68, damage: 10, bodyRadius: 12,
    xp: 5, score: 10,
  },
  bat: {
    key: 'bat', name: '扑棱蛾',
    color: 0xa855f7, colorDark: 0x7c3aed,
    hp: 20, speed: 120, damage: 9, bodyRadius: 8,
    xp: 4, score: 8,
  },
  archer: {
    key: 'archer', name: '蘑菇投手',
    color: 0xf97316, colorDark: 0xea580c,
    hp: 42, speed: 50, damage: 8, bodyRadius: 10,
    xp: 8, score: 15,
    ranged: true, fireRate: 1650, bulletSpeed: 250, bulletDamage: 10,
    keepDistance: 240,
  },
  tank: {
    key: 'tank', name: '橡果龟',
    color: 0x6b7280, colorDark: 0x4b5563,
    hp: 150, speed: 36, damage: 22, bodyRadius: 16,
    xp: 15, score: 25,
  },
  ninja: {
    key: 'ninja', name: '纸燕快递',
    color: 0x14b8a6, colorDark: 0x0d9488,
    hp: 38, speed: 155, damage: 16, bodyRadius: 9,
    fireRate: 1600, bulletDamage: 10, bulletSpeed: 260,
    xp: 12, score: 22,
  },
  summoner: {
    key: 'summoner', name: '花朵召集员',
    color: 0xec4899, colorDark: 0xdb2777,
    hp: 78, speed: 42, damage: 8, bodyRadius: 11,
    xp: 12, score: 20,
    ranged: true, fireRate: 2200, bulletSpeed: 210, bulletDamage: 10,
    keepDistance: 280,
  },
  bomber: {
    key: 'bomber', name: '彩屑南瓜',
    color: 0xf43f5e, colorDark: 0x9f1239,
    hp: 46, speed: 82, damage: 26, bodyRadius: 11,
    xp: 10, score: 18,
  },
  medic: {
    key: 'medic', name: '薄荷茶师',
    color: 0x06b6d4, colorDark: 0x0e7490,
    hp: 66, speed: 48, damage: 7, bodyRadius: 11,
    xp: 13, score: 24,
    ranged: true, fireRate: 2400, bulletSpeed: 220, bulletDamage: 8,
    keepDistance: 300,
  },
};

export const ELITE = { hp: 2.1, speed: 1.2, damage: 1.35, xp: 3, score: 3 };

export const WAVE_CFG = {
  perLevel: 5,
  levels: 4,
  spawnMargin: 120,
  delayMs: 1200,
  spawnInterval: 150,
  bossHp: 4.0,
  bossSize: 1.7,
  bossDmg: 1.4,
  bossSpeed: 0.85,
};

export interface BehaviorRecordingConfig {
  enabled: boolean;
  recordInterval: number;
  stateVectorDim: number;
  actionDim: number;
}
