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

const pct = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Records a deliberately small, explainable behavior snapshot. It is not an
 * AI model yet: the snapshot is the stable data contract that a future Shadow
 * companion, Ghost opponent or offline trainer can consume.
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
    const delta = Math.max(0, Math.min(100, deltaMs));
    this.activeMs += delta;
    if (moving) this.movingMs += delta;
    if (firing) this.firingMs += delta;
  }

  recordShot(count = 1): void { this.shots += Math.max(1, Math.round(count)); }
  recordDash(): void { this.dashes++; }
  recordSkill(): void { this.skills++; }
  recordDamage(amount: number): void { this.damageTaken += Math.max(0, amount); }

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
