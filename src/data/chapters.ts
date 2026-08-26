import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';

export type HazardKind = 'none' | 'sand' | 'tide' | 'pulse';

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  phase?: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  label: string;
}

export interface ChapterDef {
  id: number;
  name: string;
  subtitle: string;
  specialName: string;
  specialDesc: string;
  colors: { ground: number; grid: number; accent: number; detail: number; hazard: number };
  coreHp: number;
  enemyHpScale: number;
  enemyDamageScale: number;
  spawnPoints: SpawnPoint[];
  obstacles: MapRect[];
  hazards: MapRect[];
  hazardKind: HazardKind;
}

const W = ARENA_WIDTH;
const H = ARENA_HEIGHT;

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1,
    name: '林海前哨',
    subtitle: '两条兽径 · 学会截击与利用掩体',
    specialName: '古木掩体',
    specialDesc: '树群会阻挡双方子弹；敌军只从南北兽径推进。',
    colors: { ground: 0x07150f, grid: 0x163d2a, accent: 0x4ade80, detail: 0x22543d, hazard: 0x166534 },
    coreHp: 360,
    enemyHpScale: 1,
    enemyDamageScale: 1,
    spawnPoints: [
      { x: W * 0.36, y: 46, label: '北侧兽径' },
      { x: W * 0.64, y: H - 46, label: '南侧兽径' },
    ],
    obstacles: [
      { x: 300, y: 330, width: 170, height: 72 },
      { x: W - 300, y: H - 330, width: 170, height: 72 },
      { x: 330, y: H - 270, width: 92, height: 150 },
      { x: W - 330, y: 270, width: 92, height: 150 },
    ],
    hazards: [],
    hazardKind: 'none',
  },
  {
    id: 2,
    name: '赤砂遗迹',
    subtitle: '东西夹击 · 在流沙带之间转移火力',
    specialName: '流沙带',
    specialDesc: '金色流沙降低先锋 24% 移速、敌军 12% 移速。',
    colors: { ground: 0x1d1409, grid: 0x5b3a16, accent: 0xf59e0b, detail: 0x78350f, hazard: 0xd97706 },
    coreHp: 400,
    enemyHpScale: 1.12,
    enemyDamageScale: 1.06,
    spawnPoints: [
      { x: 46, y: H * 0.34, label: '西侧峡口' },
      { x: W - 46, y: H * 0.66, label: '东侧峡口' },
      { x: W - 46, y: H * 0.28, label: '东北裂谷' },
    ],
    obstacles: [
      { x: 430, y: 245, width: 210, height: 62 },
      { x: W - 430, y: H - 245, width: 210, height: 62 },
      { x: W * 0.5, y: 170, width: 90, height: 130 },
      { x: W * 0.5, y: H - 170, width: 90, height: 130 },
    ],
    hazards: [
      { x: W * 0.3, y: H * 0.5, width: 150, height: 560 },
      { x: W * 0.7, y: H * 0.5, width: 150, height: 560 },
    ],
    hazardKind: 'sand',
  },
  {
    id: 3,
    name: '沉潮港湾',
    subtitle: '三座栈桥 · 观察潮汐后选择防守通道',
    specialName: '交替潮汐',
    specialDesc: '左右水道每 5 秒交替涨潮，身处其中的所有单位减速。',
    colors: { ground: 0x071827, grid: 0x164e63, accent: 0x22d3ee, detail: 0x155e75, hazard: 0x0891b2 },
    coreHp: 440,
    enemyHpScale: 1.25,
    enemyDamageScale: 1.12,
    spawnPoints: [
      { x: 52, y: H * 0.5, label: '西栈桥' },
      { x: W * 0.5, y: 46, label: '北栈桥' },
      { x: W - 52, y: H * 0.5, label: '东栈桥' },
    ],
    obstacles: [
      { x: 350, y: 260, width: 150, height: 78 },
      { x: 350, y: H - 260, width: 150, height: 78 },
      { x: W - 350, y: 260, width: 150, height: 78 },
      { x: W - 350, y: H - 260, width: 150, height: 78 },
    ],
    hazards: [
      { x: W * 0.28, y: H * 0.5, width: 170, height: 720, phase: 0 },
      { x: W * 0.72, y: H * 0.5, width: 170, height: 720, phase: 1 },
    ],
    hazardKind: 'tide',
  },
  {
    id: 4,
    name: '霓虹围城',
    subtitle: '终局街区 · 借助电轨反制军团混编',
    specialName: '脉冲电轨',
    specialDesc: '紫色电轨周期充能；爆发时伤害轨道内的敌我单位。',
    colors: { ground: 0x0d0718, grid: 0x3b1d5c, accent: 0xc084fc, detail: 0x581c87, hazard: 0xa855f7 },
    coreHp: 500,
    enemyHpScale: 1.38,
    enemyDamageScale: 1.18,
    spawnPoints: [
      { x: 50, y: H * 0.3, label: '西街口' },
      { x: W - 50, y: H * 0.7, label: '东街口' },
      { x: W * 0.32, y: 46, label: '北高架' },
      { x: W * 0.68, y: H - 46, label: '南高架' },
    ],
    obstacles: [
      { x: 360, y: 300, width: 190, height: 66 },
      { x: W - 360, y: 300, width: 190, height: 66 },
      { x: 360, y: H - 300, width: 190, height: 66 },
      { x: W - 360, y: H - 300, width: 190, height: 66 },
      { x: W * 0.5, y: 175, width: 76, height: 120 },
      { x: W * 0.5, y: H - 175, width: 76, height: 120 },
    ],
    hazards: [
      { x: W * 0.5, y: H * 0.28, width: 720, height: 82, phase: 0 },
      { x: W * 0.5, y: H * 0.72, width: 720, height: 82, phase: 1 },
    ],
    hazardKind: 'pulse',
  },
];

export function getChapter(level: number, endless = false): ChapterDef {
  if (endless) return CHAPTERS[(Math.max(1, level) - 1) % CHAPTERS.length];
  return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, level - 1))];
}

export function pointInRect(x: number, y: number, rect: MapRect): boolean {
  return Math.abs(x - rect.x) <= rect.width / 2 && Math.abs(y - rect.y) <= rect.height / 2;
}
