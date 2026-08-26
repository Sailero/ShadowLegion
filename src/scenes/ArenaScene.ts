import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, ARENA_WIDTH, ARENA_HEIGHT,
  COLORS, HERO_CFG, ENEMY_TYPES, WAVE_CFG,
} from '../config/gameConfig';
import { BUILD_INFO, CATEGORY_COLORS, EVOLUTION_INFO } from '../data/upgrades';
import { Hero, FireEvent } from '../entities/Hero';
import { Enemy } from '../entities/Enemy';
import { Projectile, BulletOpts } from '../entities/Projectile';
import { WaveManager } from '../systems/WaveManager';
import { UpgradeManager } from '../systems/UpgradeManager';
import { SoundManager } from '../systems/SoundManager';
import { TutorialManager } from '../systems/TutorialManager';
import { ScoreManager } from '../systems/ScoreManager';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { RunRecorder } from '../systems/RunRecorder';
import { getSkill, getSkillStatsForLevel } from '../data/skills';
import type { UpgradeDef } from '../data/upgrades';
import { ChapterDef, getChapter, pointInRect } from '../data/chapters';
import { getOperative, OperativeId } from '../data/operatives';
import type { ChapterUnlockResult } from '../systems/MetaProgressionManager';

const MAX_PARTICLES = 30;

export class ArenaScene extends Phaser.Scene {
  private hero!: Hero;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private xpGems!: Phaser.Physics.Arcade.Group;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private defenseCore!: Phaser.Physics.Arcade.Image;

  private waveMgr!: WaveManager;
  private upgradeMgr!: UpgradeManager;

  /* ── UI objects ── */
  private hpGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private enemyHpGfx!: Phaser.GameObjects.Graphics;
  private shieldGfx!: Phaser.GameObjects.Graphics;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private offscreenGfx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private shieldCountText?: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private waveProgressGfx!: Phaser.GameObjects.Graphics;
  private bossHudGfx!: Phaser.GameObjects.Graphics;
  private bossNameText!: Phaser.GameObjects.Text;
  private runTimerText!: Phaser.GameObjects.Text;
  private crosshairGfx!: Phaser.GameObjects.Graphics;
  private defenseHudGfx!: Phaser.GameObjects.Graphics;
  private hazardGfx!: Phaser.GameObjects.Graphics;
  private defenseText!: Phaser.GameObjects.Text;
  private chapterText!: Phaser.GameObjects.Text;

  /* ── State ── */
  private score = 0;
  private kills = 0;
  private currentLevel = 1;
  private upgrading = false;
  private paused = false;
  private dead = false;
  private upgradeUI: Phaser.GameObjects.GameObject[] = [];
  private pauseUI: Phaser.GameObjects.GameObject[] = [];
  private upgradeHotkeys: Array<{ event: string; handler: () => void }> = [];
  private pauseMenuHandler?: () => void;
  private activeRunMs = 0;
  private currentWaveName = '';
  private chapter!: ChapterDef;
  private operativeId: OperativeId = 'ranger';
  private defenseHp = 0;
  private defenseMaxHp = 0;
  private defenseInvUntil = 0;
  private elapsedBeforeChapterMs = 0;
  private pulseDamageAt = 0;

  /* ── Hitlag ── */
  private hitlagUntil = 0;
  private lastShakeTime = 0;
  private lastDmgNumTime = 0;
  private lastComboVal = 0;
  private skillNameText!: Phaser.GameObjects.Text;

  /* ── Combo system ── */
  private comboCount = 0;
  private comboResetTime = 0;
  private readonly comboDuration = 2000;

  /* ── Effect pool tracking ── */
  private activeParticleCount = 0;

  /* ── Wave tracking ── */
  private waveEnemyTotal = 0;

  /* ── Systems ── */
  private snd!: SoundManager;
  private tutorial!: TutorialManager;
  private runRecorder!: RunRecorder;
  private endless = false;
  private bgParticles: Phaser.GameObjects.Graphics | null = null;

  /* ── TimeRift area tracking ── */
  private riftCenter = { x: 0, y: 0 };
  private riftRadius = 0;

  constructor() { super('ArenaScene'); }

  init(data: {
    level?: number; score?: number; kills?: number; endless?: boolean;
    operativeId?: OperativeId; freshRun?: boolean; elapsedMs?: number;
  }) {
    this.currentLevel = data.level || 1;
    this.score = data.score || 0;
    this.kills = data.kills || 0;
    this.upgrading = false;
    this.paused = false;
    this.dead = false;
    this.comboCount = 0;
    this.hitlagUntil = 0;
    this.activeParticleCount = 0;
    this.waveEnemyTotal = 0;
    this.riftCenter = { x: 0, y: 0 };
    this.riftRadius = 0;
    this.activeRunMs = 0;
    this.currentWaveName = '';
    this.endless = data.endless || false;
    this.operativeId = data.operativeId ?? 'ranger';
    this.chapter = getChapter(this.currentLevel, this.endless);
    this.elapsedBeforeChapterMs = data.elapsedMs || 0;
    this.pulseDamageAt = 0;
    if (data.freshRun) {
      this.registry.remove('appliedUpgrades');
    }
  }

  create() {
    this.drawArena();
    this.physics.world.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.physics.world.timeScale = 1;
    this.physics.resume();

    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.playerBullets = this.physics.add.group({ runChildUpdate: false });
    this.enemyBullets = this.physics.add.group({ runChildUpdate: false });
    this.xpGems = this.physics.add.group({ runChildUpdate: false });
    this.obstacles = this.physics.add.staticGroup();
    this.createMapGeometry();

    this.defenseMaxHp = this.chapter.coreHp;
    this.defenseHp = this.defenseMaxHp;
    this.defenseCore = this.physics.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 'defense_core')
      .setImmovable(true).setDepth(7);
    const coreBody = this.defenseCore.body as Phaser.Physics.Arcade.Body;
    coreBody.setCircle(29, 11, 11);

    this.hero = new Hero(this, ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 110);

    const metaState = MetaProgressionManager.getState();
    const metaBonuses = MetaProgressionManager.getBonuses(metaState);
    this.hero.damageMult *= metaBonuses.damageMult;
    this.hero.maxHp += metaBonuses.maxHpBonus;
    this.hero.hp = this.hero.maxHp;
    this.hero.charge = Math.min(this.hero.chargeMax, metaBonuses.startCharge);

    this.snd = SoundManager.get();
    this.tutorial = new TutorialManager(this);
    this.upgradeMgr = new UpgradeManager(metaState.unlockedSkills);
    this.upgradeMgr.initializeOperative(this.hero, this.operativeId);
    this.runRecorder = new RunRecorder();

    this.setupCollisions();
    this.setupCamera();
    this.createUI();
    this.bindEvents();
    this.input.keyboard?.on('keydown-ESC', this.togglePause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.togglePause, this);
      this.clearUpgradeHotkeys();
      this.clearPauseUI();
    });

    const saved = this.registry.get('appliedUpgrades') as string[] | undefined;
    if (saved) {
      for (const id of saved) this.upgradeMgr.applyById(this.hero, id);
    }

    this.waveMgr = new WaveManager(this, this.currentLevel, this.enemies, this.endless);
    this.waveMgr.startNextWave();

    this.tutorial.start();

    this.createBgParticles();

    if (this.input.mouse) this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.paused && ptr.rightButtonDown()) this.hero.dash(this.time.now);
    });
  }

  /* ────────────────── Arena Drawing ────────────────── */

  private drawArena(): void {
    const g = this.add.graphics();
    const palette = this.chapter.colors;
    g.fillStyle(palette.ground);
    g.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    for (let r = 350; r > 0; r -= 25) {
      g.fillStyle(palette.accent, 0.012);
      g.fillCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, r);
    }

    g.lineStyle(1, palette.grid, 0.2);
    for (let x = 0; x <= ARENA_WIDTH; x += 80) g.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 0; y <= ARENA_HEIGHT; y += 80) g.lineBetween(0, y, ARENA_WIDTH, y);
    g.lineStyle(1, palette.detail, 0.09);
    for (let x = 40; x < ARENA_WIDTH; x += 80) g.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 40; y < ARENA_HEIGHT; y += 80) g.lineBetween(0, y, ARENA_WIDTH, y);

    for (const zone of this.chapter.hazards) {
      g.fillStyle(palette.hazard, 0.08);
      g.fillRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 12);
      g.lineStyle(2, palette.hazard, 0.24);
      g.strokeRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 12);
    }

    for (const obstacle of this.chapter.obstacles) {
      g.fillStyle(palette.detail, 0.9);
      g.fillRoundedRect(obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2, obstacle.width, obstacle.height, 10);
      g.fillStyle(0xffffff, 0.035);
      g.fillRoundedRect(obstacle.x - obstacle.width / 2 + 5, obstacle.y - obstacle.height / 2 + 5, obstacle.width - 10, 10, 4);
      g.lineStyle(2, palette.accent, 0.35);
      g.strokeRoundedRect(obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2, obstacle.width, obstacle.height, 10);
    }

    for (const lane of this.chapter.spawnPoints) {
      g.lineStyle(2, palette.accent, 0.16);
      g.lineBetween(lane.x, lane.y, ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
      g.fillStyle(palette.accent, 0.7);
      g.fillCircle(lane.x, lane.y, 10);
      g.lineStyle(2, palette.accent, 0.45);
      g.strokeCircle(lane.x, lane.y, 18);
    }

    g.lineStyle(4, palette.accent, 0.38);
    g.strokeRect(2, 2, ARENA_WIDTH - 4, ARENA_HEIGHT - 4);
    g.lineStyle(1, palette.accent, 0.14);
    g.strokeRect(6, 6, ARENA_WIDTH - 12, ARENA_HEIGHT - 12);

    const bLen = 30, bOff = 10;
    g.lineStyle(2, palette.accent, 0.5);
    g.lineBetween(bOff, bOff, bOff + bLen, bOff);
    g.lineBetween(bOff, bOff, bOff, bOff + bLen);
    g.lineBetween(ARENA_WIDTH - bOff, bOff, ARENA_WIDTH - bOff - bLen, bOff);
    g.lineBetween(ARENA_WIDTH - bOff, bOff, ARENA_WIDTH - bOff, bOff + bLen);
    g.lineBetween(bOff, ARENA_HEIGHT - bOff, bOff + bLen, ARENA_HEIGHT - bOff);
    g.lineBetween(bOff, ARENA_HEIGHT - bOff, bOff, ARENA_HEIGHT - bOff - bLen);
    g.lineBetween(ARENA_WIDTH - bOff, ARENA_HEIGHT - bOff, ARENA_WIDTH - bOff - bLen, ARENA_HEIGHT - bOff);
    g.lineBetween(ARENA_WIDTH - bOff, ARENA_HEIGHT - bOff, ARENA_WIDTH - bOff, ARENA_HEIGHT - bOff - bLen);

    g.lineStyle(1, palette.accent, 0.14);
    const cx0 = ARENA_WIDTH / 2, cy0 = ARENA_HEIGHT / 2;
    for (let ring = 1; ring <= 3; ring++) {
      const r = ring * 120;
      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 3) * i - Math.PI / 6;
        const a2 = (Math.PI / 3) * (i + 1) - Math.PI / 6;
        g.lineBetween(cx0 + Math.cos(a1) * r, cy0 + Math.sin(a1) * r,
                      cx0 + Math.cos(a2) * r, cy0 + Math.sin(a2) * r);
      }
    }

    g.lineStyle(1, palette.accent, 0.35);
    g.lineBetween(cx0 - 15, cy0, cx0 + 15, cy0);
    g.lineBetween(cx0, cy0 - 15, cx0, cy0 + 15);
    g.strokeCircle(cx0, cy0, 8);

    g.setDepth(-1);
  }

  private createMapGeometry(): void {
    for (const obstacle of this.chapter.obstacles) {
      const bodyRect = this.add.rectangle(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 0, 0);
      this.physics.add.existing(bodyRect, true);
      this.obstacles.add(bodyRect);
    }
  }

  private createBgParticles(): void {
    this.bgParticles = this.add.graphics().setDepth(-0.5);
    const dots: { x: number; y: number; r: number; a: number; spd: number }[] = [];
    for (let i = 0; i < 60; i++) {
      dots.push({
        x: Math.random() * ARENA_WIDTH,
        y: Math.random() * ARENA_HEIGHT,
        r: 1 + Math.random() * 2,
        a: 0.05 + Math.random() * 0.1,
        spd: 3 + Math.random() * 8,
      });
    }
    (this as unknown as Record<string, unknown>)._bgDots = dots;
  }

  private updateBgParticles(time: number): void {
    const g = this.bgParticles;
    if (!g) return;
    g.clear();
    const dots = (this as unknown as Record<string, unknown>)._bgDots as
      { x: number; y: number; r: number; a: number; spd: number }[];
    if (!dots) return;
    for (const d of dots) {
      d.y -= d.spd * 0.016;
      if (d.y < -10) { d.y = ARENA_HEIGHT + 10; d.x = Math.random() * ARENA_WIDTH; }
      const pulse = d.a + Math.sin(time * 0.002 + d.x) * 0.03;
      g.fillStyle(this.chapter.colors.accent, pulse);
      g.fillCircle(d.x, d.y, d.r);
    }
  }

  private hazardPhase(time: number): number {
    if (this.chapter.hazardKind === 'tide') return Math.floor(time / 5000) % 2;
    if (this.chapter.hazardKind === 'pulse') return Math.floor(time / 6000) % 2;
    return 0;
  }

  private isHazardZoneActive(zone: { phase?: number }, time: number): boolean {
    if (this.chapter.hazardKind === 'sand') return true;
    if (this.chapter.hazardKind === 'tide') return (zone.phase ?? 0) === this.hazardPhase(time);
    if (this.chapter.hazardKind === 'pulse') {
      return (zone.phase ?? 0) === this.hazardPhase(time) && time % 6000 >= 5100;
    }
    return false;
  }

  private updateMapHazards(time: number): void {
    const g = this.hazardGfx;
    g.clear();
    const cycle = time % 6000;
    for (const zone of this.chapter.hazards) {
      const active = this.isHazardZoneActive(zone, time);
      const warning = this.chapter.hazardKind === 'pulse'
        && (zone.phase ?? 0) === this.hazardPhase(time)
        && cycle >= 4200;
      const alpha = active ? 0.28 + Math.sin(time * 0.025) * 0.08 : warning ? 0.1 + Math.sin(time * 0.014) * 0.07 : 0.035;
      g.fillStyle(this.chapter.colors.hazard, alpha);
      g.fillRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 10);
      g.lineStyle(active ? 3 : 1, active ? 0xffffff : this.chapter.colors.hazard, active ? 0.7 : 0.28);
      g.strokeRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 10);
    }
    if (this.defenseCore?.active) {
      const pulse = 1 + Math.sin(time * 0.004) * 0.04;
      this.defenseCore.setScale(pulse);
    }
  }

  private applyEnvironmentVelocity(
    x: number, y: number, body: Phaser.Physics.Arcade.Body, time: number, hero: boolean,
  ): void {
    const zone = this.chapter.hazards.find(item => pointInRect(x, y, item) && this.isHazardZoneActive(item, time));
    if (!zone) return;
    if (this.chapter.hazardKind === 'sand') body.velocity.scale(hero ? 0.76 : 0.88);
    if (this.chapter.hazardKind === 'tide') body.velocity.scale(0.72);
  }

  private applyPulseDamage(time: number): void {
    if (this.chapter.hazardKind !== 'pulse' || time < this.pulseDamageAt) return;
    const activeZones = this.chapter.hazards.filter(zone => this.isHazardZoneActive(zone, time));
    if (!activeZones.length) return;
    this.pulseDamageAt = time + 650;
    if (activeZones.some(zone => pointInRect(this.hero.x, this.hero.y, zone))) this.hero.takeDamage(6);
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active || !activeZones.some(zone => pointInRect(enemy.x, enemy.y, zone))) continue;
      const damage = enemy.isBoss ? 12 : 20;
      enemy.takeDamage(damage);
      this.showDmgNum(enemy.x, enemy.y - 20, damage);
    }
    this.cameras.main.flash(50, 160, 80, 255, true);
  }

  /* ────────────────── Physics ────────────────── */

  private setupCollisions(): void {
    this.physics.add.overlap(this.playerBullets, this.enemies,
      this.onBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    // Hero (sprite) must be object1, group must be object2 — Phaser calls callback(sprite, groupChild)
    this.physics.add.overlap(this.hero, this.enemyBullets,
      this.onEnemyBulletHitHero as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.hero, this.enemies,
      this.onHeroTouchEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.hero, this.xpGems,
      this.onCollectGem as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(this.hero, this.obstacles);
    this.physics.add.collider(this.enemies, this.obstacles);
    this.physics.add.collider(this.defenseCore, this.enemies,
      this.onEnemyTouchDefense as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.defenseCore, this.enemyBullets,
      this.onEnemyBulletHitDefense as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(this.playerBullets, this.obstacles,
      this.onBulletHitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(this.enemyBullets, this.obstacles,
      this.onBulletHitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
  }

  private onBulletHitObstacle(bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    const bullet = bulletObj as unknown as Projectile;
    if (bullet.active) bullet.recycle();
  }

  private onBulletHitEnemy(bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    try {
      if (this.dead) return;
      const bullet = bulletObj as unknown as Projectile;
      const enemy = enemyObj as unknown as Enemy;
      if (!bullet.active || !enemy.active) return;

      if (bullet.piercing) {
        if (bullet.hitSet.has(enemy)) return;
        bullet.hitSet.add(enemy);
      } else {
        bullet.recycle();
      }

      let dmg = bullet.damage;

      // Pierce damage retention: scale based on how many enemies already pierced
      if (bullet.piercing && bullet.hitSet.size > 1) {
        dmg = Math.round(dmg * Math.pow(this.hero.pierceRetain, bullet.hitSet.size - 1));
      }

      // Berserk: +50% per stack when low HP
      if (this.hero.berserk > 0 && this.hero.hp < this.hero.maxHp * 0.3) {
        dmg = Math.round(dmg * (1 + 0.5 * this.hero.berserk));
      }

      // Combo: threshold = max(3, 10 - stacks*2), bonus = 1 + stacks*0.10
      if (this.hero.comboDmg > 0) {
        const threshold = Math.max(3, 10 - this.hero.comboDmg * 2);
        if (this.comboCount >= threshold) {
          dmg = Math.round(dmg * (1 + 0.10 * this.hero.comboDmg));
        }
      }

      // Critical hit
      if (this.hero.critChance > 0 && Math.random() < this.hero.critChance) {
        dmg *= 2;
        this.showDmgNum(enemy.x, enemy.y - 35, dmg, false, true);
      } else {
        this.showDmgNum(enemy.x, enemy.y - 20, dmg);
      }

      enemy.knockback(bullet.x, bullet.y, 80);
      const killed = enemy.takeDamage(dmg);
      this.hitParticles(enemy.x, enemy.y, enemy.cfg.color);
      if (!killed && enemy.active) {
        this.tweens.add({ targets: enemy, scaleX: 1.25, scaleY: 0.8, duration: 50, yoyo: true });
      }

      // Frost: slow strength = 0.5 - stacks*0.05 (min 0.15), duration = 1000 + stacks*300
      if (this.hero.frostShot > 0 && !killed && enemy.active) {
        this.applyFrost(enemy, this.hero.frostShot);
      }

      // Lifesteal: +1% maxHP per stack
      if (this.hero.lifesteal > 0 && this.hero.hp < this.hero.maxHp) {
        const healAmt = Math.ceil(this.hero.maxHp * 0.01 * this.hero.lifesteal);
        this.hero.heal(healAmt);
      }

      // Explosive: radius = 40 + stacks*15, damage = dmg * 0.3 * stacks
      if (this.hero.explosiveShot > 0) {
        const aeRadius = 40 + this.hero.explosiveShot * 15;
        const aeDmg = Math.round(dmg * 0.3 * this.hero.explosiveShot);
        this.doExplosion(enemy.x, enemy.y, aeRadius, aeDmg, enemy);
      }

      // Ricochet: bounce count = stacks
      if (killed && this.hero.ricochetShot > 0 && bullet.owner === 'player') {
        this.doRicochetChain(enemy.x, enemy.y, dmg * 0.6, enemy, this.hero.ricochetShot);
      }

      // Dash reset on kill
      if (killed && this.hero.dashResetOnKill) {
        this.hero.resetDashCooldown();
      }

      this.snd.hit();
      if (!killed) {
        this.throttledShake(40, 0.002);
      }
    } catch (err) { console.error('[onBulletHitEnemy]', err); }
  }

  private onEnemyBulletHitHero(_heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    try {
      if (this.dead) return;
      const bullet = bulletObj as unknown as Projectile;
      if (!bullet.active) return;
      const dmg = bullet.damage;
      if (!dmg || dmg <= 0) return;
      bullet.recycle();
      const took = this.hero.takeDamage(dmg);
      if (took) {
        this.snd.heroHit();
        this.cameras.main.shake(80, 0.005);
      }
    } catch (err) { console.error('[onEnemyBulletHitHero]', err); }
  }

  private onEnemyBulletHitDefense(_coreObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    if (this.dead) return;
    const bullet = bulletObj as unknown as Projectile;
    if (!bullet.active || bullet.damage <= 0) return;
    const damage = bullet.damage;
    bullet.recycle();
    this.damageDefense(damage);
  }

  private onEnemyTouchDefense(_coreObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    if (this.dead) return;
    const enemy = enemyObj as unknown as Enemy;
    if (!enemy.active) return;
    const nextHitAt = (enemy.getData('defenseHitAt') as number | undefined) ?? 0;
    if (this.time.now < nextHitAt) return;
    enemy.setData('defenseHitAt', this.time.now + 1100);
    this.damageDefense(enemy.dmg);
    enemy.knockback(this.defenseCore.x, this.defenseCore.y, 90);
  }

  private damageDefense(amount: number): void {
    if (this.dead || this.time.now < this.defenseInvUntil) return;
    const damage = Math.max(1, Math.round(amount));
    this.defenseHp = Math.max(0, this.defenseHp - damage);
    this.defenseInvUntil = this.time.now + 90;
    this.defenseCore.setTintFill(0xff4455);
    this.time.delayedCall(90, () => { if (this.defenseCore.active) this.defenseCore.clearTint(); });
    this.showDmgNum(this.defenseCore.x, this.defenseCore.y - 52, damage, true);
    this.snd.heroHit();
    this.throttledShake(80, 0.005);
    if (this.defenseHp <= 0) this.onDefenseDestroyed();
  }

  private repairDefense(ratio: number): void {
    const amount = ratio >= 1 ? this.defenseMaxHp : Math.round(this.defenseMaxHp * Math.max(0, ratio));
    this.defenseHp = Math.min(this.defenseMaxHp, this.defenseHp + amount);
    if (this.defenseCore?.active) {
      this.defenseCore.setTint(0x86efac);
      this.time.delayedCall(180, () => { if (this.defenseCore.active) this.defenseCore.clearTint(); });
    }
  }

  private onHeroTouchEnemy(_heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    try {
      if (this.dead) return;
      const enemy = enemyObj as unknown as Enemy;
      if (!enemy.active) return;

      if (this.hero.isDashing && this.hero.dashDamageMult > 0) {
        const dashDmg = Math.round(this.hero.bulletDamage * this.hero.damageMult * this.hero.dashDamageMult);
        enemy.takeDamage(dashDmg);
        enemy.knockback(this.hero.x, this.hero.y, 100);
        this.showDmgNum(enemy.x, enemy.y - 20, dashDmg);
        return;
      }

      const took = this.hero.takeDamage(enemy.dmg);
      if (took) {
        this.snd.heroHit();
      }
    } catch (err) { console.error('[onHeroTouchEnemy]', err); }
  }

  private onCollectGem(_heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, gemObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    try {
      if (this.dead) return;
      const gem = gemObj as unknown as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) return;
      const xpVal = gem.getData('xp') as number || 5;
      this.score += xpVal;
      this.hero.addCharge(Math.round(xpVal * 1.2));

      const chargeGain = Math.round(xpVal * 1.2);
      const t = this.add.text(gem.x, gem.y - 5, `+${chargeGain}⚡`, {
        fontSize: '11px', fontFamily: 'monospace', color: '#fbbf24',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: t, y: gem.y - 25, alpha: 0, duration: 400, onComplete: () => t.destroy() });

      this.snd.pickup();
      gem.destroy();
    } catch (err) { console.error('[onCollectGem]', err); }
  }

  /* ────────────────── Camera ────────────────── */

  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.cameras.main.startFollow(this.hero, true, 0.18, 0.18);
    this.cameras.main.setBackgroundColor(COLORS.bg);
  }

  /* ────────────────── UI Creation ────────────────── */

  private createUI(): void {
    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.barGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.enemyHpGfx = this.add.graphics().setDepth(50);
    this.shieldGfx = this.add.graphics().setDepth(12);

    this.hpText = this.add.text(125, 26, '', {
      fontSize: '13px', fontFamily: 'monospace', color: '#fff', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);

    this.skillNameText = this.add.text(16, 58, '', {
      fontSize: '12px', fontFamily: 'monospace', color: '#d1d5db',
    }).setScrollFactor(0).setDepth(102).setOrigin(0, 0.5);

    this.waveText = this.add.text(GAME_WIDTH / 2, 12, '', {
      fontSize: '15px', fontFamily: 'monospace', color: '#e2e8f0', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    this.scoreText = this.add.text(GAME_WIDTH - 14, 12, '', {
      fontSize: '14px', fontFamily: 'monospace', color: '#94a3b8',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.runTimerText = this.add.text(GAME_WIDTH - 14, 34, '', {
      fontSize: '12px', fontFamily: 'monospace', color: '#475569',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.infoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 8, '', {
      fontSize: '12px', fontFamily: 'monospace', color: '#fbbf24',
      stroke: '#000', strokeThickness: 3,
      align: 'center', lineSpacing: 2,
      wordWrap: { width: GAME_WIDTH - 40 },
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 1);

    this.comboText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, '', {
      fontSize: '28px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
      stroke: '#000', strokeThickness: 4,
    }).setScrollFactor(0).setDepth(105).setOrigin(0.5).setAlpha(0);

    this.waveProgressGfx = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.bossHudGfx = this.add.graphics().setScrollFactor(0).setDepth(106);
    this.bossNameText = this.add.text(GAME_WIDTH / 2, 50, '', {
      fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fca5a5',
    }).setScrollFactor(0).setDepth(107).setOrigin(0.5).setVisible(false);
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(110);
    this.offscreenGfx = this.add.graphics().setScrollFactor(0).setDepth(95);
    this.crosshairGfx = this.add.graphics().setScrollFactor(0).setDepth(120);
    this.defenseHudGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hazardGfx = this.add.graphics().setDepth(2);
    this.defenseText = this.add.text(352, 26, '', {
      fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);
    this.chapterText = this.add.text(GAME_WIDTH / 2, 34, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#64748b',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);
  }

  /* ────────────────── UI Update ────────────────── */

  private updateUI(time: number): void {
    const g = this.hpGfx;
    g.clear();

    // HUD panel background
    const panelW = 240, panelH = 72;
    g.fillStyle(0x0a0e17, 0.85);
    g.fillRoundedRect(8, 8, panelW, panelH, 6);
    g.lineStyle(1, 0x1e3a5f, 0.5);
    g.strokeRoundedRect(8, 8, panelW, panelH, 6);

    // HP bar with rounded ends
    const bw = 210, bh = 18, bx = 18, by = 16;
    g.fillStyle(0x1a1a2e);
    g.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 4);
    g.fillStyle(0x1f2937);
    g.fillRoundedRect(bx, by, bw, bh, 3);
    const pct = Math.max(0, this.hero.hp / this.hero.maxHp);
    const hpColor = pct > 0.5 ? 0x22c55e : pct > 0.25 ? 0xeab308 : 0xef4444;
    if (pct > 0.01) {
      g.fillStyle(hpColor);
      g.fillRoundedRect(bx, by, Math.max(6, bw * pct), bh, 3);
      // Glossy highlight
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(bx + 1, by + 1, Math.max(4, bw * pct - 2), bh * 0.4, 2);
    }
    if (pct <= 0.25 && pct > 0) {
      g.fillStyle(0xff0000, 0.12 + Math.sin(time * 0.01) * 0.08);
      g.fillRoundedRect(bx, by, Math.max(6, bw * pct), bh, 3);
    }
    g.lineStyle(1, 0x374151, 0.6);
    g.strokeRoundedRect(bx, by, bw, bh, 3);

    // HP icon
    g.fillStyle(0xef4444);
    g.fillRect(bx + 2, by + 4, 3, bh - 8);
    g.fillRect(bx + 1, by + 5, 5, bh - 10);

    this.hpText.setText(`${Math.round(this.hero.hp)} / ${this.hero.maxHp}`);
    this.hpText.setPosition(bx + bw / 2, by + bh / 2 + 1);

    // Skill charge bar
    const cg = this.barGfx;
    cg.clear();
    const activeSkill = this.hero.getActiveSkill();
    const skillColor = activeSkill?.color ?? COLORS.chargeBar;
    const chargeCost = this.hero.getSkillChargeCost();
    const chargePct = Math.min(1, this.hero.charge / chargeCost);

    const cx = 18, cy = 42, cw = 140, ch = 12;
    cg.fillStyle(0x1f2937);
    cg.fillRoundedRect(cx, cy, cw, ch, 3);
    if (chargePct > 0.01) {
      cg.fillStyle(chargePct >= 1 ? skillColor : Phaser.Display.Color.ValueToColor(skillColor).darken(40).color);
      cg.fillRoundedRect(cx, cy, Math.max(4, cw * chargePct), ch, 3);
      if (chargePct >= 1) {
        cg.fillStyle(0xffffff, 0.15 + Math.sin(time * 0.008) * 0.1);
        cg.fillRoundedRect(cx, cy, cw, ch, 3);
      }
    }
    cg.lineStyle(1, 0x374151, 0.5);
    cg.strokeRoundedRect(cx, cy, cw, ch, 3);

    const skillName = activeSkill?.name ?? '技能';
    const lvl = this.hero.getSkillLevel(this.hero.activeSkillId);
    const buildPath = this.upgradeMgr.getBuildPath();
    const buildPrefix = buildPath
      ? `${this.upgradeMgr.isEvolved() ? EVOLUTION_INFO[buildPath].name : BUILD_INFO[buildPath].name} · `
      : '';
    const skillStr = this.hero.unlockedSkills.length > 1
      ? `${buildPrefix}${skillName} Lv${lvl} [Q]`
      : `${buildPrefix}${skillName} Lv${lvl}`;
    this.skillNameText.setText(skillStr);
    this.skillNameText.setPosition(cx + 2, cy + ch + 6);

    // Dash bar
    const dashPct = this.hero.dashCooldownPct(time);
    const dx = 168, dy = 42, dw = 60;
    cg.fillStyle(0x1f2937);
    cg.fillRoundedRect(dx, dy, dw, ch, 3);
    cg.fillStyle(dashPct >= 1 ? 0x60a5fa : 0x1e3a5f);
    cg.fillRoundedRect(dx, dy, Math.max(4, dw * dashPct), ch, 3);
    cg.lineStyle(1, 0x374151, 0.5);
    cg.strokeRoundedRect(dx, dy, dw, ch, 3);

    // Shield drawn in world space to follow hero exactly
    this.shieldGfx.clear();
    if (this.hero.shieldStacks > 0) {
      const sa = 0.4 + Math.sin(time * 0.005) * 0.2;
      const hx = this.hero.x, hy = this.hero.y;
      for (let si = 0; si < Math.min(this.hero.shieldStacks, 5); si++) {
        this.shieldGfx.lineStyle(2, 0x60a5fa, sa * (1 - si * 0.15));
        this.shieldGfx.strokeCircle(hx, hy, 22 + si * 5);
      }
      if (this.hero.shieldStacks > 1) {
        this.shieldCountText?.setText(`×${this.hero.shieldStacks}`);
      }
    }

    // Barrage/TimeRift active indicator
    if (this.hero.isBarrageActive) {
      cg.lineStyle(2, 0xef4444, 0.5 + Math.sin(time * 0.012) * 0.3);
      cg.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 35);
    }
    if (this.hero.isTimeRiftActive) {
      cg.lineStyle(2, 0x818cf8, 0.4 + Math.sin(time * 0.008) * 0.2);
      cg.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 36);
    }

    // Wave & Score (top center + right)
    const modeLabel = this.endless ? `无尽 ${this.currentLevel}` : `第 ${this.chapter.id} 章`;
    const waveName = this.currentWaveName ? ` · ${this.currentWaveName}` : '';
    this.waveText.setText(`${modeLabel}   ${this.waveMgr.wave}/${this.waveMgr.totalWaves}${waveName}   剩余 ${this.waveMgr.aliveCount}`);
    this.chapterText.setText(`${this.chapter.name} · ${getOperative(this.operativeId).name} · ${this.chapter.specialName}`);
    this.scoreText.setText(`${this.score} 分   ${this.kills} 杀`);
    const totalSec = Math.floor((this.elapsedBeforeChapterMs + this.activeRunMs) / 1000);
    this.runTimerText.setText(`${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`);

    const dg = this.defenseHudGfx;
    dg.clear();
    const dbx = 260, dby = 16, dbw = 184, dbh = 18;
    dg.fillStyle(0x0a0e17, 0.88);
    dg.fillRoundedRect(dbx - 8, dby - 8, dbw + 16, 34, 6);
    dg.fillStyle(0x1f2937);
    dg.fillRoundedRect(dbx, dby, dbw, dbh, 3);
    const defensePct = Math.max(0, this.defenseHp / this.defenseMaxHp);
    const defenseColor = defensePct > 0.5 ? this.chapter.colors.accent : defensePct > 0.25 ? 0xf59e0b : 0xef4444;
    dg.fillStyle(defenseColor);
    dg.fillRoundedRect(dbx, dby, Math.max(4, dbw * defensePct), dbh, 3);
    dg.lineStyle(1, this.chapter.colors.accent, 0.55);
    dg.strokeRoundedRect(dbx, dby, dbw, dbh, 3);
    this.defenseText.setText(`防线 ${Math.ceil(this.defenseHp)} / ${this.defenseMaxHp}`).setPosition(dbx + dbw / 2, dby + dbh / 2 + 1);

    const lines: string[] = [];
    if (activeSkill) {
      const chargeStr = chargePct >= 1 ? '✦ 就绪 ✦' : `⚡${Math.round(chargePct * 100)}%`;
      lines.push(`${skillName} Lv${lvl}  ${chargeStr}  ${chargePct >= 1 ? '[ SPACE 释放 ]' : ''}`);
    }
    const controls: string[] = [];
    if (this.hero.unlockedSkills.length > 1) controls.push('Q切换');
    controls.push('SHIFT闪避', 'ESC暂停');
    lines.push(controls.join('  |  '));
    this.infoText.setText(lines.join('\n'));

    this.drawWaveProgress();
    this.drawOffscreenIndicators();
    this.drawMinimap();
    this.drawEnemyHpBars();
    this.drawBossHud();
    this.drawCrosshair();
    this.updateCombo(time);
  }

  private drawWaveProgress(): void {
    const pg = this.waveProgressGfx;
    pg.clear();
    const pw = GAME_WIDTH - 20, ph = 4;
    const px = 10, py = GAME_HEIGHT - 6;
    pg.fillStyle(0x0f172a, 0.7);
    pg.fillRoundedRect(px, py, pw, ph, 2);
    if (this.waveEnemyTotal > 0) {
      const alive = this.waveMgr.aliveCount;
      const killed = this.waveEnemyTotal - alive;
      const progress = killed / this.waveEnemyTotal;
      if (progress > 0.005) {
        pg.fillStyle(0x3b82f6, 0.8);
        pg.fillRoundedRect(px, py, Math.max(4, pw * progress), ph, 2);
        pg.fillStyle(0x93c5fd, 0.3);
        pg.fillRoundedRect(px, py, Math.max(4, pw * progress), ph / 2, 1);
      }
    }
  }

  private drawOffscreenIndicators(): void {
    const og = this.offscreenGfx;
    og.clear();
    const cam = this.cameras.main;
    const margin = 20;

    for (const c of this.enemies.getChildren()) {
      const e = c as Enemy;
      if (!e.active) continue;
      const sx = e.x - cam.scrollX;
      const sy = e.y - cam.scrollY;

      if (sx >= -10 && sx <= GAME_WIDTH + 10 && sy >= -10 && sy <= GAME_HEIGHT + 10) continue;

      const a = Math.atan2(sy - GAME_HEIGHT / 2, sx - GAME_WIDTH / 2);
      const cos = Math.cos(a), sin = Math.sin(a);

      let ix: number, iy: number;
      const hw = GAME_WIDTH / 2 - margin, hh = GAME_HEIGHT / 2 - margin;
      const t = Math.min(
        Math.abs(cos) > 0.001 ? hw / Math.abs(cos) : 9999,
        Math.abs(sin) > 0.001 ? hh / Math.abs(sin) : 9999,
      );
      ix = GAME_WIDTH / 2 + cos * t;
      iy = GAME_HEIGHT / 2 + sin * t;

      const color = e.isBoss ? 0xef4444 : (e.isElite ? 0xfbbf24 : e.cfg.color);
      const sz = e.isBoss ? 7 : 5;

      og.fillStyle(color, 0.85);
      og.fillTriangle(
        ix + cos * sz, iy + sin * sz,
        ix + Math.cos(a + 2.3) * sz, iy + Math.sin(a + 2.3) * sz,
        ix + Math.cos(a - 2.3) * sz, iy + Math.sin(a - 2.3) * sz,
      );
    }
  }

  private drawMinimap(): void {
    const mg = this.minimapGfx;
    mg.clear();

    const mw = 130, mh = 98;
    const mx = GAME_WIDTH - mw - 10, my = GAME_HEIGHT - mh - 12;
    const sx = mw / ARENA_WIDTH, sy = mh / ARENA_HEIGHT;

    // Panel bg
    mg.fillStyle(0x080c14, 0.85);
    mg.fillRoundedRect(mx - 2, my - 2, mw + 4, mh + 4, 4);
    mg.fillStyle(0x0f172a, 0.9);
    mg.fillRoundedRect(mx, my, mw, mh, 3);
    mg.lineStyle(1, 0x1e3a5f, 0.5);
    mg.strokeRoundedRect(mx, my, mw, mh, 3);

    // Camera viewport
    const cam = this.cameras.main;
    mg.lineStyle(1, 0x3b82f6, 0.4);
    mg.strokeRect(mx + cam.scrollX * sx, my + cam.scrollY * sy, GAME_WIDTH * sx, GAME_HEIGHT * sy);

    mg.fillStyle(this.chapter.colors.detail, 0.8);
    for (const obstacle of this.chapter.obstacles) {
      mg.fillRect(
        mx + (obstacle.x - obstacle.width / 2) * sx,
        my + (obstacle.y - obstacle.height / 2) * sy,
        obstacle.width * sx, obstacle.height * sy,
      );
    }
    mg.fillStyle(this.chapter.colors.accent, 0.75);
    for (const lane of this.chapter.spawnPoints) mg.fillCircle(mx + lane.x * sx, my + lane.y * sy, 2);

    // Enemies
    for (const c of this.enemies.getChildren()) {
      const e = c as Enemy;
      if (!e.active) continue;
      mg.fillStyle(e.isBoss ? 0xef4444 : e.cfg.color, 0.9);
      const sz = e.isBoss ? 3 : 2;
      mg.fillRect(mx + e.x * sx - sz / 2, my + e.y * sy - sz / 2, sz, sz);
    }

    // Hero
    const hx = mx + this.hero.x * sx, hy = my + this.hero.y * sy;
    mg.fillStyle(0x60a5fa);
    mg.fillCircle(hx, hy, 3);
    mg.lineStyle(1, 0x93c5fd, 0.7);
    mg.strokeCircle(hx, hy, 4);
    mg.fillStyle(0xfbbf24);
    mg.fillRect(mx + this.defenseCore.x * sx - 2, my + this.defenseCore.y * sy - 2, 4, 4);
  }

  private drawEnemyHpBars(): void {
    const eg = this.enemyHpGfx;
    eg.clear();
    for (const c of this.enemies.getChildren()) {
      const e = c as Enemy;
      if (!e.active) continue;
      const ep = e.hp / e.maxHp;
      if (ep >= 1) continue;
      const w = e.isBoss ? 60 : 30;
      const h = e.isBoss ? 6 : 3;
      const ex = e.x - w / 2;
      const ey = e.y - e.cfg.bodyRadius * e.scaleY - 12;
      eg.fillStyle(0x000000, 0.5);
      eg.fillRoundedRect(ex - 1, ey - 1, w + 2, h + 2, 1);
      eg.fillStyle(0x1f2937);
      eg.fillRect(ex, ey, w, h);
      const barColor = ep > 0.5 ? 0x22c55e : ep > 0.25 ? 0xeab308 : 0xef4444;
      eg.fillStyle(barColor);
      eg.fillRect(ex, ey, Math.max(1, w * ep), h);
    }
  }

  private drawBossHud(): void {
    const boss = this.enemies.getChildren().find(child => {
      const enemy = child as Enemy;
      return enemy.active && enemy.isBoss;
    }) as Enemy | undefined;

    const g = this.bossHudGfx;
    g.clear();
    if (!boss) {
      this.bossNameText.setVisible(false);
      return;
    }

    const width = 360;
    const height = 12;
    const x = (GAME_WIDTH - width) / 2;
    const y = 68;
    const pct = Math.max(0, boss.hp / boss.maxHp);
    g.fillStyle(0x020617, 0.9);
    g.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 5);
    g.fillStyle(0x3f1118);
    g.fillRoundedRect(x, y, width, height, 3);
    g.fillStyle(0xef4444);
    g.fillRoundedRect(x, y, Math.max(4, width * pct), height, 3);
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(x + 1, y + 1, Math.max(2, width * pct - 2), 4, 2);
    this.bossNameText.setText(`${(boss.getData('bossName') as string | undefined) ?? '战区首领'}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`).setVisible(true);
  }

  private drawCrosshair(): void {
    const g = this.crosshairGfx;
    g.clear();
    if (this.dead || this.upgrading || this.paused || this.tutorial.isActive) return;
    const pointer = this.input.activePointer;
    if (!pointer.active) return;
    const x = pointer.x;
    const y = pointer.y;
    g.lineStyle(1.5, pointer.isDown ? 0xfbbf24 : 0x93c5fd, 0.8);
    g.strokeCircle(x, y, 9);
    g.lineBetween(x - 14, y, x - 6, y);
    g.lineBetween(x + 6, y, x + 14, y);
    g.lineBetween(x, y - 14, x, y - 6);
    g.lineBetween(x, y + 6, x, y + 14);
  }

  private updateCombo(time: number): void {
    if (this.comboCount > 1 && time < this.comboResetTime) {
      const remaining = (this.comboResetTime - time) / this.comboDuration;
      if (this.comboCount !== this.lastComboVal) {
        this.comboText.setText(`${this.comboCount}x COMBO!`);
        this.lastComboVal = this.comboCount;
      }
      this.comboText.setAlpha(Math.min(1, remaining * 3));
    } else if (this.comboCount > 0 && time >= this.comboResetTime) {
      this.comboCount = 0;
      this.lastComboVal = 0;
      this.comboText.setAlpha(0);
    }
  }

  private addCombo(): void {
    this.comboCount++;
    this.comboResetTime = this.time.now + this.comboDuration;
    if (this.comboCount >= 3) {
      const bonus = this.comboCount * 2;
      this.score += bonus;
    }
  }

  /* ────────────────── Events ────────────────── */

  private bindEvents(): void {
    this.events.on('heroFire', this.onHeroFire, this);
    this.events.on('enemyFire', this.onEnemyFire, this);
    this.events.on('bossTelegraph', this.onBossTelegraph, this);
    this.events.on('heroDash', this.onDash, this);
    this.events.on('heroSkill', this.onSkillUse, this);
    this.events.on('skillSwitch', this.onSkillSwitch, this);
    this.events.on('heroHit', this.onHeroHit, this);
    this.events.on('heroDodge', this.onHeroDodge, this);
    this.events.on('heroDeath', this.onHeroDeath, this);
    this.events.on('shieldBreak', this.onShieldBreak, this);
    this.events.on('enemyDeath', this.onEnemyDeath, this);
    this.events.on('enemySplit', this.onEnemySplit, this);
    this.events.on('enemySummon', this.onEnemySummon, this);
    this.events.on('enemyBlastTelegraph', this.onEnemyBlastTelegraph, this);
    this.events.on('enemyBlast', this.onEnemyBlast, this);
    this.events.on('enemySupportPulse', this.onEnemySupportPulse, this);
    this.events.on('defenseRepair', (ev: { ratio: number }) => this.repairDefense(ev.ratio));
    this.events.on('waveStart', this.onWaveStart, this);
    this.events.on('waveComplete', this.onWaveComplete, this);
    this.events.on('levelComplete', this.onLevelComplete, this);
  }

  private onHeroFire(ev: FireEvent): void {
    try {
      if (this.dead) return;
      this.runRecorder.recordShot(ev.count);
      if (ev.count <= 1) {
        this.spawnBullet({ x: ev.x, y: ev.y, angle: ev.angle, speed: ev.speed, damage: ev.damage, piercing: ev.piercing, homing: ev.homing, owner: 'player' });
      } else {
        const half = (ev.count - 1) / 2;
        for (let i = 0; i < ev.count; i++) {
          const a = ev.angle + (i - half) * ev.spreadAngle;
          this.spawnBullet({ x: ev.x, y: ev.y, angle: a, speed: ev.speed, damage: ev.damage, piercing: ev.piercing, homing: ev.homing, owner: 'player' });
        }
      }
      this.muzzleFlash(ev.x, ev.y);
      this.snd.shoot();
      this.tutorial.onShoot();
    } catch (err) { console.error('[onHeroFire]', err); }
  }

  private announce(msg: string, color: number, dur = 800): void {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.35, msg, {
      fontFamily: 'monospace', fontSize: '26px', color: hex,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: dur, onComplete: () => t.destroy() });
  }

  private muzzleFlash(x: number, y: number): void {
    const flash = this.add.circle(x, y, 8, 0xfbbf24, 0.6).setDepth(12);
    this.tweens.add({ targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 70, onComplete: () => flash.destroy() });
  }

  private onEnemyFire(ev: { x: number; y: number; angle: number; speed: number; damage: number }): void {
    try {
      if (this.dead) return;
      this.spawnBullet({ x: ev.x, y: ev.y, angle: ev.angle, speed: ev.speed, damage: ev.damage, owner: 'enemy' });
    } catch (err) { console.error('[onEnemyFire]', err); }
  }

  private onBossTelegraph(ev: { x: number; y: number; angle: number; duration: number; length: number; width: number }): void {
    const endX = ev.x + Math.cos(ev.angle) * ev.length;
    const endY = ev.y + Math.sin(ev.angle) * ev.length;
    const px = Math.cos(ev.angle + Math.PI / 2) * ev.width / 2;
    const py = Math.sin(ev.angle + Math.PI / 2) * ev.width / 2;
    const warning = this.add.graphics().setDepth(14);
    warning.fillStyle(0xef4444, 0.14);
    warning.fillPoints([
      new Phaser.Geom.Point(ev.x + px, ev.y + py),
      new Phaser.Geom.Point(endX + px, endY + py),
      new Phaser.Geom.Point(endX - px, endY - py),
      new Phaser.Geom.Point(ev.x - px, ev.y - py),
    ], true);
    warning.lineStyle(2, 0xff8a65, 0.9);
    warning.lineBetween(ev.x, ev.y, endX, endY);
    warning.lineStyle(2, 0xffc107, 0.7);
    warning.strokeCircle(endX, endY, ev.width / 2);
    warning.fillStyle(0xffaa44, 0.9);
    warning.fillCircle(ev.x, ev.y, 12);
    this.tweens.add({
      targets: warning,
      alpha: { from: 0.25, to: 1 },
      duration: 120,
      yoyo: true,
      repeat: Math.max(1, Math.floor(ev.duration / 240) - 1),
    });
    this.time.delayedCall(ev.duration, () => warning.destroy());
    this.announce(`锁定冲锋 · ${Math.round(ev.length)} 距离`, 0xef4444, Math.min(850, ev.duration));
  }

  private onEnemyBlastTelegraph(ev: { x: number; y: number; radius: number; duration: number }): void {
    const warning = this.add.circle(ev.x, ev.y, ev.radius, 0xf43f5e, 0.08).setDepth(13)
      .setStrokeStyle(3, 0xfb7185, 0.9);
    this.tweens.add({
      targets: warning, alpha: { from: 0.2, to: 0.85 }, scaleX: { from: 0.75, to: 1 }, scaleY: { from: 0.75, to: 1 },
      duration: ev.duration, onComplete: () => warning.destroy(),
    });
  }

  private onEnemyBlast(ev: { x: number; y: number; radius: number; damage: number }): void {
    const blast = this.add.circle(ev.x, ev.y, 12, 0xff3355, 0.8).setDepth(18);
    this.tweens.add({ targets: blast, radius: ev.radius, alpha: 0, duration: 260, onComplete: () => blast.destroy() });
    if (Phaser.Math.Distance.Between(ev.x, ev.y, this.hero.x, this.hero.y) <= ev.radius) this.hero.takeDamage(ev.damage);
    if (Phaser.Math.Distance.Between(ev.x, ev.y, this.defenseCore.x, this.defenseCore.y) <= ev.radius) this.damageDefense(ev.damage);
    this.cameras.main.shake(140, 0.008);
  }

  private onEnemySupportPulse(ev: { x: number; y: number; radius: number; amount: number }): void {
    let healed = 0;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active || Phaser.Math.Distance.Between(ev.x, ev.y, enemy.x, enemy.y) > ev.radius) continue;
      healed += enemy.heal(ev.amount);
    }
    const pulse = this.add.circle(ev.x, ev.y, 15, 0x22d3ee, 0.12).setDepth(12)
      .setStrokeStyle(2, 0x67e8f9, 0.8);
    this.tweens.add({ targets: pulse, radius: ev.radius, alpha: 0, duration: 450, onComplete: () => pulse.destroy() });
    if (healed > 0) this.showDmgNum(ev.x, ev.y - 34, -healed, false, false);
  }

  private spawnBullet(opts: BulletOpts): void {
    const group = opts.owner === 'player' ? this.playerBullets : this.enemyBullets;
    const maxPool = opts.owner === 'player' ? 200 : 100;
    const children = group.getChildren();

    let b: Projectile | undefined;
    for (let i = 0; i < children.length; i++) {
      if (!children[i].active) { b = children[i] as Projectile; break; }
    }

    if (b) {
      b.fire(opts);
    } else if (children.length < maxPool) {
      const tex = opts.owner === 'player' ? 'bullet_player' : 'bullet_enemy';
      b = new Projectile(this, opts.x, opts.y, tex);
      b.fire(opts);
      group.add(b);
    } else {
      return; // Pool full, skip
    }
    b.launch();
  }

  private onDash(ev: { x: number; y: number; angle: number }): void {
    this.runRecorder.recordDash();
    this.snd.dash();
    this.tutorial.onDash();
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 40, () => {
        const trail = this.add.sprite(
          ev.x + Math.cos(ev.angle) * i * 14,
          ev.y + Math.sin(ev.angle) * i * 14,
          'hero',
        );
        trail.setAlpha(0.35 - i * 0.08).setDepth(9).setTint(0x93c5fd);
        this.tweens.add({ targets: trail, alpha: 0, duration: 180, onComplete: () => trail.destroy() });
      });
    }

    if (this.hero.afterimage > 0) {
      const aiDmg = Math.round(this.hero.bulletDamage * this.hero.damageMult * 0.5 * this.hero.afterimage);
      const aiRadius = 60 + this.hero.afterimage * 10;
      this.time.delayedCall(100, () => {
        this.doExplosion(ev.x, ev.y, aiRadius, aiDmg);
        const flash = this.add.circle(ev.x, ev.y, 10, 0x93c5fd, 0.8).setDepth(16);
        this.tweens.add({ targets: flash, radius: aiRadius, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
      });
    }
  }

  private onSkillUse(ev: { skillId: string; level: number; x: number; y: number }): void {
    try {
      if (this.dead) return;
      this.runRecorder.recordSkill();
      const skill = getSkill(ev.skillId);
      if (!skill) return;
      const stats = getSkillStatsForLevel(ev.skillId, ev.level);
      if (!stats) return;

      this.tutorial.onSkillUse();
      switch (ev.skillId) {
        case 'burst': {
          this.snd.skillBurst();
          const burstMul = 1 + ev.level * 0.5;
          const burstDmg = Math.round(this.hero.bulletDamage * this.hero.damageMult * burstMul);
          this.doSkillBurst(ev.x, ev.y, burstDmg, skill.color);
          if (ev.level >= 3) {
            this.hero.heal(Math.round(this.hero.maxHp * 0.05));
          }
          break;
        }
        case 'barrage': {
          this.snd.skillBarrage();
          this.hero.barrageEndTime = this.time.now + stats.duration;
          this.announce('弹幕风暴!', skill.color, 1000);
          this.cameras.main.flash(80, 255, 80, 80, true);
          break;
        }
        case 'timerift': {
          this.snd.skillTimeRift();
          this.doSkillTimeRift(ev.x, ev.y, stats.damage * this.hero.damageMult, stats.radius, stats.duration, skill.color);
          if (ev.level >= 2) this.hero.shieldStacks += 1;
          break;
        }
        case 'sentry': {
          this.snd.skillBarrage();
          this.doSkillSentry(ev.x, ev.y, stats.damage * this.hero.damageMult, stats.radius, stats.duration, ev.level, skill.color);
          break;
        }
      }

      // XP magnet on skill use: speed scales with stacks
      if (this.hero.xpMagnetOnSkill > 0) {
        const magnetSpd = 400 + this.hero.xpMagnetOnSkill * 100;
        [...this.xpGems.getChildren()].forEach(c => {
          const gem = c as Phaser.Physics.Arcade.Sprite;
          if (!gem.active) return;
          const a = Phaser.Math.Angle.Between(gem.x, gem.y, this.hero.x, this.hero.y);
          (gem.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * magnetSpd, Math.sin(a) * magnetSpd);
        });
      }
    } catch (err) { console.error('[onSkillUse]', err); }
  }

  private doSkillBurst(x: number, y: number, damage: number, color: number): void {
    // Full-screen shockwave: damages ALL enemies on screen
    const cam = this.cameras.main;
    const screenW = cam.width;
    const screenH = cam.height;
    const maxR = Math.sqrt(screenW * screenW + screenH * screenH) / 2;

    // Expanding shockwave ring
    const ring = this.add.circle(x, y, 30, 0xffffff, 0.8).setDepth(16);
    ring.setStrokeStyle(5, color, 1);
    this.tweens.add({
      targets: ring, radius: maxR, alpha: 0, duration: 500,
      ease: 'Quad.easeOut',
      onUpdate: () => ring.setStrokeStyle(5, color, ring.alpha),
      onComplete: () => ring.destroy(),
    });

    const ring2 = this.add.circle(x, y, 20, color, 0.3).setDepth(15);
    this.tweens.add({
      targets: ring2, radius: maxR * 0.7, alpha: 0, duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring2.destroy(),
    });

    const center = this.add.circle(x, y, 25, 0xffffff, 0.9).setDepth(17);
    this.tweens.add({
      targets: center, scaleX: 4, scaleY: 4, alpha: 0, duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => center.destroy(),
    });

    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 / 16) * i;
      const len = 150 + Math.random() * 300;
      const line = this.add.line(0, 0,
        x + Math.cos(a) * 20, y + Math.sin(a) * 20,
        x + Math.cos(a) * len, y + Math.sin(a) * len,
        color, 0.7).setDepth(15).setLineWidth(2);
      this.tweens.add({
        targets: line, alpha: 0, duration: 300 + Math.random() * 150,
        onComplete: () => line.destroy(),
      });
    }

    if (this.activeParticleCount < MAX_PARTICLES) {
      this.activeParticleCount++;
      const emitter = this.add.particles(x, y, 'particle_yellow', {
        speed: { min: 150, max: 400 }, scale: { start: 1.8, end: 0 },
        lifespan: 400, tint: color, quantity: 16, emitting: false,
      });
      emitter.explode(16);
      emitter.setDepth(18);
      this.time.delayedCall(450, () => { emitter.destroy(); this.activeParticleCount--; });
    }

    this.cameras.main.shake(200, 0.015);
    this.cameras.main.flash(100, 255, 200, 50, true);

    const dmg = Math.max(1, Math.round(damage));
    let hitCount = 0;
    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active) return;
      e.takeDamage(dmg);
      e.knockback(x, y, 200);
      this.showDmgNum(e.x, e.y - 20, dmg);
      hitCount++;
    });
    if (hitCount > 0) {
      this.announce(`爆发 ×${hitCount}   ${dmg}伤害`, 0xfbbf24, 800);
    }
  }

  private doSkillTimeRift(x: number, y: number, damage: number, radius: number, duration: number, color: number): void {
    this.hero.timeRiftEndTime = this.time.now + duration;
    this.riftCenter = { x, y };
    this.riftRadius = radius;

    const rift = this.add.graphics().setDepth(3);

    rift.fillStyle(color, 0.06);
    rift.fillCircle(x, y, radius);

    for (let r = 0; r < 3; r++) {
      const ringR = radius * (0.4 + r * 0.3);
      rift.lineStyle(1.5 - r * 0.3, color, 0.5 - r * 0.12);
      rift.strokeCircle(x, y, ringR);
    }

    const distort = this.add.graphics().setDepth(3);
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 / 12) * i + Math.random() * 0.3;
      const len = radius * (0.3 + Math.random() * 0.6);
      distort.lineStyle(1, color, 0.25);
      distort.beginPath();
      distort.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
      distort.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      distort.strokePath();
    }

    this.tweens.add({
      targets: rift, alpha: { from: 0.8, to: 0.1 },
      scaleX: { from: 1, to: 1.15 }, scaleY: { from: 1, to: 1.15 },
      duration: duration, ease: 'Sine.easeInOut',
      onComplete: () => rift.destroy(),
    });
    this.tweens.add({
      targets: distort, alpha: { from: 0.5, to: 0 },
      scaleX: { from: 1, to: 0.85 }, scaleY: { from: 1, to: 0.85 },
      duration: duration * 0.8, onComplete: () => distort.destroy(),
    });

    this.cameras.main.flash(80, 100, 100, 255, true);
    this.announce('时空裂隙!', color, 1000);

    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active) return;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < radius) {
        e.takeDamage(damage);
      }
    });
  }

  private doSkillSentry(
    x: number, y: number, damage: number, radius: number, duration: number, level: number, color: number,
  ): void {
    const base = this.add.circle(x, y, 17, 0x083344, 0.95).setDepth(11).setStrokeStyle(2, color, 0.9);
    const head = this.add.rectangle(x, y, 24, 7, color, 0.9).setDepth(12);
    const rangeRing = this.add.circle(x, y, radius, color, 0.025).setDepth(3).setStrokeStyle(1, color, 0.18);
    const interval = Math.max(150, 320 - level * 28);
    const timer = this.time.addEvent({
      delay: interval,
      repeat: Math.max(0, Math.floor(duration / interval) - 1),
      callback: () => {
        if (this.dead || !base.active) return;
        let nearest: Enemy | null = null;
        let nearestDistance = radius;
        for (const child of this.enemies.getChildren()) {
          const enemy = child as Enemy;
          if (!enemy.active) continue;
          const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
          if (distance < nearestDistance) { nearest = enemy; nearestDistance = distance; }
        }
        if (!nearest) return;
        const angle = Phaser.Math.Angle.Between(x, y, nearest.x, nearest.y);
        head.setRotation(angle);
        this.spawnBullet({
          x: x + Math.cos(angle) * 18, y: y + Math.sin(angle) * 18,
          angle, speed: this.hero.bulletSpeed * 0.85, damage,
          piercing: level >= 3, homing: true, owner: 'player',
        });
        this.muzzleFlash(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18);
      },
    });
    this.time.delayedCall(duration, () => {
      timer.remove(false);
      for (const object of [base, head, rangeRing]) {
        if (object.active) this.tweens.add({ targets: object, alpha: 0, duration: 180, onComplete: () => object.destroy() });
      }
    });
    this.announce('蜂群哨戒部署', color, 850);
  }

  private onSkillSwitch(ev: { skillId: string }): void {
    const skill = getSkill(ev.skillId);
    if (!skill) return;
    this.announce(`切换: ${skill.name}`, skill.color, 600);
  }

  private onHeroHit(ev: { x: number; y: number; damage: number }): void {
    try {
      this.runRecorder.recordDamage(ev.damage);
      this.cameras.main.shake(80, 0.005);
      this.cameras.main.flash(60, 255, 0, 0, true);
      this.showDmgNum(ev.x, ev.y - 20, ev.damage, true);
      this.hitParticles(ev.x, ev.y, 0xef4444);

      if (this.hero.active) {
        this.hero.setTintFill(0xff4444);
        this.time.delayedCall(80, () => {
          if (this.hero.active) this.hero.clearTint();
        });
      }

      // Thorns: damage nearby enemies on hit
      if (this.hero.thorns > 0) {
        this.doThorns(ev.x, ev.y, this.hero.thorns);
      }
    } catch (err) { console.error('[onHeroHit]', err); }
  }

  private onHeroDodge(ev: { x: number; y: number }): void {
    const t = this.add.text(ev.x, ev.y - 30, '闪避!', {
      fontSize: '14px', fontFamily: 'monospace', color: '#60a5fa',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: ev.y - 55, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  private onHeroDeath(): void {
    this.finishDefeat('先锋阵亡');
  }

  private onDefenseDestroyed(): void {
    this.finishDefeat('防线失守');
  }

  private finishDefeat(reason: string): void {
    if (this.dead) return;
    this.dead = true;
    this.hitlagUntil = 0;
    this.physics.pause();
    this.snd.heroDeath();
    this.cameras.main.shake(400, 0.015);
    this.cameras.main.flash(300, 255, 0, 0, true);
    const focusX = reason === '防线失守' ? this.defenseCore.x : this.hero.x;
    const focusY = reason === '防线失守' ? this.defenseCore.y : this.hero.y;
    this.deathParticles(focusX, focusY);
    this.tutorial.destroy();

    // Death message overlay
    const deathText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, reason, {
      fontSize: '48px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ef4444', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.tweens.add({ targets: deathText, alpha: 1, y: deathText.y - 15, duration: 600, ease: 'Quad.easeOut' });

    const subText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.48, `击杀 ${this.kills}  |  分数 ${this.score}`, {
      fontSize: '18px', fontFamily: 'monospace', color: '#94a3b8',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.tweens.add({ targets: subText, alpha: 1, duration: 800, delay: 400 });

    // Camera slow zoom
    this.cameras.main.zoomTo(1.2, 1500, 'Sine.easeIn');

    const build = this.upgradeMgr.getBuildPath();
    const durationSec = Math.round((this.elapsedBeforeChapterMs + this.activeRunMs) / 1000);
    const newHighScore = ScoreManager.isNewHighScore(this.score);
    const profile = this.runRecorder.finish(build, this.hero.maxHp);
    const reward = MetaProgressionManager.recordRun({
      wave: this.waveMgr.wave, level: this.currentLevel, kills: this.kills,
      durationSec, victory: false, endless: this.endless, build, profile,
    });
    const data = {
      score: this.score, kills: this.kills,
      wave: this.waveMgr.wave, level: this.currentLevel,
      endless: this.endless, durationSec, build, newHighScore, profile, reward,
      defeatReason: reason, operativeId: this.operativeId,
    };
    ScoreManager.saveScore({
      score: this.score, kills: this.kills,
      level: this.currentLevel, wave: this.waveMgr.wave,
      endless: this.endless, durationSec, build,
    });
    const sceneRef = this.scene;
    window.setTimeout(() => {
      try { sceneRef.start('GameOverScene', data); } catch (_) { /* scene already destroyed */ }
    }, 2200);
  }

  private slowMoFinish(victory: boolean): void {
    const cam = this.cameras.main;
    if (victory) {
      cam.zoomTo(1.15, 1200, 'Sine.easeInOut');
    }
  }

  private onShieldBreak(ev: { x: number; y: number }): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(ev.x, ev.y, 'particle_white', {
      speed: { min: 80, max: 200 }, scale: { start: 1.5, end: 0 },
      lifespan: 400, tint: 0x60a5fa, quantity: 10, emitting: false,
    });
    emitter.explode(10); emitter.setDepth(20);
    this.time.delayedCall(500, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private onEnemyDeath(ev: { x: number; y: number; xp: number; score: number; color: number; isBoss: boolean }): void {
    try {
      if (this.dead) return;
      this.kills++;
      this.score += ev.score;
      this.hero.addCharge(this.hero.chargePerKill);
      this.addCombo();
      this.snd.kill();

      this.deathParticles(ev.x, ev.y, ev.color);

      if (ev.isBoss) {
        this.cameras.main.shake(200, 0.009);
        this.cameras.main.flash(150, 255, 200, 0, true);
        this.hitlag(80);
      } else {
        this.throttledShake(50, 0.003);
        this.hitlag(35);
      }

      this.spawnXpGem(ev.x, ev.y, ev.xp);
    } catch (err) { console.error('[onEnemyDeath]', err); }
  }

  private onEnemySplit(ev: { x: number; y: number; type: string }): void {
    const cfg = ENEMY_TYPES[ev.type];
    if (!cfg) return;
    this.waveEnemyTotal += 2;
    for (let i = 0; i < 2; i++) {
      const offset = 20;
      const a = Math.random() * Math.PI * 2;
      const child = new Enemy(
        this, ev.x + Math.cos(a) * offset, ev.y + Math.sin(a) * offset,
        cfg, false, false,
      );
      child.hp = Math.round(cfg.hp * 0.4);
      child.maxHp = child.hp;
      child.setScale(0.7);
      const b = child.body as Phaser.Physics.Arcade.Body;
      const br = cfg.bodyRadius * 0.7;
      b.setCircle(br, child.width / 2 - br, child.height / 2 - br);
      this.enemies.add(child);
    }
    this.snd.hit();
  }

  private onEnemySummon(ev: { x: number; y: number; count: number }): void {
    const cfg = ENEMY_TYPES['slime'];
    if (!cfg) return;
    this.waveEnemyTotal += ev.count;
    for (let i = 0; i < ev.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const child = new Enemy(
        this, ev.x + Math.cos(a) * 30, ev.y + Math.sin(a) * 30,
        cfg, false, false,
      );
      child.hp = Math.round(cfg.hp * 0.5);
      child.maxHp = child.hp;
      child.setScale(0.8);
      const b = child.body as Phaser.Physics.Arcade.Body;
      const br = cfg.bodyRadius * 0.8;
      b.setCircle(br, child.width / 2 - br, child.height / 2 - br);
      this.enemies.add(child);
    }
    this.snd.hit();
  }

  private onWaveStart(ev: { wave: number; total: number; isBoss?: boolean; name: string; hint: string }): void {
    this.waveEnemyTotal = this.waveMgr.aliveCount;
    this.currentWaveName = ev.name;
    if (ev.isBoss) {
      this.announce(`⚠ ${ev.name}\n${ev.hint}`, 0xef4444, 2400);
      this.cameras.main.shake(300, 0.004);
      this.snd.bossAlert();
    } else {
      this.announce(`${ev.wave}/${ev.total} · ${ev.name}\n${ev.hint}`, 0xfbbf24, 1500);
      this.snd.waveStart();
    }
  }

  private onWaveComplete(ev: { wave: number; total: number }): void {
    if (this.defenseHp > 0 && this.defenseHp < this.defenseMaxHp) {
      this.repairDefense(0.08);
    }
    if (ev.wave >= ev.total) {
      this.waveMgr.scheduleNextWave(this.time.now);
      return;
    }
    this.showUpgradeUI('wave');
  }

  private onLevelComplete(ev: { level: number }): void {
    if (this.dead) return;
    if (!this.endless && ev.level < WAVE_CFG.levels) {
      this.paused = true;
      this.physics.pause();
      this.hero.heal(Math.round(this.hero.maxHp * 0.25));
      this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
      const unlock = MetaProgressionManager.recordChapterClear(ev.level);
      this.showChapterClear(unlock);
      this.time.delayedCall(2300, () => {
        if (this.dead) return;
        this.paused = false;
        this.showUpgradeUI('level');
      });
      return;
    }

    if (!this.endless) {
      this.dead = true;
      this.tutorial.destroy();
      this.snd.victory();
      MetaProgressionManager.recordChapterClear(ev.level);
      this.announce('🏆 四大战区已守住 · 军团母巢摧毁', 0x22c55e, 3000);
      this.slowMoFinish(true);
      const build = this.upgradeMgr.getBuildPath();
      const durationSec = Math.round((this.elapsedBeforeChapterMs + this.activeRunMs) / 1000);
      const newHighScore = ScoreManager.isNewHighScore(this.score);
      const profile = this.runRecorder.finish(build, this.hero.maxHp);
      const reward = MetaProgressionManager.recordRun({
        wave: this.waveMgr.totalWaves, level: ev.level, kills: this.kills,
        durationSec, victory: true, endless: false, build, profile,
      });
      const data = {
        score: this.score, kills: this.kills, wave: this.waveMgr.totalWaves, level: ev.level,
        victory: true, endless: false, durationSec, build, newHighScore, profile, reward,
        operativeId: this.operativeId,
      };
      ScoreManager.saveScore({
        score: this.score, kills: this.kills, level: ev.level,
        wave: this.waveMgr.totalWaves, endless: false, durationSec, build,
      });
      const sceneRef = this.scene;
      window.setTimeout(() => {
        try { sceneRef.start('GameOverScene', data); } catch (_) { /* noop */ }
      }, 3000);
      return;
    }
    this.hero.heal(this.hero.maxHp);
    this.announce(`无尽 ${ev.level} 通过！下一战区威胁提升`, 0xfbbf24, 2000);
    const showUpgrade = () => {
      if (this.dead) return;
      this.showUpgradeUI('level');
    };
    window.setTimeout(() => { try { showUpgrade(); } catch (_) { /* noop */ } }, 2500);
  }

  private showChapterClear(unlock: ChapterUnlockResult): void {
    const lines = [`第 ${unlock.chapter} 章完成 · ${this.chapter.name}`];
    if (unlock.operative) lines.push(`新兵种：${getOperative(unlock.operative).name}`);
    if (unlock.skill) lines.push(`新技能蓝图：${getSkill(unlock.skill)?.name ?? unlock.skill}`);
    if (!unlock.firstClear) lines.push('重复通关：战术资料已回收');
    this.announce(lines.join('\n'), this.chapter.colors.accent, 2100);
    this.snd.victory();
    this.cameras.main.flash(160, 100, 255, 160, true);
  }

  /* ────────────────── XP Gems ────────────────── */

  private spawnXpGem(x: number, y: number, xp: number): void {
    // Cap total gems on screen to prevent performance issues
    if (this.xpGems.getLength() > 60) {
      const oldest = this.xpGems.getFirstAlive() as Phaser.Physics.Arcade.Sprite | null;
      if (oldest) oldest.destroy();
    }

    const gem = this.physics.add.sprite(x, y, 'xp_gem');
    gem.setDepth(2); gem.setData('xp', xp);
    gem.setData('spawnTime', this.time.now);
    (gem.body as Phaser.Physics.Arcade.Body).setCircle(5, 3, 3);
    this.xpGems.add(gem);

    gem.setScale(0);
    this.tweens.add({ targets: gem, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private magnetXpGems(): void {
    const now = this.time.now;
    [...this.xpGems.getChildren()].forEach(c => {
      const gem = c as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) return;

      // Auto-expire after 8 seconds — fade and destroy
      const age = now - ((gem.getData('spawnTime') as number) || 0);
      if (age > 8000) { gem.destroy(); return; }
      if (age > 6000) gem.setAlpha(1 - (age - 6000) / 2000);

      const d = Phaser.Math.Distance.Between(gem.x, gem.y, this.hero.x, this.hero.y);
      if (d < this.hero.magnetRadius) {
        const a = Phaser.Math.Angle.Between(gem.x, gem.y, this.hero.x, this.hero.y);
        const spd = 280 + (this.hero.magnetRadius - d) * 5;
        (gem.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
      }
    });
  }

  /* ────────────────── Effects ────────────────── */

  private showDmgNum(x: number, y: number, dmg: number, isHero = false, isCrit = false): void {
    if (!isHero && !isCrit) {
      const now = this.time.now;
      if (now - this.lastDmgNumTime < 60) return;
      this.lastDmgNumTime = now;
    }
    const rounded = Math.round(dmg);
    const isBig = rounded >= 50;
    const label = isCrit ? `${rounded}!` : `${rounded}`;
    const size = isCrit ? '24px' : isBig ? '18px' : (isHero ? '18px' : '14px');
    const color = isCrit ? '#fbbf24' : isBig ? '#ff9f43' : (isHero ? '#ff6b6b' : '#ffffff');
    const t = this.add.text(x + Phaser.Math.Between(-10, 10), y, label, {
      fontSize: size, fontFamily: 'monospace', fontStyle: 'bold',
      color, stroke: '#000000', strokeThickness: isCrit ? 4 : (isBig ? 3 : 2),
    }).setOrigin(0.5).setDepth(60);
    const dur = isCrit ? 800 : (isBig ? 650 : 500);
    const rise = isCrit ? 50 : (isBig ? 40 : 30);
    this.tweens.add({ targets: t, y: y - rise, alpha: 0, duration: dur, onComplete: () => t.destroy() });
    if (isCrit || isBig) {
      this.tweens.add({ targets: t, scaleX: 1.5, scaleY: 1.5, duration: 100, yoyo: true });
    }
  }

  /* ────────────────── New Upgrade Combat Effects ────────────────── */

  private applyFrost(enemy: Enemy, stacks = 1): void {
    if ((enemy as any)._frosted) return;
    (enemy as any)._frosted = true;
    const origSpd = enemy.spd;
    const slowFactor = Math.max(0.15, 0.5 - stacks * 0.05);
    const dur = 1000 + stacks * 300;
    enemy.spd *= slowFactor;
    enemy.setTint(0x87ceeb);
    this.time.delayedCall(dur, () => {
      if (enemy.active && enemy.scene) {
        enemy.spd = origSpd;
        (enemy as any)._frosted = false;
        enemy.clearTint();
        if (enemy.isElite || enemy.isBoss) enemy.setTint(0xffffff);
      }
    });
  }

  private doExplosion(x: number, y: number, radius: number, damage: number, exclude?: Enemy | null): void {
    const ring = this.add.circle(x, y, 8, 0xff6b00, 0.7).setDepth(16);
    this.tweens.add({
      targets: ring, radius, alpha: 0, duration: 200,
      onComplete: () => ring.destroy(),
    });
    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active || e === exclude) return;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < radius) {
        e.takeDamage(damage);
      }
    });
  }

  private doRicochetChain(x: number, y: number, damage: number, exclude: Enemy, bounces: number): void {
    const hit = new Set<Enemy>([exclude]);
    let cx = x, cy = y, curDmg = damage;
    const children = this.enemies.getChildren();

    for (let b = 0; b < bounces; b++) {
      let nearest: Enemy | null = null;
      let minD = 250;
      for (let i = 0; i < children.length; i++) {
        const e = children[i] as Enemy;
        if (!e.active || hit.has(e)) continue;
        const d = Phaser.Math.Distance.Between(cx, cy, e.x, e.y);
        if (d < minD) { minD = d; nearest = e; }
      }
      if (!nearest) break;
      const ne: Enemy = nearest;
      hit.add(ne);
      const line = this.add.line(0, 0, cx, cy, ne.x, ne.y, 0xfbbf24, 0.6).setDepth(15);
      this.tweens.add({ targets: line, alpha: 0, duration: 150, onComplete: () => line.destroy() });
      const roundDmg = Math.round(curDmg);
      ne.takeDamage(roundDmg);
      this.showDmgNum(ne.x, ne.y - 20, roundDmg);
      cx = ne.x;
      cy = ne.y;
      curDmg *= 0.7;
    }
  }

  private doThorns(x: number, y: number, damage: number): void {
    const ring = this.add.circle(x, y, 10, 0xef4444, 0.5).setDepth(16);
    this.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active) return;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < 60) {
        e.takeDamage(damage);
      }
    });
  }

  private hitParticles(x: number, y: number, color: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(x, y, 'particle_white', {
      speed: { min: 60, max: 180 }, scale: { start: 1.2, end: 0 },
      lifespan: 250, tint: color, quantity: 5, emitting: false,
      angle: { min: 0, max: 360 },
    });
    emitter.explode(5); emitter.setDepth(20);

    const flash = this.add.circle(x, y, 6, 0xffffff, 0.7).setDepth(21);
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 120, onComplete: () => flash.destroy() });

    this.time.delayedCall(300, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private deathParticles(x: number, y: number, color?: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const c = color ?? 0xffffff;
    const emitter = this.add.particles(x, y, 'particle_white', {
      speed: { min: 80, max: 280 }, scale: { start: 1.5, end: 0 },
      lifespan: 500, tint: c, quantity: 12, emitting: false,
      angle: { min: 0, max: 360 },
    });
    emitter.explode(12); emitter.setDepth(20);

    const ring = this.add.circle(x, y, 5, c, 0.6).setDepth(21);
    this.tweens.add({ targets: ring, radius: 25, alpha: 0, duration: 200, onComplete: () => ring.destroy() });

    this.time.delayedCall(550, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private hitlag(ms: number): void {
    const until = performance.now() + ms;
    if (until > this.hitlagUntil) this.hitlagUntil = until;
  }

  private throttledShake(dur: number, intensity: number): void {
    const now = this.time.now;
    if (now - this.lastShakeTime < 100) return;
    this.lastShakeTime = now;
    this.cameras.main.shake(dur, intensity);
  }

  private collectParticles(x: number, y: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(x, y, 'particle_yellow', {
      speed: { min: 30, max: 90 }, scale: { start: 1, end: 0 },
      lifespan: 250, quantity: 4, emitting: false,
    });
    emitter.explode(4); emitter.setDepth(20);
    this.time.delayedCall(300, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  /* ────────────────── Upgrade UI ────────────────── */

  private showUpgradeUI(pool: 'wave' | 'level'): void {
    if (this.dead || this.upgrading) return;

    const choices = this.upgradeMgr.pickThree(pool, this.hero);
    if (choices.length === 0) {
      if (pool === 'level') {
        this.paused = true;
        this.physics.pause();
        this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
        const nextLvl = this.currentLevel + 1;
        const sc = this.score;
        const kills = this.kills;
        const endless = this.endless;
        const operativeId = this.operativeId;
        const elapsedMs = this.elapsedBeforeChapterMs + this.activeRunMs;
        const sceneRef = this.scene;
        this.time.delayedCall(350, () => {
          try { sceneRef.start('ArenaScene', { level: nextLvl, score: sc, kills, endless, operativeId, elapsedMs }); } catch (_) { /* noop */ }
        });
      } else {
        this.waveMgr.scheduleNextWave(this.time.now);
      }
      return;
    }

    this.upgrading = true;
    this.physics.pause();
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(300);
    this.upgradeUI.push(overlay);

    const buildPath = this.upgradeMgr.getBuildPath();
    const title = pool === 'level'
      ? (this.endless ? '无尽强化' : '章节战利品')
      : buildPath
        ? `${BUILD_INFO[buildPath].name} · 选择改装`
        : '选择战地改装';
    const titleText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18, title, {
      fontSize: '24px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.upgradeUI.push(titleText);

    const subtitle = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.18 + 32,
      buildPath
        ? `${BUILD_INFO[buildPath].promise} · ${this.upgradeMgr.isEvolved() ? '已超限进化' : `进化 ${Math.min(3, this.upgradeMgr.getPathUpgradeCount())}/3`}`
        : '本局后续升级将围绕所选流派出现',
      { fontSize: '12px', fontFamily: 'monospace', color: '#64748b' },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.upgradeUI.push(subtitle);

    const cardW = 250, cardH = 140, gap = 18;
    const n = choices.length;
    const totalW = cardW * n + gap * (n - 1);
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const cy = GAME_HEIGHT / 2;

    choices.forEach((upg, i) => {
      const cx = startX + i * (cardW + gap);
      const catColor = CATEGORY_COLORS[upg.category] || 0x3b82f6;

      const card = this.add.graphics().setScrollFactor(0).setDepth(301);
      this.drawCard(card, cx, cy, cardW, cardH, catColor, false);
      this.upgradeUI.push(card);

      // Color dot indicator
      const dot = this.add.graphics().setScrollFactor(0).setDepth(302);
      dot.fillStyle(catColor); dot.fillCircle(cx - cardW / 2 + 18, cy - 34, 6);
      this.upgradeUI.push(dot);

      const nt = this.add.text(cx - cardW / 2 + 32, cy - 40, upg.name, {
        fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(nt);

      const keyText = this.add.text(cx - cardW / 2 + 12, cy - cardH / 2 + 10, `[${i + 1}]`, {
        fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#64748b',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(keyText);

      const rarityLabel = upg.rarity === 'epic' ? '稀有' : upg.rarity === 'rare' ? '精良' : '';
      if (rarityLabel) {
        const rarityColor = upg.rarity === 'epic' ? '#fbbf24' : '#818cf8';
        const rt = this.add.text(cx + cardW / 2 - 14, cy - 40, rarityLabel, {
          fontSize: '12px', fontFamily: 'monospace', color: rarityColor,
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(302);
        this.upgradeUI.push(rt);
      }

      if (upg.maxStacks > 1 && upg.maxStacks < 99) {
        const stack = this.upgradeMgr.getStacks(upg.id) + 1;
        const st = this.add.text(cx + cardW / 2 - 14, cy + cardH / 2 - 16, `${stack}/${upg.maxStacks}`, {
          fontSize: '11px', fontFamily: 'monospace', color: '#475569',
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(302);
        this.upgradeUI.push(st);
      }

      const dt = this.add.text(cx, cy + 6, upg.desc, {
        fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
        wordWrap: { width: cardW - 32 }, align: 'center',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(dt);

      const hitArea = this.add.rectangle(cx, cy, cardW, cardH, 0xffffff, 0)
        .setScrollFactor(0).setDepth(303).setInteractive({ useHandCursor: true });
      this.upgradeUI.push(hitArea);

      hitArea.on('pointerover', () => this.drawCard(card, cx, cy, cardW, cardH, catColor, true));
      hitArea.on('pointerout', () => this.drawCard(card, cx, cy, cardW, cardH, catColor, false));
      hitArea.on('pointerdown', () => this.selectUpgrade(upg, pool));
    });

    const keyEvents = ['keydown-ONE', 'keydown-TWO', 'keydown-THREE'];
    choices.forEach((choice, index) => {
      const event = keyEvents[index];
      const handler = () => this.selectUpgrade(choice, pool);
      this.input.keyboard?.on(event, handler);
      this.upgradeHotkeys.push({ event, handler });
    });
  }

  private drawCard(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, catColor: number, hover: boolean): void {
    g.clear();
    g.fillStyle(hover ? 0x1e293b : 0x0f172a);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(1.5, hover ? catColor : 0x1e3a5f, hover ? 0.8 : 0.5);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    if (hover) {
      g.fillStyle(catColor, 0.06);
      g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    }
  }

  private selectUpgrade(upg: UpgradeDef, pool: 'wave' | 'level'): void {
    if (!this.upgrading) return;
    this.snd.upgrade();
    this.upgradeMgr.apply(this.hero, upg);
    const evolvedPath = this.upgradeMgr.consumeEvolution();
    this.clearUpgradeUI();
    if (evolvedPath) {
      const evolution = EVOLUTION_INFO[evolvedPath];
      this.announce(`⚡ 超限进化 · ${evolution.name}\n${evolution.desc}`, BUILD_INFO[evolvedPath].color, 1900);
      this.cameras.main.flash(180, 255, 220, 100, true);
      this.cameras.main.shake(220, 0.006);
    } else {
      this.announce(`获得: ${upg.name}`, CATEGORY_COLORS[upg.category] || 0xffffff, 1000);
    }
    this.finishUpgrade(pool);
  }

  private showSkillPreview(upg: UpgradeDef, pool: 'wave' | 'level'): void {
    const skillId = upg.id === 'skill_barrage' ? 'barrage' : 'timerift';
    const skill = getSkill(skillId);
    if (!skill) { this.finishUpgrade(pool); return; }

    const previewUI: Phaser.GameObjects.GameObject[] = [];
    const previewTweens: Phaser.Tweens.Tween[] = [];

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(400);
    previewUI.push(overlay);

    const cardW = 360, cardH = 300;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(401);
    bg.fillStyle(0x0f172a, 0.95);
    bg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    bg.lineStyle(2, skill.color, 0.8);
    bg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    previewUI.push(bg);

    const hex = '#' + skill.color.toString(16).padStart(6, '0');
    const title = this.add.text(cx, cy - cardH / 2 + 30, `技能解锁: ${skill.name}`, {
      fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: hex,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(title);

    const desc = this.add.text(cx, cy - cardH / 2 + 60, skill.desc, {
      fontSize: '14px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(desc);

    const demoY = cy + 10;
    const demoGfx = this.add.graphics().setScrollFactor(0).setDepth(402);
    previewUI.push(demoGfx);

    const demoCircle = this.add.circle(cx, demoY, 8, skill.color, 0.8).setScrollFactor(0).setDepth(402);
    previewUI.push(demoCircle);

    const ring1 = this.add.circle(cx, demoY, 15, skill.color, 0).setScrollFactor(0).setDepth(402);
    ring1.setStrokeStyle(2, skill.color, 0.7);
    previewUI.push(ring1);
    previewTweens.push(this.tweens.add({ targets: ring1, radius: 60, alpha: 0, duration: 1200, repeat: -1, ease: 'Quad.easeOut' }));

    const ring2 = this.add.circle(cx, demoY, 15, skill.color, 0).setScrollFactor(0).setDepth(402);
    ring2.setStrokeStyle(1.5, skill.color, 0.5);
    previewUI.push(ring2);
    previewTweens.push(this.tweens.add({ targets: ring2, radius: 45, alpha: 0, duration: 1200, repeat: -1, delay: 400, ease: 'Quad.easeOut' }));

    const levelsY = cy + 55;
    const displayLevels = Math.min(3, skill.levels.length);
    for (let i = 0; i < displayLevels; i++) {
      const lvlText = this.add.text(cx, levelsY + i * 20, skill.levels[i].desc, {
        fontSize: '11px', fontFamily: 'monospace', color: i === 0 ? '#e2e8f0' : '#64748b',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
      previewUI.push(lvlText);
    }
    const growthText = this.add.text(cx, levelsY + displayLevels * 20 + 4, `∞ ${skill.growthDesc}`, {
      fontSize: '11px', fontFamily: 'monospace', color: '#fbbf24',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(growthText);

    const hint = this.add.text(cx, cy + cardH / 2 - 65, '充能满后按 [ SPACE ] 释放  |  [ Q ] 切换技能', {
      fontSize: '11px', fontFamily: 'monospace', color: '#60a5fa',
      backgroundColor: '#1e293b', padding: { x: 8, y: 3 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(hint);

    const btnBg = this.add.graphics().setScrollFactor(0).setDepth(402);
    const btnW = 140, btnH = 40, btnY = cy + cardH / 2 - 28;
    btnBg.fillStyle(skill.color, 0.3);
    btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    btnBg.lineStyle(2, skill.color, 0.8);
    btnBg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    previewUI.push(btnBg);

    const btnText = this.add.text(cx, btnY, '确 认', {
      fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(403);
    previewUI.push(btnText);

    const btnHit = this.add.rectangle(cx, btnY, btnW, btnH, 0x000000, 0)
      .setScrollFactor(0).setDepth(404).setInteractive({ useHandCursor: true });
    previewUI.push(btnHit);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      previewTweens.forEach(tw => tw.stop());
      previewUI.forEach(o => { try { o.destroy(); } catch (_) { /* noop */ } });
      this.announce(`获得: ${skill.name}`, skill.color, 1000);
      this.finishUpgrade(pool);
    };

    btnHit.on('pointerdown', dismiss);
    overlay.setInteractive().on('pointerdown', dismiss);
  }

  private finishUpgrade(pool: 'wave' | 'level'): void {
    this.upgrading = false;
    this.hitlagUntil = 0;

    if (pool === 'level') {
      // Keep the cleared battlefield frozen until the next scene owns control.
      // Otherwise surviving projectiles (or developer fast-forward enemies) can
      // kill the player during the chapter-transition delay.
      this.paused = true;
      this.physics.pause();
      this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
      const nextLvl = this.currentLevel + 1;
      const sc = this.score;
      const kills = this.kills;
      const endless = this.endless;
      const operativeId = this.operativeId;
      const elapsedMs = this.elapsedBeforeChapterMs + this.activeRunMs;
      const sceneRef = this.scene;
      this.time.delayedCall(450, () => {
        try { sceneRef.start('ArenaScene', { level: nextLvl, score: sc, kills, endless, operativeId, elapsedMs }); } catch (_) { /* noop */ }
      });
    } else {
      this.physics.resume();
      this.waveMgr.scheduleNextWave(this.time.now);
    }
  }

  private clearUpgradeUI(): void {
    this.clearUpgradeHotkeys();
    this.upgradeUI.forEach(obj => obj.destroy());
    this.upgradeUI = [];
  }

  private clearUpgradeHotkeys(): void {
    for (const { event, handler } of this.upgradeHotkeys) {
      this.input.keyboard?.off(event, handler);
    }
    this.upgradeHotkeys = [];
  }

  private togglePause(): void {
    if (this.dead || this.upgrading || this.tutorial.isActive) return;
    this.paused = !this.paused;
    if (!this.paused) {
      this.clearPauseUI();
      this.physics.resume();
      return;
    }

    this.physics.pause();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x02050a, 0.76)
      .setScrollFactor(0).setDepth(500);
    const panel = this.add.graphics().setScrollFactor(0).setDepth(501);
    panel.fillStyle(0x0f172a, 0.98);
    panel.fillRoundedRect(cx - 180, cy - 115, 360, 230, 12);
    panel.lineStyle(1.5, 0x3b82f6, 0.65);
    panel.strokeRoundedRect(cx - 180, cy - 115, 360, 230, 12);
    const title = this.add.text(cx, cy - 66, '行动暂停', {
      fontSize: '28px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(502);
    const build = this.upgradeMgr.getBuildPath();
    const status = this.add.text(cx, cy - 18, `${this.chapter.name}  ·  ${this.waveMgr.wave}/${this.waveMgr.totalWaves} 波  ·  ${build ? BUILD_INFO[build].name : '基础武装'}`, {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(502);
    const hint = this.add.text(cx, cy + 34, 'ESC 继续   ·   M 返回主菜单', {
      fontSize: '14px', fontFamily: 'monospace', color: '#fbbf24',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(502);
    const resume = this.add.rectangle(cx, cy + 78, 170, 38, 0x1d4ed8)
      .setScrollFactor(0).setDepth(502).setInteractive({ useHandCursor: true });
    const resumeText = this.add.text(cx, cy + 78, '继续行动', {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(503);
    resume.on('pointerdown', () => this.togglePause());
    this.pauseUI.push(overlay, panel, title, status, hint, resume, resumeText);

    this.pauseMenuHandler = () => {
      this.paused = false;
      this.clearPauseUI();
      this.scene.start('MenuScene');
    };
    this.input.keyboard?.once('keydown-M', this.pauseMenuHandler);
  }

  private clearPauseUI(): void {
    if (this.pauseMenuHandler) {
      this.input.keyboard?.off('keydown-M', this.pauseMenuHandler);
      this.pauseMenuHandler = undefined;
    }
    this.pauseUI.forEach(obj => {
      try { obj.destroy(); } catch { /* already destroyed */ }
    });
    this.pauseUI = [];
  }

  /* ────────────────── Main Update Loop ────────────────── */

  update(time: number, delta: number) {
    try {
      this._updateInner(time, delta);
    } catch (err) {
      console.error('[ArenaScene.update] error:', err);
    }
  }

  private _updateInner(time: number, _delta: number): void {
    // Hitlag: skip game logic for a few real-time ms (freeze frame effect)
    const realNow = performance.now();
    if (this.hitlagUntil > 0 && realNow < this.hitlagUntil) return;
    if (this.hitlagUntil > 0) this.hitlagUntil = 0;

    // Safety: never let physics.world.timeScale stay above 1
    if (this.physics.world.timeScale !== 1) {
      this.physics.world.timeScale = 1;
    }

    // UI and visuals ALWAYS update — even during death / upgrade / tutorial
    this.updateUI(time);
    this.updateBgParticles(time);
    this.updateMapHazards(time);

    if (this.dead || this.upgrading || this.paused) return;

    // Game logic — only when alive, not upgrading, and not in tutorial
    if (!this.tutorial.isActive) {
      this.activeRunMs += _delta;
      this.hero.tick(time, _delta);
      const heroBody = this.hero.body as Phaser.Physics.Arcade.Body;
      this.applyEnvironmentVelocity(this.hero.x, this.hero.y, heroBody, time, true);
      const pointer = this.input.activePointer;
      this.runRecorder.recordFrame(
        _delta,
        heroBody.velocity.length() > 20,
        pointer.isDown && !pointer.rightButtonDown(),
      );
      this.updateEnemies(time, _delta);
      this.applyPulseDamage(time);
      this.updateBullets(time);
      this.magnetXpGems();
      this.waveMgr.update(time, _delta);

      if (this.hero.isInvincible && !this.hero.isDashing) {
        this.hero.setAlpha(Math.sin(time * 0.02) * 0.3 + 0.7);
      } else if (!this.hero.isDashing && this.hero.alpha !== 1) {
        this.hero.setAlpha(1);
      }
    }
  }

  private updateEnemies(time: number, delta: number): void {
    const riftActive = this.hero.isTimeRiftActive;
    const bullets = this.playerBullets.getChildren();
    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active) return;
      const heroDistance = Phaser.Math.Distance.Between(e.x, e.y, this.hero.x, this.hero.y);
      const targetHero = heroDistance < (e.isBoss ? 240 : 165);
      e.tick(
        time, delta,
        targetHero ? this.hero.x : this.defenseCore.x,
        targetHero ? this.hero.y : this.defenseCore.y,
      );
      this.applyEnvironmentVelocity(e.x, e.y, e.body as Phaser.Physics.Arcade.Body, time, false);

      // Elite dodge: evade incoming player bullets
      if (e.hasDodge && !e.dodging && time > 0) {
        for (const bc of bullets) {
          const bullet = bc as Projectile;
          if (!bullet.active) continue;
          const dist = Phaser.Math.Distance.Between(e.x, e.y, bullet.x, bullet.y);
          if (dist < 70) {
            const toEnemy = Phaser.Math.Angle.Between(bullet.x, bullet.y, e.x, e.y);
            const bBody = bullet.body as Phaser.Physics.Arcade.Body;
            const bulletAngle = Math.atan2(bBody.velocity.y, bBody.velocity.x);
            const angleDiff = Phaser.Math.Angle.Wrap(toEnemy - bulletAngle);
            if (Math.abs(angleDiff) < Math.PI / 3) {
              const awayAngle = Phaser.Math.Angle.Between(e.x, e.y, bullet.x, bullet.y);
              e.triggerDodge(time, awayAngle);
              break;
            }
          }
        }
      }

      // Elite lunge: charge toward hero when in range
      if (e.hasLunge) {
        const dist = Phaser.Math.Distance.Between(e.x, e.y, this.hero.x, this.hero.y);
        if (dist < 120 && dist > 40) {
          const angle = Phaser.Math.Angle.Between(e.x, e.y, this.hero.x, this.hero.y);
          e.triggerLunge(time, angle);
        }
      }

      if (riftActive) {
        const dist = Phaser.Math.Distance.Between(this.riftCenter.x, this.riftCenter.y, e.x, e.y);
        if (dist < this.riftRadius) {
          const b = e.body as Phaser.Physics.Arcade.Body;
          b.velocity.x *= 0.3;
          b.velocity.y *= 0.3;
        }
      }
    });
  }

  private updateBullets(time: number): void {
    const enemyChildren = this.enemies.getChildren();

    [...this.playerBullets.getChildren()].forEach(c => {
      const b = c as Projectile;
      if (b.active) {
        if (b.homing) {
          b.tryHomeToward(enemyChildren);
        }
        b.tick(time);
      }
    });

    [...this.enemyBullets.getChildren()].forEach(c => {
      const b = c as Projectile;
      if (b.active) b.tick(time);
    });
  }
}
