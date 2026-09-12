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
    name: '暖风草地',
    subtitle: '南北两条小径 · 你去截击，影伴照看营地',
    specialName: '树荫掩体',
    specialDesc: '树群阻挡双方弹丸。绕树断开远程火力，按 E 安排影伴守营。',
    colors: { ground: 0xe3ead1, grid: 0xd3ddbd, accent: 0x62966d, detail: 0xa1b881, hazard: 0x9db679 },
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
    name: '杏沙小镇',
    subtitle: '东西三条来路 · 把橡果龟引进软沙再转线',
    specialName: '软绵绵沙带',
    specialDesc: '杏色软沙使你和影伴减速 24%、对手减速 12%。闪避穿沙，绕侧面回营。',
    colors: { ground: 0xf2dfbf, grid: 0xe4cba5, accent: 0xbd8552, detail: 0xd6b687, hazard: 0xd4a369 },
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
    name: '薄荷港湾',
    subtitle: '三座栈桥 · 趁退潮转线，让影伴守住另一侧',
    specialName: '交替潮汐',
    specialDesc: '左右水道每 5 秒交替涨潮，潮水让双方减速。提前换到退潮一侧再截击。',
    colors: { ground: 0xdceddf, grid: 0xbfdacf, accent: 0x4d988c, detail: 0x93beb0, hazard: 0x73b6ac },
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
    name: '花灯集市',
    subtitle: '四个街口 · 把来客引向烟花灯带',
    specialName: '烟花灯带',
    specialDesc: '灯带闪烁预告后绽放，会伤到双方。引来对手，再闪避出灯带借一束花火。',
    colors: { ground: 0xf0dfd0, grid: 0xdfc7b8, accent: 0xb67b88, detail: 0xcba7a1, hazard: 0xc58ba0 },
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
