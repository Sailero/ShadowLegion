import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';
import { getChapter, type ChapterDef, type MapRect } from './chapters';
import type { WaveDef, WaveSpawn } from './enemies';

export type StageGoalKind = 'core' | 'time' | 'dash' | 'skill' | 'terrain' | 'command' | 'intercept' | 'priority';
export interface StageGoal { kind: StageGoalKind; target: number; label: string }
export type StageLayout = 'open' | 'split' | 'staggered' | 'corridor' | 'ring' | 'cross' | 'islands' | 'zigzag' | 'garden' | 'arena';
export interface StageWaveDef extends WaveDef {
  lanes: number[];
  spawnIntervalMs: number;
  bossHpScale?: number;
}
export interface StageDef {
  id: number;
  chapter: number;
  index: number;
  label: string;
  name: string;
  description: string;
  objective: StageGoal;
  bonusObjective: StageGoal;
  waves: StageWaveDef[];
  mapVariant: { id: string; name: string; layout: StageLayout };
  targetSeconds: number;
  kind: 'standard' | 'elite' | 'boss';
  rewards: { firstClear: number; replay: number; newStar: number };
}

export interface StageMetrics {
  victory: boolean;
  durationSec: number;
  coreRatio: number;
  hpRatio?: number;
  skills?: number;
  dashes?: number;
  terrainHits?: number;
  commands?: number;
  intercepts?: number;
  priorityKills?: number;
}

type SpawnSpec = [type: string, count: number, elite?: boolean];
interface EncounterSpec { lanes: number[]; units: SpawnSpec[]; boss?: string }
interface StageSeed {
  name: string;
  description: string;
  goal: StageGoal;
  bonus: StageGoal;
  encounters: EncounterSpec[];
}
const E = (lanes: number[], units: SpawnSpec[], boss?: string): EncounterSpec => ({ lanes, units, boss });
const G = (kind: StageGoalKind, target: number, label: string): StageGoal => ({ kind, target, label });
const C = (ratio: number): StageGoal => G('core', ratio, `通关时营地生命不低于 ${Math.round(ratio * 100)}%`);
const T = (seconds: number): StageGoal => G('time', seconds, `在 ${seconds} 秒内完成本关`);
const D = (count: number): StageGoal => G('dash', count, `使用 ${count} 次闪避，练习转线与回防`);
const S = (count: number): StageGoal => G('skill', count, `释放 ${count} 次拿手技能`);
const H = (count: number): StageGoal => G('terrain', count, `命中危险区中的对手 ${count} 次`);
const L = (count: number): StageGoal => G('terrain', count, `借烟花灯带造成 ${count} 次有效伤害`);
const P = (count: number): StageGoal => G('priority', count, `在营地外围优先击退 ${count} 位后排来客或南瓜`);
const I = (count: number): StageGoal => G('intercept', count, `在距营地至少 240 步处截住 ${count} 位来客`);
const A = (count: number): StageGoal => G('command', count, `安排影伴切换同行 / 守营 ${count} 次`);

/**
 * Every row authors an encounter sequence, tactical stamp and route set.
 * Difficulty comes from their combination; stage IDs are permanent save keys.
 */
const CHAPTER_STAGE_SEEDS: StageSeed[][] = [
  [
    { name: '第一盏营灯', description: '从北边的小径认识营地。按 E 给影伴一个安排，再去迎接第一批来客。', goal: A(1), bonus: C(.8), encounters: [E([0], [['slime', 6]]), E([0], [['slime', 6], ['bat', 3]])] },
    { name: '扑棱信件', description: '南侧的小飞蛾送信很急。保留闪避，在营地外围接住它们。', goal: D(3), bonus: I(5), encounters: [E([1], [['bat', 6], ['slime', 4]]), E([0, 1], [['bat', 8], ['slime', 6]])] },
    { name: '树荫借位', description: '蘑菇投手藏在树后。沿错开的树荫接近它们，让营灯留在掩体之后。', goal: P(5), bonus: C(.75), encounters: [E([0], [['archer', 3], ['slime', 6]]), E([1, 0], [['archer', 4], ['bat', 5]])] },
    { name: '两边都照看', description: '前一批从北边来，后一批绕到南边。把影伴留给正在承压的一侧。', goal: A(2), bonus: T(155), encounters: [E([0], [['slime', 10], ['archer', 2]]), E([1], [['bat', 8], ['slime', 8]])] },
    { name: '橡果守门员', description: '穿过半环树篱，迎接草地精英。读懂冲锋走廊，比围着营地转圈更有效。', goal: C(.65), bonus: D(5), encounters: [E([0, 1], [['slime', 8], ['bat', 5]]), E([1], [['tank', 2], ['archer', 3]]), E([0], [['slime', 5], ['bat', 4]], 'tank')] },
    { name: '叶团接力', description: '宽阔来路让叶团团排成队。主动走远一点，把压力留在营地之外。', goal: I(10), bonus: T(165), encounters: [E([1, 0], [['slime', 16], ['bat', 3]]), E([0, 1], [['slime', 14], ['tank', 2]])] },
    { name: '树下小茶桌', description: '薄荷茶师开始给同伴续杯。绕过分散花坛，先收拾会治疗的后排。', goal: P(5), bonus: C(.75), encounters: [E([0], [['medic', 2], ['tank', 2], ['slime', 6]]), E([1, 0], [['medic', 3], ['archer', 3], ['bat', 5]])] },
    { name: '软垫集合', description: '折线树篱把来客分成两段。攒好灵感，等它们靠拢时使出拿手技能。', goal: S(3), bonus: C(.7), encounters: [E([1], [['slime', 12], ['tank', 2]]), E([0, 1], [['slime', 12], ['archer', 4], ['bat', 4]])] },
    { name: '满筐的风', description: '花圃两侧都是飞蛾与投手。先出门截击，再回营处理慢慢靠近的大块头。', goal: I(10), bonus: P(5), encounters: [E([0, 1], [['bat', 10], ['archer', 3]]), E([1, 0], [['tank', 3], ['archer', 4], ['slime', 7]])] },
    { name: '草地毕业照', description: '南北路线一起热闹起来。和影伴分好工，完成橡果大块头的最后一场练习。', goal: C(.7), bonus: T(225), encounters: [E([0, 1], [['slime', 12], ['bat', 6]]), E([1, 0], [['archer', 5], ['tank', 3]]), E([0, 1], [['medic', 2], ['bat', 5]], 'tank')] },
  ],
  [
    { name: '杏沙第一步', description: '软沙会拖慢双方。让对手走进沙带，你沿边缘找一个舒服的射击位置。', goal: H(10), bonus: C(.8), encounters: [E([0], [['slime', 10], ['tank', 2]]), E([1], [['tank', 3], ['archer', 4]])] },
    { name: '面包巷拐角', description: '东西两条窄巷轮流来客。用闪避跨过软沙，不要一直站在巷口硬接。', goal: D(5), bonus: T(170), encounters: [E([0], [['archer', 5], ['slime', 8]]), E([1, 2], [['bat', 9], ['archer', 4]])] },
    { name: '彩屑午后', description: '南瓜靠近后会撒开彩屑。主动接近吸引它，再在圆圈出现时离开。', goal: P(7), bonus: C(.7), encounters: [E([1], [['bomber', 4], ['slime', 8]]), E([0, 2], [['bomber', 4], ['archer', 4], ['bat', 4]])] },
    { name: '慢半拍商队', description: '橡果龟和投手结伴过沙。把前排留在减速区，顺着走廊切入后排。', goal: H(16), bonus: I(7), encounters: [E([0, 1], [['tank', 3], ['archer', 4]]), E([2, 0], [['tank', 2], ['slime', 10], ['medic', 2]])] },
    { name: '午茶擂台', description: '精英投球手在半环矮墙间等你。留意先齐射、后冲锋的节奏。', goal: D(5), bonus: P(8), encounters: [E([0], [['archer', 5], ['bat', 5]]), E([1, 2], [['bomber', 4], ['tank', 2]]), E([2], [['slime', 7], ['medic', 2]], 'archer')] },
    { name: '三封快递', description: '三个入口分批送来不同来客。先看清是哪一路，再决定自己和影伴各守哪里。', goal: A(3), bonus: C(.75), encounters: [E([2], [['ninja', 4], ['bat', 6]]), E([0, 1], [['archer', 5], ['tank', 3], ['slime', 7]])] },
    { name: '沙边小药铺', description: '茶师的花坛隔开了弹道。把队伍引入沙带，先打断治疗再处理前排。', goal: P(8), bonus: H(12), encounters: [E([0, 2], [['medic', 3], ['tank', 3], ['slime', 6]]), E([1, 2], [['medic', 3], ['archer', 4], ['bomber', 3]])] },
    { name: '绕个小远路', description: '折线围墙让回营需要多想一步。把飞蛾截在外面，别让慢龟和快递一起到家。', goal: I(11), bonus: T(185), encounters: [E([2, 0], [['bat', 12], ['tank', 2]]), E([1, 0], [['ninja', 5], ['slime', 9], ['archer', 3]])] },
    { name: '杏色花火节', description: '来客喜欢围成一团。以技能接住密集队伍，再把落单南瓜带离营地。', goal: S(4), bonus: H(15), encounters: [E([0, 1, 2], [['slime', 16], ['bomber', 4]]), E([2, 1], [['tank', 4], ['medic', 3], ['archer', 4]])] },
    { name: '小镇合影日', description: '投球王把三条街的朋友都请来了。沙带、掩体和伙伴指令要一起派上用场。', goal: H(20), bonus: C(.65), encounters: [E([0, 1], [['tank', 3], ['archer', 5], ['bat', 5]]), E([2, 0], [['bomber', 5], ['medic', 3], ['slime', 7]]), E([1, 2], [['ninja', 4], ['archer', 3]], 'archer')] },
  ],
  [
    { name: '薄荷涨潮时', description: '左右水道轮流涨潮。用第一批慢来客观察节奏，下一批改走退水路线。', goal: H(12), bonus: C(.8), encounters: [E([0], [['slime', 12], ['tank', 2]]), E([2], [['archer', 4], ['ninja', 4], ['slime', 6]])] },
    { name: '码头纸飞机', description: '纸燕会在中距离突然加速。用闪避离开它的冲刺线，再截住它的回头路。', goal: D(6), bonus: I(9), encounters: [E([1], [['ninja', 5], ['bat', 6]]), E([0, 2], [['ninja', 6], ['archer', 3]])] },
    { name: '花朵邀请函', description: '召集员会不断招呼叶团团。先沿栈桥找到花瓣脸，再回头收拾散开的队伍。', goal: P(5), bonus: T(180), encounters: [E([0, 1], [['summoner', 2], ['archer', 3], ['slime', 7]]), E([2, 1], [['summoner', 3], ['bat', 8], ['tank', 2]])] },
    { name: '桥头换班', description: '你和影伴轮流照看桥头。潮水亮起时，把主战场换到对手不方便转向的一侧。', goal: A(3), bonus: H(16), encounters: [E([0], [['tank', 4], ['medic', 2]]), E([2, 1], [['ninja', 5], ['bomber', 4], ['slime', 8]])] },
    { name: '纸燕试飞员', description: '精英纸燕绕着桥头寻找角度。不要追着它转圈，提前站到退潮出口等待。', goal: D(6), bonus: C(.7), encounters: [E([0, 2], [['bat', 10], ['archer', 4]]), E([1], [['ninja', 5], ['summoner', 2]]), E([2], [['slime', 9], ['medic', 2]], 'ninja')] },
    { name: '双潮接力', description: '左右来客几乎同时到达。借涨潮让一队慢下来，把技能留给另一队。', goal: H(20), bonus: S(3), encounters: [E([0, 2], [['tank', 4], ['ninja', 5]]), E([2, 0], [['slime', 16], ['bomber', 4], ['archer', 3]])] },
    { name: '港湾移动茶会', description: '茶师和召集员在分散花坛间互相照看。绕开正面重甲，打散支援组合。', goal: P(10), bonus: I(8), encounters: [E([1, 0], [['medic', 3], ['summoner', 2], ['tank', 2]]), E([2, 1], [['medic', 3], ['archer', 4], ['bomber', 3]])] },
    { name: '转角见海风', description: '折线货箱会遮住弹道。把来客引到空地再射击，别在箱后浪费火力。', goal: I(12), bonus: T(195), encounters: [E([0, 1], [['ninja', 6], ['bat', 8]]), E([2, 0], [['archer', 5], ['tank', 3], ['slime', 9]])] },
    { name: '潮汐花火秀', description: '三桥同时来客，技能循环会比单纯追逐更可靠。按退潮顺序逐桥清理。', goal: S(4), bonus: H(18), encounters: [E([0, 1, 2], [['slime', 16], ['summoner', 3]]), E([2, 1, 0], [['tank', 4], ['ninja', 5], ['medic', 3]])] },
    { name: '港湾毕业航线', description: '纸燕滑翔手带着伙伴完成最后一次巡港。留意纸片齐射和冲锋之间的空当。', goal: C(.65), bonus: P(10), encounters: [E([1, 0], [['ninja', 5], ['archer', 5], ['bat', 6]]), E([2, 0], [['summoner', 3], ['medic', 3], ['tank', 3]]), E([0, 1, 2], [['bomber', 4], ['slime', 8]], 'ninja')] },
  ],
  [
    { name: '灯带开场', description: '南北街口的来客会经过灯带。先看闪烁预告，再在花火绽放前轻快走开。', goal: L(8), bonus: C(.8), encounters: [E([2], [['slime', 14], ['tank', 2]]), E([3], [['tank', 3], ['archer', 5]])] },
    { name: '东街点心队', description: '茶师带着大块头走东街。先截断治疗，别让它们一起坐到营灯边。', goal: P(7), bonus: I(8), encounters: [E([1], [['medic', 3], ['tank', 3], ['slime', 8]]), E([3, 1], [['medic', 3], ['archer', 4], ['bat', 6]])] },
    { name: '彩屑十字路', description: '南瓜从交错街口涌来。看清圆圈，再看清灯带，给闪避留一点余地。', goal: D(6), bonus: L(10), encounters: [E([2, 3], [['bomber', 6], ['slime', 10]]), E([0, 1], [['bomber', 5], ['ninja', 5], ['archer', 3]])] },
    { name: '暖灯换班表', description: '四个路口依次热闹起来。你去处理远程阵地，影伴负责身后的慢来客。', goal: A(3), bonus: C(.75), encounters: [E([0, 2], [['archer', 6], ['tank', 3]]), E([1, 3], [['ninja', 6], ['summoner', 3], ['slime', 8]])] },
    { name: '花朵小团长', description: '集市精英在灯带旁指挥队伍。不要只追着团长，把它招呼来的伙伴一起引向花火。', goal: L(12), bonus: P(10), encounters: [E([0, 1], [['archer', 5], ['medic', 3], ['slime', 8]]), E([2, 3], [['bomber', 5], ['tank', 3]]), E([1, 2], [['ninja', 4], ['bat', 5]], 'summoner')] },
    { name: '灯带借个光', description: '两束烟花隔街交替开放。让橡果龟慢慢经过，把自己的技能留给支援者。', goal: L(18), bonus: S(3), encounters: [E([0, 1], [['tank', 5], ['medic', 3]]), E([2, 3], [['summoner', 3], ['archer', 5], ['slime', 10]])] },
    { name: '四街急件', description: '纸燕和飞蛾穿过花坛。主动作远处拦截，比追着漏网来客回营更省力。', goal: I(14), bonus: T(205), encounters: [E([2, 3], [['ninja', 7], ['bat', 9]]), E([0, 1], [['ninja', 6], ['bomber', 5], ['archer', 4]])] },
    { name: '茶香绕街', description: '折线小摊把茶师和召集员分开。抓住它们尚未会合的时间窗口逐个处理。', goal: P(13), bonus: C(.7), encounters: [E([0, 2], [['medic', 4], ['summoner', 3], ['tank', 2]]), E([1, 3], [['archer', 5], ['summoner', 3], ['bomber', 4]])] },
    { name: '花灯大合奏', description: '一边是慢队伍，一边是快来客。用影伴指令和技能切换，把不同节奏分开。', goal: S(5), bonus: A(3), encounters: [E([0, 1], [['tank', 5], ['medic', 3], ['slime', 10]]), E([2, 3], [['ninja', 7], ['bat', 8], ['bomber', 4]])] },
    { name: '集市谢幕礼', description: '花灯大团长要检验你对四街的了解。先拆支援组合，再借灯带处理最后的巡游。', goal: L(16), bonus: C(.65), encounters: [E([0, 2], [['tank', 4], ['archer', 6], ['medic', 3]]), E([1, 3], [['ninja', 6], ['bomber', 5], ['summoner', 2]]), E([0, 1, 2, 3], [['medic', 3], ['bat', 6]], 'summoner')] },
  ],
  [
    { name: '走进晴空里', description: '十字溪谷让横向、纵向花桥轮流放慢。先观察水色，再把第一批来客引入溪流。', goal: H(15), bonus: C(.8), encounters: [E([0, 2], [['tank', 4], ['slime', 12]]), E([1, 3], [['archer', 6], ['ninja', 5], ['medic', 2]])] },
    { name: '四桥一封信', description: '纸燕从四座花桥送来急件。别急着追，站在它们必经的溪谷出口迎接。', goal: I(14), bonus: D(6), encounters: [E([0, 1], [['ninja', 7], ['bat', 9]]), E([2, 3], [['ninja', 6], ['archer', 5], ['slime', 8]])] },
    { name: '花园诊疗日', description: '茶师把橡果龟照顾得很好。穿过错落花坛，优先散开那片移动的小茶桌。', goal: P(12), bonus: H(16), encounters: [E([0, 3], [['medic', 4], ['tank', 4], ['archer', 3]]), E([1, 2], [['summoner', 3], ['medic', 3], ['bomber', 5]])] },
    { name: '十字路口见', description: '两条直路轮流推进。跟影伴商量好换班，转线时才不会把营灯留空。', goal: A(4), bonus: C(.75), encounters: [E([0, 2], [['tank', 5], ['summoner', 3]]), E([1, 3], [['ninja', 8], ['bomber', 5], ['archer', 4]])] },
    { name: '晴空见习长', description: '精英巡游长绕着溪谷试探。读冲锋、换退潮路，把前三章学到的办法一起用上。', goal: D(7), bonus: H(18), encounters: [E([0, 1], [['ninja', 6], ['medic', 3], ['slime', 10]]), E([2, 3], [['tank', 4], ['archer', 5], ['bomber', 4]]), E([0, 2], [['summoner', 2], ['bat', 6]], 'tank')] },
    { name: '影伴的远足', description: '你负责花桥外侧，影伴负责溪谷内侧。提前截住快来客，给慢队伍留出处理时间。', goal: I(16), bonus: A(3), encounters: [E([0, 3], [['bat', 12], ['ninja', 6], ['archer', 3]]), E([1, 2], [['tank', 5], ['medic', 3], ['slime', 10]])] },
    { name: '满园小帮手', description: '花朵和茶师组成了自己的搭档。用一轮技能打开空间，再把支援者分开。', goal: P(13), bonus: S(3), encounters: [E([0, 1, 2], [['summoner', 4], ['medic', 4], ['tank', 3]]), E([1, 2, 3], [['archer', 6], ['bomber', 5], ['ninja', 5]])] },
    { name: '溪谷慢镜头', description: '折线小桥让退路变得珍贵。把密集队伍留在涨水区，用技能帮自己换一个出口。', goal: H(24), bonus: S(4), encounters: [E([0, 2], [['slime', 18], ['tank', 5]]), E([1, 3], [['ninja', 7], ['bomber', 6], ['medic', 4]])] },
    { name: '巡游前夜', description: '四桥同时排起长队。先截快件、再拆后排，营地需要你和影伴有来有回。', goal: I(15), bonus: P(12), encounters: [E([0, 1, 2, 3], [['ninja', 8], ['archer', 6], ['bat', 8]]), E([3, 2, 1, 0], [['tank', 5], ['summoner', 4], ['medic', 4], ['bomber', 4]])] },
    { name: '把晴天带回家', description: '五段旅途在这里会合。让影伴照看营灯，借溪谷拆开来客，完成晴空巡游长的最终挑战。', goal: C(.65), bonus: H(25), encounters: [E([0, 2], [['tank', 5], ['archer', 6], ['medic', 4]]), E([1, 3], [['ninja', 8], ['summoner', 4], ['bomber', 5]]), E([0, 1, 2, 3], [['medic', 3], ['archer', 4], ['bat', 7]], 'tank')] },
  ],
];

const LAYOUTS: Array<{ layout: StageLayout; name: string }> = [
  { layout: 'open', name: '开阔来路' }, { layout: 'split', name: '左右换位' },
  { layout: 'staggered', name: '错落掩体' }, { layout: 'corridor', name: '双侧走廊' },
  { layout: 'ring', name: '半环练习场' }, { layout: 'cross', name: '十字转线' },
  { layout: 'islands', name: '分散花坛' }, { layout: 'zigzag', name: '折线小径' },
  { layout: 'garden', name: '花圃夹道' }, { layout: 'arena', name: '巡游广场' },
];

function makeWave(seed: StageSeed, encounter: EncounterSpec, chapter: number, index: number, waveIndex: number): StageWaveDef {
  const spawns: WaveSpawn[] = encounter.units.map(([type, count, elite]) => ({ type, min: count, max: count + (count >= 6 ? 2 : 0), elite: elite ?? false }));
  const phase = ['看清来路', '转线应对', index === 5 ? '精英切磋' : '巡游首领'][waveIndex];
  // Ranged bases have far less HP than a tank. Give the town/harbor leaders
  // enough exposure for their telegraphs without turning them into late bosses.
  const bossHpScale = chapter === 2 || chapter === 3 ? (index === 5 ? 1.65 : 2.25) : (index === 5 ? .65 : 1);
  return {
    name: `${seed.name} · ${phase}`, hint: waveIndex === 0 ? seed.description : seed.goal.label,
    spawns, lanes: [...encounter.lanes],
    spawnIntervalMs: Math.max(600, 1050 - chapter * 50 - index * 14 + waveIndex * 30),
    ...(encounter.boss ? { isBoss: true, bossType: encounter.boss, bossHpScale } : {}),
  };
}

export const STAGES: StageDef[] = CHAPTER_STAGE_SEEDS.flatMap((seeds, chapterIndex) => seeds.map((seed, index) => {
  const chapter = chapterIndex + 1;
  const localIndex = index + 1;
  const layout = LAYOUTS[index];
  return {
    id: chapterIndex * 10 + localIndex, chapter, index: localIndex, label: `${chapter}-${localIndex}`,
    name: seed.name, description: seed.description, objective: seed.goal, bonusObjective: seed.bonus,
    waves: seed.encounters.map((encounter, waveIndex) => makeWave(seed, encounter, chapter, localIndex, waveIndex)),
    mapVariant: { id: `chapter-${chapter}-${layout.layout}`, name: layout.name, layout: layout.layout },
    targetSeconds: localIndex % 5 === 0 ? 200 + chapter * 12 : 130 + chapter * 10 + localIndex * 3,
    kind: localIndex === 10 ? 'boss' : localIndex === 5 ? 'elite' : 'standard',
    rewards: { firstClear: 3, replay: 1, newStar: 1 },
  };
}));

export const STAGES_PER_CHAPTER = 10;
export const CAMPAIGN_STAGE_COUNT = STAGES.length;

export function getStage(id: number): StageDef {
  const index = Number.isFinite(id) ? Math.max(0, Math.min(STAGES.length - 1, Math.floor(id) - 1)) : 0;
  return STAGES[index];
}
export function stageIdFor(chapter: number, index: number): number {
  const safeChapter = Number.isFinite(chapter) ? Math.max(1, Math.min(5, Math.floor(chapter))) : 1;
  const safeIndex = Number.isFinite(index) ? Math.max(1, Math.min(10, Math.floor(index))) : 1;
  return (safeChapter - 1) * 10 + safeIndex;
}
export function getStagesForChapter(chapter: number): StageDef[] { return STAGES.filter(stage => stage.chapter === chapter); }
export function getNextStage(id: number): StageDef | null { return STAGES.find(stage => stage.id === id + 1) ?? null; }
export function getStageWaves(id: number): StageWaveDef[] {
  return getStage(id).waves.map(wave => ({ ...wave, lanes: [...wave.lanes], spawns: wave.spawns.map(spawn => ({ ...spawn })) }));
}

function blocksRoute(rect: MapRect, startX: number, startY: number): boolean {
  let enter = 0, leave = 1;
  const clearance = 36;
  const axes = [
    [startX, ARENA_WIDTH / 2 - startX, rect.x - rect.width / 2 - clearance, rect.x + rect.width / 2 + clearance],
    [startY, ARENA_HEIGHT / 2 - startY, rect.y - rect.height / 2 - clearance, rect.y + rect.height / 2 + clearance],
  ];
  for (const [origin, delta, min, max] of axes) {
    if (Math.abs(delta) < .0001) { if (origin < min || origin > max) return false; }
    else {
      const first = (min - origin) / delta, second = (max - origin) / delta;
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
      if (enter > leave) return false;
    }
  }
  return true;
}

/** Fresh map objects prevent one scene's decorations or physics from mutating another stage. */
export function getStageChapter(stageId: number): ChapterDef {
  const stage = getStage(stageId);
  const base = getChapter(stage.chapter);
  const W = ARENA_WIDTH, H = ARENA_HEIGHT, cx = W / 2, cy = H / 2;
  let obstacles: MapRect[] = base.obstacles.map(rect => ({ ...rect }));
  const box = (x: number, y: number, width: number, height: number): MapRect => ({ x, y, width, height });
  switch (stage.mapVariant.layout) {
    case 'split': obstacles = obstacles.map(rect => ({ ...rect, x: W - rect.x, y: rect.y + (rect.y < cy ? 45 : -45) })); break;
    case 'staggered': obstacles = obstacles.map((rect, index) => ({ ...rect, x: rect.x + (index % 2 ? -85 : 85), y: rect.y + (index % 2 ? 45 : -45) })); break;
    case 'corridor': obstacles = [box(cx - 220, cy, 70, 310), box(cx + 220, cy, 70, 310), box(360, 260, 180, 70), box(W - 360, H - 260, 180, 70)]; break;
    case 'ring': obstacles = [box(cx - 235, cy - 125, 115, 75), box(cx + 235, cy - 125, 115, 75), box(cx - 235, cy + 125, 115, 75), box(cx + 235, cy + 125, 115, 75)]; break;
    case 'cross': obstacles = [box(440, 325, 190, 90), box(W - 440, 325, 190, 90), box(440, H - 325, 190, 90), box(W - 440, H - 325, 190, 90)]; break;
    case 'islands': obstacles = [box(420, 250, 115, 90), box(680, 375, 105, 85), box(1060, 290, 145, 80), box(480, 820, 135, 95), box(960, 890, 115, 85), box(1210, 740, 105, 90)]; break;
    case 'zigzag': obstacles = [box(350, 390, 170, 65), box(640, 795, 170, 65), box(960, 370, 170, 65), box(1250, 815, 170, 65)]; break;
    case 'garden': obstacles = [box(420, 360, 90, 230), box(1180, 840, 90, 230), box(650, 235, 210, 65), box(950, 965, 210, 65)]; break;
    case 'arena': obstacles = [box(300, 300, 140, 80), box(W - 300, 300, 140, 80), box(300, H - 300, 140, 80), box(W - 300, H - 300, 140, 80)]; break;
  }
  // Enemies steer directly at camp and may spawn 70 pixels either side of a
  // route marker. Keep that full arrival band navigable, including large bosses.
  const arrivalPoints = base.spawnPoints.flatMap(lane => [-70, 0, 70].map(jitter => {
    const verticalEdge = lane.x < 100 || lane.x > W - 100;
    return { x: lane.x + (verticalEdge ? 0 : jitter), y: lane.y + (verticalEdge ? jitter : 0) };
  }));
  const offsets = [[0, 0], [90, 0], [-90, 0], [0, 90], [0, -90], [170, 0], [-170, 0], [0, 170], [0, -170], [0, 245], [0, -245], [245, 0], [-245, 0]];
  obstacles = obstacles.flatMap(rect => {
    for (const [dx, dy] of offsets) {
      const candidate = { ...rect, x: rect.x + dx, y: rect.y + dy };
      if (candidate.x - candidate.width / 2 < 35 || candidate.x + candidate.width / 2 > W - 35 ||
        candidate.y - candidate.height / 2 < 35 || candidate.y + candidate.height / 2 > H - 35) continue;
      if (arrivalPoints.every(lane => !blocksRoute(candidate, lane.x, lane.y))) return [candidate];
    }
    return [];
  });
  const offset = ((stage.index - 1) % 3 - 1) * 36;
  const hazards = base.hazards.map((rect, index) => {
    if (stage.mapVariant.layout === 'open') return { ...rect };
    const horizontal = rect.width > rect.height;
    return {
      ...rect,
      x: rect.x + (horizontal ? 0 : offset), y: rect.y + (horizontal ? offset : 0),
      width: horizontal ? rect.width + (stage.index % 2 ? -80 : 70) : rect.width,
      height: horizontal ? rect.height : rect.height + (stage.index % 2 ? -80 : 70),
      phase: base.hazardKind === 'sand' ? rect.phase : ((rect.phase ?? index) + Math.floor(stage.index / 3)) % 2,
    };
  });
  return {
    ...base, colors: { ...base.colors }, spawnPoints: base.spawnPoints.map(point => ({ ...point })), obstacles, hazards,
    subtitle: `${stage.label} ${stage.name} · ${stage.mapVariant.name}`,
    enemyHpScale: base.enemyHpScale * (1 + (stage.index - 1) * .012),
  };
}

export function isStageGoalMet(goal: StageGoal, result: StageMetrics): boolean {
  const finite = (value: number | undefined): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  if (goal.kind === 'time') return finite(result.durationSec) > 0 && finite(result.durationSec) <= goal.target;
  const values: Record<Exclude<StageGoalKind, 'time'>, number | undefined> = {
    core: result.coreRatio, dash: result.dashes, skill: result.skills, terrain: result.terrainHits,
    command: result.commands, intercept: result.intercepts, priority: result.priorityKills,
  };
  return finite(values[goal.kind]) >= goal.target;
}

export function calculateStageStars(stage: StageDef, result: StageMetrics): number {
  if (!result.victory) return 0;
  return 1 + Number(isStageGoalMet(stage.objective, result)) + Number(isStageGoalMet(stage.bonusObjective, result));
}
