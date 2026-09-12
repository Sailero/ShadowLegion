import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, ARENA_WIDTH, ARENA_HEIGHT,
  COLORS, HERO_CFG, ENEMY_TYPES, WAVE_CFG, MAX_ACTIVE_ENEMIES, normalizeRunLevel,
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
import { SettingsManager } from '../systems/SettingsManager';
import { ShadowCompanion, ShadowRival } from '../systems/ShadowCompanion';
import { JourneyDirector } from '../systems/JourneyDirector';
import { openSettings } from '../ui/theme';
import { RunCheckpointManager } from '../systems/RunCheckpointManager';
import { SessionMetricsManager } from '../systems/SessionMetricsManager';
import { getStage, getStageChapter, type StageDef } from '../data/stages';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { getShadowTrial, type GameMode } from '../data/modes';
import { ShadowTrialManager } from '../systems/ShadowTrialManager';

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
  private announcement: Phaser.GameObjects.Container | null = null;
  private announcementPriority = -1;
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
  private shadow!: ShadowCompanion;
  private journey!: JourneyDirector;
  private shadowTrial = false;
  private shadowTrialSpawned = false;
  private shadowText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private actionHint!: Phaser.GameObjects.Text;
  private lastActionHint = -10000;
  private combatTime = 0;
  private lastHudUpdate = -1000;
  private waveStartedAt = 0;
  private pointerDashHandler?: (ptr: Phaser.Input.Pointer) => void;
  private blurHandler?: () => void;
  private commandHandler?: () => void;

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
  private mode: GameMode = 'campaign';
  private stage?: StageDef;
  private trialTier = 1;
  private completionId = '';
  private openingDrafts = 0;
  private stageStats = { dashes: 0, skills: 0, commands: 0, terrainHits: 0, intercepts: 0, priorityKills: 0 };
  private bgParticles: Phaser.GameObjects.Graphics | null = null;

  /* ── TimeRift area tracking ── */
  private riftCenter = { x: 0, y: 0 };
  private riftRadius = 0;

  constructor() { super('ArenaScene'); }

  init(data: {
    level?: number; score?: number; kills?: number; endless?: boolean;
    operativeId?: OperativeId; freshRun?: boolean; elapsedMs?: number; shadowTrial?: boolean; resumeCheckpoint?: boolean; startLevel?: number;
    mode?: GameMode; stageId?: number; trialTier?: number;
  }) {
    if (data.resumeCheckpoint) {
      const saved = RunCheckpointManager.load();
      if (saved) {
        data = { ...saved, elapsedMs: saved.elapsedMs, freshRun: false, resumeCheckpoint: true };
        this.registry.set('appliedUpgrades', saved.appliedUpgrades);
        this.registry.set('runRecorder', RunRecorder.restore(saved.recorder));
        this.registry.set('shadowTrial', saved.shadowTrial);
        this.registry.set('runStartLevel', saved.startLevel);
      } else data = { level: 1, freshRun: true };
    }
    this.mode = data.mode ?? (data.endless ? 'endless' : 'campaign');
    this.stage = this.mode === 'campaign' ? getStage(data.stageId ?? ((Math.max(1, data.level ?? 1) - 1) * 10 + 1)) : undefined;
    if (this.stage && !CampaignProgressionManager.isStageUnlocked(this.stage.id)) this.stage = getStage(CampaignProgressionManager.getNextUnlockedStage().id);
    this.trialTier = getShadowTrial(data.trialTier ?? 1).tier;
    this.currentLevel = this.stage?.chapter ?? (this.mode === 'shadow' ? this.trialTier : normalizeRunLevel(data.level, this.mode === 'endless'));
    this.completionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    this.openingDrafts = data.freshRun === false && (this.registry.get('appliedUpgrades')?.length ?? 0) > 0 ? 0 : this.stage?.id === 1 ? 1 : 2;
    this.stageStats = { dashes: 0, skills: 0, commands: 0, terrainHits: 0, intercepts: 0, priorityKills: 0 };
    this.score = data.score || 0;
    this.kills = data.kills || 0;
    this.upgrading = false;
    this.paused = false;
    this.dead = false;
    this.comboCount = 0;
    this.announcement = null;
    this.announcementPriority = -1;
    this.hitlagUntil = 0;
    this.comboResetTime = 0;
    this.lastComboVal = 0;
    this.lastShakeTime = -10000;
    this.lastDmgNumTime = -10000;
    this.defenseInvUntil = 0;
    this.activeParticleCount = 0;
    this.waveEnemyTotal = 0;
    this.riftCenter = { x: 0, y: 0 };
    this.riftRadius = 0;
    this.activeRunMs = 0;
    this.currentWaveName = '';
    this.endless = this.mode === 'endless';
    this.operativeId = data.operativeId ?? 'ranger';
    this.chapter = this.stage ? getStageChapter(this.stage.id) : getChapter(this.currentLevel, this.endless);
    this.elapsedBeforeChapterMs = data.elapsedMs || 0;
    this.pulseDamageAt = 0;
    this.shadowTrial = this.mode === 'shadow' || (data.shadowTrial ?? false);
    this.shadowTrialSpawned = false;
    this.combatTime = 0;
    this.lastHudUpdate = -1000;
    this.waveStartedAt = 0;
    this.lastActionHint = -10000;
    if (data.freshRun || this.mode !== 'endless' && !data.resumeCheckpoint) {
      RunCheckpointManager.clear();
      this.registry.remove('appliedUpgrades');
      this.registry.remove('runRecorder');
      this.registry.set('shadowTrial', this.shadowTrial);
      this.registry.set('runStartLevel', this.currentLevel);
    }
  }

  create() {
    this.data.set('battleTime', 0);
    this.time.paused = false;
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
      // Arcade circle separation also consults pushable; immovable alone can
      // still displace the camp when several circular enemies reach it.
      .setImmovable(true).setPushable(false).setDepth(7);
    const coreBody = this.defenseCore.body as Phaser.Physics.Arcade.Body;
    coreBody.setCircle(29, this.defenseCore.width / 2 - 29, this.defenseCore.height / 2 - 29);

    this.hero = new Hero(this, ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 110);

    const metaState = MetaProgressionManager.getState();
    const metaBonuses = MetaProgressionManager.getCombatBonuses(this.operativeId, metaState);
    this.defenseMaxHp += metaBonuses.coreHpBonus;
    this.defenseHp = this.defenseMaxHp;

    this.snd = SoundManager.get();
    this.tutorial = new TutorialManager(this);
    this.upgradeMgr = new UpgradeManager(metaState.unlockedSkills);
    this.upgradeMgr.initializeOperative(this.hero, this.operativeId);
    MetaProgressionManager.applyCombatBonuses(this.hero, this.operativeId, metaState);
    this.runRecorder = this.registry.get('runRecorder') ?? new RunRecorder();
    this.registry.set('runRecorder', this.runRecorder);
    this.journey = new JourneyDirector(this.chapter.id, this.shadowTrial);
    this.shadow = new ShadowCompanion(this, {
      profile: metaState.lastProfile, chapter: this.chapter,
      core: { x: this.defenseCore.x, y: this.defenseCore.y },
      onFire: opts => this.spawnBullet({ ...opts, source: 'shadow' }),
      spectator: this.mode === 'shadow',
    });

    this.setupCollisions();
    this.setupCamera();
    this.createUI();
    this.bindEvents();
    this.input.keyboard?.on('keydown-ESC', this.togglePause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.togglePause, this);
      this.clearUpgradeHotkeys();
      this.clearPauseUI();
      this.shadow.destroy();
      this.tutorial.destroy();
      if (this.commandHandler) this.input.keyboard?.off('keydown-E', this.commandHandler);
      if (this.pointerDashHandler) this.input.off('pointerdown', this.pointerDashHandler);
      if (this.blurHandler) this.game.events.off(Phaser.Core.Events.BLUR, this.blurHandler);
      if (this.physics.world) this.physics.world.timeScale = 1;
      this.time.paused = false;
      // Scene event emitters persist across restart. Only remove our gameplay events.
      for (const name of ['heroFire', 'enemyFire', 'bossTelegraph', 'heroDash', 'heroSkill',
        'skillSwitch', 'heroHit', 'heroDodge', 'heroDeath', 'shieldBreak', 'enemyDeath',
        'enemySplit', 'enemySummon', 'enemyBlastTelegraph', 'enemyBlast', 'enemySupportPulse',
        'defenseRepair', 'waveStart', 'waveComplete', 'levelComplete', 'shadowDefeated', 'actionUnavailable']) {
        this.events.removeAllListeners(name);
      }
    });

    const saved = this.registry.get('appliedUpgrades') as string[] | undefined;
    if (saved) {
      for (const id of saved) this.upgradeMgr.applyById(this.hero, id);
    }
    this.upgradeMgr.consumeEvolution();
    const savedCheckpoint = RunCheckpointManager.save({
      level: this.currentLevel, operativeId: this.operativeId, endless: this.endless,
      startLevel: this.registry.get('runStartLevel') ?? this.currentLevel,
      score: this.score, kills: this.kills, elapsedMs: this.elapsedBeforeChapterMs,
      appliedUpgrades: this.upgradeMgr.getAppliedIds(), shadowTrial: this.shadowTrial,
      recorder: this.runRecorder.serialize(),
      mode: this.mode, stageId: this.stage?.id, trialTier: this.trialTier,
    });
    if (!savedCheckpoint) this.showActionHint('本次进度暂时无法保存；仍可继续游玩');

    this.waveMgr = new WaveManager(this, this.currentLevel, this.enemies, this.endless, { mode: this.mode, stageId: this.stage?.id, trialTier: this.trialTier });
    if (this.openingDrafts === 0) this.waveMgr.startNextWave();

    this.tutorial.start();

    this.createBgParticles();

    if (this.input.mouse) this.input.mouse.disableContextMenu();
    this.pointerDashHandler = (ptr: Phaser.Input.Pointer) => {
      if (!this.paused && !this.upgrading && !this.dead && !this.tutorial.isActive && ptr.rightButtonDown()) this.hero.dash(this.combatTime);
    };
    this.input.on('pointerdown', this.pointerDashHandler);
    this.commandHandler = () => {
      if (this.dead || this.paused || this.upgrading || this.tutorial.isActive) return;
      const mode = this.shadow.toggleMode();
      this.journey.record('command');
      this.stageStats.commands++;
      this.showActionHint(mode === 'guard' ? '影伴：营地交给我！' : '影伴：一起去散步！');
      this.snd.buttonClick();
    };
    this.input.keyboard?.on('keydown-E', this.commandHandler);
    this.blurHandler = () => {
      if (!this.paused && !this.upgrading && !this.dead && !this.tutorial.isActive) this.togglePause();
      this.input.keyboard?.resetKeys();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, this.blurHandler);
  }

  /* ────────────────── Arena Drawing ────────────────── */

  private drawArena(): void {
    const g = this.add.graphics().setDepth(-1);
    const p = this.chapter.colors;
    const cx = ARENA_WIDTH / 2, cy = ARENA_HEIGHT / 2;
    if (this.textures.exists(`ground-${this.chapter.id}`)) {
      this.add.tileSprite(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, `ground-${this.chapter.id}`).setTileScale(.65).setDepth(-2);
      g.fillStyle(p.ground, .52).fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    } else g.fillStyle(p.ground).fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    // Soft meadows and a readable path to the shared picnic lantern.
    for (let i = 0; i < 34; i++) {
      const x = (i * 347 + 97) % ARENA_WIDTH, y = (i * 193 + 83) % ARENA_HEIGHT;
      g.fillStyle(p.grid, 0.16).fillEllipse(x, y, 160 + i % 4 * 35, 90);
    }
    for (const lane of this.chapter.spawnPoints) {
      g.lineStyle(64, 0xfaf0d6, 0.6).lineBetween(lane.x, lane.y, cx, cy);
      g.lineStyle(2, p.accent, 0.12).lineBetween(lane.x, lane.y, cx, cy);
      g.fillStyle(0xfff9e8).fillCircle(lane.x, lane.y, 23);
      g.lineStyle(3, p.accent, 0.6).strokeCircle(lane.x, lane.y, 23);
      this.add.text(lane.x, lane.y + (lane.y > cy ? -38 : 38), lane.label, {
        fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '13px', color: '#53654b',
        backgroundColor: '#fff8e7', padding: { x: 7, y: 4 },
      }).setOrigin(0.5).setDepth(0);
    }
    for (let i = 0; i < 190; i++) {
      const x = (i * 137 + 41) % ARENA_WIDTH, y = (i * 227 + 57) % ARENA_HEIGHT;
      if (Math.hypot(x - cx, y - cy) < 155 || this.chapter.obstacles.some(o => pointInRect(x, y, o))) continue;
      if (i % 4 === 0) {
        g.fillStyle(i % 8 ? 0xfff8e3 : 0xe8a994, 0.75);
        for (let petal = 0; petal < 5; petal++) {
          const a = petal * Math.PI * 2 / 5;
          g.fillCircle(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3);
        }
        g.fillStyle(0xc39a43).fillCircle(x, y, 2);
      } else {
        g.lineStyle(1, p.detail, 0.22).lineBetween(x - 3, y - 4, x, y + 3).lineBetween(x, y + 3, x + 4, y - 2);
      }
    }
    for (const zone of this.chapter.hazards) {
      g.fillStyle(p.hazard, 0.16).fillRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 18);
      g.lineStyle(2, p.hazard, 0.45).strokeRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 18);
      for (let i = 0; i < 6; i++) {
        const x = zone.x - zone.width * .38 + zone.width * .15 * i;
        g.lineStyle(2, p.hazard, .28).lineBetween(x, zone.y - 12, x + 10, zone.y - 8).lineBetween(x + 10, zone.y - 8, x + 20, zone.y - 12);
      }
      this.add.text(zone.x, zone.y - zone.height / 2 + 12, this.chapter.specialName, {
        fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '12px', color: '#675d46',
        backgroundColor: '#fff5dc', padding: { x: 8, y: 3 },
      }).setOrigin(.5, 0).setDepth(3);
    }
    for (const o of this.chapter.obstacles) {
      const x = o.x - o.width / 2, y = o.y - o.height / 2;
      g.fillStyle(0x6c7750, .12).fillRoundedRect(x + 5, y + 7, o.width, o.height, 13);
      const fill = this.chapter.id === 1 ? 0x9ab17c : this.chapter.id === 2 ? 0xd9b78c : this.chapter.id === 3 ? 0xb6aa83 : 0xdfac8a;
      g.fillStyle(fill).fillRoundedRect(x, y, o.width, o.height, 13);
      g.lineStyle(3, p.detail, .5).strokeRoundedRect(x, y, o.width, o.height, 13);
      g.lineStyle(2, 0xfff8df, .55).lineBetween(x + 14, y + 7, x + o.width - 14, y + 7);
      if (this.chapter.id === 1) {
        for (let i = 0; i < 5; i++) {
          g.fillStyle(i % 2 ? 0xbbca8f : 0xa8bf82, .8).fillEllipse(x + 18 + (o.width - 36) * i / 4, o.y, 27, o.height - 12);
          g.fillStyle(0xf6d095).fillCircle(x + 18 + (o.width - 36) * i / 4, o.y - 8, 3);
        }
      } else {
        for (let n = 20; n < o.width - 8; n += 28) g.lineStyle(2, p.detail, .2).lineBetween(x + n, y + 6, x + n, y + o.height - 6);
      }
      if (this.textures.exists('garden_tree')) {
        const columns = Math.max(1, Math.ceil(o.width / 96)), rows = Math.max(1, Math.ceil(o.height / 96));
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
          const tree = this.add.image(x + (column + .5) * o.width / columns, y + (row + .5) * o.height / rows, 'garden_tree')
            .setDisplaySize(o.width / columns + 23, o.height / rows + 26).setDepth(2);
          if (this.chapter.id === 2) tree.setTint(0xe8d9aa);
          if (this.chapter.id === 3) tree.setTint(0xc6e3d4);
          if (this.chapter.id === 4) tree.setTint(0xf0cab9);
          if (this.chapter.id === 5) tree.setTint(0xf6e9bc);
        }
      }
    }
    g.fillStyle(0xf8edd0).fillCircle(cx, cy, 76);
    g.lineStyle(2, 0xb49a69, .55).strokeCircle(cx, cy, 77);
    g.fillStyle(0xe2b08b, .28).fillRoundedRect(cx - 50, cy - 40, 100, 80, 10);
    for (let i = -2; i <= 2; i++) {
      g.lineStyle(2, 0xfff9e6, .7).lineBetween(cx - 46, cy + i * 14, cx + 46, cy + i * 14);
      g.lineBetween(cx + i * 17, cy - 35, cx + i * 17, cy + 35);
    }
    this.add.text(cx, cy + 59, '我们的暖灯营地', {
      fontSize: '13px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#655539',
      backgroundColor: '#fff7df', padding: { x: 8, y: 3 },
    }).setOrigin(.5).setDepth(1);
    g.lineStyle(10, p.detail, .22).strokeRoundedRect(5, 5, ARENA_WIDTH - 10, ARENA_HEIGHT - 10, 24);
    this.cacheStaticGround(g);
  }

  private cacheStaticGround(graphics: Phaser.GameObjects.Graphics): void {
    // Replaying the garden's paths every frame costs substantially more than
    // drawing the same pixels once. Only the static overlay is cached; tide,
    // hazards, particles, actors and collision geometry stay independent.
    const key = 'sunlit-arena-ground-cache';
    try {
      if (this.textures.exists(key)) this.textures.remove(key);
      graphics.generateTexture(key, ARENA_WIDTH, ARENA_HEIGHT);
      const texture = this.textures.get(key);
      this.add.image(0, 0, key).setOrigin(0).setDepth(graphics.depth).setName('static-ground-cache');
      graphics.destroy();
      // Keep just the current map's canvas/GPU texture, including across fifty
      // campaign maps and repeated endless scene restarts.
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this.textures.exists(key) && this.textures.get(key) === texture) this.textures.remove(key);
      });
    } catch (error) {
      if (this.textures.exists(key)) this.textures.remove(key);
      console.warn('Static garden cache unavailable; retaining vector background.', error);
    }
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
    if (SettingsManager.get().reducedMotion) return;
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
    for (const child of [...this.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active || !activeZones.some(zone => pointInRect(enemy.x, enemy.y, zone))) continue;
      const damage = enemy.isBoss ? 12 : 20;
      this.journey.record('terrainHit');
      this.stageStats.terrainHits++;
      enemy.takeDamage(damage);
      this.showDmgNum(enemy.x, enemy.y - 20, damage);
    }
    this.feedbackFlash(50, 160, 80, 255, true);
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
      if (this.chapter.hazardKind === 'sand' || this.chapter.hazardKind === 'tide') {
        if (this.chapter.hazards.some(zone => pointInRect(enemy.x, enemy.y, zone) && this.isHazardZoneActive(zone, this.combatTime))) {
          this.journey.record('terrainHit'); this.stageStats.terrainHits++;
        }
      }
      if (bullet.source === 'shadow') {
        const ex = enemy.x, ey = enemy.y;
        enemy.takeDamage(dmg);
        this.showDmgNum(ex, ey - 20, dmg);
        this.hitParticles(ex, ey, 0x6d9c85);
        return;
      }

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
      if (!killed && enemy.active && !SettingsManager.get().reducedMotion) {
        const scale = (enemy.getData('impactScale') as number | undefined) ?? enemy.scaleX;
        enemy.setData('impactScale', scale);
        this.tweens.killTweensOf(enemy);
        enemy.setScale(scale);
        this.tweens.add({ targets: enemy, scaleX: scale * 1.1, scaleY: scale * .92, duration: 55, yoyo: true });
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
        this.feedbackShake(80, 0.005);
      }
    } catch (err) { console.error('[onEnemyBulletHitHero]', err); }
  }

  private onEnemyBulletHitDefense(_coreObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    if (this.dead) return;
    const bullet = bulletObj as unknown as Projectile;
    if (bullet.source === 'rival') return;
    if (!bullet.active || bullet.damage <= 0) return;
    const damage = bullet.damage;
    bullet.recycle();
    this.damageDefense(damage);
  }

  private onEnemyTouchDefense(_coreObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    if ((enemyObj as Enemy).getData('shadowRival')) return;
    if (this.dead) return;
    const enemy = enemyObj as unknown as Enemy;
    if (!enemy.active) return;
    const nextHitAt = (enemy.getData('defenseHitAt') as number | undefined) ?? 0;
    if (this.combatTime < nextHitAt) return;
    enemy.setData('defenseHitAt', this.combatTime + 1100);
    this.damageDefense(enemy.dmg);
    enemy.knockback(this.defenseCore.x, this.defenseCore.y, 90);
  }

  private damageDefense(amount: number): void {
    if (this.dead || this.mode === 'shadow' || this.combatTime < this.defenseInvUntil) return;
    const damage = Math.max(1, Math.round(amount));
    this.defenseHp = Math.max(0, this.defenseHp - damage);
    this.defenseInvUntil = this.combatTime + 90;
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
        fontSize: '11px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#94612d',
        stroke: '#fff8e7', strokeThickness: 2,
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
    const text = (x: number, y: number, size = 14, color = '#3d5144') => this.add.text(x, y, '', {
      fontSize: `${size}px`, fontFamily: 'Microsoft YaHei, sans-serif', color,
    }).setScrollFactor(0).setDepth(102);
    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.barGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.enemyHpGfx = this.add.graphics().setDepth(50);
    this.shieldGfx = this.add.graphics().setDepth(12);
    this.hpText = text(30, 24, 14).setFontStyle('bold');
    this.skillNameText = text(30, 77, 12);
    this.waveText = text(512, 24, 17).setOrigin(.5, 0).setFontStyle('bold');
    this.chapterText = text(512, 52, 13).setOrigin(.5, 0);
    this.defenseText = text(512, 82, 12).setOrigin(.5);
    this.scoreText = text(986, 27, 16).setOrigin(1, 0).setFontStyle('bold');
    this.runTimerText = text(986, 56, 13).setOrigin(1, 0);
    this.shadowText = text(28, GAME_HEIGHT - 172, 13).setWordWrapWidth(274, true);
    this.objectiveText = text(28, GAME_HEIGHT - 136, 12).setWordWrapWidth(267, true).setLineSpacing(5);
    this.actionHint = text(575, GAME_HEIGHT - 92, 14, '#665237').setOrigin(.5, 1).setAlpha(0).setDepth(145)
      .setWordWrapWidth(454, true).setBackgroundColor('#fff6da').setPadding(12, 7);
    this.infoText = text(575, GAME_HEIGHT - 48, 14).setOrigin(.5).setAlign('center').setLineSpacing(7);
    this.comboText = text(30, 124, 20, '#98613b').setAlpha(0).setFontStyle('bold');
    this.waveProgressGfx = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.bossHudGfx = this.add.graphics().setScrollFactor(0).setDepth(106);
    this.bossNameText = text(512, 115, 13, '#913f50').setOrigin(.5).setDepth(107).setVisible(false);
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(110);
    this.offscreenGfx = this.add.graphics().setScrollFactor(0).setDepth(95);
    this.crosshairGfx = this.add.graphics().setScrollFactor(0).setDepth(120);
    this.defenseHudGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hazardGfx = this.add.graphics().setDepth(2);
    const pause = this.add.text(GAME_WIDTH - 18, 91, '暂停 / ESC', {
      fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '12px', color: '#536849',
      backgroundColor: '#f3ebd5', padding: { x: 8, y: 3 },
    }).setOrigin(1,.5).setScrollFactor(0).setDepth(104).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => this.togglePause());
  }

  private updateUI(time: number): void {
    this.drawCrosshair();
    this.drawEnemyHpBars();
    this.drawOffscreenIndicators();
    this.updateCombo(time);
    this.shieldGfx.clear();
    this.shieldGfx.fillStyle(0xfff8de, .72).fillEllipse(this.hero.x, this.hero.y + 15, 34, 12);
    if (this.hero.shieldStacks > 0) {
      this.shieldGfx.lineStyle(3, 0x719dba, .6).strokeCircle(this.hero.x, this.hero.y, 25);
    }
    if (time - this.lastHudUpdate < 90) return;
    this.lastHudUpdate = time;
    const g = this.hpGfx.clear();
    const panel = (x: number, y: number, w: number, h: number) => {
      g.fillStyle(0x6b7958, .1).fillRoundedRect(x, y + 3, w, h, 14);
      g.fillStyle(0xfffbef, .96).fillRoundedRect(x, y, w, h, 14);
      g.lineStyle(1, 0xc7cdb6, .9).strokeRoundedRect(x, y, w, h, 14);
    };
    panel(14, 12, 246, 96);
    panel(273, 12, 478, 96);
    panel(764, 12, 246, 96);
    panel(14, GAME_HEIGHT - 185, 294, 164);
    panel(320, GAME_HEIGHT - 84, 512, 64);
    const bar = (x: number, y: number, w: number, pct: number, color: number, h = 10) => {
      g.fillStyle(0xe3e5d6).fillRoundedRect(x, y, w, h, 5);
      if (pct > 0) g.fillStyle(color).fillRoundedRect(x, y, Math.max(5, w * Math.min(1, pct)), h, 5);
    };
    const hpPct = Math.max(0, this.hero.hp / this.hero.maxHp);
    bar(30, 52, 213, hpPct, hpPct > .3 ? 0x75a484 : 0xd48670, 14);
    this.hpText.setText(`小队体力  ${Math.ceil(this.hero.hp)} / ${this.hero.maxHp}`);
    const activeSkill = this.hero.getActiveSkill();
    const chargePct = Math.min(1, this.hero.charge / this.hero.getSkillChargeCost());
    const dash = this.hero.dashCooldownPct(time);
    this.skillNameText.setText(`轻跃 ${dash >= 1 ? '就绪' : `${((1-dash) * this.hero.dashCooldown / 1000).toFixed(1)}s`}   ·   灵感 ${Math.floor(chargePct * 100)}%`);
    const place = this.stage ? `旅途 ${this.stage.label}` : this.mode === 'shadow' ? `切磋 ${this.trialTier} 阶` : `漫游第 ${this.currentLevel} 站`;
    this.waveText.setText(`${place}   ·   ${this.waveMgr.wave} / ${this.waveMgr.totalWaves} ${this.mode === 'shadow' ? '轮' : '波'}   ·   余 ${this.waveMgr.aliveCount}`);
    this.chapterText.setText(`${this.stage?.name ?? this.chapter.name}  ·  ${this.currentWaveName}`);
    const ratio = Math.max(0, this.defenseHp / this.defenseMaxHp);
    bar(326, 74, 372, ratio, ratio > .3 ? 0xe3bd72 : 0xd48670, 19);
    this.defenseText.setText(this.mode === 'shadow' ? '友好切磋 · 营地不受伤害' : `暖灯营地  ${Math.ceil(this.defenseHp)} / ${this.defenseMaxHp}`);
    this.scoreText.setText(`${this.score.toLocaleString()} 分  ·  击退 ${this.kills}`);
    const total = Math.floor((this.elapsedBeforeChapterMs + this.activeRunMs) / 1000);
    this.runTimerText.setText(`${getOperative(this.operativeId).name}  ·  ${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`);
    const shadow = this.shadow.getStatus();
    this.shadowText.setText(this.mode === 'shadow' ? '与昨日的自己切磋 · 影伴观战中' : `影伴 · ${shadow.mode === 'guard' ? '留守营地' : '结伴出发'}   [E 切换]`);
    this.objectiveText.setText(this.stage
      ? [`☆ 完成 ${this.waveMgr.totalWaves} 波来客`, this.formatStageGoal(this.stage.objective), this.formatStageGoal(this.stage.bonusObjective)].join('\n')
      : this.mode === 'shadow' ? `看清蓄力线，再轻跃躲开\n三轮全胜，留下新的纪念\n${getShadowTrial(this.trialTier).lesson}`
      : this.journey.getObjectives().map(o => `${o.completed ? '✓' : '○'} ${o.title}  ${o.progress}/${o.target}`).join('\n'));
    const build = this.upgradeMgr.getBuildPath();
    this.infoText.setText(`${activeSkill?.name ?? '技能'}  ${chargePct >= 1 ? '[ SPACE · 可以施放 ]' : `灵感 ${Math.floor(chargePct*100)}%`}\n${build ? BUILD_INFO[build].name : '自由搭配'}  ·  SHIFT 轻跃  ·  E 影伴  ·  Q 换技能`);
    this.drawWaveProgress();
    this.drawMinimap();
    this.drawBossHud();
  }

  private showActionHint(label: string, immediate = false): void {
    if (!immediate && this.combatTime - this.lastActionHint < 700) return;
    this.lastActionHint = this.combatTime;
    this.actionHint.setText(label).setAlpha(1);
    this.tweens.killTweensOf(this.actionHint);
    this.tweens.add({ targets: this.actionHint, alpha: 0, delay: 1800, duration: 250 });
  }

  private drawWaveProgress(): void {
    const pg = this.waveProgressGfx;
    pg.clear();
    const pw = GAME_WIDTH - 20, ph = 4;
    const px = 10, py = GAME_HEIGHT - 6;
    pg.fillStyle(0xfffbef, 0.7);
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
    mg.fillStyle(0xfffbef, 0.85);
    mg.fillRoundedRect(mx - 2, my - 2, mw + 4, mh + 4, 4);
    mg.fillStyle(0xfffbef, 0.9);
    mg.fillRoundedRect(mx, my, mw, mh, 3);
    mg.lineStyle(1, 0xa8bba3, 0.5);
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
      eg.fillStyle(0xe3e5d6);
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
    const y = 130;
    const pct = Math.max(0, boss.hp / boss.maxHp);
    g.fillStyle(0x9a8665, 0.6);
    g.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 5);
    g.fillStyle(0xe6d4b7);
    g.fillRoundedRect(x, y, width, height, 3);
    g.fillStyle(0xc78164);
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
    g.lineStyle(2, pointer.isDown ? 0x9d6237 : 0x426655, 0.95);
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
        this.comboText.setText(`${this.comboCount} 次连击`);
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
    this.comboResetTime = this.combatTime + this.comboDuration;
    if (this.comboCount >= 3) {
      const bonus = this.comboCount * 2;
      this.score += bonus;
    }
  }

  /* ────────────────── Events ────────────────── */

  private bindEvents(): void {
    this.events.on('actionUnavailable', (ev: { label: string }) => this.showActionHint(ev.label, true));
    this.events.on('shadowDefeated', () => {
      this.journey.record('shadowDefeat');
      this.showActionHint('和昨日的自己击掌！镜像切磋完成');
    });
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

  private announce(msg: string, color: number, dur = 800, priority = 0): void {
    // Rapid skills share one notice. Encounter warnings remain readable until
    // their own duration ends, and never drift into the combo or battlefield.
    if (this.announcement?.active && priority < this.announcementPriority) return;
    if (this.announcement) {
      this.tweens.killTweensOf(this.announcement);
      this.announcement.destroy();
    }
    const text = this.add.text(0, 0, msg, {
      fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '18px', color: '#455343',
      wordWrap: { width: 620, useAdvancedWrap: true }, align: 'center', lineSpacing: 5,
    }).setOrigin(.5, 0);
    const paper = this.add.graphics().fillStyle(0xfffbef, .97)
      .fillRoundedRect(-text.width / 2 - 14, -9, text.width + 28, text.height + 18, 9)
      .lineStyle(1.5, color, .75)
      .strokeRoundedRect(-text.width / 2 - 14, -9, text.width + 28, text.height + 18, 9);
    const notice = this.add.container(GAME_WIDTH / 2, 166, [paper, text]).setScrollFactor(0).setDepth(150);
    this.announcement = notice;
    this.announcementPriority = priority;
    this.tweens.add({ targets: notice, alpha: 0, delay: Math.max(400, dur - 200), duration: 200, onComplete: () => {
      if (this.announcement === notice) { this.announcement = null; this.announcementPriority = -1; }
      notice.destroy();
    } });
  }

  private muzzleFlash(x: number, y: number): void {
    const flash = this.add.circle(x, y, 8, 0xfbbf24, 0.6).setDepth(12);
    this.tweens.add({ targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 70, onComplete: () => flash.destroy() });
  }

  private onEnemyFire(ev: { x: number; y: number; angle: number; speed: number; damage: number; source?: 'rival' }): void {
    try {
      if (this.dead) return;
      this.spawnBullet({ x: ev.x, y: ev.y, angle: ev.angle, speed: ev.speed, damage: ev.damage, owner: 'enemy', source: ev.source });
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
    this.announce(`锁定冲锋 · ${Math.round(ev.length)} 距离`, 0xef4444, Math.min(850, ev.duration), 2);
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
    this.feedbackShake(140, 0.008);
  }

  private onEnemySupportPulse(ev: { x: number; y: number; radius: number; amount: number }): void {
    let healed = 0;
    for (const child of [...this.enemies.getChildren()]) {
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
    this.journey.record('dash');
    this.stageStats.dashes++;
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
      this.journey.record('skill');
      this.stageStats.skills++;
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
          this.hero.barrageEndTime = this.combatTime + stats.duration;
          this.announce(`${skill.name}！`, skill.color, 1000);
          this.feedbackFlash(80, 255, 80, 80, true);
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

    this.feedbackShake(200, 0.015);
    this.feedbackFlash(100, 255, 200, 50, true);

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
    this.hero.timeRiftEndTime = this.combatTime + duration;
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

    this.feedbackFlash(80, 100, 100, 255, true);
    this.announce('慢悠悠茶会，开席！', color, 1000);

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
        for (const child of [...this.enemies.getChildren()]) {
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
      this.feedbackShake(80, 0.005);
      this.feedbackFlash(60, 255, 0, 0, true);
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
      fontSize: '14px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#60a5fa',
      fontStyle: 'bold', stroke: '#fff8e7', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: ev.y - 55, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  private onHeroDeath(): void {
    this.finishDefeat('先歇一小会儿');
  }

  private onDefenseDestroyed(): void {
    this.finishDefeat('暖灯需要休息了');
  }

  private finishDefeat(reason: string): void {
    if (this.dead) return;
    RunCheckpointManager.clear();
    this.dead = true;
    this.hitlagUntil = 0;
    this.physics.pause();
    this.snd.heroDeath();
    this.feedbackShake(400, 0.015);
    this.feedbackFlash(300, 255, 0, 0, true);
    const focusX = reason === '暖灯需要休息了' ? this.defenseCore.x : this.hero.x;
    const focusY = reason === '暖灯需要休息了' ? this.defenseCore.y : this.hero.y;
    this.deathParticles(focusX, focusY);
    this.tutorial.destroy();

    // Death message overlay
    const deathText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, reason, {
      fontSize: '48px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold',
      color: '#ef4444', stroke: '#fff8e7', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.tweens.add({ targets: deathText, alpha: 1, y: deathText.y - 15, duration: 600, ease: 'Quad.easeOut' });

    const subText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.48, `击退 ${this.kills}  |  分数 ${this.score}`, {
      fontSize: '18px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#65705c',
      stroke: '#fff8e7', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.tweens.add({ targets: subText, alpha: 1, duration: 800, delay: 400 });

    // Camera slow zoom
    if (!SettingsManager.get().reducedMotion) this.cameras.main.zoomTo(1.06, 900, 'Sine.easeIn');

    const build = this.upgradeMgr.getBuildPath();
    const durationSec = Math.round((this.elapsedBeforeChapterMs + this.activeRunMs) / 1000);
    const newHighScore = ScoreManager.isNewHighScore(this.score);
    const profile = this.runRecorder.finish(build, this.hero.maxHp);
    const reward = MetaProgressionManager.recordRun({
      recordOnly: true, mode: this.mode, stageId: this.stage?.id ?? (this.mode === 'shadow' ? 0 : undefined), operativeId: this.operativeId, completionId: this.completionId,
      startLevel: this.registry.get('runStartLevel') ?? this.currentLevel,
      wave: this.waveMgr.wave, level: this.currentLevel, kills: this.kills,
      durationSec, victory: false, endless: this.endless, build, profile,
    });
    const data = {
      score: this.score, kills: this.kills,
      wave: this.waveMgr.wave, level: this.currentLevel,
      endless: this.endless, durationSec, build, newHighScore, profile, reward,
      defeatReason: reason, operativeId: this.operativeId, shadowTrial: this.shadowTrial,
      mode: this.mode, stageId: this.stage?.id, trialTier: this.trialTier,
      stageResult: this.stage ? CampaignProgressionManager.recordStageResult(this.stage.id, {
        completionId: this.completionId, victory: false, operativeId: this.operativeId,
        durationSec, coreRatio: this.defenseHp / this.defenseMaxHp, ...this.stageStats,
      }) : null,
      startLevel: this.registry.get('runStartLevel') ?? this.currentLevel,
    };
    ScoreManager.saveScore({
      score: this.score, kills: this.kills,
      level: this.currentLevel, wave: this.waveMgr.wave,
      endless: this.endless, durationSec, build,
    });
    const sceneRef = this.scene;
    this.time.delayedCall(2200, () => {
      try { sceneRef.start('GameOverScene', data); } catch (_) { /* scene already destroyed */ }
    });
  }

  private slowMoFinish(victory: boolean): void {
    const cam = this.cameras.main;
    if (victory && !SettingsManager.get().reducedMotion) {
      cam.zoomTo(1.06, 1200, 'Sine.easeInOut');
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

  private onEnemyDeath(ev: { x: number; y: number; xp: number; score: number; color: number; isBoss: boolean; type?: string; shadowRival?: boolean }): void {
    try {
      if (this.dead) return;
      this.kills++;
      if (!ev.shadowRival && Math.hypot(ev.x - this.defenseCore.x, ev.y - this.defenseCore.y) >= 240) this.stageStats.intercepts++;
      if (!ev.shadowRival && Math.hypot(ev.x - this.defenseCore.x, ev.y - this.defenseCore.y) >= 240 && ['archer', 'medic', 'summoner', 'bomber'].includes(ev.type ?? '')) this.stageStats.priorityKills++;
      this.score += ev.score;
      this.hero.addCharge(this.hero.chargePerKill);
      this.addCombo();
      this.snd.kill();

      this.deathParticles(ev.x, ev.y, ev.color);

      if (ev.isBoss) {
        this.feedbackShake(200, 0.009);
        this.feedbackFlash(150, 255, 200, 0, true);
        this.hitlag(80);
      } else {
        this.throttledShake(50, 0.003);
        this.hitlag(35);
      }

      this.spawnXpGem(ev.x, ev.y, ev.xp);
    } catch (err) { console.error('[onEnemyDeath]', err); }
  }

  private onEnemySplit(ev: { x: number; y: number; type: string }): void {
    if (this.dead) return;
    const cfg = ENEMY_TYPES[ev.type];
    if (!cfg) return;
    const count = Math.min(2, Math.max(0, MAX_ACTIVE_ENEMIES - this.enemies.countActive(true)));
    this.waveEnemyTotal += count;
    for (let i = 0; i < count; i++) {
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
    if (this.dead || !Number.isFinite(ev.count)) return;
    const cfg = ENEMY_TYPES['slime'];
    if (!cfg) return;
    const count = Math.min(Math.max(0, Math.floor(ev.count)), Math.max(0, MAX_ACTIVE_ENEMIES - this.enemies.countActive(true)));
    this.waveEnemyTotal += count;
    for (let i = 0; i < count; i++) {
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

  private onWaveStart(ev: { wave: number; total: number; isBoss?: boolean; name: string; hint: string; lanes?: Array<{x: number;y: number;label: string}> }): void {
    this.waveEnemyTotal = this.waveMgr.aliveCount;
    this.currentWaveName = ev.name;
    this.waveStartedAt = this.activeRunMs;
    for (const lane of ev.lanes ?? this.chapter.spawnPoints) {
      const marker = this.add.circle(lane.x, lane.y, 26, 0xd49c58, .2).setStrokeStyle(3, 0x976237).setDepth(4);
      this.tweens.add({ targets: marker, radius: 48, alpha: 0, duration: 2000, onComplete: () => marker.destroy() });
    }
    if (this.mode === 'shadow') {
      const trial = getShadowTrial(this.trialTier);
      for (let i = 0; i < trial.rivals; i++) {
        const angle = -Math.PI / 2 + i * Math.PI;
        const rival = new ShadowRival(this, this.defenseCore.x + Math.cos(angle) * 250, this.defenseCore.y + Math.sin(angle) * 250,
          MetaProgressionManager.getState().lastProfile, this.trialTier,
          () => ({ x: this.hero.x, y: this.hero.y }), { tier: this.trialTier, round: ev.wave, offsetMs: i * 650 });
        this.enemies.add(rival); this.waveEnemyTotal++;
      }
    } else if (this.shadowTrial && ev.wave === Math.min(3, this.waveMgr.totalWaves) && !this.shadowTrialSpawned) {
      this.shadowTrialSpawned = true;
      const lane = this.chapter.spawnPoints[0];
      const rival = new ShadowRival(this, lane.x, lane.y,
        MetaProgressionManager.getState().lastProfile, this.chapter.id,
        () => ({ x: this.hero.x, y: this.hero.y }));
      this.enemies.add(rival);
      this.waveEnemyTotal++;
      this.showActionHint('镜像切磋开始：观察蓄力线，轻跃躲开昨日的自己');
    }
    if (ev.isBoss) {
      this.announce(`⚠ ${ev.name}\n${ev.hint}`, 0xef4444, 2400, 1);
      this.feedbackShake(300, 0.004);
      this.snd.bossAlert();
    } else {
      this.announce(`${ev.wave}/${ev.total} · ${ev.name}\n${ev.hint}`, 0xfbbf24, 1500, 1);
      this.snd.waveStart();
    }
  }

  private onWaveComplete(ev: { wave: number; total: number }): void {
    if (this.dead) return;
    for (const bullet of this.enemyBullets.getChildren() as Projectile[]) if (bullet.active) bullet.recycle();
    if (this.mode === 'shadow') this.hero.heal(Math.round(this.hero.maxHp * .25));
    if (this.mode === 'campaign' && !new URLSearchParams(window.location.search).has('renderqa') && new URLSearchParams(window.location.search).get('qa') !== '1') SessionMetricsManager.record({
      chapter: this.chapter.id, wave: ev.wave, activeMs: this.activeRunMs - this.waveStartedAt,
      operativeId: this.operativeId, shadowTrial: this.shadowTrial,
      coreRatio: this.defenseHp / this.defenseMaxHp,
    });
    this.journey.finishWave(this.defenseHp / this.defenseMaxHp);
    this.grantJourneyRewards();
    if (this.defenseHp > 0 && this.defenseHp < this.defenseMaxHp) {
      this.repairDefense(0.08);
    }
    if (ev.wave >= ev.total) {
      this.waveMgr.allWavesDone = true;
      this.onLevelComplete({ level: this.currentLevel });
      return;
    }
    this.showUpgradeUI('wave');
  }

  private onLevelComplete(ev: { level: number }): void {
    if (this.dead) return;
    if (this.mode !== 'endless') { this.finishFiniteRun(); return; }
    this.paused = true;
    this.physics.pause();
    this.hero.heal(this.hero.maxHp);
    const milestoneReward = MetaProgressionManager.recordModeProgress({ completionId: `${this.completionId}-floor`, mode: 'endless', operativeId: this.operativeId, wave: this.currentLevel * this.waveMgr.totalWaves });
    this.announce(`漫游第 ${ev.level} 站完成 · 下一站更热闹${milestoneReward.earned ? `\n新里程碑 · 暖晶 +${milestoneReward.earned}，已收进行囊` : ''}`, 0xb47b45, 2000, 3);
    this.time.delayedCall(1800, () => { if (!this.dead && this.sys.isActive()) this.showUpgradeUI('level'); });
  }

  private finishFiniteRun(): void {
    if (this.dead) return;
    this.dead = true;
    this.physics.pause();
    this.tutorial.destroy();
    RunCheckpointManager.clear();
    this.snd.victory();
    const build = this.upgradeMgr.getBuildPath();
    const durationSec = Math.max(1, Math.round(this.activeRunMs / 1000));
    const profile = this.runRecorder.finish(build, this.hero.maxHp);
    const stageResult = this.stage ? CampaignProgressionManager.recordStageResult(this.stage.id, {
      completionId: this.completionId, victory: true, operativeId: this.operativeId,
      durationSec, coreRatio: this.defenseHp / this.defenseMaxHp, hpRatio: this.hero.hp / this.hero.maxHp, ...this.stageStats,
    }) : null;
    const trialResult = this.mode === 'shadow' ? ShadowTrialManager.recordVictory(this.trialTier, durationSec) : null;
    const modeReward = this.mode === 'shadow' ? MetaProgressionManager.recordModeProgress({
      completionId: this.completionId, mode: 'shadow', tier: this.trialTier, operativeId: this.operativeId,
    }) : null;
    const runReward = MetaProgressionManager.recordRun({
      recordOnly: true, mode: this.mode, stageId: this.stage?.id ?? 0, completionId: this.completionId,
      operativeId: this.operativeId, startLevel: this.currentLevel,
      wave: this.waveMgr.totalWaves, level: this.currentLevel, kills: this.kills,
      durationSec, victory: true, endless: false, build, profile,
    });
    const earned = stageResult?.earned ?? modeReward?.earned ?? 0;
    const reward = { ...runReward, earned, total: MetaProgressionManager.getState().shadowCores, progressReward: 0, victoryReward: earned,
      masteryXp: modeReward?.masteryXp ?? stageResult?.masteryXp ?? 0, saved: modeReward?.saved ?? stageResult?.saved ?? true };
    const data = {
      mode: this.mode, stageId: this.stage?.id, trialTier: this.trialTier, stageResult, trialResult,
      score: this.score, kills: this.kills, wave: this.waveMgr.totalWaves, level: this.currentLevel,
      victory: true, endless: false, durationSec, build, newHighScore: ScoreManager.isNewHighScore(this.score),
      profile, reward, operativeId: this.operativeId, shadowTrial: this.shadowTrial, startLevel: this.currentLevel,
    };
    ScoreManager.saveScore({ score: this.score, kills: this.kills, level: this.currentLevel, wave: this.waveMgr.totalWaves, endless: false, durationSec, build });
    this.announce(this.stage ? `${this.stage.label} · ${this.stage.name}\n${'★'.repeat(stageResult?.stars ?? 1)}  这段风景收进日记啦` : '三轮切磋完成 · 和昨日的自己击掌', 0x598862, 1800, 3);
    this.slowMoFinish(true);
    this.time.delayedCall(1900, () => this.scene.start('GameOverScene', data));
  }

  private formatStageGoal(goal: { kind: string; target: number; label: string }): string {
    const key: Record<string, keyof typeof this.stageStats> = { dash: 'dashes', skill: 'skills', terrain: 'terrainHits', command: 'commands', intercept: 'intercepts', priority: 'priorityKills' };
    const value = goal.kind === 'core' ? this.defenseHp / this.defenseMaxHp
      : goal.kind === 'time' ? this.activeRunMs / 1000 : this.stageStats[key[goal.kind]] ?? 0;
    const complete = goal.kind === 'time' ? value <= goal.target : value >= goal.target;
    const progress = goal.kind === 'core' ? `${Math.round(value * 100)}%` : goal.kind === 'time' ? `${Math.floor(value)}s` : `${Math.min(goal.target, value)}/${goal.target}`;
    const short: Record<string, string> = { core: `营地保留 ${Math.round(goal.target * 100)}% 体力`, time: `${goal.target} 秒内完成`, dash: '轻跃转线', skill: '释放拿手技能', terrain: '借地形命中', command: '指挥影伴', intercept: '营地外围截击', priority: '外围截击后排 / 南瓜' };
    return `${complete ? '✦' : '☆'} ${short[goal.kind] ?? goal.label}  ${progress}`;
  }

  private spawnXpGem(x: number, y: number, xp: number): void {
    // Cap total gems on screen to prevent performance issues
    if (this.xpGems.getLength() > 60) {
      const oldest = this.xpGems.getFirstAlive() as Phaser.Physics.Arcade.Sprite | null;
      if (oldest) oldest.destroy();
    }

    const gem = this.physics.add.sprite(x, y, 'xp_gem');
    gem.setDepth(2); gem.setData('xp', xp);
    gem.setData('spawnTime', this.combatTime);
    (gem.body as Phaser.Physics.Arcade.Body).setCircle(5, 3, 3);
    this.xpGems.add(gem);

    gem.setScale(0);
    this.tweens.add({ targets: gem, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private magnetXpGems(): void {
    const now = this.combatTime;
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
      const now = this.combatTime;
      if (now - this.lastDmgNumTime < 60) return;
      this.lastDmgNumTime = now;
    }
    const rounded = Math.round(dmg);
    const isBig = rounded >= 50;
    const label = isCrit ? `${rounded}!` : `${rounded}`;
    const size = isCrit ? '24px' : isBig ? '18px' : (isHero ? '18px' : '14px');
    const color = isCrit ? '#94612d' : isBig ? '#ff9f43' : (isHero ? '#ff6b6b' : '#ffffff');
    const t = this.add.text(x + Phaser.Math.Between(-10, 10), y, label, {
      fontSize: size, fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold',
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

  private hitlag(_ms: number): void {
    // Keep movement responsive. Local squash and sparks provide impact feedback.
  }

  private throttledShake(dur: number, intensity: number): void {
    const now = this.combatTime;
    if (now - this.lastShakeTime < 100) return;
    this.lastShakeTime = now;
    this.feedbackShake(dur, intensity);
  }

  private feedbackShake(duration: number, intensity: number): void {
    if (!SettingsManager.get().reducedMotion) this.cameras.main.shake(Math.min(140, duration), Math.min(.004, intensity));
  }

  private feedbackFlash(_duration: number, _red: number, _green: number, _blue: number, _force = true): void {
    // Local sparks and readable hit numbers carry feedback without full-screen flashes.
  }

  private grantJourneyRewards(): void {
    const count = this.journey.claimRewards();
    if (!count) return;
    this.repairDefense(.05 * count);
    this.hero.addCharge(15 * count);
    this.showActionHint(`旅途印章 +${count}  ·  暖灯修复 ${5 * count}%  ·  灵感 +${15 * count}`);
    this.snd.upgrade();
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

    const choices = this.upgradeMgr.pickThree(pool, this.hero, this.defenseHp / this.defenseMaxHp);
    if (choices.length === 0) {
      // A complete build still has to consume opening drafts and carry its
      // run state into the next station, exactly like a selected upgrade.
      this.finishUpgrade(pool);
      return;
    }

    this.upgrading = true;
    this.input.keyboard?.resetKeys();
    this.physics.pause();
    this.time.paused = true;
    this.tweens.pauseAll();
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x647256, 0.65)
      .setScrollFactor(0).setDepth(300);
    this.upgradeUI.push(overlay);

    const buildPath = this.upgradeMgr.getBuildPath();
    const title = pool === 'level'
      ? (this.endless ? '无尽强化' : '旅途纪念品')
      : buildPath
        ? `${BUILD_INFO[buildPath].name} · 选择灵感`
        : '营地小憩 · 选一份灵感';
    const titleText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18, title, {
      fontSize: '24px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: '#35483e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.upgradeUI.push(titleText);

    const subtitle = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.18 + 32,
      buildPath
        ? `${BUILD_INFO[buildPath].promise} · ${this.upgradeMgr.isEvolved() ? '已绽放进阶' : `进化 ${Math.min(3, this.upgradeMgr.getPathUpgradeCount())}/3`}`
        : '本局后续升级将围绕所选流派出现',
      { fontSize: '12px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#68745f' },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.upgradeUI.push(subtitle);

    const cardW = 276, cardH = 196, gap = 18;
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
        fontSize: '16px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: '#35483e',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(nt);

      const keyText = this.add.text(cx - cardW / 2 + 12, cy - cardH / 2 + 10, `[${i + 1}]`, {
        fontSize: '11px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: '#68745f',
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(keyText);

      const rarityLabel = upg.rarity === 'epic' ? '稀有' : upg.rarity === 'rare' ? '精良' : '';
      if (rarityLabel) {
        const rarityColor = upg.rarity === 'epic' ? '#94612d' : '#818cf8';
        const rt = this.add.text(cx + cardW / 2 - 14, cy - cardH / 2 + 10, rarityLabel, {
          fontSize: '12px', fontFamily: 'Microsoft YaHei, sans-serif', color: rarityColor,
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(302);
        this.upgradeUI.push(rt);
      }

      if (upg.maxStacks > 1 && upg.maxStacks < 99) {
        const stack = this.upgradeMgr.getStacks(upg.id) + 1;
        const st = this.add.text(cx + cardW / 2 - 14, cy + cardH / 2 - 16, `${stack}/${upg.maxStacks}`, {
          fontSize: '11px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#68745f',
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(302);
        this.upgradeUI.push(st);
      }

      const dt = this.add.text(cx, cy + 6, upg.desc, {
        fontSize: '13px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#65705c',
        wordWrap: { width: cardW - 32, useAdvancedWrap: true }, align: 'center',
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
    g.fillStyle(hover ? 0xf0e6cb : 0xfffbef);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(1.5, hover ? catColor : 0xa8bba3, hover ? 0.8 : 0.5);
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
      this.showActionHint(`绽放进阶 · ${evolution.name}`, true);
      this.feedbackFlash(180, 255, 220, 100, true);
      this.feedbackShake(220, 0.006);
    } else {
      this.showActionHint(`行囊添新 · ${upg.name}`, true);
    }
    this.finishUpgrade(pool);
  }

  private showSkillPreview(upg: UpgradeDef, pool: 'wave' | 'level'): void {
    const skillId = upg.id === 'skill_barrage' ? 'barrage' : 'timerift';
    const skill = getSkill(skillId);
    if (!skill) { this.finishUpgrade(pool); return; }

    const previewUI: Phaser.GameObjects.GameObject[] = [];
    const previewTweens: Phaser.Tweens.Tween[] = [];

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x647256, 0.655)
      .setScrollFactor(0).setDepth(400);
    previewUI.push(overlay);

    const cardW = 360, cardH = 300;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(401);
    bg.fillStyle(0xfffbef, 0.95);
    bg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    bg.lineStyle(2, skill.color, 0.8);
    bg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    previewUI.push(bg);

    const hex = '#' + skill.color.toString(16).padStart(6, '0');
    const title = this.add.text(cx, cy - cardH / 2 + 30, `技能解锁: ${skill.name}`, {
      fontSize: '22px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: hex,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(title);

    const desc = this.add.text(cx, cy - cardH / 2 + 60, skill.desc, {
      fontSize: '14px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#65705c',
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
        fontSize: '11px', fontFamily: 'Microsoft YaHei, sans-serif', color: i === 0 ? '#35483e' : '#68745f',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
      previewUI.push(lvlText);
    }
    const growthText = this.add.text(cx, levelsY + displayLevels * 20 + 4, `∞ ${skill.growthDesc}`, {
      fontSize: '11px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#94612d',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(402);
    previewUI.push(growthText);

    const hint = this.add.text(cx, cy + cardH / 2 - 65, '充能满后按 [ SPACE ] 释放  |  [ Q ] 切换技能', {
      fontSize: '11px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#60a5fa',
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
      fontSize: '16px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: '#fff',
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
      this.showActionHint(`学会本领 · ${skill.name}`, true);
      this.finishUpgrade(pool);
    };

    btnHit.on('pointerdown', dismiss);
    overlay.setInteractive().on('pointerdown', dismiss);
  }

  private finishUpgrade(pool: 'wave' | 'level'): void {
    this.input.keyboard?.resetKeys();
    this.time.paused = false;
    this.tweens.resumeAll();
    this.upgrading = false;
    this.hitlagUntil = 0;
    if (this.waveMgr.wave === 0 && this.openingDrafts > 0) {
      this.openingDrafts--;
      if (this.openingDrafts > 0) this.showUpgradeUI('wave');
      else { this.physics.resume(); this.waveMgr.startNextWave(); }
      return;
    }

    if (pool === 'level') {
      // Keep the cleared battlefield frozen until the next scene owns control.
      // Otherwise surviving projectiles (or developer fast-forward enemies) can
      // kill the player during the chapter-transition delay.
      this.paused = true;
      this.physics.pause();
      this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
      const nextLvl = normalizeRunLevel(this.currentLevel + 1, true);
      const sc = this.score;
      const kills = this.kills;
      const endless = this.endless;
      const operativeId = this.operativeId;
      const elapsedMs = this.elapsedBeforeChapterMs + this.activeRunMs;
      const sceneRef = this.scene;
      this.time.delayedCall(450, () => {
        try { sceneRef.start('ArenaScene', { level: nextLvl, score: sc, kills, endless, operativeId, elapsedMs, mode: 'endless', freshRun: false }); } catch (_) { /* noop */ }
      });
    } else {
      this.physics.resume();
      this.waveMgr.scheduleNextWave(this.combatTime);
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
    if (this.paused && this.pauseUI.length === 0) return;
    this.input.keyboard?.resetKeys();
    this.paused = !this.paused;
    if (!this.paused) {
      this.clearPauseUI();
      this.time.paused = false;
      this.tweens.resumeAll();
      this.physics.resume();
      return;
    }

    this.physics.pause();
    this.time.paused = true;
    this.tweens.pauseAll();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x647256, 0.65)
      .setScrollFactor(0).setDepth(500);
    const panel = this.add.graphics().setScrollFactor(0).setDepth(501);
    panel.fillStyle(0xfffbef, 0.98);
    panel.fillRoundedRect(cx - 250, cy - 145, 500, 290, 16);
    panel.lineStyle(1.5, 0x729679, 0.65);
    panel.strokeRoundedRect(cx - 250, cy - 145, 500, 290, 16);
    const title = this.add.text(cx, cy - 66, '喝口茶，歇一歇', {
      fontSize: '28px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: '#35483e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(502);
    const build = this.upgradeMgr.getBuildPath();
    const status = this.add.text(cx, cy - 18, `${this.chapter.name}  ·  ${this.waveMgr.wave}/${this.waveMgr.totalWaves} 波  ·  ${build ? BUILD_INFO[build].name : '基础武装'}`, {
      fontSize: '13px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#65705c',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(502);
    const hint = this.add.text(cx, cy + 34, 'ESC 继续  ·  M 回营地（本小关从出发点续玩）', {
      fontSize: '14px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#94612d',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(502);
    const resume = this.add.rectangle(cx, cy + 78, 170, 38, 0x527d65)
      .setScrollFactor(0).setDepth(502).setInteractive({ useHandCursor: true });
    const resumeText = this.add.text(cx, cy + 78, '继续同行', {
      fontSize: '15px', fontFamily: 'Microsoft YaHei, sans-serif', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(503);
    resume.on('pointerdown', () => this.togglePause());
    const settings = this.add.text(cx, cy + 117, '旅途设置 · 音量 / 自动开火 / 减少动态效果', {
      fontSize: '12px', fontFamily: 'Microsoft YaHei, sans-serif', color: '#526c46',
    }).setOrigin(.5).setScrollFactor(0).setDepth(503).setInteractive({ useHandCursor: true });
    settings.on('pointerdown', () => openSettings(this));
    this.pauseUI.push(overlay, panel, title, status, hint, resume, resumeText, settings);

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
    this.updateUI(this.combatTime);
    if (!this.paused && !this.upgrading && !this.tutorial.isActive) this.updateBgParticles(this.combatTime);
    this.updateMapHazards(this.combatTime);

    if (this.dead || this.upgrading || this.paused) return;

    // Game logic — only when alive, not upgrading, and not in tutorial
    if (!this.tutorial.isActive) {
      if (this.openingDrafts > 0 && this.waveMgr.wave === 0) { this.showUpgradeUI('wave'); return; }
      _delta = Math.min(50, Math.max(0, _delta));
      this.activeRunMs += _delta;
      this.combatTime += _delta;
      this.data.set('battleTime', this.combatTime);
      time = this.combatTime;
      const slowZone = this.chapter.hazards.some(zone => pointInRect(this.hero.x, this.hero.y, zone) && this.isHazardZoneActive(zone, time));
      this.hero.terrainSpeedMult = slowZone ? this.chapter.hazardKind === 'sand' ? .76 : this.chapter.hazardKind === 'tide' ? .72 : 1 : 1;
      this.hero.tick(time, _delta);
      const heroBody = this.hero.body as Phaser.Physics.Arcade.Body;
      const pointer = this.input.activePointer;
      this.runRecorder.recordFrame(
        _delta,
        heroBody.velocity.length() > 20,
        (pointer.isDown && !pointer.rightButtonDown()) || SettingsManager.get().autoFire,
      );
      this.shadow.update(time, _delta, this.hero, this.enemies.getChildren() as Enemy[]);
      this.updateEnemies(time, _delta);
      if (this.dead) return;
      this.grantJourneyRewards();
      this.applyPulseDamage(time);
      if (this.dead) return;
      this.updateBullets(time);
      this.magnetXpGems();
      this.waveMgr.update(time, _delta);

      if (this.hero.isInvincible && !this.hero.isDashing) {
        this.hero.setAlpha(SettingsManager.get().reducedMotion ? .65 : Math.sin(time * 0.012) * .2 + .8);
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
      if (!e.active || !e.body) return;
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
