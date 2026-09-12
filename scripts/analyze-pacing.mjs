import { writeFileSync, mkdirSync } from 'node:fs';
import { ENEMY_TYPES, HERO_CFG, ELITE, WAVE_CFG } from '../src/config/gameConfig.ts';
import { LEVEL_WAVES } from '../src/data/enemies.ts';
import { CHAPTERS } from '../src/data/chapters.ts';

// A workload estimate, not a player simulation or measured session duration.
// Deliberately excludes upgrades, area damage, skill damage, healing and summons.
const baseDps = HERO_CFG.bulletDamage * 1000 / HERO_CFG.fireRate;
const hitRatio = 0.55;
const firingUptime = 0.6;
const effectiveDps = baseDps * hitRatio * firingUptime;
const rows = LEVEL_WAVES.map((waves, chapterIndex) => {
  let expectedEnemies = 0;
  let expectedHp = 0;
  let spawnSeconds = 0;
  for (const wave of waves) {
    let count = 0;
    for (const spawn of wave.spawns) {
      const expected = (spawn.min + spawn.max) / 2;
      count += expected;
      expectedHp += expected * ENEMY_TYPES[spawn.type].hp * (spawn.elite ? ELITE.hp : 1);
    }
    if (wave.isBoss) {
      count++;
      expectedHp += ENEMY_TYPES[wave.bossType].hp * WAVE_CFG.bossHp;
    }
    expectedEnemies += count;
    spawnSeconds += count * WAVE_CFG.spawnInterval / 1000;
  }
  expectedHp *= CHAPTERS[chapterIndex].enemyHpScale;
  return {
    chapter: chapterIndex + 1,
    name: CHAPTERS[chapterIndex].name,
    expectedEnemies,
    expectedHp: Math.round(expectedHp),
    spawnWindowSeconds: Number(spawnSeconds.toFixed(1)),
    baseWeaponWorkSeconds: Math.round(expectedHp / effectiveDps),
    upgradeReadingSecondsAssumption: (waves.length - 1) * 10,
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  disclaimer: 'Static HP/workload model only. Not playtest results; actual duration depends on movement, build, skills, deaths, missions and reading time.',
  assumptions: { baseDps, hitRatio, firingUptime, effectiveDps, upgradeReadingSeconds: 10 },
  chapters: rows,
};
mkdirSync('release/reports', { recursive: true });
writeFileSync('release/reports/pacing-budget.json', JSON.stringify(report, null, 2) + '\n');
console.table(rows);
console.log(report.disclaimer);
console.log('Saved release/reports/pacing-budget.json');
