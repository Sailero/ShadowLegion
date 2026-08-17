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

  // Elite abilities
  private canDodge = false;
  private dodgeCooldown = 2000;
  private lastDodge = 0;
  private isDodging = false;
  private dodgeEnd = 0;

  private canLunge = false;
  private lungeCooldown = 3500;
  private lastLunge = 0;
  private isLunging = false;
  private lungeEnd = 0;

  // Summoner state
  private summonCooldown = 5000;
  private lastSummon = 0;

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

    // Elite abilities
    if (elite && !boss) {
      if (cfg.key === 'bat' || cfg.key === 'ninja') {
        this.canDodge = true;
      }
      if (cfg.key === 'tank' || cfg.key === 'slime') {
        this.canLunge = true;
      }
    }

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
      case 'ninja':
        this.ninjaAI(time, heroX, heroY);
        break;
      case 'summoner':
        this.summonerAI(time, heroX, heroY);
        break;
    }

    // Dodge movement
    if (this.isDodging) {
      if (time > this.dodgeEnd) {
        this.isDodging = false;
        this.setAlpha(1);
      }
    }
    // Lunge end
    if (this.isLunging && time > this.lungeEnd) {
      this.isLunging = false;
      this.clearTint();
      if (this.isElite) this.setTint(0xffffff);
    }
  }

  private chaseAI(hx: number, hy: number): void {
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;
    // Tank: slow but relentless; speed boost when close
    if (this.cfg.key === 'tank' && dist < 100) {
      b.setVelocity(Math.cos(a) * this.spd * 1.6, Math.sin(a) * this.spd * 1.6);
    } else {
      b.setVelocity(Math.cos(a) * this.spd, Math.sin(a) * this.spd);
    }
    this.rotation = a;
  }

  private batAI(time: number, hx: number, hy: number): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);

    if (time > this.changeDirTime) {
      this.offsetAngle = (Math.random() - 0.5) * 2.5;
      this.changeDirTime = time + 200 + Math.random() * 400;
    }

    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;

    if (dist < 50) {
      // Quick dash through the player
      const dashAngle = baseAngle + (Math.random() > 0.5 ? 1 : -1) * Math.PI * 0.4;
      b.setVelocity(Math.cos(dashAngle) * this.spd * 1.8, Math.sin(dashAngle) * this.spd * 1.8);
    } else if (dist < 120) {
      const orbitAngle = baseAngle + Math.PI / 2 + this.offsetAngle * 0.5;
      b.setVelocity(Math.cos(orbitAngle) * this.spd * 1.3, Math.sin(orbitAngle) * this.spd * 1.3);
    } else {
      const a = baseAngle + this.offsetAngle * 0.6;
      b.setVelocity(Math.cos(a) * this.spd, Math.sin(a) * this.spd);
    }
    this.rotation = baseAngle;
  }

  private archerAI(time: number, hx: number, hy: number): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const kd = this.cfg.keepDistance || 220;
    const b = this.body as Phaser.Physics.Arcade.Body;

    if (dist < kd - 40) {
      b.setVelocity(-Math.cos(a) * this.spd * 1.3, -Math.sin(a) * this.spd * 1.3);
    } else if (dist > kd + 60) {
      b.setVelocity(Math.cos(a) * this.spd * 0.7, Math.sin(a) * this.spd * 0.7);
    } else {
      const strafe = a + Math.PI / 2 * (Math.sin(time * 0.002) > 0 ? 1 : -1);
      b.setVelocity(Math.cos(strafe) * this.spd * 0.5, Math.sin(strafe) * this.spd * 0.5);
    }
    this.rotation = a;

    const fr = this.cfg.fireRate || 1400;
    if (time > this.lastFire + fr && dist < 450) {
      this.lastFire = time;
      const spread = this.isElite ? 0.25 : 0.15;
      const bulletCount = this.isElite ? 3 : 2;
      for (let i = 0; i < bulletCount; i++) {
        const offset = (i - (bulletCount - 1) / 2) * spread;
        this.scene.events.emit('enemyFire', {
          x: this.x + Math.cos(a) * 16,
          y: this.y + Math.sin(a) * 16,
          angle: a + offset,
          speed: this.cfg.bulletSpeed || 300,
          damage: this.cfg.bulletDamage || 16,
        });
      }
    }
  }

  private bossAI(time: number, hx: number, hy: number): void {
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;
    this.rotation = a;

    if (this.bossCharging) {
      if (time > this.bossChargeEnd) {
        this.bossCharging = false;
        this.clearTint();
      }
      return;
    }

    // Boss charge attack with spread shot
    if (time > this.bossLastCharge + this.bossChargeCD) {
      this.bossCharging = true;
      this.bossLastCharge = time;
      this.bossChargeEnd = time + 600;
      b.setVelocity(Math.cos(a) * this.spd * 8, Math.sin(a) * this.spd * 8);
      this.setTint(0xff4444);

      const shots = this.cfg.ranged ? 7 : 5;
      for (let i = 0; i < shots; i++) {
        const sa = a + (i - (shots - 1) / 2) * 0.2;
        this.scene.events.emit('enemyFire', {
          x: this.x, y: this.y,
          angle: sa,
          speed: (this.cfg.bulletSpeed || 250) * 1.5,
          damage: (this.cfg.bulletDamage || 14) * 1.5,
        });
      }
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);

    // Boss movement: orbit when close, chase when far
    if (dist < 160) {
      const orbitDir = Math.sin(time * 0.0015) > 0 ? 1 : -1;
      const orbit = a + Math.PI / 2 * orbitDir;
      b.setVelocity(Math.cos(orbit) * this.spd * 1.3, Math.sin(orbit) * this.spd * 1.3);
    } else {
      b.setVelocity(Math.cos(a) * this.spd * 1.1, Math.sin(a) * this.spd * 1.1);
    }

    // Boss always has ranged auto-attack
    const fr = ((this.cfg.fireRate || 1400) * 0.5);
    if (time > this.lastFire + fr && dist < 500) {
      this.lastFire = time;
      // Ring shot every 3rd attack
      const isRing = Math.random() < 0.3;
      if (isRing) {
        for (let i = 0; i < 8; i++) {
          const ra = (Math.PI * 2 / 8) * i;
          this.scene.events.emit('enemyFire', {
            x: this.x, y: this.y,
            angle: ra,
            speed: (this.cfg.bulletSpeed || 250) * 0.8,
            damage: (this.cfg.bulletDamage || 14),
          });
        }
      } else {
        const cnt = this.cfg.ranged ? 3 : 2;
        for (let i = 0; i < cnt; i++) {
          const spread = (i - (cnt - 1) / 2) * 0.15;
          this.scene.events.emit('enemyFire', {
            x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 20,
            angle: a + spread,
            speed: this.cfg.bulletSpeed || 300,
            damage: this.cfg.bulletDamage || 16,
          });
        }
      }
    }
  }

  // Public method so ArenaScene can trigger dodge
  triggerDodge(time: number, awayAngle: number): void {
    if (!this.canDodge || this.isDodging || time < this.lastDodge + this.dodgeCooldown) return;
    this.isDodging = true;
    this.lastDodge = time;
    this.dodgeEnd = time + 200;
    this.setAlpha(0.4);
    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setVelocity(Math.cos(awayAngle) * this.spd * 4, Math.sin(awayAngle) * this.spd * 4);
  }

  triggerLunge(time: number, towardAngle: number): void {
    if (!this.canLunge || this.isLunging || time < this.lastLunge + this.lungeCooldown) return;
    this.isLunging = true;
    this.lastLunge = time;
    this.lungeEnd = time + 300;
    this.setTint(0xff6666);
    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setVelocity(Math.cos(towardAngle) * this.spd * 5, Math.sin(towardAngle) * this.spd * 5);
  }

  get hasDodge(): boolean { return this.canDodge; }
  get hasLunge(): boolean { return this.canLunge; }
  get dodging(): boolean { return this.isDodging; }

  private ninjaAI(time: number, hx: number, hy: number): void {
    if (this.isDodging || this.isLunging) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const b = this.body as Phaser.Physics.Arcade.Body;

    if (dist < 40) {
      // Hit and run: dash away after getting close
      const away = a + Math.PI + (Math.random() - 0.5) * 1.0;
      b.setVelocity(Math.cos(away) * this.spd * 2, Math.sin(away) * this.spd * 2);
    } else if (dist < 150) {
      // Circle player with erratic movement
      if (time > this.changeDirTime) {
        this.offsetAngle = (Math.random() - 0.5) * 3;
        this.changeDirTime = time + 150 + Math.random() * 250;
      }
      const orbit = a + Math.PI / 2 + this.offsetAngle;
      b.setVelocity(Math.cos(orbit) * this.spd * 1.4, Math.sin(orbit) * this.spd * 1.4);
    } else {
      // Approach from an angle
      const approach = a + (Math.sin(time * 0.003) * 0.8);
      b.setVelocity(Math.cos(approach) * this.spd, Math.sin(approach) * this.spd);
    }
    this.rotation = a;

    // Ninja always has dodge ability
    this.canDodge = true;
  }

  private summonerAI(time: number, hx: number, hy: number): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);
    const a = Phaser.Math.Angle.Between(this.x, this.y, hx, hy);
    const kd = this.cfg.keepDistance || 280;
    const b = this.body as Phaser.Physics.Arcade.Body;

    // Keep far distance
    if (dist < kd - 50) {
      b.setVelocity(-Math.cos(a) * this.spd * 1.5, -Math.sin(a) * this.spd * 1.5);
    } else if (dist > kd + 80) {
      b.setVelocity(Math.cos(a) * this.spd * 0.6, Math.sin(a) * this.spd * 0.6);
    } else {
      const strafe = a + Math.PI / 2 * (Math.sin(time * 0.0015) > 0 ? 1 : -1);
      b.setVelocity(Math.cos(strafe) * this.spd * 0.4, Math.sin(strafe) * this.spd * 0.4);
    }
    this.rotation = a;

    // Ranged attack
    const fr = this.cfg.fireRate || 2000;
    if (time > this.lastFire + fr && dist < 500) {
      this.lastFire = time;
      // Fires 3 homing-ish spread bullets
      for (let i = -1; i <= 1; i++) {
        this.scene.events.emit('enemyFire', {
          x: this.x + Math.cos(a) * 14,
          y: this.y + Math.sin(a) * 14,
          angle: a + i * 0.3,
          speed: this.cfg.bulletSpeed || 220,
          damage: this.cfg.bulletDamage || 12,
        });
      }
    }

    // Summon minions
    if (time > this.lastSummon + this.summonCooldown) {
      this.lastSummon = time;
      this.scene.events.emit('enemySummon', { x: this.x, y: this.y, count: 2 });
    }
  }

  takeDamage(amount: number): boolean {
    if (!this.active) return false;
    // Dodging enemies take reduced damage
    if (this.isDodging) amount = Math.round(amount * 0.3);
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
