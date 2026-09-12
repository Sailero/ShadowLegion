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
  { id: 'atk_up', name: '烘焙弹丸', desc: '攻击力 +15%', category: 'attack', rarity: 'common', maxStacks: 4 },
  { id: 'atkspd_up', name: '轻快节拍', desc: '攻击速度 +13%', category: 'attack', rarity: 'common', maxStacks: 4 },
  { id: 'hp_up', name: '软绒护衣', desc: '最大生命 +22，并恢复 22', category: 'defense', rarity: 'common', maxStacks: 3 },
  { id: 'heal', name: '热可可补给', desc: '你与营地各恢复 30%', category: 'defense', rarity: 'common', maxStacks: 99 },
  { id: 'spd_up', name: '轻盈鞋垫', desc: '移动速度 +10%', category: 'mobility', rarity: 'common', maxStacks: 3 },
  { id: 'charge_up', name: '灵感回收', desc: '击杀充能 +4', category: 'special', rarity: 'common', maxStacks: 3 },

  { id: 'crit', name: '花火 · 惊喜响指', desc: '暴击率 +12%', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'nova' },
  { id: 'explosive', name: '花火 · 连环礼花', desc: '命中爆炸范围与伤害提升', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'nova' },
  { id: 'skill_burst_up', name: '花火 · 派对加料', desc: '花火派对 Lv+1，基础伤害 +5%', category: 'skill', rarity: 'rare', maxStacks: 4, path: 'nova', requiresSkill: 'burst' },

  { id: 'scatter', name: '爆米花 · 多一勺', desc: '弹道数 +1，单发伤害 -6%', category: 'attack', rarity: 'rare', maxStacks: 2, path: 'storm' },
  { id: 'pierce', name: '爆米花 · 串串分享', desc: '子弹穿透并保留更多伤害', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'storm' },
  { id: 'skill_barrage_up', name: '爆米花 · 大份快乐', desc: '爆米花雨 Lv+1，攻速 +6%', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'storm', requiresSkill: 'barrage' },

  { id: 'frost_shot', name: '抱抱 · 慢半拍', desc: '命中施加减速，叠层增强', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'shield', name: '抱抱 · 软垫护盾', desc: '获得 1 层可抵消伤害的护盾', category: 'defense', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'dash_cd', name: '抱抱 · 轻巧转身', desc: '闪避冷却 -15%', category: 'mobility', rarity: 'rare', maxStacks: 3, path: 'rift' },
  { id: 'skill_timerift_up', name: '抱抱 · 续一壶茶', desc: '慢悠悠茶会 Lv+1，并获得 1 层护盾', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'rift', requiresSkill: 'timerift' },

  { id: 'homing', name: '蜜蜂 · 花粉加料', desc: '保留追踪能力，基础伤害 +6%', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'engineer' },
  { id: 'ricochet', name: '蜜蜂 · 传花接力', desc: '击杀后向附近敌人弹射一次', category: 'attack', rarity: 'rare', maxStacks: 3, path: 'engineer' },
  { id: 'skill_sentry_up', name: '蜜蜂 · 招呼帮手', desc: '蜜蜂小帮手 Lv+1，充能效率提高', category: 'skill', rarity: 'rare', maxStacks: 3, path: 'engineer', requiresSkill: 'sentry' },

  { id: 'unlock_barrage', name: '支援蓝图 · 爆米花雨', desc: '本局解锁爆米花雨；之后可继续升级', category: 'skill', rarity: 'epic', maxStacks: 1, unlocksSkill: 'barrage' },
  { id: 'unlock_timerift', name: '支援蓝图 · 慢悠悠茶会', desc: '本局解锁慢悠悠茶会；之后可继续升级', category: 'skill', rarity: 'epic', maxStacks: 1, unlocksSkill: 'timerift' },
  { id: 'unlock_sentry', name: '支援蓝图 · 蜜蜂小帮手', desc: '本局解锁自动哨戒节点', category: 'skill', rarity: 'epic', maxStacks: 1, unlocksSkill: 'sentry' },
  { id: 'support_barrage_up', name: '爆米花加餐', desc: '爆米花雨 Lv+1', category: 'skill', rarity: 'rare', maxStacks: 2, requiresSkill: 'barrage' },
  { id: 'support_timerift_up', name: '茶会续杯', desc: '慢悠悠茶会 Lv+1', category: 'skill', rarity: 'rare', maxStacks: 2, requiresSkill: 'timerift' },
  { id: 'support_sentry_up', name: '帮手练习', desc: '蜜蜂小帮手 Lv+1', category: 'skill', rarity: 'rare', maxStacks: 2, requiresSkill: 'sentry' },
];

/** One large reward is chosen between chapters and persists for the run. */
export const LEVEL_UPGRADES: UpgradeDef[] = [
  { id: 'veteran_damage', name: '熟练小手', desc: '攻击力 +20%，暴击率 +5%', category: 'attack', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_armor', name: '安心同行', desc: '最大生命 +30，并获得 1 层护盾', category: 'defense', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_speed', name: '远足好鞋', desc: '移速 +12%，闪避冷却 -12%', category: 'mobility', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_energy', name: '满满便当', desc: '立即充满能量，击杀充能 +4', category: 'special', rarity: 'epic', maxStacks: 3 },
  { id: 'veteran_multishot', name: '分享一份', desc: '弹道 +1，攻击力 -5%', category: 'attack', rarity: 'epic', maxStacks: 2 },
  { id: 'veteran_repair', name: '围炉点心', desc: '立即回满生命，之后每秒恢复 1 点生命', category: 'defense', rarity: 'epic', maxStacks: 3 },
];

export const BUILD_INFO: Record<BuildPath, { name: string; color: number; promise: string }> = {
  nova: { name: '花火邮装', color: 0xf97316, promise: '转线截击，让花火连成一串' },
  storm: { name: '爆米花邮装', color: 0xd59067, promise: '弹丸铺成扇面，守住一整条路' },
  rift: { name: '抱抱邮装', color: 0xa292bc, promise: '护盾与减速，替营地争取时间' },
  engineer: { name: '蜜蜂邮装', color: 0x5b9d91, promise: '部署帮手，再去照看另一条路' },
};

export const EVOLUTION_INFO: Record<BuildPath, { name: string; desc: string }> = {
  nova: { name: '花火大派对', desc: '爆炸、暴击与基础伤害同时跃升' },
  storm: { name: '爆米花盛宴', desc: '追加弹道、穿透与攻击速度' },
  rift: { name: '移动小茶馆', desc: '追加护盾、迟滞与闪避循环' },
  engineer: { name: '蜜蜂好朋友', desc: '追踪、弹射与哨戒火力同时强化' },
};

export const CATEGORY_COLORS: Record<string, number> = {
  attack: 0xbc7557,
  defense: 0x658e70,
  mobility: 0x568c94,
  special: 0xb28c47,
  skill: 0x927daa,
};
