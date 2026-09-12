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
    name: '花火派对',
    desc: '一圈暖暖的花火，击退全场的小捣蛋',
    chargeCost: 100,
    color: 0xfbbf24,
    maxLevel: 5,
    growthDesc: '升级：伤害倍率 +0.5x',
    levels: [
      { damage: 1, radius: 9999, duration: 0, cooldown: 0, desc: 'Lv1: 1.5x全屏伤害 + 击退' },
      { damage: 1, radius: 9999, duration: 0, cooldown: 0, desc: 'Lv2: 2.0x全场伤害 + 击退' },
      { damage: 1, radius: 9999, duration: 0, cooldown: 0, desc: 'Lv3: 2.5x伤害 + 击退 + 回复5%生命' },
    ],
  },
  {
    id: 'barrage',
    name: '爆米花雨',
    desc: '把快乐撒向四周，旋转弹丸替你分担来路',
    chargeCost: 100,
    color: 0xd59067,
    maxLevel: 5,
    growthDesc: '升级：弹道、伤害与持续时间提升',
    levels: [
      { damage: 5, radius: 0, duration: 1500, cooldown: 0, desc: 'Lv1: 8方向 · 1.5秒 · 每弹5伤害' },
      { damage: 7, radius: 0, duration: 2000, cooldown: 0, desc: 'Lv2: 10方向 · 2秒 · 每弹7伤害' },
      { damage: 10, radius: 0, duration: 2500, cooldown: 0, desc: 'Lv3: 12方向 · 2.5秒 · 每弹10伤害' },
    ],
  },
  {
    id: 'timerift',
    name: '慢悠悠茶会',
    desc: '原地摆一桌茶会，请路过的对手慢一点',
    chargeCost: 80,
    color: 0xa292bc,
    maxLevel: 5,
    growthDesc: '升级：范围、伤害与持续时间提升',
    levels: [
      { damage: 4, radius: 200, duration: 2500, cooldown: 0, desc: 'Lv1: 200范围 · 立即伤害与2.5秒减速' },
      { damage: 7, radius: 260, duration: 3000, cooldown: 0, desc: 'Lv2: 260范围 · 3秒 · 使用时护盾+1' },
      { damage: 10, radius: 320, duration: 4000, cooldown: 0, desc: 'Lv3: 320范围 · 4秒 · 使用时护盾+1' },
    ],
  },
  {
    id: 'sentry',
    name: '蜜蜂小帮手',
    desc: '留下一位勤快小帮手，自动照看附近的来客',
    chargeCost: 90,
    color: 0x5b9d91,
    maxLevel: 5,
    growthDesc: '升级：射程、单发伤害与驻场时间提升',
    levels: [
      { damage: 7, radius: 260, duration: 5000, cooldown: 0, desc: 'Lv1: 260射程 · 5秒自动射击' },
      { damage: 10, radius: 310, duration: 6000, cooldown: 0, desc: 'Lv2: 310射程 · 6秒 · 更快锁敌' },
      { damage: 14, radius: 360, duration: 7000, cooldown: 0, desc: 'Lv3: 360射程 · 7秒 · 穿透弹' },
    ],
  },
];

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find(s => s.id === id);
}

export function getSkillStatsForLevel(id: string, level: number): SkillLevel | null {
  const skill = getSkill(id);
  if (!skill) return null;
  const lvl = Number.isFinite(level) ? Math.min(skill.maxLevel, Math.max(1, Math.floor(level))) : 1;

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
        desc: `Lv${lvl}: ${6 + lvl * 2}方向 ${((base.duration + extra * 200) / 1000).toFixed(1)}秒`,
      };
    case 'timerift':
      return {
        ...base,
        damage: base.damage + extra * 2,
        radius: base.radius + extra * 20,
        duration: base.duration + extra * 300,
        desc: `Lv${lvl}: ${base.radius + extra * 20}范围 ${((base.duration + extra * 300) / 1000).toFixed(1)}秒`,
      };
    case 'sentry':
      return {
        ...base,
        damage: base.damage + extra * 3,
        radius: base.radius + extra * 25,
        duration: base.duration + extra * 400,
        desc: `Lv${lvl}: ${base.radius + extra * 25}射程 ${((base.duration + extra * 400) / 1000).toFixed(1)}秒`,
      };
    default:
      return base;
  }
}
