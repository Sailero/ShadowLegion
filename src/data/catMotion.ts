export type CatMotionName = 'idle' | 'run' | 'dash' | 'celebrate';
export const CAT_FRAME_COUNTS: Record<CatMotionName, number> = { idle: 4, run: 8, dash: 4, celebrate: 6 };
export const CAT_IDLE_DURATIONS = [1600, 350, 100, 250];
export const CAT_FRAME_SIZE = 56;

export interface CatPose {
  bodyY: number; bodyAngle: number; headAngle: number; headY: number;
  leftArm: number; rightArm: number; leftLeg: number; rightLeg: number;
  leftFootY: number; rightFootY: number; tail: number; bag: number; blink: boolean;
}

/** Local joint poses, never a rotation or bounce of the complete character. */
export function getCatPose(motion: CatMotionName, frame: number): CatPose {
  const index = Math.max(0, Math.min(CAT_FRAME_COUNTS[motion] - 1, Math.floor(frame)));
  const pose: CatPose = { bodyY: 0, bodyAngle: 0, headAngle: 0, headY: 0,
    leftArm: .04, rightArm: -.04, leftLeg: .04, rightLeg: -.04,
    leftFootY: 0, rightFootY: 0, tail: 0, bag: 0, blink: false };
  if (motion === 'idle') {
    const breath = [0, .35, .15, -.15][index];
    return { ...pose, bodyY: breath, headY: -breath * .5,
      headAngle: [0, -.025, -.015, .015][index], tail: [0, .06, .035, -.035][index],
      bag: [0, -.025, -.01, .02][index], rightArm: -.04 - breath * .04, blink: index === 2 };
  }
  if (motion === 'run') {
    const phase = index * Math.PI / 4, stride = Math.sin(phase);
    return { ...pose, bodyY: -Math.abs(Math.sin(phase)) * .7,
      bodyAngle: .025, headAngle: -.025 + Math.sin(phase - .6) * .025,
      headY: Math.sin(phase * 2 - .5) * .22,
      leftArm: -.05 - stride * .46, rightArm: -.12 + stride * .4,
      leftLeg: stride * .42, rightLeg: -stride * .42,
      leftFootY: -Math.max(0, stride) * 1.4, rightFootY: -Math.max(0, -stride) * 1.4,
      tail: Math.sin(phase - .75) * .14, bag: Math.sin(phase - 1.1) * .13 };
  }
  if (motion === 'dash') {
    const poses = [
      { bodyY: 1, bodyAngle: -.08, headAngle: .05, leftLeg: -.32, rightLeg: .32, leftArm: -.25, rightArm: .15, tail: -.1, bag: .12 },
      { bodyY: -1.8, bodyAngle: .14, headAngle: -.1, leftLeg: .62, rightLeg: -.55, leftArm: .48, rightArm: -.48, tail: -.23, bag: -.22 },
      { bodyY: -1, bodyAngle: .09, headAngle: -.04, leftLeg: .35, rightLeg: -.24, leftArm: .25, rightArm: -.24, tail: -.11, bag: -.14 },
      { bodyY: .65, bodyAngle: -.025, headAngle: .035, leftLeg: -.12, rightLeg: .1, leftArm: -.12, rightArm: .08, tail: .11, bag: .09 },
    ];
    return { ...pose, ...poses[index] };
  }
  const lift = [0, .4, 1, .85, .55, 0][index];
  return { ...pose, bodyY: -lift * 1.2, headY: -lift * .25, headAngle: Math.sin(index * 1.2) * .055,
    leftArm: lift * 2.4, rightArm: -lift * 2.1, leftLeg: -.06 - lift * .12,
    rightLeg: .06 + lift * .12, tail: Math.sin(index * 1.4) * .12,
    bag: Math.sin(index * 1.1 - .5) * .1, blink: index === 3 };
}

export interface CatMotionInput { speed: number; paused?: boolean; reducedMotion?: boolean }
export interface CatMotionFrame { motion: CatMotionName; frame: number }

/** Simulation-clock state machine: paused scenes cannot advance an actor's limbs. */
export class CatMotionClock {
  private motion: CatMotionName = 'idle';
  private elapsed = 0;
  private duration = 0;
  private moving = false;

  dash(durationMs = 180): void {
    this.motion = 'dash'; this.elapsed = 0;
    this.duration = Math.max(80, Number.isFinite(durationMs) ? durationMs : 180);
  }
  celebrate(): void { this.motion = 'celebrate'; this.elapsed = 0; this.duration = 1000; }
  /** Movement cancellation (pause, rescue, scene exit) must also cancel its transient pose. */
  resetTransient(): void {
    this.motion = 'idle'; this.elapsed = 0; this.duration = 0; this.moving = false;
  }
  update(deltaMs: number, input: CatMotionInput): CatMotionFrame {
    const delta = input.paused || !Number.isFinite(deltaMs) ? 0 : Math.max(0, Math.min(100, deltaMs));
    if (!input.paused) {
      const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
      this.moving = speed > (this.moving ? 8 : 18);
      // Player movement has priority over a cosmetic reward gesture.
      if (this.motion === 'celebrate' && this.moving) {
        this.motion = 'run'; this.elapsed = 0; this.duration = 0;
      }
      if (this.motion === 'dash' || this.motion === 'celebrate') {
        this.elapsed += delta;
        if (this.elapsed >= this.duration) { this.motion = this.moving ? 'run' : 'idle'; this.elapsed = 0; }
      } else {
        const next = this.moving ? 'run' : 'idle';
        if (next !== this.motion) { this.motion = next; this.elapsed = 0; }
        const pace = this.motion === 'run' ? Math.max(.65, Math.min(1.65, speed / 170)) : 1;
        this.elapsed += delta * pace;
      }
    }
    if (this.motion === 'idle') {
      if (input.reducedMotion) return { motion: 'idle', frame: 0 };
      let remaining = this.elapsed % CAT_IDLE_DURATIONS.reduce((a, b) => a + b, 0);
      for (let frame = 0; frame < CAT_IDLE_DURATIONS.length; frame++) {
        if (remaining < CAT_IDLE_DURATIONS[frame]) return { motion: 'idle', frame };
        remaining -= CAT_IDLE_DURATIONS[frame];
      }
    }
    const count = CAT_FRAME_COUNTS[this.motion];
    return { motion: this.motion, frame: this.motion === 'run'
      ? Math.floor(this.elapsed / 85) % count
      : Math.min(count - 1, Math.floor(this.elapsed / this.duration * count)) };
  }
}
