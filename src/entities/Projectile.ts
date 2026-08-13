import Phaser from 'phaser';

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
  damage: number;
  piercing: boolean;
  homing: boolean;
  owner: 'player' | 'enemy';
  spd: number;
  private born: number;
  private lifespan = 3000;
  private launchAngle: number;
  hitSet = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene, opts: BulletOpts) {
    const tex = opts.owner === 'player' ? 'bullet_player' : 'bullet_enemy';
    super(scene, opts.x, opts.y, tex);
    scene.add.existing(this);

    this.damage = opts.damage;
    this.piercing = opts.piercing ?? false;
    this.homing = opts.homing ?? false;
    this.owner = opts.owner;
    this.spd = opts.speed;
    this.born = scene.time.now;
    this.launchAngle = opts.angle;
    this.rotation = opts.angle;
    this.setDepth(8);
  }

  launch(): void {
    const b = this.body as Phaser.Physics.Arcade.Body;
    if (!b) return;
    b.setCircle(3, 2, 2);
    b.setVelocity(
      Math.cos(this.launchAngle) * this.spd,
      Math.sin(this.launchAngle) * this.spd,
    );
  }

  tick(time: number): void {
    if (!this.active) return;

    if (time - this.born > this.lifespan ||
        this.x < -50 || this.x > 1650 || this.y < -50 || this.y > 1250) {
      this.destroy();
      return;
    }
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
