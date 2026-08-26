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

/** Four compact chapters. Each chapter introduces one new battlefield question. */
export const LEVEL_WAVES: WaveDef[][] = [
  [
    W('兽径接触', '守住信标；靠近敌军可把仇恨从信标拉到自己身上', S('slime', 4, 4)),
    W('林间侧翼', '蝙蝠会绕开正面火力，利用树群分割敌潮', S('slime', 4, 5), S('bat', 2, 3)),
    W('双径合流', '南北同时推进，先清理更接近信标的一侧', S('slime', 5, 6), S('bat', 3, 4)),
    W('古木重甲', '重甲速度慢但会快速压垮防线', S('slime', 4, 5), S('bat', 3, 3), S('tank', 1, 1, true)),
    Boss('腐林破城者', '橙色走廊就是实际冲锋范围，离开走廊而非只躲红线', 'tank', S('slime', 4, 5), S('bat', 3, 3)),
  ],
  [
    W('峡口火力', '弓手会保持距离射击信标，优先切入远程阵地', S('slime', 4, 5), S('archer', 2, 2)),
    W('流沙重压', '把重甲引入流沙，再绕回防线输出', S('tank', 2, 2), S('archer', 2, 3)),
    W('爆破预兆', '爆破兵闪红后即将引爆，立刻离开圆形警戒区', S('slime', 4, 4), S('bomber', 2, 2)),
    W('遗迹夹击', '东西峡口同时来敌，别长期停留在同一侧', S('archer', 3, 3), S('tank', 2, 2), S('bomber', 2, 3)),
    Boss('赤砂炮骑', '远程齐射后会锁定冲锋；用遗迹墙体截断弹幕', 'archer', S('slime', 4, 5), S('bomber', 2, 2)),
  ],
  [
    W('栈桥突袭', '三条窄路让来敌更可读，也更容易形成堵塞', S('bat', 4, 5), S('ninja', 1, 1)),
    W('涨潮时刻', '亮起的水道会减速，提前换到退潮侧拦截', S('slime', 4, 4), S('ninja', 2, 2)),
    W('港湾召集', '召唤师会持续补充小怪，越晚处理压力越大', S('bat', 4, 5), S('summoner', 1, 2)),
    W('三桥争夺', '高速单位与爆破兵混编，保留闪避处理爆炸', S('ninja', 2, 3), S('bomber', 2, 2), S('summoner', 1, 1, true)),
    Boss('深潮猎手', '连续飞镖后锁定突进；借涨潮水道削弱其追击', 'ninja', S('bat', 4, 5), S('summoner', 1, 1)),
  ],
  [
    W('街区修复队', '修复师会治疗附近敌军，青色脉冲出现时立刻集火', S('tank', 2, 2), S('medic', 1, 1), S('slime', 4, 4)),
    W('电轨实验', '电轨先闪烁预警再爆发；诱导敌潮进入轨道', S('archer', 3, 3), S('bomber', 2, 2), S('medic', 1, 1)),
    W('霓虹混编', '四类职责协同出现，击杀顺序比单纯堆伤害重要', S('tank', 2, 2), S('ninja', 2, 2), S('summoner', 1, 1), S('medic', 1, 1)),
    W('最后防线', '精英修复师会让前排快速回满，主动穿过火线处理后排', S('archer', 3, 4), S('tank', 2, 2), S('bomber', 2, 3), S('medic', 1, 1, true)),
    Boss('军团母巢', '预警走廊、召唤与环形弹幕会连续出现；电轨也是你的武器', 'summoner', S('tank', 2, 2), S('ninja', 2, 2), S('medic', 1, 1)),
  ],
];
