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
}

export const SKILLS: SkillDef[] = [
  {
    id: 'burst',
    name: '能量爆发',
    desc: '以自身为中心释放冲击波',
    chargeCost: 100,
    color: 0xfbbf24,
    maxLevel: 3,
    levels: [
      { damage: 15, radius: 80, duration: 0, cooldown: 0, desc: '15伤害 / 80范围' },
      { damage: 25, radius: 100, duration: 0, cooldown: 0, desc: '25伤害 / 100范围' },
      { damage: 40, radius: 130, duration: 0, cooldown: 0, desc: '40伤害 / 130范围' },
    ],
  },
  {
    id: 'barrage',
    name: '弹幕风暴',
    desc: '向四周倾泻弹幕',
    chargeCost: 100,
    color: 0xef4444,
    maxLevel: 3,
    levels: [
      { damage: 5, radius: 0, duration: 1500, cooldown: 0, desc: '1.5秒 / 8方向' },
      { damage: 7, radius: 0, duration: 2000, cooldown: 0, desc: '2秒 / 12方向' },
      { damage: 10, radius: 0, duration: 2500, cooldown: 0, desc: '2.5秒 / 16方向' },
    ],
  },
  {
    id: 'timerift',
    name: '时空裂隙',
    desc: '大范围减速敌人',
    chargeCost: 80,
    color: 0x818cf8,
    maxLevel: 3,
    levels: [
      { damage: 4, radius: 200, duration: 2500, cooldown: 0, desc: '200范围 / 2.5秒' },
      { damage: 7, radius: 260, duration: 3000, cooldown: 0, desc: '260范围 / 3秒' },
      { damage: 10, radius: 320, duration: 4000, cooldown: 0, desc: '320范围 / 4秒' },
    ],
  },
];

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find(s => s.id === id);
}
