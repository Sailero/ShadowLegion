export interface WaveSpawn {
  type: string;
  min: number;
  max: number;
  elite?: boolean;
}

export interface WaveDef {
  spawns: WaveSpawn[];
  isBoss?: boolean;
  bossType?: string;
  name: string;
  hint: string;
}

const S = (type: string, min: number, max: number, elite = false): WaveSpawn =>
  ({ type, min, max, elite });

const W = (name: string, hint: string, ...spawns: WaveSpawn[]): WaveDef => ({ spawns, name, hint });

const Boss = (name: string, hint: string, bossType: string, ...spawns: WaveSpawn[]): WaveDef =>
  ({ spawns, isBoss: true, bossType, name, hint });

export const LEVEL_WAVES: WaveDef[][] = [
  // Phase 1: a complete 6–10 minute run with a readable difficulty curve.
  [
    W('接触', '熟悉移动与射击', S('slime', 4, 4)),
    W('侧翼', '高速敌人会绕向你的侧面', S('slime', 4, 5), S('bat', 2, 3)),
    W('火力线', '优先处理橙色远程单位', S('slime', 3, 4), S('bat', 3, 4), S('archer', 2, 2)),
    W('破阵', '重甲逼近时保留闪避', S('slime', 4, 5), S('archer', 2, 3), S('tank', 1, 1, true)),
    W('猎杀者', '青色忍者会突进并闪避子弹', S('bat', 4, 5), S('tank', 1, 2), S('ninja', 2, 2)),
    W('交叉火力', '移动中寻找弹幕缺口', S('slime', 5, 6), S('bat', 4, 5), S('archer', 3, 3), S('ninja', 1, 2)),
    W('最终防线', '精英与混编小队同时入场', S('slime', 5, 6), S('bat', 4, 5), S('archer', 3, 4), S('tank', 2, 2), S('ninja', 2, 2), S('bat', 1, 1, true)),
    Boss('军团核心', '观察红色预警线，闪避首领冲锋', 'summoner', S('slime', 4, 4), S('bat', 3, 3), S('archer', 2, 2), S('tank', 1, 1)),
  ],
];
