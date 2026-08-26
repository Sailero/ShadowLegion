export interface SkillLevel {
  damage: number;
  radius: number;
  duration: number;
  cooldown: number;
  desc: string;
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  chargeCost: number;
  color: number;
  maxLevel: number;
  levels: SkillLevel[];
  growthDesc: string;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'burst',
    name: '能量爆发',
    desc: '清除近屏压力并击退敌人',
    chargeCost: 100,
    color: 0xfbbf24,
    maxLevel: 5,
    growthDesc: '升级：伤害倍率 +0.5x',
    levels: [
      { damage: 1, radius: 9999, duration: 0, cooldown: 0, desc: 'Lv1: 1.5x全屏伤害 + 击退' },
      { damage: 1, radius: 9999, duration: 0, cooldown: 0, desc: 'Lv2: 2.0x伤害 + 暴击+5%' },
      { damage: 1, radius: 9999, duration: 0, cooldown: 0, desc: 'Lv3: 2.5x伤害 + 暴击+5% + 回复5%HP' },
    ],
  },
  {
    id: 'barrage',
    name: '弹幕风暴',
    desc: '短时间向四周倾泻旋转弹幕',
    chargeCost: 100,
    color: 0xef4444,
    maxLevel: 5,
    growthDesc: '升级：弹道、伤害与持续时间提升',
    levels: [
      { damage: 5, radius: 0, duration: 1500, cooldown: 0, desc: 'Lv1: 8方向1.5秒 + 弹道+1' },
      { damage: 7, radius: 0, duration: 2000, cooldown: 0, desc: 'Lv2: 12方向2秒 + 弹道+1 + 攻速+8%' },
      { damage: 10, radius: 0, duration: 2500, cooldown: 0, desc: 'Lv3: 16方向2.5秒 + 弹道+1 + 攻速+8%' },
    ],
  },
  {
    id: 'timerift',
    name: '时空裂隙',
    desc: '制造减速力场并压制近身敌人',
    chargeCost: 80,
    color: 0x818cf8,
    maxLevel: 5,
    growthDesc: '升级：范围、伤害与持续时间提升',
    levels: [
      { damage: 4, radius: 200, duration: 2500, cooldown: 0, desc: 'Lv1: 200范围2.5秒 + 闪避+5%' },
      { damage: 7, radius: 260, duration: 3000, cooldown: 0, desc: 'Lv2: 260范围3秒 + 闪避+5% + 护盾+1' },
      { damage: 10, radius: 320, duration: 4000, cooldown: 0, desc: 'Lv3: 320范围4秒 + 闪避+5% + 护盾+1' },
    ],
  },
];

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find(s => s.id === id);
}

export function getSkillStatsForLevel(id: string, level: number): SkillLevel | null {
  const skill = getSkill(id);
  if (!skill) return null;
  const lvl = Math.min(skill.maxLevel, Math.max(1, level));

  if (lvl <= skill.levels.length) {
    return skill.levels[lvl - 1];
  }

  const base = skill.levels[skill.levels.length - 1];
  const extra = lvl - skill.levels.length;

  switch (id) {
    case 'burst':
      return { ...base, desc: `Lv${lvl}: ${(1 + lvl * 0.5).toFixed(1)}x全屏伤害` };
    case 'barrage':
      return {
        ...base,
        damage: base.damage + extra * 2,
        duration: base.duration + extra * 200,
        desc: `Lv${lvl}: ${16 + extra * 2}方向 ${((base.duration + extra * 200) / 1000).toFixed(1)}秒`,
      };
    case 'timerift':
      return {
        ...base,
        damage: base.damage + extra * 2,
        radius: base.radius + extra * 20,
        duration: base.duration + extra * 300,
        desc: `Lv${lvl}: ${base.radius + extra * 20}范围 ${((base.duration + extra * 300) / 1000).toFixed(1)}秒`,
      };
    default:
      return base;
  }
}
