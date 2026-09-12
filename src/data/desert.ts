/** Authored geometry for the three local awnings; no dynamic pose is persisted. */
export interface DesertPoint { readonly x: number; readonly y: number }
export type DesertPuzzleId = 'lesson' | 'stones' | 'courtyard';
export type DesertCheckpoint = 'start' | DesertPuzzleId;
export type DesertAnchorId = 'lesson' | 'stones-west' | 'stones-east' | 'courtyard';
export interface DesertPath { readonly id: string; readonly width: number; readonly waypoints: readonly DesertPoint[] }
export interface DesertPlaza extends DesertPoint { readonly id: string; readonly radius: number }
export interface DesertObstacle { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DesertRoute { readonly id: DesertAnchorId; readonly waypoints: readonly DesertPoint[] }
export interface DesertAnchor {
  readonly id: DesertAnchorId; readonly puzzle: DesertPuzzleId; readonly label: string;
  readonly command: DesertPoint; readonly echo: DesertPoint; readonly foldedGrip: DesertPoint; readonly route: DesertRoute;
}
export interface DesertTarget extends DesertPoint { readonly id: string; readonly label: string; readonly radius: number }
export interface DesertPuzzle { readonly id: DesertPuzzleId; readonly label: string; readonly readTargetId: string; readonly targets: readonly DesertTarget[] }
const point = (x: number, y: number): DesertPoint => Object.freeze({ x, y });
const points = (...values: readonly [number, number][]): readonly DesertPoint[] => Object.freeze(values.map(([x, y]) => point(x, y)));
const route = (id: DesertAnchorId, ...values: readonly [number, number][]): DesertRoute => Object.freeze({ id, waypoints: points(...values) });
const target = (id: string, label: string, x: number, y: number): DesertTarget => Object.freeze({ id, label, x, y, radius: 16 });
export const DESERT_WORLD = Object.freeze({ width: 2400, height: 1650 });
export const DESERT_CHECKPOINTS: Readonly<Record<DesertCheckpoint, DesertPoint>> = Object.freeze({
  start: point(230, 1400), lesson: point(1020, 1100), stones: point(1640, 650), courtyard: point(2120, 420),
});
export const DESERT_SPAWN = DESERT_CHECKPOINTS.start;
export const DESERT_NPC = Object.freeze({ x: 2200, y: 340, label: '仙人掌 · 团刺' });
export const DESERT_DISCOVERY = Object.freeze({ x: 2050, y: 650, label: '第六块软垫' });
export const DESERT_ANCHORS: Readonly<Record<DesertAnchorId, DesertAnchor>> = Object.freeze({
  lesson: Object.freeze({ id: 'lesson', puzzle: 'lesson', label: '卷叶小棚', command: point(430, 1260), echo: point(500, 1200), foldedGrip: point(540, 1200),
    route: route('lesson', [430, 1260], [470, 1260], [500, 1200]) }),
  'stones-west': Object.freeze({ id: 'stones-west', puzzle: 'stones', label: '石堆西侧棚脚', command: point(1190, 1030), echo: point(1270, 980), foldedGrip: point(1230, 980),
    route: route('stones-west', [1190, 1030], [1230, 1030], [1270, 980]) }),
  'stones-east': Object.freeze({ id: 'stones-east', puzzle: 'stones', label: '绕石后的棚脚', command: point(1200, 780), echo: point(1420, 740), foldedGrip: point(1460, 740),
    route: route('stones-east', [1200, 780], [1300, 700], [1420, 740]) }),
  courtyard: Object.freeze({ id: 'courtyard', puzzle: 'courtyard', label: '并排小院棚', command: point(1690, 570), echo: point(1750, 500), foldedGrip: point(1790, 500),
    route: route('courtyard', [1690, 570], [1750, 570], [1750, 500]) }),
});
export const DESERT_PUZZLES: Readonly<Record<DesertPuzzleId, DesertPuzzle>> = Object.freeze({
  lesson: Object.freeze({ id: 'lesson', label: '给卷叶一点阴凉', readTargetId: 'lesson-sign', targets: Object.freeze([target('lesson-sign', '卷叶门牌', 690, 1235)]) }),
  stones: Object.freeze({ id: 'stones', label: '把阴凉搬到石堆另一边', readTargetId: 'stones-sign', targets: Object.freeze([target('stones-sign', '石堆后的门牌', 1620, 775)]) }),
  courtyard: Object.freeze({ id: 'courtyard', label: '两个人都舒服的位置', readTargetId: 'courtyard-sign', targets: Object.freeze([
    target('courtyard-sign', '条纹棚下的门牌', 1950, 475), target('courtyard-cushion', '软垫卷叶', 1820, 540),
  ]) }),
});
export const DESERT_OBSTACLES: readonly DesertObstacle[] = Object.freeze([
  Object.freeze({ id: 'warm-stones', x: 1320, y: 860, width: 180, height: 180 }),
]);
export const DESERT_PATHS: readonly DesertPath[] = Object.freeze([
  Object.freeze({ id: 'post-road', width: 180, waypoints: points([230, 1400], [410, 1320], [500, 1200]) }),
  Object.freeze({ id: 'courtyard-road', width: 180, waypoints: points([740, 1200], [1020, 1100], [1190, 1030], [1200, 780], [1300, 700], [1420, 740]) }),
  Object.freeze({ id: 'upper-road', width: 180, waypoints: points([1420, 740], [1640, 650], [1750, 500]) }),
  Object.freeze({ id: 'mail-road', width: 180, waypoints: points([1990, 500], [2120, 420], [2200, 340]) }),
  Object.freeze({ id: 'cushion-road', width: 160, waypoints: points([1990, 500], [2050, 650], [2200, 570], [2200, 340]) }),
  ...Object.values(DESERT_ANCHORS).map(anchor => Object.freeze({ id: `echo-${anchor.id}`, width: 150, waypoints: anchor.route.waypoints })),
]);
export const DESERT_PLAZAS: readonly DesertPlaza[] = Object.freeze([
  Object.freeze({ id: 'post', x: 230, y: 1400, radius: 130 }),
  Object.freeze({ id: 'lesson-turning', x: 500, y: 1200, radius: 290 }),
  Object.freeze({ id: 'stone-west', x: 1190, y: 1010, radius: 150 }),
  Object.freeze({ id: 'stone-top', x: 1300, y: 710, radius: 135 }),
  Object.freeze({ id: 'stone-east', x: 1420, y: 740, radius: 290 }),
  Object.freeze({ id: 'courtyard-turning', x: 1750, y: 500, radius: 290 }),
  Object.freeze({ id: 'mail', x: 2200, y: 340, radius: 130 }),
  Object.freeze({ id: 'sixth-cushion', x: 2050, y: 650, radius: 105 }),
]);
export function isDesertPoint(value: unknown): value is DesertPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as DesertPoint;
  return typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)
    && p.x >= 0 && p.y >= 0 && p.x <= DESERT_WORLD.width && p.y <= DESERT_WORLD.height;
}
export function isDesertAnchor(value: unknown): value is DesertAnchorId { return value === 'lesson' || value === 'stones-west' || value === 'stones-east' || value === 'courtyard'; }
export function isDesertPuzzle(value: unknown): value is DesertPuzzleId { return value === 'lesson' || value === 'stones' || value === 'courtyard'; }
function distanceToSegment(p: DesertPoint, a: DesertPoint, b: DesertPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Rounded continuous paths, with the whole actor footprint outside the stones. */
export function isDesertSafe(p: DesertPoint, bodyRadius = 12): boolean {
  if (!isDesertPoint(p) || typeof bodyRadius !== 'number' || !Number.isFinite(bodyRadius) || bodyRadius < 0 || bodyRadius > 40) return false;
  if (p.x < bodyRadius || p.y < bodyRadius || p.x > DESERT_WORLD.width - bodyRadius || p.y > DESERT_WORLD.height - bodyRadius) return false;
  if (DESERT_OBSTACLES.some(box => p.x >= box.x - bodyRadius && p.x <= box.x + box.width + bodyRadius
    && p.y >= box.y - bodyRadius && p.y <= box.y + box.height + bodyRadius)) return false;
  return DESERT_PLAZAS.some(plaza => Math.hypot(p.x - plaza.x, p.y - plaza.y) <= plaza.radius - bodyRadius)
    || DESERT_PATHS.some(path => path.waypoints.slice(1).some((end, i) => distanceToSegment(p, path.waypoints[i], end) <= path.width / 2 - bodyRadius));
}
