export interface LakePoint { readonly x: number; readonly y: number }
export type LakeDockId = 'start' | 'mid' | 'mail';
export type LakeLeafId = 'west' | 'north';
export type LakeDirection = 'west' | 'east' | 'north' | 'south';
export type LakeRouteId = 'start-mid' | 'mid-mail';
export type LakeVoyageEvent = 'midDocked' | 'mailDocked';

const point = (x: number, y: number): LakePoint => Object.freeze({ x, y });
export const LAKE_WORLD = Object.freeze({ width: 1800, height: 1300 });
export const LAKE_DOCKS: Readonly<Record<LakeDockId, LakePoint>> = Object.freeze({
  start: point(565, 950), mid: point(900, 700), mail: point(1390, 340),
});
export const LAKE_ANCHORS: Readonly<Record<LakeDockId, LakePoint>> = Object.freeze({
  start: point(470, 930), mid: point(850, 700), mail: point(1435, 340),
});
export interface LakeLeaf extends LakePoint {
  readonly label: string;
  readonly directions: readonly LakeDirection[];
  readonly required: LakeDirection;
}
export const LAKE_LEAVES: Readonly<Record<LakeLeafId, LakeLeaf>> = Object.freeze({
  west: Object.freeze({ x: 680, y: 420, label: '西岸导流叶', directions: Object.freeze(['west', 'east'] as const), required: 'east' }),
  north: Object.freeze({ x: 1050, y: 255, label: '北岸导流叶', directions: Object.freeze(['south', 'north'] as const), required: 'north' }),
});
export interface LakeRoute {
  readonly from: LakeDockId;
  readonly to: LakeDockId;
  readonly durationMs: number;
  readonly waypoints: readonly LakePoint[];
}
export const LAKE_ROUTES: Readonly<Record<LakeRouteId, LakeRoute>> = Object.freeze({
  'start-mid': Object.freeze({ from: 'start', to: 'mid', durationMs: 5600,
    waypoints: Object.freeze([LAKE_DOCKS.start, point(640, 875), point(730, 780), LAKE_DOCKS.mid]) }),
  'mid-mail': Object.freeze({ from: 'mid', to: 'mail', durationMs: 6200,
    waypoints: Object.freeze([LAKE_DOCKS.mid, point(1080, 630), point(1260, 500), LAKE_DOCKS.mail]) }),
});
export const LAKE_INTERACTION_RADIUS = 105;
export const LAKE_LEAF_RADIUS = 80;
export const LAKE_ANCHOR_RADIUS = 24;
/** A stalled frame cannot teleport a letter across an entire voyage. */
export const LAKE_MAX_DELTA_MS = 100;

export type LakeVoyageError = 'invalid-position' | 'far-from-dock' | 'far-from-leaf' | 'sailing'
  | 'finished' | 'not-anchored' | 'wrong-dock' | 'no-letter' | 'invalid-leaf' | 'invalid-direction' | 'route-not-ready';
export interface LakeActionResult {
  readonly ok: boolean;
  readonly error?: LakeVoyageError;
  readonly duplicate?: boolean;
  readonly target?: LakePoint;
}
export interface LakeVoyageSnapshot {
  readonly phase: 'docked' | 'sailing';
  readonly dock: LakeDockId | null;
  readonly boat: LakePoint;
  readonly heading: number;
  readonly route: LakeRouteId | null;
  readonly destination: LakeDockId | null;
  readonly progress: number;
  readonly loaded: boolean;
  readonly anchorTarget: LakePoint | null;
  readonly anchored: boolean;
  readonly leaves: Readonly<Record<LakeLeafId, LakeDirection>>;
  readonly routeReady: boolean;
  readonly midDocked: boolean;
  readonly mailDocked: boolean;
}

const validPoint = (value: unknown): value is LakePoint => Boolean(value && typeof value === 'object'
  && typeof (value as LakePoint).x === 'number' && Number.isFinite((value as LakePoint).x)
  && typeof (value as LakePoint).y === 'number' && Number.isFinite((value as LakePoint).y)
  && (value as LakePoint).x >= 0 && (value as LakePoint).x <= LAKE_WORLD.width
  && (value as LakePoint).y >= 0 && (value as LakePoint).y <= LAKE_WORLD.height);
const near = (a: LakePoint, b: LakePoint, radius: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= radius;
const denied = (error: LakeVoyageError): LakeActionResult => ({ ok: false, error });

/**
 * Pure, local runtime for one letter. It never persists, awards a delivery or
 * trusts a selected destination as an arrival. The scene feeds actual echo
 * position / stays before processing interactions and saves emitted dock events.
 * Resume is only from the last confirmed safe dock, never an in-flight position.
 */
export class LakeVoyage {
  private dock: LakeDockId | null;
  private boat: LakePoint;
  private heading = 0;
  private route: LakeRouteId | null = null;
  private elapsedMs = 0;
  private progress = 0;
  private loaded: boolean;
  private requestedAnchor: LakeDockId | null = null;
  private anchored = false;
  private leaves: Record<LakeLeafId, LakeDirection> = { west: 'west', north: 'south' };
  private midDocked: boolean;
  private mailDocked: boolean;

  constructor(resumeDock: LakeDockId = 'start') {
    const safeDock = resumeDock === 'mid' || resumeDock === 'mail' ? resumeDock : 'start';
    this.dock = safeDock;
    this.boat = LAKE_DOCKS[safeDock];
    this.loaded = safeDock !== 'start';
    this.midDocked = safeDock !== 'start';
    this.mailDocked = safeDock === 'mail';
  }

  getSnapshot(): LakeVoyageSnapshot {
    return Object.freeze({
      phase: this.route ? 'sailing' : 'docked', dock: this.dock,
      boat: point(this.boat.x, this.boat.y), heading: this.heading,
      route: this.route, destination: this.route ? LAKE_ROUTES[this.route].to : null,
      progress: this.progress, loaded: this.loaded,
      anchorTarget: this.requestedAnchor ? point(LAKE_ANCHORS[this.requestedAnchor].x, LAKE_ANCHORS[this.requestedAnchor].y) : null,
      anchored: this.anchored, leaves: Object.freeze({ ...this.leaves }),
      routeReady: this.dock === 'start' || (this.dock === 'mid' && this.leavesReady()),
      midDocked: this.midDocked, mailDocked: this.mailDocked,
    });
  }

  /** Request a reachable dock anchor. Issuing E is not proof the echo is there. */
  command(player: LakePoint): LakeActionResult {
    const error = this.dockInteractionError(player);
    if (error) return denied(error);
    const dock = this.dock!;
    this.requestedAnchor = dock;
    this.anchored = false; // Require a fresh actual-position sample after the request.
    return { ok: true, target: point(LAKE_ANCHORS[dock].x, LAKE_ANCHORS[dock].y) };
  }

  loadLetter(player: LakePoint): LakeActionResult {
    const error = this.dockInteractionError(player);
    if (error) return denied(error);
    if (this.dock !== 'start') return denied('wrong-dock');
    if (!this.anchored) return denied('not-anchored');
    if (this.loaded) return { ok: true, duplicate: true };
    this.loaded = true;
    return { ok: true };
  }

  /** Both leaves must be configured from their own bank while the echo holds mid. */
  setLeaf(id: LakeLeafId, direction: LakeDirection, player: LakePoint): LakeActionResult {
    if (!validPoint(player)) return denied('invalid-position');
    if (id !== 'west' && id !== 'north') return denied('invalid-leaf');
    const leaf = LAKE_LEAVES[id];
    if (!leaf.directions.includes(direction)) return denied('invalid-direction');
    if (this.route) return denied('sailing');
    if (this.mailDocked) return denied('finished');
    if (this.dock !== 'mid' || !this.midDocked) return denied('wrong-dock');
    if (!near(player, leaf, LAKE_LEAF_RADIUS)) return denied('far-from-leaf');
    if (!this.anchored) return denied('not-anchored');
    const duplicate = this.leaves[id] === direction;
    this.leaves[id] = direction;
    return { ok: true, ...(duplicate ? { duplicate: true } : {}) };
  }

  depart(player: LakePoint): LakeActionResult {
    const error = this.dockInteractionError(player);
    if (error) return denied(error);
    if (!this.anchored) return denied('not-anchored');
    if (!this.loaded) return denied('no-letter');
    if (this.dock === 'mid' && !this.leavesReady()) return denied('route-not-ready');
    this.route = this.dock === 'start' ? 'start-mid' : 'mid-mail';
    this.dock = null;
    this.elapsedMs = this.progress = 0;
    this.requestedAnchor = null;
    this.anchored = false;
    return { ok: true };
  }

  /** Zero delta may refresh anchor occupancy; invalid delta never advances time. */
  update(deltaMs: number, echoPosition: LakePoint, echoStays: boolean): LakeVoyageEvent[] {
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs < 0) {
      this.anchored = false; // A malformed frame cannot retain a stale occupancy proof.
      return [];
    }
    this.anchored = this.dock !== null && this.requestedAnchor === this.dock && echoStays === true
      && validPoint(echoPosition) && near(echoPosition, LAKE_ANCHORS[this.dock], LAKE_ANCHOR_RADIUS);
    if (!this.route || deltaMs === 0) return [];
    const route = LAKE_ROUTES[this.route];
    this.elapsedMs = Math.min(route.durationMs, this.elapsedMs + Math.min(LAKE_MAX_DELTA_MS, deltaMs));
    this.progress = this.elapsedMs / route.durationMs;
    this.moveAlong(route);
    if (this.elapsedMs < route.durationMs) return [];
    this.dock = route.to;
    this.boat = LAKE_DOCKS[route.to];
    this.route = null;
    this.anchored = false;
    this.requestedAnchor = null;
    if (route.to === 'mid' && !this.midDocked) { this.midDocked = true; return ['midDocked']; }
    if (route.to === 'mail' && !this.mailDocked) { this.mailDocked = true; return ['mailDocked']; }
    return [];
  }

  private dockInteractionError(player: LakePoint): LakeVoyageError | null {
    if (!validPoint(player)) return 'invalid-position';
    if (this.route) return 'sailing';
    if (this.mailDocked) return 'finished';
    if (!this.dock || !near(player, LAKE_DOCKS[this.dock], LAKE_INTERACTION_RADIUS)) return 'far-from-dock';
    return null;
  }

  private leavesReady(): boolean {
    return this.leaves.west === LAKE_LEAVES.west.required && this.leaves.north === LAKE_LEAVES.north.required;
  }

  private moveAlong(route: LakeRoute): void {
    const lengths = route.waypoints.slice(1).map((p, index) => Math.hypot(p.x - route.waypoints[index].x, p.y - route.waypoints[index].y));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * this.progress;
    for (let i = 0; i < lengths.length; i++) {
      const start = route.waypoints[i], end = route.waypoints[i + 1];
      if (remaining <= lengths[i] || i === lengths.length - 1) {
        const t = lengths[i] ? Math.min(1, remaining / lengths[i]) : 1;
        this.boat = point(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t);
        this.heading = Math.atan2(end.y - start.y, end.x - start.x);
        return;
      }
      remaining -= lengths[i];
    }
  }
}
