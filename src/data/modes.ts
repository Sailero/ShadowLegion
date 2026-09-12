import type { WaveDef } from './enemies';

export type GameMode = 'campaign' | 'endless' | 'shadow';
export interface ShadowTrialDef {
  tier: number;
  name: string;
  description: string;
  lesson: string;
  color: number;
  healthScale: number;
  volleyCount: number;
  telegraphMs: number;
  bulletSpeed: number;
  damage: number;
  rivals: number;
}

/** Finite, repeatable duels. No timer penalty: learn the tells at your own pace. */
export const SHADOW_TRIALS: ShadowTrialDef[] = [
  { tier: 1, name: '初次击掌', description: '三轮单人切磋，认识昨天的自己。', lesson: '看清蓄力线，向侧面轻跃。', color: 0x769878, healthScale: 1, volleyCount: 1, telegraphMs: 850, bulletSpeed: 200, damage: 7, rivals: 1 },
  { tier: 2, name: '纸风车回旋', description: '扇形纸片开始展开，寻找弹幕空隙。', lesson: '别一直后退，绕着影子移动。', color: 0xba9667, healthScale: 1.12, volleyCount: 3, telegraphMs: 800, bulletSpeed: 215, damage: 8, rivals: 1 },
  { tier: 3, name: '薄荷快步', description: '更快的走位和连续蓄力，练习读招。', lesson: '把闪避留给无法步行绕开的纸片。', color: 0x66a69b, healthScale: 1.25, volleyCount: 3, telegraphMs: 700, bulletSpeed: 235, damage: 9, rivals: 1 },
  { tier: 4, name: '花灯双人舞', description: '两位影子错拍出招，考验目标选择。', lesson: '借花架挡住一侧，先化解另一侧。', color: 0xb78290, healthScale: 0.9, volleyCount: 3, telegraphMs: 800, bulletSpeed: 215, damage: 8, rivals: 2 },
  { tier: 5, name: '昨日游园会', description: '五瓣纸花与双影合奏，完成最后的击掌。', lesson: '保留退路，用技能打开重新站位的空间。', color: 0xb39955, healthScale: 1.08, volleyCount: 5, telegraphMs: 850, bulletSpeed: 225, damage: 9, rivals: 2 },
];

export function getShadowTrial(tier: number): ShadowTrialDef {
  return SHADOW_TRIALS[Math.max(0, Math.min(4, Math.floor(Number.isFinite(tier) ? tier : 1) - 1))];
}

export function getShadowTrialWaves(tier: number): WaveDef[] {
  const trial = getShadowTrial(tier);
  return ['热身击掌', '默契加演', '最后一支舞'].map((name, i) => ({
    name: `${trial.name} · ${name}`, hint: i === 0 ? trial.lesson : '清空本轮镜像即可前进；营地在切磋中不会受伤。', spawns: [],
  }));
}
