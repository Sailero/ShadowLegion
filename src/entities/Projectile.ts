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
}

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage = 0;
  piercing = false;
  homing = false;
  owner: 'player' | 'enemy' = 'player';
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
    this.spd = opts.speed;
    this.born = this.scene.time.now;
    this.launchAngle = opts.angle;
    this.rotation = opts.angle;
    this.hitSet.clear();
    this.setTexture(opts.owner === 'player' ? 'bullet_player' : 'bullet_enemy');
  }

  launch(): void {
    const b = this.body as Phaser.Physics.Arcade.Body;
    if (!b) return;
    b.setCircle(3, 2, 2);
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

  homeToward(tx: number, ty: number): void {
    const a = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const b = this.body as Phaser.Physics.Arcade.Body;
    const cur = Math.atan2(b.velocity.y, b.velocity.x);
    const diff = Phaser.Math.Angle.Wrap(a - cur);
    const turn = Phaser.Math.Clamp(diff, -0.06, 0.06);
    const na = cur + turn;
    b.setVelocity(Math.cos(na) * this.spd, Math.sin(na) * this.spd);
    this.rotation = na;
  }
}
