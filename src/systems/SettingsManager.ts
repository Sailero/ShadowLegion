export interface GameSettings {
  volume: number;
  reducedMotion: boolean;
  autoFire: boolean;
}

const KEY = 'sunlit_echoes_settings_v1';

/** Local-only preferences. Unavailable browser storage never prevents play. */
export class SettingsManager {
  private static state: GameSettings | undefined;

  static get(): GameSettings {
    if (!this.state) {
      let saved: Partial<GameSettings> = {};
      try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* use defaults */ }
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.state = {
        volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.3,
        reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : reduced,
        autoFire: saved.autoFire === true,
      };
    }
    return { ...this.state };
  }

  static update(patch: Partial<GameSettings>): GameSettings {
    const next = { ...this.get(), ...patch };
    next.volume = Number.isFinite(next.volume) ? Math.min(1, Math.max(0, next.volume)) : 0.3;
    next.autoFire = next.autoFire === true;
    next.reducedMotion = next.reducedMotion === true;
    this.state = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* session preferences still work */ }
    return this.get();
  }
}
