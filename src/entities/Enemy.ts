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
  private bossWindup = false;
  private bossWindupEnd = 0;
  private bossChargeAngle = 0;
  private bossCharging = false;
  private bossChargeEnd = 0;

  private _dying = false;
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
    const spawnedAt = scene.time.now;
    this.lastFire = spawnedAt;
    this.bossLastCharge = spawnedAt;
    this.lastSummon = spawnedAt;
    this.lastLunge = spawnedAt;
    this.lastDodge = spawnedAt;

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

    // Keep all enemies inside arena bounds
    const margin = 30;
    const ww = this.scene.physics.world.bounds.width;
    const wh = this.scene.physics.world.bounds.height;
    this.x = Phaser.Math.Clamp(this.x, margin, ww - margin);
    this.y = Phaser.Math.Clamp(this.y, margin, wh - margin);
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

    // Clamp boss position to stay well inside arena
    const margin = 60;
    const worldW = this.scene.physics.world.bounds.width;
    const worldH = this.scene.physics.world.bounds.height;
    if (this.x < margin || this.x > worldW - margin || this.y < margin || this.y > worldH - margin) {
      this.x = Phaser.Math.Clamp(this.x, margin, worldW - margin);
      this.y = Phaser.Math.Clamp(this.y, margin, worldH - margin);
      if (this.bossCharging) {
        this.bossCharging = false;
        this.clearTint();
      }
      const toCenter = Phaser.Math.Angle.Between(this.x, this.y, worldW / 2, worldH / 2);
      b.setVelocity(Math.cos(toCenter) * this.spd * 2, Math.sin(toCenter) * this.spd * 2);
      return;
    }

    if (this.bossWindup) {
      b.setVelocity(0, 0);
      this.rotation = this.bossChargeAngle;
      if (time >= this.bossWindupEnd) {
        this.bossWindup = false;
        this.bossCharging = true;
        this.bossChargeEnd = time + 520;
        b.setVelocity(
          Math.cos(this.bossChargeAngle) * this.spd * 7,
          Math.sin(this.bossChargeAngle) * this.spd * 7,
        );
        this.setTint(0xff4444);

        const shots = this.cfg.ranged ? 5 : 3;
        for (let i = 0; i < shots; i++) {
          const shotAngle = this.bossChargeAngle + (i - (shots - 1) / 2) * 0.18;
          this.scene.events.emit('enemyFire', {
            x: this.x, y: this.y,
            angle: shotAngle,
            speed: (this.cfg.bulletSpeed || 250) * 1.25,
            damage: (this.cfg.bulletDamage || 14) * 1.25,
          });
        }
      }
      return;
    }

    if (this.bossCharging) {
      if (time > this.bossChargeEnd) {
        this.bossCharging = false;
        this.clearTint();
      }
      return;
    }

    // Telegraph first, then commit to a fixed charge line. The player can read
    // and counter the attack instead of being hit by an instant speed spike.
    if (time > this.bossLastCharge + this.bossChargeCD) {
      this.bossLastCharge = time;
      this.bossWindup = true;
      this.bossWindupEnd = time + 750;
      this.bossChargeAngle = a;
      b.setVelocity(0, 0);
      this.setTint(0xffaa44);
      this.scene.events.emit('bossTelegraph', {
        x: this.x, y: this.y, angle: a, duration: 750,
      });
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, hx, hy);

    const isNinjaBoss = this.cfg.key === 'ninja';
    const isArcherBoss = this.cfg.key === 'archer';

    if (isNinjaBoss) {
      // Ninja boss: erratic fast orbiting + frequent teleport-lunges
      if (time > this.changeDirTime) {
        this.offsetAngle = (Math.random() - 0.5) * 4;
        this.changeDirTime = time + 80 + Math.random() * 150;
      }
      if (dist < 100) {
        const away = a + Math.PI + this.offsetAngle;
        b.setVelocity(Math.cos(away) * this.spd * 2.5, Math.sin(away) * this.spd * 2.5);
      } else if (dist < 250) {
        const orbit = a + Math.PI / 2 + this.offsetAngle;
        b.setVelocity(Math.cos(orbit) * this.spd * 1.8, Math.sin(orbit) * this.spd * 1.8);
      } else {
        b.setVelocity(Math.cos(a) * this.spd * 1.6, Math.sin(a) * this.spd * 1.6);
      }
    } else if (isArcherBoss) {
      // Archer boss: keep distance, strafe, heavy ranged
      const kd = 300;
      if (dist < kd - 60) {
        b.setVelocity(-Math.cos(a) * this.spd * 1.5, -Math.sin(a) * this.spd * 1.5);
      } else if (dist > kd + 80) {
        b.setVelocity(Math.cos(a) * this.spd, Math.sin(a) * this.spd);
      } else {
        const strafe = a + Math.PI / 2 * (Math.sin(time * 0.002) > 0 ? 1 : -1);
        b.setVelocity(Math.cos(strafe) * this.spd * 0.8, Math.sin(strafe) * this.spd * 0.8);
      }
    } else {
      if (dist < 160) {
        const orbitDir = Math.sin(time * 0.0015) > 0 ? 1 : -1;
        const orbit = a + Math.PI / 2 * orbitDir;
        b.setVelocity(Math.cos(orbit) * this.spd * 1.3, Math.sin(orbit) * this.spd * 1.3);
      } else {
        b.setVelocity(Math.cos(a) * this.spd * 1.1, Math.sin(a) * this.spd * 1.1);
      }
    }

    const fr = isNinjaBoss ? 600 : isArcherBoss ? 800 : ((this.cfg.fireRate || 1400) * 0.5);
    if (time > this.lastFire + fr && dist < 500) {
      this.lastFire = time;
      if (isNinjaBoss) {
        // Ninja boss: rapid 5-way shuriken spread
        for (let i = -2; i <= 2; i++) {
          this.scene.events.emit('enemyFire', {
            x: this.x, y: this.y, angle: a + i * 0.3,
            speed: 320, damage: (this.cfg.bulletDamage || 14) * 1.2,
          });
        }
      } else if (isArcherBoss) {
        // Archer boss: accurate long-range volleys
        const cnt = 5;
        for (let i = 0; i < cnt; i++) {
          const sa = a + (i - (cnt - 1) / 2) * 0.12;
          this.scene.events.emit('enemyFire', {
            x: this.x, y: this.y, angle: sa,
            speed: 350, damage: (this.cfg.bulletDamage || 16) * 1.5,
          });
        }
      } else {
        const isRing = Math.random() < 0.3;
        if (isRing) {
          for (let i = 0; i < 8; i++) {
            const ra = (Math.PI * 2 / 8) * i;
            this.scene.events.emit('enemyFire', {
              x: this.x, y: this.y, angle: ra,
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

    this.canDodge = true;

    if (dist < 50) {
      const away = a + Math.PI + (Math.random() - 0.5) * 0.8;
      b.setVelocity(Math.cos(away) * this.spd * 2.5, Math.sin(away) * this.spd * 2.5);
    } else if (dist < 120) {
      if (time > this.changeDirTime) {
        this.offsetAngle = (Math.random() - 0.5) * 3.5;
        this.changeDirTime = time + 100 + Math.random() * 200;
      }
      const orbit = a + Math.PI / 2 + this.offsetAngle;
      b.setVelocity(Math.cos(orbit) * this.spd * 1.6, Math.sin(orbit) * this.spd * 1.6);
    } else if (dist < 250 && dist > 180) {
      // Lunge: sudden dash toward player
      if (!this.canLunge) this.canLunge = true;
      if (time > this.lastLunge + 2500) {
        this.triggerLunge(time, a);
      } else {
        const approach = a + (Math.sin(time * 0.005) * 0.6);
        b.setVelocity(Math.cos(approach) * this.spd * 1.2, Math.sin(approach) * this.spd * 1.2);
      }
    } else {
      const approach = a + (Math.sin(time * 0.004) * 0.7);
      b.setVelocity(Math.cos(approach) * this.spd * 1.3, Math.sin(approach) * this.spd * 1.3);
    }
    this.rotation = a;

    // Throw shuriken frequently
    const fr = this.cfg.fireRate || 1200;
    if (time > this.lastFire + fr && dist < 350) {
      this.lastFire = time;
      for (let i = -1; i <= 1; i++) {
        this.scene.events.emit('enemyFire', {
          x: this.x + Math.cos(a) * 12, y: this.y + Math.sin(a) * 12,
          angle: a + i * 0.25,
          speed: this.cfg.bulletSpeed || 280,
          damage: this.cfg.bulletDamage || 14,
        });
      }
    }
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
    if (!this.active || this._dying) return false;
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
    if (this._dying) return;
    this._dying = true;
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
