import {
  MOUNTAIN_STATIONS, MOUNTAIN_ECHO_ROUTES, MOUNTAIN_NOTE_LABELS,
  isMountainPoint, isMountainStation, isMountainNote,
  type MountainPoint, type MountainStationId, type MountainNote, type MountainActor,
  type MountainCheckpoint, type MountainEchoRoute,
} from '../data/mountain';

export const MOUNTAIN_OBSERVE_RADIUS = 90;
export const MOUNTAIN_ASSIGN_RADIUS = 85;
export const MOUNTAIN_BELL_RADIUS = 60;
export const MOUNTAIN_ECHO_RADIUS = 24;
export const MOUNTAIN_NOTE_INTERVAL_MS = 900;
export const MOUNTAIN_MAX_DELTA_MS = 100;
export type MountainRelayPhase = 'idle' | 'observed' | 'awaitingEcho' | 'echoPlaying' | 'awaitingPlayer' | 'matchedPendingSave' | 'complete';
export type MountainRelayError = 'invalid-station' | 'invalid-note' | 'invalid-position' | 'locked' | 'far-from-instruction'
  | 'far-from-command' | 'far-from-bell' | 'not-observed' | 'other-station-active' | 'not-assigned' | 'echo-not-ready'
  | 'not-player-turn' | 'wrong-note' | 'awaiting-save' | 'not-matched' | 'finished';
export type MountainRelayEvent = Readonly<{ type: 'note'; station: MountainStationId; actor: MountainActor; note: MountainNote; index: number }>
  | Readonly<{ type: 'matched'; station: MountainStationId }>;
export interface MountainRelayAction {
  readonly ok: boolean;
  readonly error?: MountainRelayError;
  readonly duplicate?: boolean;
  readonly target?: MountainPoint;
  readonly route?: MountainEchoRoute;
  readonly events: readonly MountainRelayEvent[];
}
export interface MountainRelayStep { readonly index: number; readonly note: MountainNote; readonly label: string; readonly actor: MountainActor }
export interface MountainRelaySnapshot {
  readonly phase: MountainRelayPhase;
  readonly activeStation: MountainStationId | null;
  readonly played: number;
  readonly next: MountainRelayStep | null;
  readonly playerWait: boolean;
  readonly echoPresent: boolean;
  readonly echoTarget: MountainPoint | null;
  readonly echoElapsedMs: number;
  readonly matchedPendingSave: MountainStationId | null;
  readonly confirmed: Readonly<Record<MountainStationId, boolean>>;
  readonly stations: Readonly<Record<MountainStationId, Readonly<{
    pattern: readonly MountainRelayStep[]; observed: boolean; confirmed: boolean;
  }>>>;
}
const emptyEvents: readonly MountainRelayEvent[] = Object.freeze([]);
const deny = (error: MountainRelayError): MountainRelayAction => Object.freeze({ ok: false, error, events: emptyEvents });
const success = (extra: Omit<Partial<MountainRelayAction>, 'ok' | 'error'> = {}): MountainRelayAction => Object.freeze({ ok: true, events: emptyEvents, ...extra });
const near = (a: MountainPoint, b: MountainPoint, radius: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= radius;
const pattern = (id: MountainStationId): readonly MountainRelayStep[] => Object.freeze(MOUNTAIN_STATIONS[id].pattern.map((note, index) =>
  Object.freeze({ index, note, label: MOUNTAIN_NOTE_LABELS[note], actor: MOUNTAIN_STATIONS[id].owners[index] })));
const patterns = Object.freeze({ lesson: pattern('lesson'), pass: pattern('pass') });

/**
 * Silent-readable cooperative relay. The scene walks the actual echo along the
 * returned authored route, refreshes occupancy with update(0, ...) before F,
 * handles events from BOTH ringPlayer and update, and confirms only saved nodes.
 * This class never moves actors, writes storage, or delivers the letter itself.
 */
export class MountainRelay {
  private activeStation: MountainStationId | null = null;
  private observed: Record<MountainStationId, boolean> = { lesson: false, pass: false };
  private confirmed: Record<MountainStationId, boolean>;
  private assigned = false;
  private echoPresent = false;
  private elapsedMs = 0;
  private played = 0;
  private matched = false;

  constructor(resume: MountainCheckpoint = 'start') {
    // The caller supplies only the highest confirmed milestone, never a cursor,
    // route position or unconfirmed match. Unknown input restarts safely.
    this.confirmed = { lesson: resume === 'lesson' || resume === 'pass', pass: resume === 'pass' };
    this.observed = { ...this.confirmed };
  }

  getSnapshot(): MountainRelaySnapshot {
    const next = this.activeStation && !this.matched ? patterns[this.activeStation][this.played] ?? null : null;
    return Object.freeze({ phase: this.phase(), activeStation: this.activeStation, played: this.played, next,
      playerWait: this.assigned && !this.matched && next?.actor === 'player', echoPresent: this.echoPresent,
      echoTarget: this.assigned && this.activeStation ? MOUNTAIN_STATIONS[this.activeStation].echo : null,
      echoElapsedMs: this.elapsedMs, matchedPendingSave: this.matched ? this.activeStation : null,
      confirmed: Object.freeze({ ...this.confirmed }), stations: Object.freeze({
        lesson: Object.freeze({ pattern: patterns.lesson, observed: this.observed.lesson, confirmed: this.confirmed.lesson }),
        pass: Object.freeze({ pattern: patterns.pass, observed: this.observed.pass, confirmed: this.confirmed.pass }),
      }),
    });
  }

  observe(station: MountainStationId, player: MountainPoint): MountainRelayAction {
    const error = this.stationError(station, player);
    if (error) return deny(error);
    if (!near(player, MOUNTAIN_STATIONS[station].instruction, MOUNTAIN_OBSERVE_RADIUS)) return deny('far-from-instruction');
    if (this.confirmed[station]) return success({ duplicate: true });
    if (this.activeStation && this.activeStation !== station) return deny('other-station-active');
    const duplicate = this.observed[station];
    this.observed[station] = true; this.activeStation = station;
    return success(duplicate ? { duplicate: true } : {});
  }

  assign(station: MountainStationId, player: MountainPoint): MountainRelayAction {
    const error = this.stationError(station, player);
    if (error) return deny(error);
    if (!near(player, MOUNTAIN_STATIONS[station].command, MOUNTAIN_ASSIGN_RADIUS)) return deny('far-from-command');
    if (this.confirmed[station]) return deny('finished');
    if (this.matched) return deny('awaiting-save');
    if (!this.observed[station]) return deny('not-observed');
    if (this.activeStation && this.activeStation !== station) return deny('other-station-active');
    const duplicate = this.assigned;
    this.activeStation = station;
    if (!this.assigned) { this.assigned = true; this.echoPresent = false; this.elapsedMs = 0; }
    return success({ ...(duplicate ? { duplicate: true } : {}), target: MOUNTAIN_STATIONS[station].echo,
      route: MOUNTAIN_ECHO_ROUTES[MOUNTAIN_STATIONS[station].routeId] });
  }

  ringPlayer(station: MountainStationId, note: MountainNote, player: MountainPoint): MountainRelayAction {
    const error = this.stationError(station, player);
    if (error) return deny(error);
    if (!isMountainNote(note)) return deny('invalid-note');
    if (!near(player, MOUNTAIN_STATIONS[station].playerBells[note], MOUNTAIN_BELL_RADIUS)) return deny('far-from-bell');
    if (this.confirmed[station]) return deny('finished');
    if (this.matched) return deny('awaiting-save');
    if (this.activeStation !== station || !this.assigned) return deny('not-assigned');
    if (!this.echoPresent) return deny('echo-not-ready');
    const next = patterns[station][this.played];
    if (next.actor !== 'player') return deny('not-player-turn');
    if (next.note !== note) return deny('wrong-note');
    return success({ events: this.playNext() });
  }

  /** Explicit recall abandons only the live attempt, never an unsaved success. */
  cancel(): MountainRelayAction {
    if (this.matched) return deny('awaiting-save');
    const duplicate = this.activeStation === null;
    this.resetAttempt();
    return success(duplicate ? { duplicate: true } : {});
  }

  /** Wrong notes preserve the prefix; each echo note requires a fresh stable hold. */
  update(deltaMs: number, echoPosition: MountainPoint, echoStays: boolean): readonly MountainRelayEvent[] {
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs < 0) {
      this.echoPresent = false; this.elapsedMs = 0;
      return emptyEvents;
    }
    this.echoPresent = this.assigned && this.activeStation !== null && echoStays === true
      && isMountainPoint(echoPosition) && near(echoPosition, MOUNTAIN_STATIONS[this.activeStation].echo, MOUNTAIN_ECHO_RADIUS);
    if (!this.echoPresent) { this.elapsedMs = 0; return emptyEvents; }
    if (this.matched || !this.activeStation || deltaMs === 0) return emptyEvents;
    if (patterns[this.activeStation][this.played].actor !== 'echo') return emptyEvents;
    this.elapsedMs += Math.min(MOUNTAIN_MAX_DELTA_MS, deltaMs);
    if (this.elapsedMs < MOUNTAIN_NOTE_INTERVAL_MS) return emptyEvents;
    const remainder = this.elapsedMs - MOUNTAIN_NOTE_INTERVAL_MS;
    const events = this.playNext();
    if (!this.matched && patterns[this.activeStation][this.played].actor === 'echo') this.elapsedMs = remainder;
    return events;
  }

  /** Call only after the scene confirms the matching Journey node was saved. */
  confirmSaved(station: MountainStationId): MountainRelayAction {
    if (!isMountainStation(station)) return deny('invalid-station');
    if (this.confirmed[station]) return success({ duplicate: true });
    if (!this.matched || this.activeStation !== station) return deny('not-matched');
    this.confirmed[station] = true;
    this.resetAttempt();
    return success();
  }

  private stationError(station: MountainStationId, player: MountainPoint): MountainRelayError | null {
    if (!isMountainStation(station)) return 'invalid-station';
    if (!isMountainPoint(player)) return 'invalid-position';
    if (station === 'pass' && !this.confirmed.lesson) return 'locked';
    return null;
  }

  private phase(): MountainRelayPhase {
    if (this.confirmed.pass) return 'complete';
    if (!this.activeStation) return 'idle';
    if (this.matched) return 'matchedPendingSave';
    if (!this.assigned) return 'observed';
    if (!this.echoPresent) return 'awaitingEcho';
    return patterns[this.activeStation][this.played].actor === 'player' ? 'awaitingPlayer' : 'echoPlaying';
  }

  private playNext(): readonly MountainRelayEvent[] {
    const station = this.activeStation!;
    const step = patterns[station][this.played];
    const events: MountainRelayEvent[] = [Object.freeze({ type: 'note', station, actor: step.actor, note: step.note, index: step.index })];
    this.played++;
    // A player's wait can last indefinitely; it never banks time for a later echo.
    this.elapsedMs = 0;
    if (this.played === patterns[station].length) {
      this.matched = true;
      events.push(Object.freeze({ type: 'matched', station }));
    }
    return Object.freeze(events);
  }

  private resetAttempt(): void {
    this.activeStation = null; this.assigned = this.echoPresent = this.matched = false;
    this.elapsedMs = this.played = 0;
  }
}
