import {
  DESERT_ANCHORS, DESERT_PUZZLES, DESERT_OBSTACLES, isDesertAnchor, isDesertPuzzle, isDesertPoint, isDesertSafe,
  type DesertAnchorId, type DesertPuzzleId, type DesertCheckpoint, type DesertPoint, type DesertRoute, type DesertObstacle,
} from '../data/desert';

export const COVER_ASSIGN_RADIUS = 85;
export const COVER_ECHO_RADIUS = 24;
export const COVER_GRIP_RADIUS = 38;
export const COVER_READ_RADIUS = 65;
export const COVER_MIN_SPAN = 200;
export const COVER_MAX_SPAN = 260;
export const COVER_WIDTH = 160;
export const COVER_TARGET_MARGIN = 8;
export type CoverReleaseReason = 'overstretched' | 'obstructed' | 'echo-left' | 'invalid-position';
export type CoverError = 'invalid-anchor' | 'invalid-puzzle' | 'invalid-position' | 'locked' | 'finished' | 'far-from-command'
  | 'other-anchor-active' | 'not-assigned' | 'echo-not-ready' | 'far-from-grip' | 'not-holding' | 'not-taut'
  | 'far-from-target' | 'not-covered' | 'awaiting-save' | 'not-matched' | 'overstretched' | 'obstructed';
export type CoverEvent = Readonly<{ type: 'released'; reason: CoverReleaseReason; grip: DesertPoint }>
  | Readonly<{ type: 'matched'; puzzle: DesertPuzzleId }>;
export interface CoverAction {
  readonly ok: boolean; readonly error?: CoverError; readonly duplicate?: boolean;
  readonly target?: DesertPoint; readonly route?: DesertRoute; readonly events: readonly CoverEvent[];
}
export interface CoverSample { readonly player: DesertPoint; readonly echo: DesertPoint; readonly echoStays: boolean }
export interface CoverSnapshot {
  readonly phase: 'idle' | 'awaitingEcho' | 'ready' | 'holding' | 'laid' | 'matchedPendingSave' | 'complete';
  readonly activeAnchor: DesertAnchorId | null; readonly activePuzzle: DesertPuzzleId | null;
  readonly playerHolding: boolean; readonly echoPresent: boolean; readonly echoTarget: DesertPoint | null;
  readonly echoPosition: DesertPoint | null; readonly playerPosition: DesertPoint | null; readonly grip: DesertPoint | null;
  readonly grips: Readonly<Record<DesertAnchorId, DesertPoint>>;
  readonly spanLength: number; readonly shadowPolygon: readonly DesertPoint[]; readonly taut: boolean;
  readonly coveredTargets: Readonly<Record<string, boolean>>; readonly confirmed: Readonly<Record<DesertPuzzleId, boolean>>;
  readonly matchedPendingSave: DesertPuzzleId | null; readonly reason: CoverReleaseReason | null;
}
interface Pose { readonly echo: DesertPoint; readonly player: DesertPoint }
const puzzleOrder: readonly DesertPuzzleId[] = ['lesson', 'stones', 'courtyard'];
const point = (p: DesertPoint): DesertPoint => Object.freeze({ x: p.x, y: p.y });
const eventsNone: readonly CoverEvent[] = Object.freeze([]);
const success = (extra: Omit<Partial<CoverAction>, 'ok' | 'error'> = {}): CoverAction => Object.freeze({ ok: true, events: eventsNone, ...extra });
const deny = (error: CoverError): CoverAction => Object.freeze({ ok: false, error, events: eventsNone });
const distance = (a: DesertPoint, b: DesertPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
function polygon(pose: Pose): readonly DesertPoint[] {
  const length = distance(pose.echo, pose.player);
  if (length < 1e-8) return Object.freeze([]);
  const nx = -(pose.player.y - pose.echo.y) / length * COVER_WIDTH / 2;
  const ny = (pose.player.x - pose.echo.x) / length * COVER_WIDTH / 2;
  return Object.freeze([
    point({ x: pose.echo.x + nx, y: pose.echo.y + ny }), point({ x: pose.player.x + nx, y: pose.player.y + ny }),
    point({ x: pose.player.x - nx, y: pose.player.y - ny }), point({ x: pose.echo.x - nx, y: pose.echo.y - ny }),
  ]);
}
/** SAT checks the whole convex cloth, including a stone wholly inside its face. */
function intersects(shape: readonly DesertPoint[], box: DesertObstacle, inflate = 0): boolean {
  if (!shape.length) return false;
  const x = box.x - inflate, y = box.y - inflate, right = box.x + box.width + inflate, bottom = box.y + box.height + inflate;
  const corners = [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...shape.map((p, i) => {
    const next = shape[(i + 1) % shape.length]; return { x: p.y - next.y, y: next.x - p.x };
  })];
  return !axes.some(axis => {
    const a = shape.map(p => p.x * axis.x + p.y * axis.y), b = corners.map(p => p.x * axis.x + p.y * axis.y);
    return Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a);
  });
}
const clearPose = (pose: Pose): boolean => DESERT_OBSTACLES.every(box => !intersects(polygon(pose), box));
const halfway = (a: DesertPoint, b: DesertPoint): DesertPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Conservative continuous collision check, not just fixed frame sampling.
 * Each interval bounds every corner's translation + changing unit-normal offset.
 * If its start polygon misses stones expanded by that bound, the WHOLE interval
 * is clear. Otherwise subdivide; unresolved contact within 0.02px is blocked.
 */
function sweepClear(a: Pose, b: Pose, depth = 0): boolean {
  const halfWidth = COVER_WIDTH / 2;
  const endpoints = [a.echo, a.player, b.echo, b.player];
  const minX = Math.min(...endpoints.map(p => p.x)) - halfWidth, maxX = Math.max(...endpoints.map(p => p.x)) + halfWidth;
  const minY = Math.min(...endpoints.map(p => p.y)) - halfWidth, maxY = Math.max(...endpoints.map(p => p.y)) + halfWidth;
  const boxes = DESERT_OBSTACLES.filter(box => minX <= box.x + box.width && maxX >= box.x && minY <= box.y + box.height && maxY >= box.y);
  if (!boxes.length) return true;
  const d0 = { x: a.player.x - a.echo.x, y: a.player.y - a.echo.y };
  const d1 = { x: b.player.x - b.echo.x, y: b.player.y - b.echo.y };
  const change = { x: d1.x - d0.x, y: d1.y - d0.y }, square = change.x * change.x + change.y * change.y;
  const t = square ? Math.max(0, Math.min(1, -(d0.x * change.x + d0.y * change.y) / square)) : 0;
  const minimumSpan = Math.hypot(d0.x + change.x * t, d0.y + change.y * t);
  // A folded-through-zero turn next to a stone has no safe continuous normal.
  if (minimumSpan < 1e-6) return false;
  const displacement = Math.max(distance(a.echo, b.echo), distance(a.player, b.player));
  const bound = displacement + halfWidth * Math.min(2, 2 * Math.sqrt(square) / minimumSpan);
  const start = polygon(a);
  if (boxes.every(box => !intersects(start, box, bound))) return true;
  if (depth >= 18 || bound <= .02) return false;
  const middle = { echo: halfway(a.echo, b.echo), player: halfway(a.player, b.player) };
  if (!clearPose(middle)) return false;
  return sweepClear(a, middle, depth + 1) && sweepClear(middle, b, depth + 1);
}

/** Pure spatial model. Scene refreshes update(0, actualSample) before E/F. */
export class PairedCover {
  private activeAnchor: DesertAnchorId | null = null;
  private confirmed: Record<DesertPuzzleId, boolean>;
  private holding = false;
  private echoPresent = false;
  private sample: Pose | null = null;
  private lastLegal: Pose | null = null;
  private grips: Partial<Record<DesertAnchorId, DesertPoint>> = {};
  private pending: DesertPuzzleId | null = null;
  private reason: CoverReleaseReason | null = null;

  constructor(checkpoint: DesertCheckpoint = 'start') {
    const index = puzzleOrder.indexOf(checkpoint as DesertPuzzleId);
    this.confirmed = { lesson: index >= 0, stones: index >= 1, courtyard: index >= 2 };
  }

  getSnapshot(): CoverSnapshot {
    const activePuzzle = this.activeAnchor ? DESERT_ANCHORS[this.activeAnchor].puzzle : null;
    const spanLength = this.sample ? distance(this.sample.echo, this.sample.player) : 0;
    const taut = this.holding && this.echoPresent && spanLength >= COVER_MIN_SPAN && spanLength <= COVER_MAX_SPAN;
    const coveredTargets: Record<string, boolean> = {};
    if (activePuzzle) for (const target of DESERT_PUZZLES[activePuzzle].targets) {
      coveredTargets[target.id] = Boolean(taut && this.sample && this.covers(target, target.radius + COVER_TARGET_MARGIN));
    }
    const grips = Object.fromEntries(Object.values(DESERT_ANCHORS).map(anchor => [anchor.id,
      this.holding && this.activeAnchor === anchor.id && this.lastLegal ? point(this.lastLegal.player) : point(this.grips[anchor.id] ?? anchor.foldedGrip),
    ])) as Record<DesertAnchorId, DesertPoint>;
    return Object.freeze({ phase: this.phase(), activeAnchor: this.activeAnchor, activePuzzle, playerHolding: this.holding,
      echoPresent: this.echoPresent, echoTarget: this.activeAnchor ? DESERT_ANCHORS[this.activeAnchor].echo : null,
      echoPosition: this.sample ? point(this.sample.echo) : null, playerPosition: this.sample ? point(this.sample.player) : null,
      grip: this.activeAnchor ? this.currentGrip() : null, grips: Object.freeze(grips), spanLength,
      shadowPolygon: this.holding && this.echoPresent && this.sample ? polygon(this.sample) : Object.freeze([]),
      taut, coveredTargets: Object.freeze(coveredTargets), confirmed: Object.freeze({ ...this.confirmed }),
      matchedPendingSave: this.pending, reason: this.reason,
    });
  }

  assign(anchorId: DesertAnchorId, player: DesertPoint): CoverAction {
    if (!isDesertAnchor(anchorId)) return deny('invalid-anchor');
    if (!isDesertPoint(player) || !isDesertSafe(player)) return deny('invalid-position');
    const anchor = DESERT_ANCHORS[anchorId];
    if (!this.unlocked(anchor.puzzle)) return deny('locked');
    if (distance(player, anchor.command) > COVER_ASSIGN_RADIUS) return deny('far-from-command');
    if (this.pending) return deny('awaiting-save');
    if (this.confirmed[anchor.puzzle]) return deny('finished');
    if (this.activeAnchor && this.activeAnchor !== anchorId) return deny('other-anchor-active');
    if (this.activeAnchor === anchorId) return success({ duplicate: true, target: anchor.echo, route: anchor.route });
    this.activeAnchor = anchorId; this.holding = this.echoPresent = false; this.sample = this.lastLegal = null; this.reason = null;
    return success({ target: anchor.echo, route: anchor.route });
  }

  grip(player: DesertPoint): CoverAction {
    if (!isDesertPoint(player) || !isDesertSafe(player)) return deny('invalid-position');
    if (this.pending) return deny('awaiting-save');
    if (!this.activeAnchor) return deny('not-assigned');
    if (!this.echoPresent || !this.sample) return deny('echo-not-ready');
    if (this.holding) return success({ duplicate: true });
    if (distance(player, this.currentGrip()) > COVER_GRIP_RADIUS) return deny('far-from-grip');
    const pose = { echo: point(this.sample.echo), player: point(player) };
    if (distance(pose.echo, pose.player) > COVER_MAX_SPAN) return deny('overstretched');
    if (!clearPose(pose)) return deny('obstructed');
    this.sample = this.lastLegal = pose; this.holding = true; this.reason = null;
    return success();
  }

  release(): CoverAction {
    if (this.pending) return deny('awaiting-save');
    if (!this.holding) return success({ duplicate: true });
    this.putDown(); this.reason = null;
    return success();
  }

  /** Release before the scene recalls the real echo; local cloth corners remain retrievable. */
  cancel(): CoverAction {
    if (this.pending) return deny('awaiting-save');
    const duplicate = this.activeAnchor === null;
    if (this.holding) this.putDown();
    this.activeAnchor = null; this.holding = this.echoPresent = false; this.sample = this.lastLegal = null; this.reason = null;
    return success(duplicate ? { duplicate: true } : {});
  }

  /** No timer or accumulated exposure: zero and positive dt both validate actual space. */
  update(deltaMs: number, input: CoverSample): readonly CoverEvent[] {
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs < 0 || !input || !isDesertPoint(input.player) || !isDesertPoint(input.echo)) {
      this.echoPresent = false;
      return this.holding && !this.pending ? this.failHold('invalid-position') : eventsNone;
    }
    const pose = { echo: point(input.echo), player: point(input.player) };
    this.echoPresent = this.activeAnchor !== null && input.echoStays === true && isDesertSafe(input.echo)
      && distance(input.echo, DESERT_ANCHORS[this.activeAnchor].echo) <= COVER_ECHO_RADIUS;
    if (!this.holding || this.pending) { this.sample = pose; return eventsNone; }
    if (!this.echoPresent) return this.failHold('echo-left');
    if (!isDesertSafe(input.player)) return this.failHold('obstructed');
    if (distance(input.player, input.echo) > COVER_MAX_SPAN) return this.failHold('overstretched');
    if (!clearPose(pose) || this.lastLegal && !sweepClear(this.lastLegal, pose)) return this.failHold('obstructed');
    this.sample = this.lastLegal = pose;
    return eventsNone;
  }

  read(puzzleId: DesertPuzzleId, player: DesertPoint): CoverAction {
    if (!isDesertPuzzle(puzzleId)) return deny('invalid-puzzle');
    if (!isDesertPoint(player) || !isDesertSafe(player)) return deny('invalid-position');
    if (!this.unlocked(puzzleId)) return deny('locked');
    if (this.pending) return deny('awaiting-save');
    if (this.confirmed[puzzleId]) return deny('finished');
    if (!this.activeAnchor || DESERT_ANCHORS[this.activeAnchor].puzzle !== puzzleId) return deny('not-assigned');
    if (!this.holding) return deny('not-holding');
    if (!this.echoPresent) return deny('echo-not-ready');
    // Require a freshly sampled player pose, rather than reading at a remote location.
    if (!this.sample || distance(player, this.sample.player) > 1e-6) return deny('invalid-position');
    const definition = DESERT_PUZZLES[puzzleId], readTarget = definition.targets.find(target => target.id === definition.readTargetId)!;
    if (distance(player, readTarget) > COVER_READ_RADIUS) return deny('far-from-target');
    const snapshot = this.getSnapshot();
    if (!snapshot.taut) return deny('not-taut');
    if (!definition.targets.every(target => snapshot.coveredTargets[target.id])) return deny('not-covered');
    // Reading is complete: leave the local corner where it was matched while
    // the scene confirms persistence. Walking away must not stretch a saved proof.
    this.putDown(); this.pending = puzzleId;
    return success({ events: Object.freeze([Object.freeze({ type: 'matched', puzzle: puzzleId })]) });
  }

  confirmSaved(puzzleId: DesertPuzzleId): CoverAction {
    if (!isDesertPuzzle(puzzleId)) return deny('invalid-puzzle');
    if (this.confirmed[puzzleId]) return success({ duplicate: true });
    if (this.pending !== puzzleId) return deny('not-matched');
    this.confirmed[puzzleId] = true; this.pending = null;
    if (this.holding) this.putDown();
    this.activeAnchor = null; this.holding = this.echoPresent = false; this.sample = this.lastLegal = null; this.reason = null;
    return success();
  }

  private unlocked(puzzle: DesertPuzzleId): boolean { return puzzle === 'lesson' || puzzle === 'stones' && this.confirmed.lesson || puzzle === 'courtyard' && this.confirmed.stones; }
  private currentGrip(): DesertPoint { return this.holding && this.lastLegal ? point(this.lastLegal.player) : this.grips[this.activeAnchor!] ?? DESERT_ANCHORS[this.activeAnchor!].foldedGrip; }
  private putDown(): void {
    if (this.activeAnchor && this.lastLegal) this.grips[this.activeAnchor] = point(this.lastLegal.player);
    this.holding = false;
  }
  private failHold(reason: CoverReleaseReason): readonly CoverEvent[] {
    this.putDown(); this.reason = reason;
    return Object.freeze([Object.freeze({ type: 'released', reason, grip: this.currentGrip() })]);
  }
  private phase(): CoverSnapshot['phase'] {
    if (this.pending) return 'matchedPendingSave';
    if (this.confirmed.courtyard) return 'complete';
    if (!this.activeAnchor) return 'idle';
    if (!this.echoPresent) return 'awaitingEcho';
    if (this.holding) return 'holding';
    return this.grips[this.activeAnchor] ? 'laid' : 'ready';
  }
  private covers(target: DesertPoint, margin: number): boolean {
    const pose = this.sample!, length = distance(pose.echo, pose.player);
    if (!length) return false;
    const dx = pose.player.x - pose.echo.x, dy = pose.player.y - pose.echo.y;
    const x = target.x - pose.echo.x, y = target.y - pose.echo.y;
    const along = (x * dx + y * dy) / length, across = Math.abs(-x * dy + y * dx) / length;
    return along >= margin && along <= length - margin && across <= COVER_WIDTH / 2 - margin;
  }
}
