import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, ARENA_WIDTH, ARENA_HEIGHT,
  COLORS, HERO_CFG, ENEMY_TYPES,
} from '../config/gameConfig';
import { CATEGORY_COLORS } from '../data/upgrades';
import { Hero, FireEvent } from '../entities/Hero';
import { Enemy } from '../entities/Enemy';
import { Projectile, BulletOpts } from '../entities/Projectile';
import { WaveManager } from '../systems/WaveManager';
import { UpgradeManager } from '../systems/UpgradeManager';
import { SoundManager } from '../systems/SoundManager';
import { TutorialManager } from '../systems/TutorialManager';
import { ScoreManager } from '../systems/ScoreManager';
import { getSkill } from '../data/skills';
import type { UpgradeDef } from '../data/upgrades';

const MAX_PARTICLES = 30;

export class ArenaScene extends Phaser.Scene {
  private hero!: Hero;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private xpGems!: Phaser.Physics.Arcade.Group;

  private waveMgr!: WaveManager;
  private upgradeMgr!: UpgradeManager;

  /* ── UI objects ── */
  private hpGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private enemyHpGfx!: Phaser.GameObjects.Graphics;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private offscreenGfx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private waveProgressGfx!: Phaser.GameObjects.Graphics;

  /* ── State ── */
  private score = 0;
  private kills = 0;
  private currentLevel = 1;
  private upgrading = false;
  private dead = false;
  private upgradeUI: Phaser.GameObjects.GameObject[] = [];

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
  private endless = false;
  private bgParticles: Phaser.GameObjects.Graphics | null = null;

  /* ── TimeRift area tracking ── */
  private riftCenter = { x: 0, y: 0 };
  private riftRadius = 0;

  constructor() { super('ArenaScene'); }

  init(data: { level?: number; score?: number; endless?: boolean }) {
    this.currentLevel = data.level || 1;
    this.score = data.score || 0;
    this.kills = 0;
    this.upgrading = false;
    this.dead = false;
    this.comboCount = 0;
    this.hitlagUntil = 0;
    this.activeParticleCount = 0;
    this.waveEnemyTotal = 0;
    this.riftCenter = { x: 0, y: 0 };
    this.riftRadius = 0;
    this.endless = data.endless || false;
    if (this.currentLevel === 1 && !this.endless) {
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

    this.hero = new Hero(this, ARENA_WIDTH / 2, ARENA_HEIGHT / 2);

    this.snd = SoundManager.get();
    this.tutorial = new TutorialManager(this);
    this.upgradeMgr = new UpgradeManager();

    this.setupCollisions();
    this.setupCamera();
    this.createUI();
    this.bindEvents();

    const saved = this.registry.get('appliedUpgrades') as string[] | undefined;
    if (saved) {
      for (const id of saved) this.upgradeMgr.applyById(this.hero, id);
    }

    this.waveMgr = new WaveManager(this, this.currentLevel, this.enemies);
    this.waveMgr.startNextWave();

    this.tutorial.start();

    this.createBgParticles();

    if (this.input.mouse) this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) this.hero.dash(this.time.now);
    });
  }

  /* ────────────────── Arena Drawing ────────────────── */

  private drawArena(): void {
    const g = this.add.graphics();
    // Layered background
    g.fillStyle(0x080c14);
    g.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Gradient center glow
    for (let r = 350; r > 0; r -= 25) {
      g.fillStyle(0x0f1d35, 0.025);
      g.fillCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, r);
    }

    // Main grid
    g.lineStyle(1, 0x1a2a42, 0.15);
    for (let x = 0; x <= ARENA_WIDTH; x += 80) g.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 0; y <= ARENA_HEIGHT; y += 80) g.lineBetween(0, y, ARENA_WIDTH, y);

    // Fine sub-grid
    g.lineStyle(1, 0x0e1a2e, 0.08);
    for (let x = 40; x < ARENA_WIDTH; x += 80) g.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 40; y < ARENA_HEIGHT; y += 80) g.lineBetween(0, y, ARENA_WIDTH, y);

    // Corner glow accents
    const corners = [
      [0, 0], [ARENA_WIDTH, 0],
      [0, ARENA_HEIGHT], [ARENA_WIDTH, ARENA_HEIGHT],
    ];
    for (const [cx, cy] of corners) {
      for (let r = 120; r > 0; r -= 20) {
        g.fillStyle(0x0d2847, 0.03);
        g.fillCircle(cx, cy, r);
      }
    }

    // Boundary glow
    g.lineStyle(4, 0x1e40af, 0.35);
    g.strokeRect(2, 2, ARENA_WIDTH - 4, ARENA_HEIGHT - 4);
    g.lineStyle(1, 0x3b82f6, 0.12);
    g.strokeRect(6, 6, ARENA_WIDTH - 12, ARENA_HEIGHT - 12);

    // Corner bracket decorations
    const bLen = 30, bOff = 10;
    g.lineStyle(2, 0x3b82f6, 0.4);
    // Top-left
    g.lineBetween(bOff, bOff, bOff + bLen, bOff);
    g.lineBetween(bOff, bOff, bOff, bOff + bLen);
    // Top-right
    g.lineBetween(ARENA_WIDTH - bOff, bOff, ARENA_WIDTH - bOff - bLen, bOff);
    g.lineBetween(ARENA_WIDTH - bOff, bOff, ARENA_WIDTH - bOff, bOff + bLen);
    // Bottom-left
    g.lineBetween(bOff, ARENA_HEIGHT - bOff, bOff + bLen, ARENA_HEIGHT - bOff);
    g.lineBetween(bOff, ARENA_HEIGHT - bOff, bOff, ARENA_HEIGHT - bOff - bLen);
    // Bottom-right
    g.lineBetween(ARENA_WIDTH - bOff, ARENA_HEIGHT - bOff, ARENA_WIDTH - bOff - bLen, ARENA_HEIGHT - bOff);
    g.lineBetween(ARENA_WIDTH - bOff, ARENA_HEIGHT - bOff, ARENA_WIDTH - bOff, ARENA_HEIGHT - bOff - bLen);

    g.setDepth(-1);
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
      g.fillStyle(0x3b82f6, pulse);
      g.fillCircle(d.x, d.y, d.r);
    }
  }

  /* ────────────────── Physics ────────────────── */

  private setupCollisions(): void {
    this.physics.add.overlap(this.playerBullets, this.enemies,
      this.onBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.hero,
      this.onEnemyBulletHitHero as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.hero, this.enemies,
      this.onHeroTouchEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.hero, this.xpGems,
      this.onCollectGem as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
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

      // Berserk: +80% damage when low HP
      if (this.hero.berserk && this.hero.hp < this.hero.maxHp * 0.3) {
        dmg = Math.round(dmg * 1.8);
      }
      // Combo damage: +30% when combo >= 10
      if (this.hero.comboDmg && this.comboCount >= 10) {
        dmg = Math.round(dmg * 1.3);
      }
      // Critical hit
      if (this.hero.critChance > 0 && Math.random() < this.hero.critChance) {
        dmg *= 2;
        this.showDmgNum(enemy.x, enemy.y - 35, dmg, false, true);
      } else {
        this.showDmgNum(enemy.x, enemy.y - 20, dmg);
      }

      enemy.knockback(bullet.x, bullet.y, 60);
      const killed = enemy.takeDamage(dmg);
      this.hitParticles(enemy.x, enemy.y, enemy.cfg.color);

      // Frost shot: slow enemy
      if (this.hero.frostShot && !killed && enemy.active) {
        this.applyFrost(enemy);
      }

      // Lifesteal
      if (this.hero.lifesteal && this.hero.hp < this.hero.maxHp) {
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.ceil(this.hero.maxHp * 0.01));
      }

      // Explosive shot: AoE on hit
      if (this.hero.explosiveShot) {
        this.doExplosion(enemy.x, enemy.y, 60, Math.round(dmg * 0.4), enemy);
      }

      // Ricochet: on kill, bullet bounces to nearby enemy
      if (killed && this.hero.ricochetShot && bullet.owner === 'player') {
        this.doRicochet(enemy.x, enemy.y, dmg * 0.7, enemy);
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

  private onEnemyBulletHitHero(bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, _heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    try {
      if (this.dead) return;
      const bullet = bulletObj as unknown as Projectile;
      if (!bullet.active) return;
      const dmg = bullet.damage;
      bullet.recycle();
      this.hero.takeDamage(dmg);
      this.snd.heroHit();
    } catch (err) { console.error('[onEnemyBulletHitHero]', err); }
  }

  private onHeroTouchEnemy(_heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    try {
      if (this.dead) return;
      const enemy = enemyObj as unknown as Enemy;
      if (!enemy.active) return;

      if (this.hero.isDashing && this.hero.dashDamage > 0) {
        enemy.takeDamage(this.hero.dashDamage);
        enemy.knockback(this.hero.x, this.hero.y, 100);
        return;
      }

      this.hero.takeDamage(enemy.dmg);
      this.snd.heroHit();
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
    this.cameras.main.startFollow(this.hero, true, 0.09, 0.09);
    this.cameras.main.setBackgroundColor(COLORS.bg);
  }

  /* ────────────────── UI Creation ────────────────── */

  private createUI(): void {
    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.barGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.enemyHpGfx = this.add.graphics().setDepth(50);

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

    this.infoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, '', {
      fontSize: '14px', fontFamily: 'monospace', color: '#fbbf24', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 1);

    this.comboText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, '', {
      fontSize: '28px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
      stroke: '#000', strokeThickness: 4,
    }).setScrollFactor(0).setDepth(105).setOrigin(0.5).setAlpha(0);

    this.waveProgressGfx = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(110);
    this.offscreenGfx = this.add.graphics().setScrollFactor(0).setDepth(95);
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

    this.hpText.setText(`${this.hero.hp} / ${this.hero.maxHp}`);
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
    const skillStr = this.hero.unlockedSkills.length > 1 ? `${skillName} Lv${lvl} [Q]` : `${skillName} Lv${lvl}`;
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

    // Shield indicator
    if (this.hero.hasShield) {
      cg.lineStyle(2, 0x60a5fa, 0.4 + Math.sin(time * 0.005) * 0.2);
      cg.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 40);
      cg.lineStyle(1, 0x60a5fa, 0.15);
      cg.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 44);
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
    this.waveText.setText(`关卡 ${this.currentLevel}   波次 ${this.waveMgr.wave}/10   剩余 ${this.waveMgr.aliveCount}`);
    this.scoreText.setText(`${this.score} 分   ${this.kills} 杀`);

    // Tips (bottom) — always show skill info and controls
    const tips: string[] = [];
    if (activeSkill) {
      const sLvl = Math.max(0, lvl - 1);
      const sStats = activeSkill.levels[sLvl];
      const desc = sStats?.desc || activeSkill.desc;
      if (chargePct >= 1) {
        tips.push(`[ SPACE ] ${skillName} — ${desc}  ✦就绪✦`);
      } else {
        tips.push(`${skillName}: ${desc}  ⚡${Math.round(chargePct * 100)}%`);
      }
    }
    if (this.hero.unlockedSkills.length > 1) tips.push('[ Q ] 切换');
    tips.push('[ SHIFT ] 闪避');
    this.infoText.setText(tips.join('   '));

    this.drawWaveProgress();
    this.drawOffscreenIndicators();
    this.drawMinimap();
    this.drawEnemyHpBars();
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
    this.events.on('waveStart', this.onWaveStart, this);
    this.events.on('waveComplete', this.onWaveComplete, this);
    this.events.on('levelComplete', this.onLevelComplete, this);
  }

  private onHeroFire(ev: FireEvent): void {
    try {
      if (this.dead) return;
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

    // Afterimage: leave an exploding clone at start position
    if (this.hero.afterimage) {
      this.time.delayedCall(100, () => {
        this.doExplosion(ev.x, ev.y, 80, Math.round(this.hero.bulletDamage * this.hero.damageMult * 1.5));
        const flash = this.add.circle(ev.x, ev.y, 10, 0x93c5fd, 0.8).setDepth(16);
        this.tweens.add({ targets: flash, radius: 80, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
      });
    }
  }

  private onSkillUse(ev: { skillId: string; level: number; x: number; y: number }): void {
    try {
      if (this.dead) return;
      const skill = getSkill(ev.skillId);
      if (!skill) return;
      const lvl = Math.max(0, Math.min(ev.level, skill.maxLevel) - 1);
      const stats = skill.levels[lvl];
      if (!stats) return;

      this.tutorial.onSkillUse();
      switch (ev.skillId) {
        case 'burst':
          this.snd.skillBurst();
          this.doSkillBurst(ev.x, ev.y, stats.damage * this.hero.damageMult, stats.radius, skill.color);
          break;
        case 'barrage':
          this.snd.skillBarrage();
          this.hero.barrageEndTime = this.time.now + stats.duration;
          this.announce('弹幕风暴!', skill.color, 1000);
          this.cameras.main.flash(80, 255, 80, 80, true);
          break;
        case 'timerift':
          this.snd.skillTimeRift();
          this.doSkillTimeRift(ev.x, ev.y, stats.damage * this.hero.damageMult, stats.radius, stats.duration, skill.color);
          break;
      }

      // XP magnet on skill use
      if (this.hero.xpMagnetOnSkill) {
        [...this.xpGems.getChildren()].forEach(c => {
          const gem = c as Phaser.Physics.Arcade.Sprite;
          if (!gem.active) return;
          const a = Phaser.Math.Angle.Between(gem.x, gem.y, this.hero.x, this.hero.y);
          const spd = 500;
          (gem.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
        });
      }
    } catch (err) { console.error('[onSkillUse]', err); }
  }

  private doSkillBurst(x: number, y: number, damage: number, radius: number, color: number): void {
    const expandR = radius * 1.4;

    // Shockwave ring expanding outward
    const ring = this.add.circle(x, y, radius * 0.3, 0xffffff, 0.8).setDepth(16);
    ring.setStrokeStyle(4, color, 1);
    this.tweens.add({
      targets: ring,
      radius: expandR,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        ring.setStrokeStyle(4, color, ring.alpha);
      },
      onComplete: () => ring.destroy(),
    });

    // Inner flash
    const flash = this.add.circle(x, y, radius * 0.8, color, 0.35).setDepth(15);
    this.tweens.add({
      targets: flash,
      radius: expandR,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Bright center burst
    const center = this.add.circle(x, y, 20, 0xffffff, 0.9).setDepth(17);
    this.tweens.add({
      targets: center,
      scaleX: 3, scaleY: 3,
      alpha: 0,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => center.destroy(),
    });

    // Radial lines
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 / 12) * i;
      const len = radius * 0.6 + Math.random() * radius * 0.5;
      const line = this.add.line(
        0, 0,
        x + Math.cos(a) * 15, y + Math.sin(a) * 15,
        x + Math.cos(a) * len, y + Math.sin(a) * len,
        color, 0.7,
      ).setDepth(15).setLineWidth(2);
      this.tweens.add({
        targets: line, alpha: 0, duration: 250 + Math.random() * 100,
        onComplete: () => line.destroy(),
      });
    }

    // Particles
    if (this.activeParticleCount < MAX_PARTICLES) {
      this.activeParticleCount++;
      const emitter = this.add.particles(x, y, 'particle_yellow', {
        speed: { min: 100, max: 300 }, scale: { start: 1.5, end: 0 },
        lifespan: 350, tint: color, quantity: 12, emitting: false,
      });
      emitter.explode(12);
      emitter.setDepth(18);
      this.time.delayedCall(400, () => { emitter.destroy(); this.activeParticleCount--; });
    }

    this.cameras.main.shake(150, 0.01);
    this.cameras.main.flash(80, 255, 200, 50, true);

    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active) return;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < radius + e.cfg.bodyRadius) {
        e.takeDamage(damage);
        e.knockback(x, y, 150);
        this.showDmgNum(e.x, e.y - 20, damage);
      }
    });
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
      targets: rift, alpha: { from: 0.8, to: 0.1 }, angle: 45,
      duration: duration, onComplete: () => rift.destroy(),
    });
    this.tweens.add({
      targets: distort, alpha: { from: 0.5, to: 0 }, angle: -30,
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

  private onSkillSwitch(ev: { skillId: string }): void {
    const skill = getSkill(ev.skillId);
    if (!skill) return;
    this.announce(`切换: ${skill.name}`, skill.color, 600);
  }

  private onHeroHit(ev: { x: number; y: number; damage: number }): void {
    try {
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
    this.dead = true;
    this.hitlagUntil = 0;
    this.physics.pause();
    this.snd.heroDeath();
    this.cameras.main.shake(400, 0.015);
    this.cameras.main.flash(300, 255, 0, 0, true);
    this.deathParticles(this.hero.x, this.hero.y);
    this.tutorial.destroy();

    // Death message overlay
    const deathText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, '阵亡', {
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

    const data = {
      score: this.score, kills: this.kills,
      wave: this.waveMgr.wave, level: this.currentLevel,
      endless: this.endless,
    };
    ScoreManager.saveScore({
      score: this.score, kills: this.kills,
      level: this.currentLevel, wave: this.waveMgr.wave,
      endless: this.endless,
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

  private onWaveStart(ev: { wave: number; total: number; isBoss?: boolean }): void {
    this.waveEnemyTotal = this.waveMgr.aliveCount;
    if (ev.isBoss) {
      this.announce('⚠ BOSS 来袭！', 0xef4444, 2000);
      this.cameras.main.shake(300, 0.004);
      this.snd.bossAlert();
    } else {
      this.announce(`波次 ${ev.wave}`, 0xfbbf24, 1000);
      this.snd.waveStart();
    }
  }

  private onWaveComplete(ev: { wave: number; total: number }): void {
    if (ev.wave >= ev.total) {
      this.waveMgr.scheduleNextWave(this.time.now);
      return;
    }
    this.showUpgradeUI('wave');
  }

  private onLevelComplete(ev: { level: number }): void {
    if (ev.level >= 3 && !this.endless) {
      this.dead = true;
      this.tutorial.destroy();
      this.snd.victory();
      this.announce('🏆 通关成功！进入无尽模式可继续挑战', 0x22c55e, 3000);
      this.slowMoFinish(true);
      const data = {
        score: this.score, kills: this.kills, wave: 10, level: ev.level,
        victory: true, endless: false,
      };
      ScoreManager.saveScore({ score: this.score, kills: this.kills, level: ev.level, wave: 10, endless: false });
      const sceneRef = this.scene;
      window.setTimeout(() => {
        try { sceneRef.start('GameOverScene', data); } catch (_) { /* noop */ }
      }, 3000);
      return;
    }
    this.hero.heal(this.hero.maxHp);
    if (this.endless) {
      this.announce(`无尽 ${ev.level} 通过！敌人更强了...`, 0xfbbf24, 2000);
    } else {
      this.announce(`关卡 ${ev.level} 通过！`, 0x22c55e, 2000);
    }
    const showUpgrade = () => {
      if (this.dead) return;
      this.showUpgradeUI('level');
    };
    window.setTimeout(() => { try { showUpgrade(); } catch (_) { /* noop */ } }, 2500);
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
    const label = isCrit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`;
    const t = this.add.text(x + Phaser.Math.Between(-8, 8), y, label, {
      fontSize: isCrit ? '22px' : (isHero ? '18px' : '14px'),
      fontFamily: 'monospace',
      color: isCrit ? '#fbbf24' : (isHero ? '#ff6b6b' : '#ffffff'),
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? 3 : 2,
    }).setOrigin(0.5).setDepth(60);
    const dur = isCrit ? 700 : 500;
    this.tweens.add({ targets: t, y: y - (isCrit ? 45 : 30), alpha: 0, duration: dur, onComplete: () => t.destroy() });
    if (isCrit) {
      this.tweens.add({ targets: t, scaleX: 1.4, scaleY: 1.4, duration: 120, yoyo: true });
    }
  }

  /* ────────────────── New Upgrade Combat Effects ────────────────── */

  private applyFrost(enemy: Enemy): void {
    const origSpd = enemy.spd;
    enemy.spd *= 0.5;
    enemy.setTint(0x87ceeb);
    this.time.delayedCall(1000, () => {
      if (enemy.active && enemy.scene) {
        enemy.spd = origSpd;
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

  private doRicochet(x: number, y: number, damage: number, exclude: Enemy): void {
    let nearest: Enemy | null = null;
    let minD = 200;
    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active || e === exclude) return;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < minD) { minD = d; nearest = e; }
    });
    if (!nearest) return;
    const ne = nearest as Enemy;
    const line = this.add.line(0, 0, x, y, ne.x, ne.y, 0xfbbf24, 0.6).setDepth(15);
    this.tweens.add({ targets: line, alpha: 0, duration: 150, onComplete: () => line.destroy() });
    ne.takeDamage(Math.round(damage));
    this.showDmgNum(ne.x, ne.y - 20, Math.round(damage));
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
      speed: { min: 50, max: 140 }, scale: { start: 0.9, end: 0 },
      lifespan: 200, tint: color, quantity: 3, emitting: false,
    });
    emitter.explode(3); emitter.setDepth(20);
    this.time.delayedCall(250, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private deathParticles(x: number, y: number, color?: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(x, y, 'particle_white', {
      speed: { min: 70, max: 220 }, scale: { start: 1.3, end: 0 },
      lifespan: 450, tint: color ?? 0xffffff, quantity: 8, emitting: false,
    });
    emitter.explode(8); emitter.setDepth(20);
    this.time.delayedCall(500, () => { emitter.destroy(); this.activeParticleCount--; });
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
        this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
        const nextLvl = this.currentLevel + 1;
        const sc = this.score;
        const endless = this.endless;
        const sceneRef = this.scene;
        window.setTimeout(() => {
          try { sceneRef.start('ArenaScene', { level: nextLvl, score: sc, endless }); } catch (_) { /* noop */ }
        }, 800);
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

    const title = pool === 'level' ? '永久强化' : '选择升级';
    const titleText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18, title, {
      fontSize: '24px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.upgradeUI.push(titleText);

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

      const rarityLabel = upg.rarity === 'epic' ? '稀有' : upg.rarity === 'rare' ? '精良' : '';
      if (rarityLabel) {
        const rarityColor = upg.rarity === 'epic' ? '#fbbf24' : '#818cf8';
        const rt = this.add.text(cx + cardW / 2 - 14, cy - 40, rarityLabel, {
          fontSize: '12px', fontFamily: 'monospace', color: rarityColor,
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(302);
        this.upgradeUI.push(rt);
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
    this.snd.upgrade();
    this.upgradeMgr.apply(this.hero, upg);
    this.clearUpgradeUI();

    // Show skill preview popup for skill unlocks
    const isSkillUnlock = ['skill_barrage', 'skill_timerift'].includes(upg.id);
    if (isSkillUnlock) {
      this.showSkillPreview(upg, pool);
      return;
    }

    this.announce(`获得: ${upg.name}`, CATEGORY_COLORS[upg.category] || 0xffffff, 1000);
    this.finishUpgrade(pool);
  }

  private showSkillPreview(upg: UpgradeDef, pool: 'wave' | 'level'): void {
    const skillId = upg.id === 'skill_barrage' ? 'barrage' : 'timerift';
    const skill = getSkill(skillId);
    if (!skill) { this.finishUpgrade(pool); return; }

    const previewUI: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(400).setInteractive();
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

    // Animated demo
    const demoY = cy + 10;
    const demoGfx = this.add.graphics().setScrollFactor(0).setDepth(402);
    previewUI.push(demoGfx);

    // Demo animation: pulsing rings showing skill effect
    const demoCircle = this.add.circle(cx, demoY, 8, skill.color, 0.8).setScrollFactor(0).setDepth(402);
    previewUI.push(demoCircle);

    const ring1 = this.add.circle(cx, demoY, 15, skill.color, 0).setScrollFactor(0).setDepth(402);
    ring1.setStrokeStyle(2, skill.color, 0.7);
    previewUI.push(ring1);
    this.tweens.add({ targets: ring1, radius: 60, alpha: 0, duration: 1200, repeat: -1, ease: 'Quad.easeOut' });

    const ring2 = this.add.circle(cx, demoY, 15, skill.color, 0).setScrollFactor(0).setDepth(402);
    ring2.setStrokeStyle(1.5, skill.color, 0.5);
    previewUI.push(ring2);
    this.tweens.add({ targets: ring2, radius: 45, alpha: 0, duration: 1200, repeat: -1, delay: 400, ease: 'Quad.easeOut' });

    // Level descriptions
    const levelsY = cy + 60;
    for (let i = 0; i < skill.levels.length; i++) {
      const lvlText = this.add.text(cx, levelsY + i * 22, `Lv${i + 1}: ${skill.levels[i].desc}`, {
        fontSize: '12px', fontFamily: 'monospace', color: i === 0 ? '#e2e8f0' : '#64748b',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
      previewUI.push(lvlText);
    }

    // Usage hint
    const hint = this.add.text(cx, cy + cardH / 2 - 65, '充能满后按 [ SPACE ] 释放  |  [ Q ] 切换技能', {
      fontSize: '11px', fontFamily: 'monospace', color: '#60a5fa',
      backgroundColor: '#1e293b', padding: { x: 8, y: 3 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(hint);

    // OK button
    const btnBg = this.add.graphics().setScrollFactor(0).setDepth(402);
    const btnW = 120, btnH = 32, btnY = cy + cardH / 2 - 28;
    btnBg.fillStyle(skill.color, 0.2);
    btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    btnBg.lineStyle(1, skill.color, 0.6);
    btnBg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    previewUI.push(btnBg);

    const btnText = this.add.text(cx, btnY, '确认', {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(403);
    previewUI.push(btnText);

    const btnHit = this.add.rectangle(cx, btnY, btnW, btnH, 0x000000, 0)
      .setScrollFactor(0).setDepth(404).setInteractive({ useHandCursor: true });
    previewUI.push(btnHit);

    btnHit.on('pointerdown', () => {
      previewUI.forEach(o => o.destroy());
      this.announce(`获得: ${skill.name}`, skill.color, 1000);
      this.finishUpgrade(pool);
    });
  }

  private finishUpgrade(pool: 'wave' | 'level'): void {
    this.upgrading = false;
    this.physics.resume();
    this.hitlagUntil = 0;

    if (pool === 'level') {
      this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
      const nextLvl = this.currentLevel + 1;
      const sc = this.score;
      const endless = this.endless;
      const sceneRef = this.scene;
      window.setTimeout(() => {
        try { sceneRef.start('ArenaScene', { level: nextLvl, score: sc, endless }); } catch (_) { /* noop */ }
      }, 1200);
    } else {
      this.waveMgr.scheduleNextWave(this.time.now);
    }
  }

  private clearUpgradeUI(): void {
    this.upgradeUI.forEach(obj => obj.destroy());
    this.upgradeUI = [];
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

    if (this.dead || this.upgrading) return;

    // Game logic — only when alive, not upgrading, and not in tutorial
    if (!this.tutorial.isActive) {
      this.hero.tick(time, _delta);
      this.updateEnemies(time, _delta);
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
      e.tick(time, delta, this.hero.x, this.hero.y);

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
