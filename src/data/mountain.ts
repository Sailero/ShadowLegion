/** Shared, authored walking geometry. None of these coordinates is saved progress. */
export interface MountainPoint { readonly x: number; readonly y: number }
export type MountainStationId = 'lesson' | 'pass';
export type MountainNote = 'leaf' | 'sun' | 'bell';
export type MountainActor = 'echo' | 'player';
export type MountainCheckpoint = 'start' | 'lesson' | 'pass';
export type MountainRouteId = 'lesson-echo' | 'pass-echo';
export interface MountainPath {
  readonly id: string;
  readonly kind: 'main' | 'wind' | 'echo';
  readonly width: number;
  readonly waypoints: readonly MountainPoint[];
}
export interface MountainPlaza extends MountainPoint {
  readonly id: string;
  readonly kind: 'main' | 'wind';
  readonly radius: number;
}
export interface MountainEchoRoute {
  readonly id: MountainRouteId;
  readonly station: MountainStationId;
  readonly waypoints: readonly MountainPoint[];
}
export interface MountainStation {
  readonly label: string;
  readonly instruction: MountainPoint;
  readonly command: MountainPoint;
  readonly echo: MountainPoint;
  readonly playerBells: Readonly<Record<MountainNote, MountainPoint>>;
  readonly pattern: readonly MountainNote[];
  readonly owners: readonly MountainActor[];
  readonly routeId: MountainRouteId;
}
const point = (x: number, y: number): MountainPoint => Object.freeze({ x, y });
const points = (...values: readonly [number, number][]): readonly MountainPoint[] => Object.freeze(values.map(([x, y]) => point(x, y)));
export const MOUNTAIN_WORLD = Object.freeze({ width: 2100, height: 1500 });
export const MOUNTAIN_NOTE_LABELS: Readonly<Record<MountainNote, string>> = Object.freeze({ leaf: '叶', sun: '日', bell: '铃' });
export const MOUNTAIN_ACTOR_LABELS: Readonly<Record<MountainActor, string>> = Object.freeze({ echo: '小暖', player: '棉棉' });
export const MOUNTAIN_CHECKPOINTS: Readonly<Record<MountainCheckpoint, MountainPoint>> = Object.freeze({
  start: point(220, 1280), lesson: point(1300, 640), pass: point(1830, 390),
});
export const MOUNTAIN_SPAWN = MOUNTAIN_CHECKPOINTS.start;
export const MOUNTAIN_GATE = Object.freeze({ x: 1688, y: 290, width: 64, height: 200 });
export const MOUNTAIN_NPC = Object.freeze({ x: 1910, y: 230, label: '山羊 · 岚角' });
export const MOUNTAIN_MAILBOX = point(1830, 390);
export const MOUNTAIN_DISCOVERY = Object.freeze({ x: 1080, y: 800, label: '云纹明信片' });
export const MOUNTAIN_STATIONS: Readonly<Record<MountainStationId, MountainStation>> = Object.freeze({
  lesson: Object.freeze({ label: '山脚试铃台', instruction: point(540, 1080), command: point(660, 1030), echo: point(700, 1000),
    playerBells: Object.freeze({ leaf: point(880, 1100), sun: point(1030, 1100), bell: point(1180, 1100) }),
    pattern: Object.freeze(['leaf', 'sun', 'bell'] as const), owners: Object.freeze(['echo', 'echo', 'player'] as const), routeId: 'lesson-echo' }),
  pass: Object.freeze({ label: '山口接力台', instruction: point(1300, 640), command: point(1400, 580), echo: point(1460, 570),
    playerBells: Object.freeze({ leaf: point(1260, 390), sun: point(1410, 390), bell: point(1560, 390) }),
    pattern: Object.freeze(['bell', 'leaf', 'sun'] as const), owners: Object.freeze(['echo', 'player', 'echo'] as const), routeId: 'pass-echo' }),
});
export const MOUNTAIN_ECHO_ROUTES: Readonly<Record<MountainRouteId, MountainEchoRoute>> = Object.freeze({
  'lesson-echo': Object.freeze({ id: 'lesson-echo', station: 'lesson', waypoints: points([660, 1030], [680, 1000], [700, 1000]) }),
  'pass-echo': Object.freeze({ id: 'pass-echo', station: 'pass', waypoints: points([1400, 580], [1520, 690], [1580, 570], [1460, 570]) }),
});
export const MOUNTAIN_PATHS: readonly MountainPath[] = Object.freeze([
  Object.freeze({ id: 'post-trail', kind: 'main', width: 160, waypoints: points([220, 1280], [420, 1220], [540, 1080]) }),
  Object.freeze({ id: 'lesson-bells', kind: 'main', width: 160, waypoints: points([540, 1080], [880, 1100], [1180, 1100]) }),
  Object.freeze({ id: 'wide-ascent', kind: 'main', width: 160, waypoints: points([1180, 1100], [1540, 1050], [1700, 850], [1570, 650], [1300, 640]) }),
  Object.freeze({ id: 'pass-approach', kind: 'main', width: 160, waypoints: points([1300, 640], [1400, 580], [1450, 440], [1410, 390]) }),
  Object.freeze({ id: 'pass-bells', kind: 'main', width: 160, waypoints: points([1260, 390], [1410, 390], [1560, 390]) }),
  Object.freeze({ id: 'mail-bridge', kind: 'main', width: 160, waypoints: points([1560, 390], [1790, 390], [1830, 390], [1910, 230]) }),
  Object.freeze({ id: 'wind-shortcut', kind: 'wind', width: 150, waypoints: points([1180, 1100], [1080, 1000], [1080, 800], [1120, 650], [1300, 640]) }),
  Object.freeze({ id: 'lesson-echo', kind: 'echo', width: 150, waypoints: Object.freeze([point(540, 1080), ...MOUNTAIN_ECHO_ROUTES['lesson-echo'].waypoints]) }),
  Object.freeze({ id: 'pass-echo', kind: 'echo', width: 150, waypoints: MOUNTAIN_ECHO_ROUTES['pass-echo'].waypoints }),
]);
export const MOUNTAIN_PLAZAS: readonly MountainPlaza[] = Object.freeze([
  Object.freeze({ id: 'post', kind: 'main', x: 220, y: 1280, radius: 120 }),
  Object.freeze({ id: 'lesson-sign', kind: 'main', x: 570, y: 1060, radius: 125 }),
  Object.freeze({ id: 'lesson-bells', kind: 'main', x: 1030, y: 1100, radius: 165 }),
  Object.freeze({ id: 'pass-sign', kind: 'main', x: 1320, y: 640, radius: 105 }),
  Object.freeze({ id: 'pass-bells', kind: 'main', x: 1410, y: 390, radius: 175 }),
  Object.freeze({ id: 'mail', kind: 'main', x: 1870, y: 300, radius: 125 }),
  Object.freeze({ id: 'cloud-sketch', kind: 'wind', x: 1080, y: 800, radius: 85 }),
]);

export function isMountainPoint(value: unknown): value is MountainPoint {
  if (!value || typeof value !== 'object') return false;
  const p = value as MountainPoint;
  return typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)
    && p.x >= 0 && p.y >= 0 && p.x <= MOUNTAIN_WORLD.width && p.y <= MOUNTAIN_WORLD.height;
}
export function isMountainStation(value: unknown): value is MountainStationId { return value === 'lesson' || value === 'pass'; }
export function isMountainNote(value: unknown): value is MountainNote { return value === 'leaf' || value === 'sun' || value === 'bell'; }

function distanceToSegment(p: MountainPoint, a: MountainPoint, b: MountainPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Continuous round joins; the footprint cannot straddle a cliff or closed gate. */
export function isMountainSafe(p: MountainPoint, options: { windOpen?: boolean; gateOpen?: boolean } = {}, bodyRadius = 12): boolean {
  if (!isMountainPoint(p) || typeof bodyRadius !== 'number' || !Number.isFinite(bodyRadius) || bodyRadius < 0 || bodyRadius > 40) return false;
  if (p.x < bodyRadius || p.y < bodyRadius || p.x > MOUNTAIN_WORLD.width - bodyRadius || p.y > MOUNTAIN_WORLD.height - bodyRadius) return false;
  if (options.gateOpen !== true && p.x >= MOUNTAIN_GATE.x - bodyRadius && p.x <= MOUNTAIN_GATE.x + MOUNTAIN_GATE.width + bodyRadius
    && p.y >= MOUNTAIN_GATE.y - bodyRadius && p.y <= MOUNTAIN_GATE.y + MOUNTAIN_GATE.height + bodyRadius) return false;
  if (MOUNTAIN_PLAZAS.some(plaza => (plaza.kind !== 'wind' || options.windOpen === true)
    && Math.hypot(p.x - plaza.x, p.y - plaza.y) <= plaza.radius - bodyRadius)) return true;
  return MOUNTAIN_PATHS.some(path => (path.kind !== 'wind' || options.windOpen === true)
    && path.waypoints.slice(1).some((end, index) => distanceToSegment(p, path.waypoints[index], end) <= path.width / 2 - bodyRadius));
}
