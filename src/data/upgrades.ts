export type BuildPath = 'nova' | 'storm' | 'rift' | 'engineer';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  category: 'attack' | 'defense' | 'mobility' | 'special' | 'skill';
  rarity: 'common' | 'rare' | 'epic';
  maxStacks: number;
  path?: BuildPath;
  unlocksSkill?: string;
  requiresSkill?: string;
}

/**
 * Operative identity is selected before combat. Cards deepen that identity or
 * add unlocked support skills; there is no longer a disconnected "protocol"
 * choice at wave one.
 */
export const WAVE_UPGRADES: UpgradeDef[] = [
  { id: 'atk_up', name: '强化弹药', desc: '攻击力 +15%', category: 'attack', rarity: 'common', maxStacks: 4 },
  { id: 'atkspd_up', name: '速射装置', desc: '攻击速度 +13%', category: 'attack', rarity: 'common', maxStacks: 4 },
  { id: 'hp_up', name: '复合装甲', desc: '最大生命 +22，并恢复 22', category: 'defense', rarity: 'common', maxStacks: 3 },
  { id: 'heal', name: '战地急救', desc: '先锋与防线各恢复 30%', category: 'defense', rarity: 'common', maxStacks: 99 },
  { id: 'spd_up', name: '轻量骨架', desc: '移动速度 +10%', category: 'mobility', rarity: 'common', maxStacks: 3 },
  { id: 'charge_up', name: '能量回收', desc: '击杀充能 +4', category: 'special', rarity: 'common', maxStacks: 3 },

  { id: 'crit', name: '游骑 · 临界弹头', desc: '暴击率 +12%', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'nova' },
  { id: 'explosive', name: '游骑 · 聚变装药', desc: '命中爆炸范围与伤害提升', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'nova' },
  { id: 'skill_burst_up', name: '游骑 · 超载爆发', desc: '能量爆发 Lv+1，基础伤害 +5%', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'nova', requiresSkill: 'burst' },

  { id: 'scatter', name: '重炮 · 并联枪管', desc: '弹道数 +1，单发伤害 -6%', category: 'attack', rarity: 'rare', maxStacks: 2, path: 'storm' },
  { id: 'pierce', name: '重炮 · 磁轨穿透', desc: '子弹穿透并保留更多伤害', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'storm' },
  { id: 'skill_barrage_up', name: '重炮 · 风暴增幅', desc: '弹幕风暴 Lv+1，攻速 +6%', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'storm', requiresSkill: 'barrage' },

  { id: 'frost_shot', name: '壁垒 · 迟滞弹', desc: '命中施加减速，叠层增强', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'shield', name: '壁垒 · 相位护盾', desc: '获得 1 层可抵消伤害的护盾', category: 'defense', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'dash_cd', name: '壁垒 · 折跃回路', desc: '闪避冷却 -15%', category: 'mobility', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'skill_timerift_up', name: '壁垒 · 裂隙增幅', desc: '时空裂隙 Lv+1，并获得 1 层护盾', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'rift', requiresSkill: 'timerift' },

  { id: 'homing', name: '工程 · 导引弹头', desc: '追踪转向更稳定，伤害 +6%', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'engineer' },
  { id: 'ricochet', name: '工程 · 蜂群中继', desc: '击杀后向附近敌人弹射一次', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'engineer' },
  { id: 'skill_sentry_up', name: '工程 · 哨戒扩容', desc: '蜂群哨戒 Lv+1，充能效率提高', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'engineer', requiresSkill: 'sentry' },

  { id: 'unlock_barrage', name: '支援蓝图 · 弹幕风暴', desc: '本局解锁弹幕风暴；之后可继续升级', category: 'skill', rarity: 'epic', maxStacks: 1, unlocksSkill: 'barrage' },
  { id: 'unlock_timerift', name: '支援蓝图 · 时空裂隙', desc: '本局解锁时空裂隙；之后可继续升级', category: 'skill', rarity: 'epic', maxStacks: 1, unlocksSkill: 'timerift' },
  { id: 'unlock_sentry', name: '支援蓝图 · 蜂群哨戒', desc: '本局解锁自动哨戒节点', category: 'skill', rarity: 'epic', maxStacks: 1, unlocksSkill: 'sentry' },
  { id: 'support_barrage_up', name: '弹幕校准', desc: '弹幕风暴 Lv+1', category: 'skill', rarity: 'rare', maxStacks: 2, requiresSkill: 'barrage' },
  { id: 'support_timerift_up', name: '裂隙校准', desc: '时空裂隙 Lv+1', category: 'skill', rarity: 'rare', maxStacks: 2, requiresSkill: 'timerift' },
  { id: 'support_sentry_up', name: '哨戒校准', desc: '蜂群哨戒 Lv+1', category: 'skill', rarity: 'rare', maxStacks: 2, requiresSkill: 'sentry' },
];

/** One large reward is chosen between chapters and persists for the run. */
export const LEVEL_UPGRADES: UpgradeDef[] = [
  { id: 'veteran_damage', name: '老兵火控', desc: '攻击力 +20%，暴击率 +5%', category: 'attack', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_armor', name: '防线共振', desc: '最大生命 +30，并获得 1 层护盾', category: 'defense', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_speed', name: '跨区机动', desc: '移速 +12%，闪避冷却 -12%', category: 'mobility', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_energy', name: '战区电池', desc: '立即充满能量，击杀充能 +4', category: 'special', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_multishot', name: '火力迭代', desc: '弹道 +1，攻击力 -5%', category: 'attack', rarity: 'epic', maxStacks: 2 },
  { id: 'veteran_repair', name: '全线维修', desc: '先锋和下一章防线恢复至满值', category: 'defense', rarity: 'epic', maxStacks: 99 },
];

export const BUILD_INFO: Record<BuildPath, { name: string; color: number; promise: string }> = {
  nova: { name: '游骑先锋', color: 0xf97316, promise: '机动截击与爆炸连锁' },
  storm: { name: '重炮兵', color: 0xef4444, promise: '多弹道持续压制' },
  rift: { name: '壁垒卫士', color: 0x818cf8, promise: '护盾、迟滞与阵线控制' },
  engineer: { name: '蜂群工程师', color: 0x22d3ee, promise: '部署、追踪与弹射支援' },
};

export const EVOLUTION_INFO: Record<BuildPath, { name: string; desc: string }> = {
  nova: { name: '超新星游骑', desc: '爆炸、暴击与基础伤害同时跃升' },
  storm: { name: '赤色重炮', desc: '追加弹道、穿透与攻击速度' },
  rift: { name: '永恒壁垒', desc: '追加护盾、迟滞与闪避循环' },
  engineer: { name: '蜂群主机', desc: '追踪、弹射与哨戒火力同时强化' },
};

export const CATEGORY_COLORS: Record<string, number> = {
  attack: 0xef4444,
  defense: 0x22c55e,
  mobility: 0x3b82f6,
  special: 0xfbbf24,
  skill: 0xa855f7,
};
