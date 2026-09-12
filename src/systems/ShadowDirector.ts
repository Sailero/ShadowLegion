import type { BuildPath } from '../data/upgrades';
import type { CombatProfile, ShadowStyle } from './RunRecorder';
import type { MapRect } from '../data/chapters';

export type ShadowMode = 'follow' | 'guard';
export interface ShadowTemperament {
  name: string;
  style: ShadowStyle;
  source: 'training' | 'previous-run';
  description: string;
  mode: ShadowMode;
  speed: number;
  range: number;
  fireIntervalMs: number;
  damage: number;
  orbitRadius: number;
  color: number;
}

const STYLES: ShadowStyle[] = ['火力手', '游猎者', '战术家', '坚守者', '突击者'];
const BUILDS: BuildPath[] = ['nova', 'storm', 'rift', 'engineer'];
const finite = (value: unknown, fallback: number, min = 0, max = 100): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Untrusted local saves must never turn into NaN velocities or unbounded fire. */
export function sanitizeCombatProfile(value: unknown): CombatProfile | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (!STYLES.includes(source.style as ShadowStyle)) return null;
  return {
    style: source.style as ShadowStyle,
    mobility: finite(source.mobility, 50), firepower: finite(source.firepower, 50),
    reflex: finite(source.reflex, 30), technique: finite(source.technique, 30),
    shots: finite(source.shots, 0, 0, 10000000), dashes: finite(source.dashes, 0, 0, 1000000),
    skills: finite(source.skills, 0, 0, 1000000), damageTaken: finite(source.damageTaken, 0, 0, 10000000),
    build: BUILDS.includes(source.build as BuildPath) ? source.build as BuildPath : null,
    createdAt: typeof source.createdAt === 'string' && Number.isFinite(Date.parse(source.createdAt))
      ? source.createdAt : '1970-01-01T00:00:00.000Z',
  };
}

/** An explainable rules-based echo, never described as an online learning model. */
export function deriveShadowTemperament(value: unknown): ShadowTemperament {
  const profile = sanitizeCombatProfile(value);
  if (!profile) return {
    name: '小暖', style: '坚守者', source: 'training',
    description: '见习影伴会照看营地；按 E 邀它一起出发。',
    mode: 'guard', speed: 165, range: 285, fireIntervalMs: 1050,
    damage: 8, orbitRadius: 92, color: 0x57a992,
  };
  const names: Record<ShadowStyle, string> = {
    '火力手': '爆米花影', '游猎者': '追风影', '战术家': '点子影', '坚守者': '抱抱影', '突击者': '跃跃影',
  };
  const descriptions: Record<ShadowStyle, string> = {
    '火力手': '记住了你的持续射击：出手更快，擅长压住近路。',
    '游猎者': '记住了你的走位与闪避：跟得更紧，转线更灵活。',
    '战术家': '记住了你的技能习惯：优先照看远程与支援怪。',
    '坚守者': '记住了你的稳健站位：习惯守营，优先拦住漏网怪。',
    '突击者': '记住了你的主动出击：跟随你一起截击来路。',
  };
  return {
    name: names[profile.style], style: profile.style, source: 'previous-run',
    description: descriptions[profile.style],
    mode: profile.style === '坚守者' || profile.mobility < 40 ? 'guard' : 'follow',
    speed: 145 + profile.mobility * 0.45 + profile.reflex * 0.15,
    range: 255 + profile.technique * 0.6,
    fireIntervalMs: Math.round(1200 - profile.firepower * 3.5),
    // Hard cap: 9 / .85 = 10.6 DPS, under 20% of the starting player's 55.6.
    damage: 8 + (profile.firepower >= 72 ? 1 : 0),
    orbitRadius: 72 + (100 - profile.mobility) * 0.45,
    color: profile.style === '火力手' ? 0xdc9166 : profile.style === '战术家' ? 0xa696c7 : 0x57a992,
  };
}

export interface ShadowPoint { x: number; y: number }

/** Inclusive segment/AABB intersection. Shared by both echoes and pure tests. */
export function shadowLineBlocked(from: ShadowPoint, to: ShadowPoint, obstacles: readonly MapRect[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const rect of obstacles) {
    let entry = 0;
    let exit = 1;
    const ranges = [
      [from.x, dx, rect.x - rect.width / 2, rect.x + rect.width / 2],
      [from.y, dy, rect.y - rect.height / 2, rect.y + rect.height / 2],
    ];
    let intersects = true;
    for (const [origin, step, min, max] of ranges) {
      if (Math.abs(step) < 0.0001) {
        if (origin < min || origin > max) { intersects = false; break; }
      } else {
        const first = (min - origin) / step;
        const second = (max - origin) / step;
        entry = Math.max(entry, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
        if (entry > exit) { intersects = false; break; }
      }
    }
    if (intersects) return true;
  }
  return false;
}

export interface ShadowTarget extends ShadowPoint {
  active: boolean;
  cfg: { key: string };
}

/** Guardians protect the camp; tacticians pick dangerous support roles. */
export function chooseShadowTarget<T extends ShadowTarget>(
  position: ShadowPoint, core: ShadowPoint, candidates: readonly T[],
  temperament: ShadowTemperament, mode: ShadowMode, obstacles: readonly MapRect[],
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const enemy of candidates) {
    if (!enemy.active) continue;
    const range = Math.hypot(enemy.x - position.x, enemy.y - position.y);
    if (range > temperament.range || shadowLineBlocked(position, enemy, obstacles)) continue;
    const coreDistance = Math.hypot(enemy.x - core.x, enemy.y - core.y);
    let score = mode === 'guard' ? coreDistance * 1.4 + range * 0.3 : range;
    if (coreDistance < 170) score -= 230;
    if (temperament.style === '战术家' && ['medic', 'summoner', 'archer'].includes(enemy.cfg.key)) score -= 100;
    if (score < bestScore) { best = enemy; bestScore = score; }
  }
  return best;
}
