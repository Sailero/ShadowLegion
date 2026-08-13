import Phaser from 'phaser';
import { HERO_CFG, ARENA_WIDTH, ARENA_HEIGHT } from '../config/gameConfig';

export interface FireEvent {
  x: number;
  y: number;
  angle: number;
  damage: number;
  speed: number;
  piercing: boolean;
  homing: boolean;
  count: number;
  spreadAngle: number;
}

export class Hero extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  maxHp: number;

  moveSpeed: number;
  private accel: number;
  private decel: number;

  fireRate: number;
  private lastFire = 0;
  bulletDamage: number;
  bulletSpeed: number;
  bulletCount = 1;
  bulletPiercing = false;
  bulletHoming = false;
  spreadAngle = 0.25;

  private dashSpd: number;
  private dashDur: number;
  dashCooldown: number;
  private lastDash = 0;
  private dashing = false;
  private dashEnd = 0;
  private dashVx = 0;
  private dashVy = 0;
  dashDamage = 0;

  charge = 0;
  chargeMax: number;
  chargePerKill: number;
  chargeBlastRadius: number;
  chargeBlastDamage: number;

  hasShield = false;
  speedMult = 1;
  damageMult = 1;
  atkSpdMult = 1;
  magnetRadius: number;

  private invUntil = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // Phase 2 placeholder
  allies: Hero[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'hero');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setCircle(HERO_CFG.bodyRadius, 24 - HERO_CFG.bodyRadius, 24 - HERO_CFG.bodyRadius);
    b.setCollideWorldBounds(true);

    this.hp = HERO_CFG.maxHp;
    this.maxHp = HERO_CFG.maxHp;
    this.moveSpeed = HERO_CFG.speed;
    this.accel = HERO_CFG.accel;
    this.decel = HERO_CFG.decel;
    this.fireRate = HERO_CFG.fireRate;
    this.bulletDamage = HERO_CFG.bulletDamage;
    this.bulletSpeed = HERO_CFG.bulletSpeed;
    this.dashSpd = HERO_CFG.dashSpeed;
    this.dashDur = HERO_CFG.dashDuration;
    this.dashCooldown = HERO_CFG.dashCooldown;
    this.chargeMax = HERO_CFG.chargeMax;
    this.chargePerKill = HERO_CFG.chargePerKill;
    this.chargeBlastRadius = HERO_CFG.chargeBlastRadius;
    this.chargeBlastDamage = HERO_CFG.chargeBlastDamage;
    this.magnetRadius = HERO_CFG.magnetRadius;

    this.setDepth(10);
    this.setupKeys();
  }

  private setupKeys(): void {
    const kb = this.scene.input.keyboard!;
    this.keys = {
      W: kb.addKey('W', false),
      A: kb.addKey('A', false),
      S: kb.addKey('S', false),
      D: kb.addKey('D', false),
      SHIFT: kb.addKey('SHIFT', false),
      SPACE: kb.addKey('SPACE', false),
    };
  }

  get isDashing(): boolean { return this.dashing; }
  get isInvincible(): boolean { return this.dashing || this.scene.time.now < this.invUntil; }

  tick(time: number, delta: number): void {
    if (this.hp <= 0) return;
    const dt = delta / 1000;
    const body = this.body as Phaser.Physics.Arcade.Body;

    if (this.dashing) {
      if (time > this.dashEnd) {
        this.dashing = false;
        this.setAlpha(1);
      } else {
        body.setVelocity(this.dashVx, this.dashVy);
        return;
      }
    }

    let ix = 0, iy = 0;
    if (this.keys.A.isDown) ix -= 1;
    if (this.keys.D.isDown) ix += 1;
    if (this.keys.W.isDown) iy -= 1;
    if (this.keys.S.isDown) iy += 1;

    if (ix && iy) { const n = Math.SQRT1_2; ix *= n; iy *= n; }

    const maxSpd = this.moveSpeed * this.speedMult;

    if (ix || iy) {
      const tx = ix * maxSpd;
      const ty = iy * maxSpd;
      const lerp = Math.min(1, this.accel * dt / maxSpd);
      body.setVelocity(
        Phaser.Math.Linear(body.velocity.x, tx, lerp),
        Phaser.Math.Linear(body.velocity.y, ty, lerp),
      );
    } else {
      const spd = body.velocity.length();
      if (spd > 1) {
        const f = Math.max(0, 1 - this.decel * dt / spd);
        body.setVelocity(body.velocity.x * f, body.velocity.y * f);
      } else {
        body.setVelocity(0, 0);
      }
    }

    const ptr = this.scene.input.activePointer;
    const wp = this.scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
    this.rotation = Phaser.Math.Angle.Between(this.x, this.y, wp.x, wp.y);

    const interval = this.fireRate / this.atkSpdMult;
    if (ptr.isDown && !ptr.rightButtonDown() && time > this.lastFire + interval) {
      this.fire(time, wp.x, wp.y);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.SHIFT)) {
      this.dash(time);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && this.charge >= this.chargeMax) {
      this.blast();
    }
  }

  private fire(time: number, tx: number, ty: number): void {
    this.lastFire = time;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const ev: FireEvent = {
      x: this.x + Math.cos(angle) * 20,
      y: this.y + Math.sin(angle) * 20,
      angle,
      damage: this.bulletDamage * this.damageMult,
      speed: this.bulletSpeed,
      piercing: this.bulletPiercing,
      homing: this.bulletHoming,
      count: this.bulletCount,
      spreadAngle: this.spreadAngle,
    };
    this.scene.events.emit('heroFire', ev);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.velocity.x -= Math.cos(angle) * 30;
    body.velocity.y -= Math.sin(angle) * 30;
  }

  dash(time: number): void {
    if (time < this.lastDash + this.dashCooldown) return;
    const body = this.body as Phaser.Physics.Arcade.Body;

    let angle: number;
    if (body.velocity.length() > 20) {
      angle = Math.atan2(body.velocity.y, body.velocity.x);
    } else {
      angle = this.rotation;
    }

    this.dashing = true;
    this.lastDash = time;
    this.dashEnd = time + this.dashDur;
    this.dashVx = Math.cos(angle) * this.dashSpd;
    this.dashVy = Math.sin(angle) * this.dashSpd;
    body.setVelocity(this.dashVx, this.dashVy);
    this.setAlpha(0.5);

    this.scene.events.emit('heroDash', { x: this.x, y: this.y, angle });
  }

  private blast(): void {
    this.charge = 0;
    this.scene.events.emit('heroBlast', {
      x: this.x, y: this.y,
      radius: this.chargeBlastRadius,
      damage: this.chargeBlastDamage * this.damageMult,
    });
  }

  takeDamage(amount: number): boolean {
    if (this.isInvincible) return false;

    if (this.hasShield) {
      this.hasShield = false;
      this.scene.events.emit('shieldBreak', { x: this.x, y: this.y });
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.invUntil = this.scene.time.now + HERO_CFG.invincibleMs;
    this.scene.events.emit('heroHit', { x: this.x, y: this.y, damage: amount });

    if (this.hp <= 0) {
      this.scene.events.emit('heroDeath');
      this.setActive(false).setVisible(false);
      return true;
    }
    return false;
  }

  addCharge(amount: number): void {
    this.charge = Math.min(this.chargeMax, this.charge + amount);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  dashCooldownPct(time: number): number {
    return Math.min(1, (time - this.lastDash) / this.dashCooldown);
  }

  getStateVector(): number[] {
    const b = this.body as Phaser.Physics.Arcade.Body;
    return [
      this.x / ARENA_WIDTH, this.y / ARENA_HEIGHT,
      b.velocity.x / 200, b.velocity.y / 200,
      this.hp / this.maxHp, this.rotation / Math.PI,
      this.dashing ? 1 : 0, this.charge / this.chargeMax,
    ];
  }
}
