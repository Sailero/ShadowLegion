import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, ARENA_WIDTH, ARENA_HEIGHT,
  HERO_CFG, ENEMY_TYPES, WAVE_CFG,
} from '../config/gameConfig';
import { SKILLS, getSkill, getSkillStatsForLevel } from '../data/skills';
import { WAVE_UPGRADES, LEVEL_UPGRADES, EVOLUTION_INFO } from '../data/upgrades';
import { LEVEL_WAVES } from '../data/enemies';
import { CHAPTERS, pointInRect } from '../data/chapters';
import { OPERATIVES } from '../data/operatives';
import { BOSS_CHARGE_PROFILE } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import {
  calculateRunReward, createDefaultMetaState, WORKSHOP_MAX_RANK, workshopUpgradeCost,
} from '../systems/MetaProgressionManager';
import { RunRecorder } from '../systems/RunRecorder';
import { UpgradeManager } from '../systems/UpgradeManager';
import type { Hero } from '../entities/Hero';

interface Result { name: string; ok: boolean; msg?: string }

function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

export function runDataTests(): Result[] {
  const R: Result[] = [];
  const t = (name: string, fn: () => void) => {
    try { fn(); R.push({ name, ok: true }); }
    catch (e: unknown) { R.push({ name, ok: false, msg: (e as Error).message }); }
  };

  t('Dimensions valid', () => {
    assert(GAME_WIDTH > 0 && GAME_HEIGHT > 0, 'GAME dims');
    assert(ARENA_WIDTH >= GAME_WIDTH && ARENA_HEIGHT >= GAME_HEIGHT, 'ARENA >= GAME');
  });

  t('Hero config', () => {
    for (const k of ['maxHp','speed','fireRate','bulletSpeed','bulletDamage','dashSpeed','dashDuration','dashCooldown','chargeMax','chargePerKill','bodyRadius'] as const) {
      assert((HERO_CFG as Record<string, number>)[k] > 0, `${k} must > 0`);
    }
  });

  t('Enemy types', () => {
    for (const [k, c] of Object.entries(ENEMY_TYPES)) {
      assert(c.key === k && c.hp > 0 && c.speed > 0 && c.damage > 0 && c.bodyRadius > 0, `${k} invalid`);
    }
  });

  t('Wave definitions', () => {
    assert(LEVEL_WAVES.length === WAVE_CFG.levels, `levels count`);
    for (let l = 0; l < LEVEL_WAVES.length; l++) {
      assert(LEVEL_WAVES[l].length === WAVE_CFG.perLevel, `L${l + 1} waves count`);
      for (const w of LEVEL_WAVES[l]) {
        for (const s of w.spawns) assert(ENEMY_TYPES[s.type] !== undefined, `unknown type ${s.type}`);
        if (w.isBoss) assert(w.bossType !== undefined && ENEMY_TYPES[w.bossType!] !== undefined, 'boss type');
      }
    }
  });

  t('Skills valid', () => {
    for (const s of SKILLS) {
      assert(s.levels.length > 0 && s.maxLevel >= s.levels.length, `${s.id} levels`);
      assert(s.chargeCost > 0, `${s.id} cost`);
      for (let i = 0; i < s.levels.length; i++) {
        assert(s.levels[i].damage >= 0 && s.levels[i].radius >= 0, `${s.id} L${i + 1}`);
      }
    }
  });

  t('Skill level bounds (level 0 safety)', () => {
    for (const s of SKILLS) {
      assert(getSkillStatsForLevel(s.id, 0) !== null, `${s.id} level 0 should resolve`);
      assert(getSkillStatsForLevel(s.id, s.maxLevel + 10) !== null, `${s.id} overflow should clamp`);
    }
  });

  t('New enemy types exist', () => {
    assert(ENEMY_TYPES['ninja'] !== undefined, 'ninja type missing');
    assert(ENEMY_TYPES['summoner'] !== undefined, 'summoner type missing');
    assert(ENEMY_TYPES['ninja'].speed > 100, 'ninja should be fast');
    assert(ENEMY_TYPES['summoner'].ranged === true, 'summoner should be ranged');
  });

  t('Upgrades no duplicates', () => {
    const ids = [...WAVE_UPGRADES, ...LEVEL_UPGRADES].map(u => u.id);
    assert(new Set(ids).size === ids.length, 'duplicate IDs');
  });

  t('Upgrades valid', () => {
    for (const u of [...WAVE_UPGRADES, ...LEVEL_UPGRADES]) {
      assert(u.maxStacks > 0, `${u.id} maxStacks`);
    }
  });

  t('Four operative specialties exist', () => {
    assert(OPERATIVES.length === 4, 'must have four operatives');
    assert(new Set(OPERATIVES.map(item => item.id)).size === 4, 'duplicate operative id');
    assert(Object.keys(EVOLUTION_INFO).length === 4, 'must have four evolutions');
    for (const operative of OPERATIVES) {
      assert(Boolean(getSkill(operative.signatureSkill)), `${operative.id} signature skill missing`);
    }
  });

  t('Upgrade categories valid', () => {
    const validCats = ['attack','defense','mobility','special','skill'];
    for (const u of [...WAVE_UPGRADES, ...LEVEL_UPGRADES]) {
      assert(validCats.includes(u.category), `${u.id} has invalid category ${u.category}`);
    }
  });

  t('Waves reference valid enemy types', () => {
    for (let l = 0; l < LEVEL_WAVES.length; l++) {
      for (const w of LEVEL_WAVES[l]) {
        for (const s of w.spawns) {
          assert(ENEMY_TYPES[s.type] !== undefined, `L${l+1} references unknown type: ${s.type}`);
        }
      }
    }
  });

  t('Campaign gradually introduces all enemy roles', () => {
    const campaignTypes = new Set<string>();
    for (const level of LEVEL_WAVES) {
      for (const w of level) {
        for (const s of w.spawns) campaignTypes.add(s.type);
        if (w.bossType) campaignTypes.add(w.bossType);
      }
    }
    for (const type of Object.keys(ENEMY_TYPES)) assert(campaignTypes.has(type), `campaign missing ${type}`);
    assert(!LEVEL_WAVES[0].some(w => w.spawns.some(s => s.type === 'medic')), 'medic should not appear in chapter 1');
  });

  t('Chapter maps have distinct lanes, cover and mechanics', () => {
    assert(CHAPTERS.length === WAVE_CFG.levels, 'chapter/config count mismatch');
    assert(new Set(CHAPTERS.map(chapter => chapter.hazardKind)).size === 4, 'chapter hazards should be distinct');
    for (const chapter of CHAPTERS) {
      assert(chapter.spawnPoints.length >= 2, `chapter ${chapter.id} needs lanes`);
      assert(chapter.obstacles.length >= 4, `chapter ${chapter.id} needs cover`);
      assert(chapter.coreHp > 0, `chapter ${chapter.id} core hp`);
    }
    assert(pointInRect(CHAPTERS[1].hazards[0].x, CHAPTERS[1].hazards[0].y, CHAPTERS[1].hazards[0]), 'hazard containment');
  });

  t('Boss telegraph matches charge profile', () => {
    const length = BOSS_CHARGE_PROFILE.baseSpeed * BOSS_CHARGE_PROFILE.durationMs / 1000;
    assert(length >= 200 && length <= 400, `charge length ${length}`);
    assert(BOSS_CHARGE_PROFILE.windupMs >= 800, 'boss warning too short');
    assert(BOSS_CHARGE_PROFILE.width >= 60, 'boss corridor too narrow');
  });

  t('Balance: kills to charge', () => {
    const n = Math.ceil(100 / HERO_CFG.chargePerKill);
    assert(n <= 15, `Need ${n} kills to charge, too many`);
  });

  t('Balance: hero survives 3+ hits', () => {
    const maxDmg = Math.max(...Object.values(ENEMY_TYPES).map(e => e.damage));
    assert(Math.floor(HERO_CFG.maxHp / maxDmg) >= 3, 'dies too fast');
  });

  t('Balance: burst radius effective', () => {
    const r = getSkill('burst')!.levels[0].radius;
    assert(r >= 100, `Burst Lv1 radius ${r} too small`);
  });

  t('Meta progression defaults valid', () => {
    const meta = createDefaultMetaState();
    assert(meta.shadowCores === 0 && meta.totalRuns === 0, 'meta counters');
    assert(Object.values(meta.modules).every(rank => rank === 0), 'module defaults');
    assert(meta.clearedBuilds.length === 0, 'build clears');
    assert(meta.highestChapterUnlocked === 1, 'chapter default');
    assert(meta.unlockedOperatives.length === 1 && meta.unlockedOperatives[0] === 'ranger', 'operative default');
    assert(meta.unlockedSkills.includes('burst'), 'burst should start unlocked');
  });

  t('Workshop costs rise and cap', () => {
    assert(workshopUpgradeCost(0) === 2, 'rank 0 cost');
    assert(workshopUpgradeCost(4) === 6, 'rank 4 cost');
    assert(workshopUpgradeCost(WORKSHOP_MAX_RANK) === 0, 'max rank cost');
  });

  t('Run rewards favor progress and first clears', () => {
    const loss = calculateRunReward({ wave: 3, level: 1, victory: false, endless: false }, false);
    const win = calculateRunReward({ wave: 5, level: 4, victory: true, endless: false }, true);
    assert(loss.earned === 1, `wave 3 loss reward=${loss.earned}`);
    assert(win.earned === 13 && win.newBuildClear, `first clear reward=${win.earned}`);
  });

  t('Run recorder creates bounded Shadow profile', () => {
    const recorder = new RunRecorder();
    for (let i = 0; i < 100; i++) recorder.recordFrame(50, i % 5 !== 0, i % 3 !== 0);
    recorder.recordShot(40);
    recorder.recordDash();
    recorder.recordSkill();
    recorder.recordDamage(20);
    const profile = recorder.finish('nova', 120);
    for (const value of [profile.mobility, profile.firepower, profile.reflex, profile.technique]) {
      assert(value >= 0 && value <= 100, `profile metric ${value}`);
    }
    assert(profile.build === 'nova' && profile.shots === 40, 'profile snapshot');
  });

  t('Three matching path upgrades trigger one evolution', () => {
    const hero = {
      unlockedSkills: ['burst'],
      activeSkillId: 'burst',
      explosiveShot: 0,
      critChance: 0,
      damageMult: 1,
      dashCooldown: 1000,
      skillLevels: { burst: 1 },
    } as unknown as Hero;
    const manager = new UpgradeManager();
    manager.initializeOperative(hero, 'ranger');
    for (const id of ['crit', 'explosive', 'skill_burst_up']) {
      const upgrade = WAVE_UPGRADES.find(item => item.id === id);
      assert(Boolean(upgrade), `upgrade ${id} missing`);
      manager.apply(hero, upgrade!);
    }
    assert(manager.isEvolved(), 'nova should evolve after three path upgrades');
    assert(manager.getPathUpgradeCount() === 3, 'path upgrade count should be 3');
    assert(manager.consumeEvolution() === 'nova', 'nova evolution feedback missing');
    assert(hero.explosiveShot >= 3, 'ranger evolution should strengthen explosions');
  });

  return R;
}

export function runSceneTests(scene: Phaser.Scene): Result[] {
  const R: Result[] = [];
  const t = (name: string, fn: () => void) => {
    const hero = (scene as Phaser.Scene & { hero?: Hero }).hero;
    const snapshot = hero ? {
      hp: hero.hp, maxHp: hero.maxHp, invUntil: hero.invUntil,
      shieldStacks: hero.shieldStacks, dodgeChance: hero.dodgeChance, charge: hero.charge,
    } : null;
    try { fn(); R.push({ name, ok: true }); }
    catch (e: unknown) { R.push({ name, ok: false, msg: (e as Error).message }); }
    finally {
      // Developer checks must not refill, consume or leave altered run resources,
      // even when an assertion throws before a test's own cleanup executes.
      if (hero && snapshot) Object.assign(hero, snapshot);
    }
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = scene as any;

  t('Scene is active', () => {
    assert(scene.sys.isActive(), 'scene not active');
  });

  t('Physics world running', () => {
    const w = scene.physics.world;
    assert(w.isPaused === Boolean(s.tutorial?.isActive), `physics/tutorial mismatch: paused=${w.isPaused}`);
    assert(w.timeScale <= 1, `timeScale=${w.timeScale}, expected <= 1`);
  });

  t('Camera configured', () => {
    const cam = scene.cameras.main;
    assert(cam.getBounds().width === ARENA_WIDTH, 'cam bounds width');
    assert(cam.getBounds().height === ARENA_HEIGHT, 'cam bounds height');
  });

  t('Hero exists and alive', () => {
    assert(s.hero !== undefined, 'hero undefined');
    assert(s.hero.active, 'hero not active');
    assert(s.hero.hp > 0, `hero hp = ${s.hero.hp}`);
  });

  t('Groups exist', () => {
    for (const k of ['enemies', 'playerBullets', 'enemyBullets', 'xpGems']) {
      assert(s[k] !== undefined, `${k} undefined`);
    }
  });

  t('WaveManager initialized', () => {
    assert(s.waveMgr !== undefined, 'waveMgr undefined');
    assert(s.waveMgr.wave >= 0, `wave = ${s.waveMgr.wave}`);
  });

  t('SoundManager initialized', () => {
    assert(s.snd !== undefined, 'snd undefined');
  });

  t('Tutorial initialized', () => {
    assert(s.tutorial !== undefined, 'tutorial undefined');
  });

  t('Run recorder initialized', () => {
    assert(s.runRecorder !== undefined, 'runRecorder undefined');
  });

  t('Workshop scene registered', () => {
    assert(scene.scene.manager.keys.WorkshopScene !== undefined, 'WorkshopScene missing');
  });

  t('Loadout scene registered', () => {
    assert(scene.scene.manager.keys.LoadoutScene !== undefined, 'LoadoutScene missing');
  });

  t('Dead flag is false', () => {
    assert(s.dead === false, 'dead is true');
  });

  t('Upgrading flag is false', () => {
    assert(s.upgrading === false, 'upgrading is true');
  });

  t('hitlagUntil is 0', () => {
    assert(s.hitlagUntil === 0, `hitlagUntil = ${s.hitlagUntil}`);
  });

  t('hitlag has no side effects', () => {
    assert(s.physics.world.timeScale === 1, `timeScale = ${s.physics.world.timeScale}`);
  });

  t('Hero has stackable upgrade properties', () => {
    assert(typeof s.hero.critChance === 'number', 'critChance missing');
    assert(typeof s.hero.lifesteal === 'number', 'lifesteal should be number');
    assert(typeof s.hero.explosiveShot === 'number', 'explosiveShot should be number');
    assert(typeof s.hero.frostShot === 'number', 'frostShot should be number');
    assert(typeof s.hero.berserk === 'number', 'berserk should be number');
    assert(typeof s.hero.thorns === 'number', 'thorns missing');
    assert(typeof s.hero.dodgeChance === 'number', 'dodgeChance missing');
    assert(typeof s.hero.overcharge === 'number', 'overcharge should be number');
    assert(typeof s.hero.regenPerSec === 'number', 'regenPerSec missing');
    assert(typeof s.hero.shieldStacks === 'number', 'shieldStacks missing');
    assert(typeof s.hero.ricochetShot === 'number', 'ricochetShot should be number');
    assert(typeof s.hero.comboDmg === 'number', 'comboDmg should be number');
    assert(typeof s.hero.afterimage === 'number', 'afterimage should be number');
    assert(typeof s.hero.dashDamageMult === 'number', 'dashDamageMult missing');
    assert(typeof s.hero.pierceRetain === 'number', 'pierceRetain missing');
  });

  // ── HP Module Tests ──
  t('[HP] takeDamage reduces HP', () => {
    const origHp = s.hero.hp;
    const origInvUntil = s.hero.invUntil;
    const origShields = s.hero.shieldStacks;
    const origDodge = s.hero.dodgeChance;
    s.hero.invUntil = 0; // clear invincibility
    s.hero.shieldStacks = 0;
    s.hero.dodgeChance = 0;
    const took = s.hero.takeDamage(10);
    assert(took === true, 'takeDamage should return true');
    assert(s.hero.hp === origHp - 10, `hp: expected ${origHp - 10}, got ${s.hero.hp}`);
    s.hero.hp = origHp;
    s.hero.invUntil = origInvUntil;
    s.hero.shieldStacks = origShields;
    s.hero.dodgeChance = origDodge;
  });

  t('[HP] invincible blocks damage', () => {
    const origHp = s.hero.hp;
    s.hero.invUntil = Date.now() + 99999;
    const took = s.hero.takeDamage(10);
    assert(took === false, 'should be blocked by invincibility');
    assert(s.hero.hp === origHp, 'hp should not change');
    s.hero.invUntil = 0;
  });

  t('[HP] heal works and is integer', () => {
    const origHp = s.hero.hp;
    s.hero.hp = 50;
    s.hero.heal(20.7);
    assert(Number.isInteger(s.hero.hp), `heal result should be integer, got ${s.hero.hp}`);
    assert(s.hero.hp === 71, `expected 71, got ${s.hero.hp}`);
    s.hero.hp = origHp;
  });

  t('[HP] heal caps at maxHp', () => {
    s.hero.hp = s.hero.maxHp - 5;
    s.hero.heal(100);
    assert(s.hero.hp === s.hero.maxHp, `heal should cap at maxHp`);
  });

  // ── Charge/Energy Module Tests ──
  t('[Energy] addCharge works', () => {
    const origCharge = s.hero.charge;
    s.hero.charge = 0;
    s.hero.addCharge(10);
    assert(s.hero.charge === 10, `expected 10, got ${s.hero.charge}`);
    s.hero.charge = origCharge;
  });

  t('[Energy] addCharge caps at chargeMax', () => {
    s.hero.charge = 0;
    s.hero.addCharge(9999);
    const max = s.hero.overcharge > 0 ? Math.round(s.hero.chargeMax * (1 + s.hero.overcharge * 0.2)) : s.hero.chargeMax;
    assert(s.hero.charge === max, `expected ${max}, got ${s.hero.charge}`);
    s.hero.charge = 0;
  });

  // ── Skill Module Tests ──
  t('[Skill] activeSkill is valid', () => {
    const sk = s.hero.getActiveSkill();
    assert(sk !== null && sk !== undefined, 'activeSkill should exist');
    assert(typeof sk.id === 'string', 'skill should have id');
    assert(sk.levels.length > 0, 'skill should have levels');
  });

  t('[Skill] skill level within bounds', () => {
    for (const sid of ['burst', 'barrage', 'timerift', 'sentry']) {
      const lvl = s.hero.getSkillLevel(sid);
      assert(typeof lvl === 'number' && lvl >= 0, `${sid} level invalid: ${lvl}`);
    }
  });

  // ── Projectile Module Tests ──
  t('[Projectile] HOMING_RANGE is reasonable', () => {
    assert(Projectile.HOMING_RANGE <= 150, `HOMING_RANGE=${Projectile.HOMING_RANGE}, should be <= 150`);
    assert(Projectile.HOMING_RANGE >= 50, `HOMING_RANGE=${Projectile.HOMING_RANGE}, should be >= 50`);
  });

  // ── Attribute/Property Module Tests ──
  t('[Attr] hero initial properties are integers', () => {
    assert(Number.isInteger(s.hero.hp), `hp not integer: ${s.hero.hp}`);
    assert(Number.isInteger(s.hero.maxHp), `maxHp not integer: ${s.hero.maxHp}`);
  });

  t('[Attr] upgrade properties have correct types', () => {
    assert(s.hero.critChance >= 0 && s.hero.critChance <= 1, `critChance out of range: ${s.hero.critChance}`);
    assert(s.hero.dodgeChance >= 0 && s.hero.dodgeChance <= 1, `dodgeChance out of range: ${s.hero.dodgeChance}`);
    assert(s.hero.thorns >= 0, `thorns negative: ${s.hero.thorns}`);
  });

  // ── UI Module Tests ──
  t('[UI] text elements exist', () => {
    assert(s.hpText !== undefined, 'hpText missing');
    assert(s.waveText !== undefined, 'waveText missing');
    assert(s.scoreText !== undefined, 'scoreText missing');
    assert(s.infoText !== undefined, 'infoText missing');
    assert(s.comboText !== undefined, 'comboText missing');
  });

  // ── Collision Module Tests ──
  t('[Collision] handlers registered', () => {
    const count = scene.physics.world.colliders.getActive().length;
    assert(count >= 4, `expected at least 4 colliders, got ${count}`);
  });

  // ── Enemy Module Tests ──
  t('[Enemy] group exists and has physics', () => {
    assert(s.enemies !== undefined, 'enemies group missing');
    assert(typeof s.enemies.getChildren === 'function', 'enemies should be a group');
  });

  return R;
}

export function printResults(label: string, results: Result[]): void {
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log(`%c═══ ${label}: ${passed}/${results.length} passed ═══`,
    failed > 0 ? 'color: #ef4444; font-weight: bold' : 'color: #22c55e; font-weight: bold');
  for (const r of results) {
    if (r.ok) {
      console.log(`  %c✓ ${r.name}`, 'color: #22c55e');
    } else {
      console.log(`  %c✗ ${r.name}: ${r.msg}`, 'color: #ef4444; font-weight: bold');
    }
  }
}
