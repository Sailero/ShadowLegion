export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  category: 'attack' | 'defense' | 'mobility' | 'special' | 'skill';
  rarity: 'common' | 'rare' | 'epic';
  maxStacks: number;
}

export const WAVE_UPGRADES: UpgradeDef[] = [
  { id: 'atk_up',       name: '强化弹药',    desc: '攻击力 +15%',          category: 'attack',   rarity: 'common', maxStacks: 5 },
  { id: 'atkspd_up',    name: '速射装置',    desc: '攻速 +20%',            category: 'attack',   rarity: 'common', maxStacks: 5 },
  { id: 'bulletspd_up', name: '加速弹头',    desc: '弹速 +25%',            category: 'attack',   rarity: 'common', maxStacks: 4 },
  { id: 'scatter',      name: '散射',        desc: '同时发射3颗子弹',      category: 'attack',   rarity: 'rare',   maxStacks: 1 },
  { id: 'pierce',       name: '穿透弹',      desc: '子弹穿透敌人',          category: 'attack',   rarity: 'rare',   maxStacks: 1 },
  { id: 'homing',       name: '追踪弹',      desc: '子弹缓慢追踪敌人',      category: 'attack',   rarity: 'epic',   maxStacks: 1 },

  { id: 'hp_up',        name: '生命强化',    desc: '最大HP +25',            category: 'defense',  rarity: 'common', maxStacks: 5 },
  { id: 'heal',         name: '急救包',      desc: '恢复 30% HP',           category: 'defense',  rarity: 'common', maxStacks: 99 },
  { id: 'shield',       name: '能量护盾',    desc: '抵挡下一次伤害',         category: 'defense',  rarity: 'rare',   maxStacks: 1 },

  { id: 'spd_up',       name: '轻量护甲',    desc: '移速 +12%',             category: 'mobility', rarity: 'common', maxStacks: 4 },
  { id: 'dash_cd',      name: '闪避强化',    desc: '闪避冷却 -30%',         category: 'mobility', rarity: 'rare',   maxStacks: 2 },
  { id: 'dash_dmg',     name: '冲刺打击',    desc: '闪避时对路径敌人造成伤害', category: 'mobility', rarity: 'rare',   maxStacks: 1 },

  { id: 'magnet',       name: '磁力装置',    desc: '拾取范围 +50%',          category: 'special',  rarity: 'common', maxStacks: 3 },
  { id: 'charge_up',    name: '能量回收',    desc: '击杀充能 +50%',          category: 'special',  rarity: 'common', maxStacks: 3 },

  // 新增有趣升级
  { id: 'lifesteal',    name: '生命汲取',    desc: '攻击回复1%最大生命值',       category: 'attack',   rarity: 'rare',   maxStacks: 1 },
  { id: 'crit',         name: '暴击强化',    desc: '20%几率造成双倍伤害',        category: 'attack',   rarity: 'rare',   maxStacks: 2 },
  { id: 'explosive',    name: '爆裂弹',      desc: '子弹命中时小范围爆炸',       category: 'attack',   rarity: 'epic',   maxStacks: 1 },
  { id: 'ricochet',     name: '弹射',        desc: '子弹击杀后弹向附近敌人',     category: 'attack',   rarity: 'epic',   maxStacks: 1 },
  { id: 'frost_shot',   name: '寒冰弹',      desc: '子弹减速敌人50%持续1秒',     category: 'attack',   rarity: 'rare',   maxStacks: 1 },
  { id: 'berserk',      name: '狂暴本能',    desc: 'HP低于30%时伤害+80%',       category: 'attack',   rarity: 'rare',   maxStacks: 1 },

  { id: 'thorns',       name: '反伤荆棘',    desc: '受伤时对周围敌人造成伤害',   category: 'defense',  rarity: 'rare',   maxStacks: 2 },
  { id: 'second_wind',  name: '再生之力',    desc: '脱战3秒后每秒恢复2%HP',     category: 'defense',  rarity: 'rare',   maxStacks: 1 },
  { id: 'dodge',        name: '闪避本能',    desc: '15%几率完全闪避伤害',        category: 'defense',  rarity: 'rare',   maxStacks: 2 },

  { id: 'afterimage',   name: '残影冲刺',    desc: '闪避留下爆炸残影',           category: 'mobility', rarity: 'epic',   maxStacks: 1 },
  { id: 'dash_reset',   name: '连续冲刺',    desc: '击杀重置闪避冷却',           category: 'mobility', rarity: 'rare',   maxStacks: 1 },

  { id: 'xp_magnet_burst', name: '充能磁暴', desc: '使用技能时吸取全场能量球',  category: 'special',  rarity: 'rare',   maxStacks: 1 },
  { id: 'combo_dmg',    name: '连击强化',    desc: '10连击以上额外+30%伤害',    category: 'special',  rarity: 'rare',   maxStacks: 1 },
  { id: 'overcharge',   name: '过载充能',    desc: '充能可超过上限50%,溢出增伤', category: 'special',  rarity: 'epic',   maxStacks: 1 },

  // Skill upgrades
  { id: 'skill_burst_up',   name: '爆发强化',  desc: '能量爆发等级 +1',     category: 'skill', rarity: 'rare',  maxStacks: 2 },
  { id: 'skill_barrage',    name: '解锁：弹幕风暴', desc: '解锁弹幕风暴技能', category: 'skill', rarity: 'epic',  maxStacks: 1 },
  { id: 'skill_barrage_up', name: '弹幕强化',  desc: '弹幕风暴等级 +1',     category: 'skill', rarity: 'rare',  maxStacks: 2 },
  { id: 'skill_timerift',   name: '解锁：时空裂隙', desc: '解锁时空裂隙技能', category: 'skill', rarity: 'epic',  maxStacks: 1 },
  { id: 'skill_timerift_up', name: '裂隙强化', desc: '时空裂隙等级 +1',     category: 'skill', rarity: 'rare',  maxStacks: 2 },
];

export const LEVEL_UPGRADES: UpgradeDef[] = [
  { id: 'perm_atk',     name: '武器改造',    desc: '永久攻击力 +5',          category: 'attack',   rarity: 'epic', maxStacks: 99 },
  { id: 'perm_hp',      name: '体质强化',    desc: '永久最大HP +20',         category: 'defense',  rarity: 'epic', maxStacks: 99 },
  { id: 'perm_spd',     name: '动力核心',    desc: '永久移速 +8%',           category: 'mobility', rarity: 'epic', maxStacks: 99 },
  { id: 'perm_charge',  name: '蓄能核心',    desc: '击杀充能 +30%',          category: 'special',  rarity: 'epic', maxStacks: 99 },
  { id: 'perm_crit',    name: '精密打击',    desc: '暴击率永久+10%',            category: 'attack',   rarity: 'epic', maxStacks: 3 },
  { id: 'perm_regen',   name: '再生体质',    desc: '永久每秒恢复1HP',           category: 'defense',  rarity: 'epic', maxStacks: 3 },
];

export const CATEGORY_COLORS: Record<string, number> = {
  attack: 0xef4444,
  defense: 0x22c55e,
  mobility: 0x3b82f6,
  special: 0xfbbf24,
  skill: 0xa855f7,
};
