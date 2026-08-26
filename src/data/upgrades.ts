export type BuildPath = 'nova' | 'storm' | 'rift';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  category: 'attack' | 'defense' | 'mobility' | 'special' | 'skill';
  rarity: 'common' | 'rare' | 'epic';
  maxStacks: number;
  path?: BuildPath;
  isCore?: boolean;
}

/**
 * Phase 1 deliberately uses three compact, legible builds. The first upgrade
 * always selects a protocol; later rolls favour that protocol and keep one
 * universal utility option so a run has direction without becoming automatic.
 */
export const WAVE_UPGRADES: UpgradeDef[] = [
  { id: 'core_nova', name: '爆裂协议', desc: '命中爆炸，能量爆发升至 Lv2', category: 'skill', rarity: 'epic', maxStacks: 1, path: 'nova', isCore: true },
  { id: 'core_storm', name: '弹幕协议', desc: '获得双弹道与弹幕风暴', category: 'skill', rarity: 'epic', maxStacks: 1, path: 'storm', isCore: true },
  { id: 'core_rift', name: '时隙协议', desc: '获得时空裂隙与 1 层护盾', category: 'skill', rarity: 'epic', maxStacks: 1, path: 'rift', isCore: true },

  { id: 'atk_up', name: '强化弹药', desc: '攻击力 +18%', category: 'attack', rarity: 'common', maxStacks: 3 },
  { id: 'atkspd_up', name: '速射装置', desc: '攻击速度 +16%', category: 'attack', rarity: 'common', maxStacks: 3 },
  { id: 'hp_up', name: '复合装甲', desc: '最大生命 +25，并恢复 25', category: 'defense', rarity: 'common', maxStacks: 3 },
  { id: 'heal', name: '战地急救', desc: '恢复 35% 最大生命', category: 'defense', rarity: 'common', maxStacks: 99 },
  { id: 'spd_up', name: '轻量骨架', desc: '移动速度 +12%', category: 'mobility', rarity: 'common', maxStacks: 3 },
  { id: 'charge_up', name: '能量回收', desc: '击杀充能 +35%', category: 'special', rarity: 'common', maxStacks: 3 },

  { id: 'crit', name: '临界弹头', desc: '暴击率 +14%', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'nova' },
  { id: 'explosive', name: '聚变装药', desc: '爆炸范围与伤害进一步提升', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'nova' },
  { id: 'skill_burst_up', name: '超载爆发', desc: '能量爆发 Lv+1，暴击率 +5%', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'nova' },

  { id: 'scatter', name: '并联枪管', desc: '弹道数 +1，扩散角更紧凑', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'storm' },
  { id: 'pierce', name: '磁轨穿透', desc: '子弹可穿透并保留更多伤害', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'storm' },
  { id: 'skill_barrage_up', name: '风暴增幅', desc: '弹幕风暴 Lv+1，攻击速度 +8%', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'storm' },

  { id: 'frost_shot', name: '迟滞弹', desc: '命中减速更强、持续更久', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'shield', name: '相位护盾', desc: '获得 1 层可抵消伤害的护盾', category: 'defense', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'dash_cd', name: '折跃回路', desc: '闪避冷却 -18%', category: 'mobility', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'skill_timerift_up', name: '裂隙增幅', desc: '时空裂隙 Lv+1，并获得 1 层护盾', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'rift' },
];

// One 8-wave chapter is the complete Phase 1 run; persistent workshop growth
// lives in MetaProgressionManager rather than in a second in-run level table.
export const LEVEL_UPGRADES: UpgradeDef[] = [];

export const BUILD_INFO: Record<BuildPath, { name: string; color: number; promise: string }> = {
  nova: { name: '爆裂', color: 0xf97316, promise: '暴击与范围连锁清场' },
  storm: { name: '弹幕', color: 0xef4444, promise: '多弹道持续压制' },
  rift: { name: '时隙', color: 0x818cf8, promise: '减速、护盾与机动控场' },
};

export const EVOLUTION_INFO: Record<BuildPath, { name: string; desc: string }> = {
  nova: { name: '超新星', desc: '爆炸、暴击与基础伤害同时跃升' },
  storm: { name: '赤色风暴', desc: '追加弹道、穿透与攻击速度' },
  rift: { name: '永恒时隙', desc: '追加护盾、迟滞与闪避循环' },
};

export const CATEGORY_COLORS: Record<string, number> = {
  attack: 0xef4444,
  defense: 0x22c55e,
  mobility: 0x3b82f6,
  special: 0xfbbf24,
  skill: 0xa855f7,
};
