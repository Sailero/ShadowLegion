import { getBattleTime } from '../systems/BattleClock';
import Phaser from 'phaser';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../config/gameConfig';

export interface BulletOpts {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  piercing?: boolean;
  homing?: boolean;
  owner: 'player' | 'enemy';
  source?: 'hero' | 'shadow' | 'rival';
}

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage = 0;
  piercing = false;
  homing = false;
  owner: 'player' | 'enemy' = 'player';
  source: 'hero' | 'shadow' | 'rival' = 'hero';
  spd = 0;
  private born = 0;
  private lifespan = 3000;
  private launchAngle = 0;
  hitSet = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene, x: number, y: number, tex: string) {
    super(scene, x, y, tex);
    scene.add.existing(this);
    this.setDepth(8);
  }

  fire(opts: BulletOpts): void {
    this.setPosition(opts.x, opts.y);
    this.setActive(true).setVisible(true);
    this.damage = opts.damage;
    this.piercing = opts.piercing ?? false;
    this.homing = opts.homing ?? false;
    this.owner = opts.owner;
    this.source = opts.source ?? 'hero';
    this.spd = opts.speed;
    this.born = getBattleTime(this.scene);
    this.launchAngle = opts.angle;
    this.rotation = opts.angle;
    this.hitSet.clear();
    this.setTexture(opts.owner === 'player' ? 'bullet_player' : 'bullet_enemy');
    this.clearTint();
    if (this.source === 'shadow') this.setTint(0x68aa98);
    if (this.source === 'rival') this.setTint(0xbc7192);
  }

  launch(): void {
    const b = this.body as Phaser.Physics.Arcade.Body;
    if (!b) return;
    const r = this.owner === 'enemy' ? 6 : 3;
    b.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    b.enable = true;
    b.setVelocity(
      Math.cos(this.launchAngle) * this.spd,
      Math.sin(this.launchAngle) * this.spd,
    );
  }

  tick(time: number): void {
    if (!this.active) return;

    if (time - this.born > this.lifespan ||
        this.x < -50 || this.x > ARENA_WIDTH + 50 || this.y < -50 || this.y > ARENA_HEIGHT + 50) {
      this.recycle();
      return;
    }
  }

  recycle(): void {
    this.setActive(false).setVisible(false);
    const b = this.body as Phaser.Physics.Arcade.Body;
    if (b) {
      b.setVelocity(0, 0);
      b.enable = false;
    }
    this.hitSet.clear();
  }

  static readonly HOMING_RANGE = 100;

  tryHomeToward(enemies: Phaser.GameObjects.GameObject[]): void {
    let target: Phaser.Physics.Arcade.Sprite | null = null;
    let minD = Infinity;

    for (const c of enemies) {
      if (!c.active || this.hitSet.has(c)) continue;
      const e = c as Phaser.Physics.Arcade.Sprite;
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (d < Projectile.HOMING_RANGE && d < minD) {
        minD = d;
        target = e;
      }
    }
    if (!target) return;

    const b = this.body as Phaser.Physics.Arcade.Body;
    const tb = target.body as Phaser.Physics.Arcade.Body | null;

    let aimX = target.x;
    let aimY = target.y;

    if (tb && this.spd > 0) {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const evx = tb.velocity.x;
      const evy = tb.velocity.y;

      const a2 = evx * evx + evy * evy - this.spd * this.spd;
      const b2 = 2 * (dx * evx + dy * evy);
      const c2 = dx * dx + dy * dy;

      let t = 0;
      if (Math.abs(a2) < 0.001) {
        if (Math.abs(b2) > 0.001) t = -c2 / b2;
      } else {
        const disc = b2 * b2 - 4 * a2 * c2;
        if (disc >= 0) {
          const sqrtD = Math.sqrt(disc);
          const t1 = (-b2 + sqrtD) / (2 * a2);
          const t2 = (-b2 - sqrtD) / (2 * a2);
          if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
          else if (t1 > 0) t = t1;
          else if (t2 > 0) t = t2;
        }
      }

      t = Phaser.Math.Clamp(t, 0, 0.6);
      aimX = target.x + evx * t;
      aimY = target.y + evy * t;
    }

    // Instant turn: no turn-rate limit, directly aim at predicted intercept point
    const na = Phaser.Math.Angle.Between(this.x, this.y, aimX, aimY);
    b.setVelocity(Math.cos(na) * this.spd, Math.sin(na) * this.spd);
    this.rotation = na;
  }
}
