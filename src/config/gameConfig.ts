export const GAME_CONFIG = {
  WIDTH: 900,
  HEIGHT: 700,
  BG_COLOR: '#0a0e17',

  HEX: {
    RADIUS: 28,
    GRID_COLS: 10,
    GRID_ROWS: 10,
    OFFSET_X: 120,
    OFFSET_Y: 80,
  },

  COLORS: {
    PLAYER: 0x4a9eff,
    ENEMY: 0xff4a4a,
    NEUTRAL: 0x2a3a4a,
    HIGHLIGHT: 0xffdd44,
    MOVE_RANGE: 0x44ff88,
    ATTACK_RANGE: 0xff6644,
    TERRAIN: {
      PLAIN: 0x1a2a3a,
      HIGHLAND: 0x3a2a1a,
      WATER: 0x0a2a4a,
      FOREST: 0x1a3a1a,
      RESOURCE: 0x3a3a0a,
    },
  },

  UNITS: {
    STRIKER: { name: '突击兵', attack: 3, defense: 1, move: 3, range: 1, cost: 3 },
    GUARDIAN: { name: '盾卫兵', attack: 1, defense: 3, move: 2, range: 1, cost: 4 },
    SNIPER: { name: '狙击手', attack: 4, defense: 1, move: 1, range: 3, cost: 5 },
    SCOUT: { name: '侦察兵', attack: 2, defense: 1, move: 4, range: 1, cost: 2 },
    ENGINEER: { name: '工程兵', attack: 1, defense: 2, move: 2, range: 1, cost: 3 },
  },

  BUILDINGS: {
    TOWER: { name: '箭塔', defense: 2, range: 2, cost: 5 },
    WALL: { name: '城墙', defense: 4, range: 0, cost: 2 },
    BARRACKS: { name: '兵营', defense: 1, range: 0, cost: 6 },
    WATCHTOWER: { name: '瞭望台', defense: 1, range: 3, cost: 4 },
    RESOURCE_TOWER: { name: '资源塔', defense: 1, range: 0, cost: 5 },
  },

  RESOURCES: {
    INITIAL_ENERGY: 10,
    ENERGY_PER_TURN: 3,
    INITIAL_TECH: 0,
    INITIAL_INTEL: 0,
  },
} as const;

export type UnitType = keyof typeof GAME_CONFIG.UNITS;
export type BuildingType = keyof typeof GAME_CONFIG.BUILDINGS;
export type TerrainType = keyof typeof GAME_CONFIG.COLORS.TERRAIN;

export const COUNTER_TABLE: Record<string, string> = {
  STRIKER: 'GUARDIAN',
  GUARDIAN: 'SNIPER',
  SNIPER: 'STRIKER',
};
