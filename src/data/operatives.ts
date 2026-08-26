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
    id: 'ranger', name: '游骑先锋', role: '机动爆破',
    trait: '暴击 +8%，闪避冷却 -15%，命中产生小范围爆炸。',
    color: 0xf97316, path: 'nova', signatureSkill: 'burst', requiredChapter: 0,
  },
  {
    id: 'gunner', name: '重炮兵', role: '持续压制',
    trait: '双弹道、攻速 +10%，但移动速度 -8%。',
    color: 0xef4444, path: 'storm', signatureSkill: 'barrage', requiredChapter: 1,
  },
  {
    id: 'warden', name: '壁垒卫士', role: '控场守线',
    trait: '最大生命 +35、初始护盾 2 层，射速 -8%。',
    color: 0x818cf8, path: 'rift', signatureSkill: 'timerift', requiredChapter: 2,
  },
  {
    id: 'engineer', name: '蜂群工程师', role: '部署支援',
    trait: '子弹轻度追踪并弹射 1 次，基础伤害 -8%。',
    color: 0x22d3ee, path: 'engineer', signatureSkill: 'sentry', requiredChapter: 3,
  },
];

export function getOperative(id: string | null | undefined): OperativeDef {
  return OPERATIVES.find(item => item.id === id) ?? OPERATIVES[0];
}
