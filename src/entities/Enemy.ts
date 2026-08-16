import Phaser from 'phaser';
import { EnemyType, ELITE, WAVE_CFG } from '../config/gameConfig';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  cfg: EnemyType;
  hp: number;
  maxHp: number;
  dmg: number;
  spd: number;
  xpVal: number;
  scoreVal: number;
  isElite: boolean;
  isBoss: boolean;

  private lastFire = 0;
  private changeDirTime = 0;
  private offsetAngle = 0;
  private eliteGlow: Phaser.GameObjects.Sprite | null = null;

  private bossChargeCD = 3000;
  private bossLastCharge = 0;
  private bossCharging = false;
  private bossChargeEnd = 0;

  canSplit = false;
  private splitDone = false;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    cfg: EnemyType, elite = false, boss = false,
  ) {
    const tex = `enemy_${cfg.key}`;
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.cfg = cfg;
    this.isElite = elite;
    this.isBoss = boss;

    let hpMul = 1, spdMul = 1, dmgMul = 1, xpMul = 1, scMul = 1, sizeMul = 1;
    if (elite) { hpMul = ELITE.hp; spdMul = ELITE.speed; dmgMul = ELITE.damage; xpMul = ELITE.xp; scMul = ELITE.score; sizeMul = 1.15; }
    if (boss) { hpMul *= WAVE_CFG.bossHp; sizeMul = WAVE_CFG.bossSize; dmgMul *= WAVE_CFG.bossDmg; spdMul *= WAVE_CFG.bossSpeed; xpMul *= 10; scMul *= 10; }

    this.hp = Math.round(cfg.hp * hpMul);
    this.maxHp = this.hp;
    this.dmg = Math.round(cfg.damage * dmgMul);
    this.spd = cfg.speed * spdMul;
    this.xpVal = Math.round(cfg.xp * xpMul);
    this.scoreVal = Math.round(cfg.score * scMul);

    const br = cfg.bodyRadius * sizeMul;
    const b = this.body as Phaser.Physics.Arcade.Body;
    const texW = this.width;
    const texH = this.height;
    b.setCircle(br, texW / 2 - br, texH / 2 - br);
    b.setCollideWorldBounds(true);
    b.setBounce(0.3);

    this.setScale(sizeMul);
    this.setDepth(5);

    if (elite || boss) {
      this.eliteGlow = scene.add.sprite(x, y, 'elite_glow');
      this.eliteGlow.setScale(sizeMul * 1.1);
      this.eliteGlow.setDepth(4);
      this.eliteGlow.setAlpha(0.6);
    }
  }

  tick(time: number, _delta: number, heroX: number, heroY: number): void {
    if (!this.active) return;

    if (this.eliteGlow) {
      this.eliteGlow.setPosition(this.x, this.y);
    }

    if (this.isBoss) {
      this.bossAI(time, heroX, heroY);
      return;
    }

    switch (this.cfg.key) {
      case 'slime':
      case 'tank':
        this.chaseAI(heroX, heroY);
        break;
      case 'bat':
        this.batAI(time, heroX, heroY);
        break;
      case 'archer':
        this.archerAI(time, heroX, heroY);
        break;
    }
  }

  private chaseAI(hx: number, hy: number): void {
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setVelocity(Math.cos(a) * this.spd, Math.sin(a) * this.spd);
    this.rotation = a;
  }

  private batAI(time: number, hx: number, hy: number): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);

    if (time > this.changeDirTime) {
      this.offsetAngle = (Math.random() - 0.5) * 2.0;
      this.changeDirTime = time + 300 + Math.random() * 500;
    }

    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;

    if (dist < 60) {
      const orbitAngle = baseAngle + Math.PI / 2 + this.offsetAngle * 0.3;
      b.setVelocity(Math.cos(orbitAngle) * this.spd * 1.2, Math.sin(orbitAngle) * this.spd * 1.2);
    } else {
      const a = baseAngle + this.offsetAngle;
      b.setVelocity(Math.cos(a) * this.spd, Math.sin(a) * this.spd);
    }
    this.rotation = baseAngle;
  }

  private archerAI(time: number, hx: number, hy: number): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const kd = this.cfg.keepDistance || 200;
    const b = this.body as Phaser.Physics.Arcade.Body;

    if (dist < kd - 30) {
      b.setVelocity(-Math.cos(a) * this.spd, -Math.sin(a) * this.spd);
    } else if (dist > kd + 50) {
      b.setVelocity(Math.cos(a) * this.spd * 0.6, Math.sin(a) * this.spd * 0.6);
    } else {
      const strafe = a + Math.PI / 2;
      b.setVelocity(Math.cos(strafe) * this.spd * 0.4, Math.sin(strafe) * this.spd * 0.4);
    }
    this.rotation = a;

    const fr = this.cfg.fireRate || 2000;
    if (time > this.lastFire + fr && dist < 400) {
      this.lastFire = time;
      this.scene.events.emit('enemyFire', {
        x: this.x + Math.cos(a) * 16,
        y: this.y + Math.sin(a) * 16,
        angle: a,
        speed: this.cfg.bulletSpeed || 200,
        damage: this.cfg.bulletDamage || 12,
      });
    }
  }

  private bossAI(time: number, hx: number, hy: number): void {
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;
    this.rotation = a;

    if (this.bossCharging) {
      if (time > this.bossChargeEnd) {
        this.bossCharging = false;
        this.setTint(0xffffff);
      }
      return;
    }

    if (time > this.bossLastCharge + this.bossChargeCD) {
      this.bossCharging = true;
      this.bossLastCharge = time;
      this.bossChargeEnd = time + 400;
      b.setVelocity(Math.cos(a) * this.spd * 6, Math.sin(a) * this.spd * 6);
      this.setTint(0xff4444);

      if (this.cfg.ranged) {
        for (let i = -1; i <= 1; i++) {
          this.scene.events.emit('enemyFire', {
            x: this.x, y: this.y,
            angle: a + i * 0.3,
            speed: (this.cfg.bulletSpeed || 200) * 1.3,
            damage: (this.cfg.bulletDamage || 12) * 1.5,
          });
        }
      }
      return;
    }

    b.setVelocity(Math.cos(a) * this.spd, Math.sin(a) * this.spd);
  }

  takeDamage(amount: number): boolean {
    if (!this.active) return false;
    this.hp -= amount;

    if (this.hp <= 0) {
      this.die();
      return true;
    }

    if (this.canSplit && !this.splitDone && this.hp <= this.maxHp * 0.4) {
      this.splitDone = true;
      this.scene.events.emit('enemySplit', {
        x: this.x, y: this.y, type: this.cfg.key,
      });
    }

    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(50, () => {
      if (this.active && this.scene) {
        this.clearTint();
        if (this.isElite || this.isBoss) this.setTint(0xffffff);
      }
    });
    return false;
  }

  knockback(fromX: number, fromY: number, force: number): void {
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const b = this.body as Phaser.Physics.Arcade.Body;
    b.velocity.x += Math.cos(a) * force;
    b.velocity.y += Math.sin(a) * force;
  }

  private die(): void {
    this.scene.events.emit('enemyDeath', {
      x: this.x, y: this.y,
      xp: this.xpVal, score: this.scoreVal,
      color: this.cfg.color, isBoss: this.isBoss,
    });
    if (this.eliteGlow) {
      this.eliteGlow.destroy();
      this.eliteGlow = null;
    }
    this.destroy();
  }

  override destroy(fromScene?: boolean): void {
    if (this.eliteGlow) {
      this.eliteGlow.destroy();
      this.eliteGlow = null;
    }
    super.destroy(fromScene);
  }
}
