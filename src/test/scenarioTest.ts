/**
 * In-game scenario tests.
 * Attach to ArenaScene after create() and runs automated checks
 * every second, logging to browser console.
 */

import Phaser from 'phaser';

interface TestLog { time: number; name: string; ok: boolean; detail?: string }

export function attachScenarioTests(scene: Phaser.Scene): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = scene as any;
  const log: TestLog[] = [];
  const startTime = Date.now();
  let lastWave = 0;

  // Dev-only keyboard harness. It keeps end-to-end browser verification on the
  // same public input surface as a player instead of reaching into the scene
  // from browser automation.
  const defeatWave = () => {
    const enemies = s.enemies?.getChildren?.() ?? [];
    for (const child of [...enemies]) {
      if (child?.active && typeof child.takeDamage === 'function') child.takeDamage(999999);
    }
    console.log(`[DEV] Defeated ${enemies.length} active enemies`);
  };
  const fillCharge = () => {
    if (s.hero) s.hero.charge = s.hero.chargeMax;
    console.log('[DEV] Skill charge filled');
  };
  const completeRun = () => {
    scene.events.emit('levelComplete', { level: s.currentLevel || 1 });
    console.log('[DEV] Run completion triggered');
  };
  const jumpToBoss = () => {
    const enemies = s.enemies?.getChildren?.() ?? [];
    for (const child of [...enemies]) {
      if (child?.active) child.destroy();
    }
    const manager = s.waveMgr;
    if (!manager) return;
    // Keep the scene alive long enough for visual telegraph sampling.
    s.defenseInvUntil = Number.MAX_SAFE_INTEGER;
    if (s.hero) s.hero.invUntil = Number.MAX_SAFE_INTEGER;
    manager.wave = Math.max(0, manager.totalWaves - 1);
    manager.pendingSpawns = [];
    manager.spawning = false;
    manager.waveActive = false;
    manager.betweenWaves = false;
    manager.allWavesDone = false;
    manager.startNextWave();
    console.log('[DEV] Boss wave started');
  };
  scene.input.keyboard?.on('keydown-F8', defeatWave);
  scene.input.keyboard?.on('keydown-F7', fillCharge);
  scene.input.keyboard?.on('keydown-F6', completeRun);
  // Letter aliases are reliable in browsers that reserve function keys.
  scene.input.keyboard?.on('keydown-K', defeatWave);
  scene.input.keyboard?.on('keydown-C', fillCharge);
  scene.input.keyboard?.on('keydown-N', completeRun);
  scene.input.keyboard?.on('keydown-B', jumpToBoss);

  function check(name: string, cond: boolean, detail?: string) {
    log.push({ time: Date.now() - startTime, name, ok: cond, detail });
    if (!cond) {
      console.error(`[SCENARIO FAIL] ${name}: ${detail}`);
    }
  }

  const timer = setInterval(() => {
    if (!scene.sys || !scene.sys.isActive()) {
      clearInterval(timer);
      printLog();
      return;
    }

    // Physics world should never be stuck at high timeScale for > 200ms
    const ts = scene.physics.world.timeScale;
    check('timeScale healthy', ts === 1,
      `timeScale=${ts}, hitlagUntil=${s.hitlagUntil}`);

    // Hero should be alive unless dead flag is set
    if (!s.dead) {
      check('hero alive while !dead', s.hero.hp > 0 || s.dead,
        `hp=${s.hero.hp}, dead=${s.dead}`);
    }

    // snd should never be undefined
    check('snd exists', s.snd !== undefined);

    // tutorial should exist
    check('tutorial exists', s.tutorial !== undefined);

    // waveMgr should exist
    check('waveMgr exists', s.waveMgr !== undefined);

    // Track wave changes
    if (s.waveMgr && s.waveMgr.wave !== lastWave) {
      console.log(`[SCENARIO] Wave changed: ${lastWave} → ${s.waveMgr.wave}`);
      lastWave = s.waveMgr.wave;
    }

    // Particle count should stay bounded
    check('particle count bounded', s.activeParticleCount <= 30,
      `activeParticleCount=${s.activeParticleCount}`);

    // Bullet group size should stay reasonable
    const pbCount = s.playerBullets?.getChildren().length ?? 0;
    const ebCount = s.enemyBullets?.getChildren().length ?? 0;
    check('bullet pool size', pbCount < 500 && ebCount < 200,
      `player=${pbCount}, enemy=${ebCount}`);

    // XP gems should be bounded
    const gemCount = s.xpGems?.getLength() ?? 0;
    check('xp gem count bounded', gemCount <= 80,
      `gemCount=${gemCount}`);

    // Enemy count should not explode (summoner checks)
    const enemyCount = s.enemies?.getChildren().filter((c: { active: boolean }) => c.active).length ?? 0;
    check('enemy count reasonable', enemyCount < 100,
      `enemyCount=${enemyCount}`);

    // Upgrade system integrity
    if (s.upgradeMgr) {
      const appliedCount = s.upgradeMgr.getAppliedIds().length;
      check('upgrade tracking', appliedCount >= 0,
        `applied=${appliedCount}`);
    }

    // Hero stats should be valid
    if (!s.dead && s.hero) {
      check('hero hp valid', s.hero.hp >= 0 && s.hero.hp <= s.hero.maxHp * 1.1,
        `hp=${s.hero.hp}/${s.hero.maxHp}`);
      check('hero charge valid', s.hero.charge >= 0,
        `charge=${s.hero.charge}`);
    }

  }, 1000);

  function printLog() {
    const fails = log.filter(l => !l.ok);
    if (fails.length > 0) {
      console.warn(`%c[SCENARIO] ${fails.length} failures detected:`, 'color: #ef4444; font-weight: bold');
      for (const f of fails) {
        console.warn(`  ${f.time}ms: ${f.name} — ${f.detail}`);
      }
    } else {
      console.log(`%c[SCENARIO] All checks passed (${log.length} checks)`, 'color: #22c55e; font-weight: bold');
    }
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    clearInterval(timer);
    scene.input.keyboard?.off('keydown-F8', defeatWave);
    scene.input.keyboard?.off('keydown-F7', fillCharge);
    scene.input.keyboard?.off('keydown-F6', completeRun);
    scene.input.keyboard?.off('keydown-K', defeatWave);
    scene.input.keyboard?.off('keydown-C', fillCharge);
    scene.input.keyboard?.off('keydown-N', completeRun);
    scene.input.keyboard?.off('keydown-B', jumpToBoss);
    printLog();
  });

  console.log('%c[SCENARIO] Tests attached to ArenaScene', 'color: #60a5fa');
}
