import type { BuildPath } from './upgrades';

export type OperativeId = 'ranger' | 'gunner' | 'warden' | 'engineer';

export interface OperativeDef {
  id: OperativeId;
  name: string;
  role: string;
  trait: string;
  color: number;
  path: BuildPath;
  signatureSkill: string;
  requiredChapter: number;
}

export const OPERATIVES: OperativeDef[] = [
  {
    id: 'ranger', name: '花火邮装', role: '跑动截击 · 连锁花火',
    trait: '暴击 +8%，闪避冷却 -15%，命中产生小范围爆炸。',
    color: 0xf97316, path: 'nova', signatureSkill: 'burst', requiredChapter: 0,
  },
  {
    id: 'gunner', name: '爆米花邮装', role: '多路弹丸 · 持续压制',
    trait: '双弹道、攻速 +10%，但移动速度 -8%。',
    color: 0xd59067, path: 'storm', signatureSkill: 'barrage', requiredChapter: 1,
  },
  {
    id: 'warden', name: '抱抱邮装', role: '护盾减速 · 稳稳守营',
    trait: '最大生命 +35、初始护盾 2 层，射速 -8%。',
    color: 0xa292bc, path: 'rift', signatureSkill: 'timerift', requiredChapter: 2,
  },
  {
    id: 'engineer', name: '蜜蜂邮装', role: '部署帮手 · 追踪弹射',
    trait: '子弹轻度追踪并弹射 1 次，基础伤害 -8%。',
    color: 0x5b9d91, path: 'engineer', signatureSkill: 'sentry', requiredChapter: 3,
  },
];

export function getOperative(id: string | null | undefined): OperativeDef {
  return OPERATIVES.find(item => item.id === id) ?? OPERATIVES[0];
}
