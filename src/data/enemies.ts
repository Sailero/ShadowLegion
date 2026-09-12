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

/** Five-map endless route. Independent campaign stages live in stages.ts. */
export const LEVEL_WAVES: WaveDef[][] = [
  [
    W('小径来客', '守住营地；靠近敌军可把仇恨从营地拉到自己身上', S('slime', 4, 4)),
    W('树荫捉迷藏', '扑棱蛾会绕开正面火力，利用树群分割敌潮', S('slime', 4, 5), S('bat', 2, 3)),
    W('两路串门', '南北同时推进，先清理更接近营地的一侧', S('slime', 5, 6), S('bat', 3, 4)),
    W('大块头来啦', '橡果龟速度慢但会快速挤进营地', S('slime', 4, 5), S('bat', 3, 3), S('tank', 1, 1, true)),
    Boss('橡果大块头', '橙色走廊就是实际冲锋范围，离开走廊而非只躲红线', 'tank', S('slime', 4, 5), S('bat', 3, 3)),
  ],
  [
    W('杏沙投手', '蘑菇投手会保持距离射击营地，优先切入远程阵地', S('slime', 4, 5), S('archer', 2, 2)),
    W('软沙慢慢走', '把橡果龟引入流沙，再绕回防线输出', S('tank', 2, 2), S('archer', 2, 3)),
    W('彩屑要飞啦', '彩屑南瓜闪红后即将引爆，立刻离开圆形警戒区', S('slime', 4, 4), S('bomber', 2, 2)),
    W('小镇两头忙', '东西峡口同时来敌，别长期停留在同一侧', S('archer', 3, 3), S('tank', 2, 2), S('bomber', 2, 3)),
    Boss('蘑菇投球王', '远程齐射后会锁定冲锋；用小镇矮墙截断弹幕', 'archer', S('slime', 4, 5), S('bomber', 2, 2)),
  ],
  [
    W('栈桥快递', '三条窄路让来敌更可读，也更容易形成堵塞', S('bat', 4, 5), S('ninja', 1, 1)),
    W('薄荷涨潮时', '亮起的水道会减速，提前换到退潮侧拦截', S('slime', 4, 4), S('ninja', 2, 2)),
    W('港湾来做客', '花朵召集员会持续补充小怪，越晚处理压力越大', S('bat', 4, 5), S('summoner', 1, 2)),
    W('三桥接力', '高速单位与彩屑南瓜混编，保留闪避处理爆炸', S('ninja', 2, 3), S('bomber', 2, 2), S('summoner', 1, 1, true)),
    Boss('纸燕滑翔手', '连续纸片后锁定突进；借涨潮水道削弱其追击', 'ninja', S('bat', 4, 5), S('summoner', 1, 1)),
  ],
  [
    W('集市点心队', '薄荷茶师会治疗附近敌军，青色脉冲出现时立刻集火', S('tank', 2, 2), S('medic', 1, 1), S('slime', 4, 4)),
    W('借一束烟花', '灯带先闪烁预警再爆发；诱导敌潮进入轨道', S('archer', 3, 3), S('bomber', 2, 2), S('medic', 1, 1)),
    W('花灯大合唱', '四类职责协同出现，击杀顺序比单纯堆伤害重要', S('tank', 2, 2), S('ninja', 2, 2), S('summoner', 1, 1), S('medic', 1, 1)),
    W('最后一班来客', '精英薄荷茶师会让前排快速回满，主动穿过火线处理后排', S('archer', 3, 4), S('tank', 2, 2), S('bomber', 2, 3), S('medic', 1, 1, true)),
    Boss('花灯大团长', '预警走廊、召唤与环形弹幕会连续出现；灯带也是你的武器', 'summoner', S('tank', 2, 2), S('ninja', 2, 2), S('medic', 1, 1)),
  ],
  [
    W('花桥开门', '先截住纸燕快递，再回到退水的一侧照看营地', S('ninja', 3, 4), S('slime', 5, 6)),
    W('溪谷午茶', '薄荷茶师躲在橡果龟后面，绕过溪流处理后排', S('tank', 2, 3), S('medic', 2, 2), S('archer', 2, 3)),
    W('四桥接力赛', '四条来路依次加压，让影伴守住你暂时离开的一侧', S('bat', 5, 6), S('bomber', 3, 3), S('summoner', 1, 2)),
    W('满园都到齐', '别让召集员与茶师碰头，优先解决后排的互相支援', S('ninja', 3, 3), S('tank', 2, 2), S('summoner', 1, 1, true), S('medic', 2, 2)),
    Boss('晴空巡游长', '借交替溪流拖慢追击；冲锋前先给自己留一条退路', 'tank', S('archer', 3, 3), S('ninja', 2, 2), S('medic', 1, 1)),
  ],
];
