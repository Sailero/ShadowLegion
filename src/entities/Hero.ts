import { getBattleTime } from '../systems/BattleClock';
import Phaser from 'phaser';
import { HERO_CFG, ARENA_WIDTH, ARENA_HEIGHT } from '../config/gameConfig';
import { getSkill, getSkillStatsForLevel } from '../data/skills';
import { SettingsManager } from '../systems/SettingsManager';
import { DiscreteActionInput } from '../systems/DiscreteActionInput';
import { CatAnimator, catAnimationKey } from '../systems/CatAnimator';
import { getOperativeVisual } from '../data/operativeVisuals';
import type { OperativeId } from '../data/operatives';

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
  aimAngle = 0;
  bulletDamage: number;
  bulletSpeed: number;
  bulletCount = 1;
  bulletPiercing = false;
  bulletHoming = false;
  spreadAngle = 0.25;

  private dashSpd: number;
  private dashDur: number;
  dashCooldown: number;
  private lastDash = -10000;
  private dashing = false;
  private dashEnd = 0;
  private dashVx = 0;
  private dashVy = 0;
  dashDamage = 0; // legacy; use dashDamageMult for scaling

  /* ── Skill system ── */
  charge = 0;
  chargeMax: number;
  chargePerKill: number;
  activeSkillId = 'burst';
  skillLevels: Record<string, number> = { burst: 1 };
  unlockedSkills: string[] = ['burst'];

  /* ── Barrage state ── */
  barrageEndTime = 0;
  private barrageInterval = 120;
  private lastBarrageFire = 0;

  /* ── TimeRift state ── */
  timeRiftEndTime = 0;

  shieldStacks = 0;
  critChance = 0;
  lifesteal = 0;
  explosiveShot = 0;
  ricochetShot = 0;
  frostShot = 0;
  berserk = 0;
  thorns = 0;
  secondWind = 0;
  dodgeChance = 0;
  afterimage = 0;
  dashResetOnKill = 0;
  xpMagnetOnSkill = 0;
  comboDmg = 0;
  overcharge = 0;
  regenPerSec = 0;
  pierceRetain = 0.6;
  dashDamageMult = 0;
  private lastDamageTaken = 0;
  private regenTimer = 0;
  private swTimer = 0;
  speedMult = 1;
  terrainSpeedMult = 1;
  damageMult = 1;
  atkSpdMult = 1;
  magnetRadius: number;

  invUntil = 0;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private actionInput?: DiscreteActionInput;
  private catAnimator?: CatAnimator;
  private appearance: OperativeId = 'ranger';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'hero');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setCircle(HERO_CFG.bodyRadius, this.width / 2 - HERO_CFG.bodyRadius, this.height / 2 - HERO_CFG.bodyRadius);
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
    this.magnetRadius = HERO_CFG.magnetRadius;

    this.setDepth(10);
    this.setupKeys();
    this.catAnimator = new CatAnimator(this);
    this.catAnimator.update(0, { speed: 0 });
  }

  setOperativeAppearance(id: OperativeId): void {
    this.appearance = id;
    const fallback = getOperativeVisual(id).heroTexture;
    if (this.scene.textures.exists(fallback)) this.setTexture(fallback);
    this.catAnimator?.setAppearance(id);
  }

  /** End-of-journey presentation can animate after combat updates have stopped. */
  playCelebration(): void {
    const key = catAnimationKey(this.appearance, 'celebrate');
    if (this.scene.anims.exists(key)) this.play(key);
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
      Q: kb.addKey('Q', false),
      UP: kb.addKey('UP', false),
      DOWN: kb.addKey('DOWN', false),
      LEFT: kb.addKey('LEFT', false),
      RIGHT: kb.addKey('RIGHT', false),
    };
    this.once('destroy', this.destroyActionInput, this);
  }

  configureActionInput(canAccept: () => boolean): void {
    this.destroyActionInput();
    this.actionInput = new DiscreteActionInput(() => this.hp > 0 && canAccept());
    this.actionInput.bind('dash', this.keys.SHIFT);
    this.actionInput.bind('skill', this.keys.SPACE);
    this.actionInput.bind('cycleSkill', this.keys.Q);
  }

  clearActionInput(): void { this.actionInput?.clear(); }

  destroyActionInput(): void {
    this.actionInput?.destroy();
    this.actionInput = undefined;
  }

  get isDashing(): boolean { return this.dashing; }
  get isInvincible(): boolean { return this.dashing || getBattleTime(this.scene) < this.invUntil; }
  get isBarrageActive(): boolean { return getBattleTime(this.scene) < this.barrageEndTime; }
  get isTimeRiftActive(): boolean { return getBattleTime(this.scene) < this.timeRiftEndTime; }

  getActiveSkill() { return getSkill(this.activeSkillId); }

  getSkillLevel(id: string): number { return this.skillLevels[id] ?? 0; }

  getSkillChargeCost(): number {
    const skill = this.getActiveSkill();
    return skill?.chargeCost ?? 100;
  }

  tick(time: number, delta: number): void {
    if (this.hp <= 0) { this.clearActionInput(); return; }
    const dt = delta / 1000;
    const body = this.body as Phaser.Physics.Arcade.Body;

    const isDashing = this.dashing && time <= this.dashEnd;
    if (this.dashing && time > this.dashEnd) {
      this.dashing = false;
      this.setAlpha(1);
    }

    if (isDashing) {
      body.setVelocity(this.dashVx, this.dashVy);
    }

    let ix = 0, iy = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) ix -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) ix += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) iy -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) iy += 1;

    if (!isDashing) {
      if (ix && iy) { const n = Math.SQRT1_2; ix *= n; iy *= n; }
      const maxSpd = this.moveSpeed * this.speedMult * this.terrainSpeedMult;

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
      this.aimAngle = Phaser.Math.Angle.Between(this.x, this.y, wp.x, wp.y);
      this.setFlipX(Math.cos(this.aimAngle) < 0);
      this.rotation = 0;

      const interval = this.fireRate / this.atkSpdMult;
      if ((ptr.isDown && !ptr.rightButtonDown() || SettingsManager.get().autoFire) && time > this.lastFire + interval) {
        this.fire(time, wp.x, wp.y);
      }
    }

    if (this.regenPerSec > 0 && this.hp < this.maxHp) {
      this.regenTimer += dt;
      if (this.regenTimer >= 1) {
        this.regenTimer -= 1;
        this.hp = Math.min(this.maxHp, Math.round(this.hp + this.regenPerSec));
      }
    }
    if (this.secondWind > 0 && time - this.lastDamageTaken > 3000 && this.hp < this.maxHp) {
      this.swTimer += dt;
      if (this.swTimer >= 0.5) {
        this.swTimer -= 0.5;
        this.hp = Math.min(this.maxHp, Math.round(this.hp + this.maxHp * 0.01 * this.secondWind));
      }
    } else {
      this.swTimer = 0;
    }

    // Barrage auto-fire
    if (this.isBarrageActive && time > this.lastBarrageFire + this.barrageInterval) {
      this.lastBarrageFire = time;
      const lvl = Math.max(1, this.getSkillLevel('barrage'));
      const dirs = 6 + lvl * 2;
      const stats = getSkillStatsForLevel('barrage', lvl);
      const dmg = (stats?.damage ?? 5) * this.damageMult;
      for (let i = 0; i < dirs; i++) {
        const a = (Math.PI * 2 / dirs) * i + time * 0.001;
        this.scene.events.emit('heroFire', {
          x: this.x + Math.cos(a) * 15,
          y: this.y + Math.sin(a) * 15,
          angle: a, damage: dmg, speed: this.bulletSpeed * 0.8,
          piercing: false, homing: false, count: 1, spreadAngle: 0,
        } as FireEvent);
      }
    }

    this.consumeActionInput(time);
    this.catAnimator?.update(delta, { speed: body.velocity.length(), reducedMotion: SettingsManager.get().reducedMotion });
  }

  private consumeActionInput(time: number): void {
    if (this.actionInput?.consume('dash')) {
      this.dash(time);
    }

    if (this.actionInput?.consume('skill')) {
      if (this.charge >= this.getSkillChargeCost()) this.useSkill();
      else this.scene.events.emit('actionUnavailable', { label: `还差 ${Math.ceil(this.getSkillChargeCost() - this.charge)} 点灵感，继续击退小捣蛋` });
    }

    if (this.actionInput?.consume('cycleSkill')) {
      this.cycleSkill();
    }
  }

  private fire(time: number, tx: number, ty: number): void {
    this.lastFire = time;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const ev: FireEvent = {
      x: this.x + Math.cos(angle) * 20,
      y: this.y + Math.sin(angle) * 20,
      angle, damage: this.bulletDamage * this.damageMult,
      speed: this.bulletSpeed, piercing: this.bulletPiercing,
      homing: this.bulletHoming, count: this.bulletCount,
      spreadAngle: this.spreadAngle,
    };
    this.scene.events.emit('heroFire', ev);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.velocity.x -= Math.cos(angle) * 30;
    body.velocity.y -= Math.sin(angle) * 30;
  }

  private useSkill(): void {
    const cost = this.getSkillChargeCost();
    this.charge -= cost;
    this.scene.events.emit('heroSkill', {
      skillId: this.activeSkillId,
      level: this.getSkillLevel(this.activeSkillId),
      x: this.x, y: this.y,
    });
  }

  private cycleSkill(): void {
    if (this.unlockedSkills.length <= 1) return;
    const idx = this.unlockedSkills.indexOf(this.activeSkillId);
    const next = (idx + 1) % this.unlockedSkills.length;
    this.activeSkillId = this.unlockedSkills[next];
    this.scene.events.emit('skillSwitch', { skillId: this.activeSkillId });
  }

  dash(time: number): void {
    if (time < this.lastDash + this.dashCooldown) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const angle = body.velocity.length() > 20
      ? Math.atan2(body.velocity.y, body.velocity.x)
      : this.aimAngle;

    this.dashing = true;
    this.lastDash = time;
    this.dashEnd = time + this.dashDur;
    this.dashVx = Math.cos(angle) * this.dashSpd;
    this.dashVy = Math.sin(angle) * this.dashSpd;
    body.setVelocity(this.dashVx, this.dashVy);
    if (Math.abs(this.dashVx) > 1) this.setFlipX(this.dashVx < 0);
    this.catAnimator?.dash(this.dashDur);
    this.setAlpha(0.5);
    this.scene.events.emit('heroDash', { x: this.x, y: this.y, angle });
  }

  takeDamage(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || this.hp <= 0) return false;
    if (this.isInvincible) return false;

    if (this.shieldStacks > 0) {
      this.shieldStacks--;
      this.invUntil = getBattleTime(this.scene) + HERO_CFG.invincibleMs;
      this.scene.events.emit('shieldBreak', { x: this.x, y: this.y });
      return false;
    }

    // Dodge chance
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
      this.scene.events.emit('heroDodge', { x: this.x, y: this.y });
      return false;
    }

    this.hp = Math.max(0, Math.round(this.hp - amount));
    this.lastDamageTaken = getBattleTime(this.scene);
    this.invUntil = getBattleTime(this.scene) + HERO_CFG.invincibleMs;
    this.scene.events.emit('heroHit', { x: this.x, y: this.y, damage: amount });

    if (this.hp <= 0) {
      this.scene.events.emit('heroDeath');
      this.setActive(false).setVisible(false);
    }
    return true;
  }

  addCharge(amount: number): void {
    const max = this.overcharge > 0 ? Math.round(this.chargeMax * (1 + this.overcharge * 0.2)) : this.chargeMax;
    this.charge = Math.min(max, this.charge + amount);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, Math.round(this.hp + amount));
  }

  resetDashCooldown(): void {
    this.lastDash = 0;
  }

  dashCooldownPct(time: number): number {
    return Math.min(1, (time - this.lastDash) / this.dashCooldown);
  }

  getStateVector(): number[] {
    const b = this.body as Phaser.Physics.Arcade.Body;
    return [
      this.x / ARENA_WIDTH, this.y / ARENA_HEIGHT,
      b.velocity.x / 200, b.velocity.y / 200,
      this.hp / this.maxHp, this.aimAngle / Math.PI,
      this.dashing ? 1 : 0, this.charge / this.chargeMax,
    ];
  }
}
