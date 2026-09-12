import type Phaser from 'phaser';
import { CatMotionClock, type CatMotionInput, type CatMotionName } from '../data/catMotion';
import type { OperativeId } from '../data/operatives';

export type CatAppearance = OperativeId | 'echo' | 'mirror';
export const catAtlasKey = (appearance: CatAppearance = 'ranger', avatar = false): string => `mailcat-${appearance}${avatar ? '-avatar' : ''}`;
export const catAnimationKey = (appearance: CatAppearance, motion: CatMotionName, avatar = false): string => `${catAtlasKey(appearance, avatar)}-${motion}`;

/** Manual frame advance keeps actor animation on the same paused clock as movement. */
export class CatAnimator {
  readonly clock = new CatMotionClock();
  private holding = false;
  constructor(private sprite: Phaser.GameObjects.Sprite, private appearance: CatAppearance = 'ranger') {}
  setAppearance(appearance: CatAppearance): void { this.appearance = appearance; this.update(0, { speed: 0 }); }
  setHolding(holding: boolean): void { this.holding = holding; }
  update(deltaMs: number, input: CatMotionInput): void {
    const key = catAtlasKey(this.appearance);
    if (!this.sprite.scene?.textures?.exists(key)) return;
    const frame = this.clock.update(deltaMs, { ...input, holding: input.holding ?? this.holding }), name = `${frame.motion}-${frame.frame}`;
    if (this.sprite.texture.key !== key || this.sprite.frame.name !== name) this.sprite.setTexture(key, name);
  }
  dash(durationMs: number): void { this.clock.dash(durationMs); this.update(0, { speed: 0 }); }
  celebrate(): void { this.clock.celebrate(); this.update(0, { speed: 0 }); }
  resetTransient(): void { this.clock.resetTransient(); this.update(0, { speed: 0 }); }
}
