import type { BuildPath } from '../data/upgrades';

export type ShadowStyle = '火力手' | '游猎者' | '战术家' | '坚守者' | '突击者';

export interface CombatProfile {
  style: ShadowStyle;
  mobility: number;
  firepower: number;
  reflex: number;
  technique: number;
  shots: number;
  dashes: number;
  skills: number;
  damageTaken: number;
  build: BuildPath | null;
  createdAt: string;
}

export interface RunRecorderSnapshot {
  version: 1;
  activeMs: number;
  movingMs: number;
  firingMs: number;
  shots: number;
  dashes: number;
  skills: number;
  damageTaken: number;
}

export const MAX_RECORDED_RUN_MS = 7 * 24 * 60 * 60 * 1000;
const pct = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

/** Restore only bounded, finite measurements, never arbitrary object fields. */
export function sanitizeRunRecorderSnapshot(value: unknown): RunRecorderSnapshot {
  const source = typeof value === 'object' && value !== null && (value as { version?: unknown }).version === 1
    ? value as Record<string, unknown> : {};
  const read = (key: string, max = 1000000000): number =>
    typeof source[key] === 'number' && Number.isFinite(source[key])
      ? Math.max(0, Math.min(max, source[key] as number)) : 0;
  const activeMs = read('activeMs', MAX_RECORDED_RUN_MS);
  return {
    version: 1, activeMs,
    movingMs: read('movingMs', activeMs), firingMs: read('firingMs', activeMs),
    shots: Math.floor(read('shots')), dashes: Math.floor(read('dashes')), skills: Math.floor(read('skills')),
    damageTaken: read('damageTaken'),
  };
}

/**
 * Records a deliberately small, explainable behavior snapshot. It is not an
 * learning model: the snapshot drives the current rules-based Shadow companion
 * and optional mirror rival. It stores habits, not exact movement recordings.
 */
export class RunRecorder {
  private activeMs = 0;
  private movingMs = 0;
  private firingMs = 0;
  private shots = 0;
  private dashes = 0;
  private skills = 0;
  private damageTaken = 0;

  recordFrame(deltaMs: number, moving: boolean, firing: boolean): void {
    if (!Number.isFinite(deltaMs)) return;
    const delta = Math.max(0, Math.min(100, deltaMs));
    this.activeMs += delta;
    if (moving) this.movingMs += delta;
    if (firing) this.firingMs += delta;
  }

  recordShot(count = 1): void { if (Number.isFinite(count) && count > 0) this.shots += Math.max(1, Math.round(count)); }
  recordDash(): void { this.dashes++; }
  recordSkill(): void { this.skills++; }
  recordDamage(amount: number): void { if (Number.isFinite(amount)) this.damageTaken += Math.max(0, amount); }

  serialize(): RunRecorderSnapshot {
    return sanitizeRunRecorderSnapshot({
      version: 1, activeMs: this.activeMs, movingMs: this.movingMs, firingMs: this.firingMs,
      shots: this.shots, dashes: this.dashes, skills: this.skills, damageTaken: this.damageTaken,
    });
  }

  static restore(value: unknown): RunRecorder {
    const snapshot = sanitizeRunRecorderSnapshot(value);
    const recorder = new RunRecorder();
    recorder.activeMs = snapshot.activeMs;
    recorder.movingMs = snapshot.movingMs;
    recorder.firingMs = snapshot.firingMs;
    recorder.shots = snapshot.shots;
    recorder.dashes = snapshot.dashes;
    recorder.skills = snapshot.skills;
    recorder.damageTaken = snapshot.damageTaken;
    return recorder;
  }

  finish(build: BuildPath | null, maxHp: number): CombatProfile {
    const minutes = Math.max(this.activeMs / 60000, 0.25);
    const mobility = pct((this.movingMs / Math.max(1, this.activeMs)) * 100);
    const triggerDiscipline = pct((this.firingMs / Math.max(1, this.activeMs)) * 100);
    const projectilePressure = pct((this.shots / minutes / 220) * 100);
    const firepower = pct(triggerDiscipline * 0.45 + projectilePressure * 0.55);
    const reflex = pct((this.dashes / minutes / 12) * 100);
    const technique = pct((this.skills / minutes / 3.5) * 100);
    const resilience = pct(100 - (this.damageTaken / Math.max(1, maxHp * 1.4)) * 100);

    let style: ShadowStyle = '突击者';
    if (technique >= 62) style = '战术家';
    else if (mobility >= 68 && reflex >= 42) style = '游猎者';
    else if (firepower >= 72) style = '火力手';
    else if (resilience >= 72 && mobility < 58) style = '坚守者';

    return {
      style, mobility, firepower, reflex, technique,
      shots: this.shots, dashes: this.dashes, skills: this.skills,
      damageTaken: Math.round(this.damageTaken), build,
      createdAt: new Date().toISOString(),
    };
  }
}
