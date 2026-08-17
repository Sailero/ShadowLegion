import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, ARENA_WIDTH, ARENA_HEIGHT,
  HERO_CFG, ENEMY_TYPES, WAVE_CFG,
} from '../config/gameConfig';
import { SKILLS, getSkill } from '../data/skills';
import { WAVE_UPGRADES, LEVEL_UPGRADES } from '../data/upgrades';
import { LEVEL_WAVES } from '../data/enemies';
import { Projectile } from '../entities/Projectile';

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
      assert(s.levels.length === s.maxLevel, `${s.id} levels`);
      assert(s.chargeCost > 0, `${s.id} cost`);
      for (let i = 0; i < s.levels.length; i++) {
        assert(s.levels[i].damage >= 0 && s.levels[i].radius >= 0, `${s.id} L${i + 1}`);
      }
    }
  });

  t('Skill level bounds (level 0 safety)', () => {
    for (const s of SKILLS) {
      const lvl0 = Math.max(0, Math.min(0, s.maxLevel) - 1);
      assert(lvl0 >= 0, `${s.id} level 0 index should clamp to 0, got ${lvl0}`);
      assert(s.levels[lvl0] !== undefined, `${s.id} levels[${lvl0}] undefined`);
      const lvlOver = Math.max(0, Math.min(s.maxLevel + 1, s.maxLevel) - 1);
      assert(s.levels[lvlOver] !== undefined, `${s.id} levels[${lvlOver}] undefined`);
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

  t('New upgrades exist', () => {
    const allIds = [...WAVE_UPGRADES, ...LEVEL_UPGRADES].map(u => u.id);
    const newIds = ['lifesteal','crit','explosive','ricochet','frost_shot','berserk',
                    'thorns','second_wind','dodge','afterimage','dash_reset',
                    'xp_magnet_burst','combo_dmg','overcharge','perm_crit','perm_regen'];
    for (const id of newIds) {
      assert(allIds.includes(id), `upgrade ${id} missing`);
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

  t('Level 3 has new enemy types', () => {
    const l3Types = new Set<string>();
    for (const w of LEVEL_WAVES[2]) {
      for (const s of w.spawns) l3Types.add(s.type);
    }
    assert(l3Types.has('ninja'), 'Level 3 missing ninja');
    assert(l3Types.has('summoner'), 'Level 3 missing summoner');
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

  return R;
}

export function runSceneTests(scene: Phaser.Scene): Result[] {
  const R: Result[] = [];
  const t = (name: string, fn: () => void) => {
    try { fn(); R.push({ name, ok: true }); }
    catch (e: unknown) { R.push({ name, ok: false, msg: (e as Error).message }); }
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = scene as any;

  t('Scene is active', () => {
    assert(scene.sys.isActive(), 'scene not active');
  });

  t('Physics world running', () => {
    const w = scene.physics.world;
    assert(!w.isPaused, 'physics paused');
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

  t('Hero has new upgrade properties', () => {
    assert(typeof s.hero.critChance === 'number', 'critChance missing');
    assert(typeof s.hero.lifesteal === 'boolean', 'lifesteal missing');
    assert(typeof s.hero.explosiveShot === 'boolean', 'explosiveShot missing');
    assert(typeof s.hero.frostShot === 'boolean', 'frostShot missing');
    assert(typeof s.hero.berserk === 'boolean', 'berserk missing');
    assert(typeof s.hero.thorns === 'number', 'thorns missing');
    assert(typeof s.hero.dodgeChance === 'number', 'dodgeChance missing');
    assert(typeof s.hero.overcharge === 'boolean', 'overcharge missing');
    assert(typeof s.hero.regenPerSec === 'number', 'regenPerSec missing');
  });

  // ── HP Module Tests ──
  t('[HP] takeDamage reduces HP', () => {
    const origHp = s.hero.hp;
    const origInvUntil = s.hero.invUntil;
    s.hero.invUntil = 0; // clear invincibility
    const took = s.hero.takeDamage(10);
    assert(took === true, 'takeDamage should return true');
    assert(s.hero.hp === origHp - 10, `hp: expected ${origHp - 10}, got ${s.hero.hp}`);
    s.hero.hp = origHp;
    s.hero.invUntil = origInvUntil;
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
    const max = s.hero.overcharge ? Math.round(s.hero.chargeMax * 1.5) : s.hero.chargeMax;
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
    for (const sid of ['burst', 'barrage', 'timerift']) {
      const lvl = s.hero.getSkillLevel(sid);
      assert(typeof lvl === 'number' && lvl >= 0, `${sid} level invalid: ${lvl}`);
    }
  });

  // ── Projectile Module Tests ──
  t('[Projectile] HOMING_RANGE is reasonable', () => {
    assert(Projectile.HOMING_RANGE <= 200, `HOMING_RANGE=${Projectile.HOMING_RANGE}, should be <= 200`);
    assert(Projectile.HOMING_RANGE >= 80, `HOMING_RANGE=${Projectile.HOMING_RANGE}, should be >= 80`);
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
    assert(scene.physics.world.colliders.getActive().length >= 4, 'expected at least 4 colliders');
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
