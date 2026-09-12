import { writeFileSync, mkdirSync } from 'node:fs';
import { ARENA_WIDTH, ARENA_HEIGHT, ENEMY_TYPES, HERO_CFG, ELITE, WAVE_CFG } from '../src/config/gameConfig.ts';
import { LEVEL_WAVES } from '../src/data/enemies.ts';
import { CHAPTERS, pointInRect } from '../src/data/chapters.ts';
import { STAGES, getStageChapter } from '../src/data/stages.ts';
import { OPERATIVES } from '../src/data/operatives.ts';
import { SKILLS } from '../src/data/skills.ts';

// Static workload scenarios, never measured completion times or strict bounds.
const round = value => Math.round(value * 10) / 10;
const sum = values => values.reduce((total, value) => total + value, 0);
const range = values => ({ min: round(Math.min(...values)), max: round(Math.max(...values)) });
const baseDps = HERO_CFG.bulletDamage * 1000 / HERO_CFG.fireRate;
const priorityTypes = new Set(['archer', 'medic', 'summoner', 'bomber']);
const center = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
const scenarios = [
  { id: 'cautious', label: '基础武器／谨慎操作', hitRatio: .55, firingUptime: .6, buildMultiplier: 1, companionDps: 0 },
  { id: 'developing', label: '初步流派／稳定操作', hitRatio: .65, firingUptime: .72, buildMultiplier: 1.25, companionDps: 3 },
  { id: 'fluent', label: '顺畅流派／熟悉路线', hitRatio: .8, firingUptime: .85, buildMultiplier: 1.6, companionDps: 5 },
].map(item => ({ ...item, effectiveDps: baseDps * item.hitRatio * item.firingUptime * item.buildMultiplier + item.companionDps }));

function unitsForWave(wave, chapter) {
  const units = wave.spawns.map(spawn => {
    const cfg = ENEMY_TYPES[spawn.type];
    return { type: spawn.type, min: spawn.min, expected: (spawn.min + spawn.max) / 2,
      hp: Math.round(Math.round(cfg.hp * (spawn.elite ? ELITE.hp : 1)) * chapter.enemyHpScale),
      speed: cfg.speed * (spawn.elite ? ELITE.speed : 1), xp: Math.round(cfg.xp * (spawn.elite ? ELITE.xp : 1)), boss: false };
  });
  if (wave.isBoss && wave.bossType) {
    const cfg = ENEMY_TYPES[wave.bossType];
    units.push({ type: wave.bossType, min: 1, expected: 1,
      hp: Math.round(Math.round(cfg.hp * WAVE_CFG.bossHp) * chapter.enemyHpScale * (wave.bossHpScale ?? 1)),
      speed: cfg.speed * WAVE_CFG.bossSpeed, xp: cfg.xp * 10, boss: true });
  }
  return units;
}

function routeBudget(lane, chapter, speed) {
  const fullDistance = Math.hypot(lane.x - center.x, lane.y - center.y);
  const approachDistance = Math.max(0, fullDistance - 240);
  let hazardDistance = 0, seconds = 0;
  for (let sample = 0; sample < 120; sample++) {
    const t = ((sample + .5) / 120) * approachDistance / fullDistance;
    const x = lane.x + (center.x - lane.x) * t, y = lane.y + (center.y - lane.y) * t;
    const distance = approachDistance / 120;
    const inZone = chapter.hazards.some(rect => pointInRect(x, y, rect));
    if (inZone) hazardDistance += distance;
    // Tide has a 50% active cycle; average reciprocal speed, not speed.
    const timeMultiplier = !inZone ? 1 : chapter.hazardKind === 'sand' ? 1 / .88
      : chapter.hazardKind === 'tide' ? .5 + .5 / .72 : 1;
    seconds += distance / speed * timeMultiplier;
  }
  return { fullDistance, hazardDistance, seconds };
}

function waveBudget(wave, chapter, index) {
  const units = unitsForWave(wave, chapter);
  const lanes = (wave.lanes ?? chapter.spawnPoints.map((_, i) => i)).map(i => chapter.spawnPoints[i]);
  const expectedEnemies = sum(units.map(unit => unit.expected));
  const routes = units.map(unit => ({ unit, values: lanes.map(lane => routeBudget(lane, chapter, unit.speed)) }));
  return { index: index + 1, name: wave.name, lanes: lanes.map(lane => lane.label),
    minimumEnemies: sum(units.map(unit => unit.min)), expectedEnemies,
    expectedHp: sum(units.map(unit => unit.expected * unit.hp)), bossHp: sum(units.filter(unit => unit.boss).map(unit => unit.hp)),
    minimumPriorityKills: sum(units.filter(unit => priorityTypes.has(unit.type)).map(unit => unit.min)),
    minimumGemCharge: sum(units.map(unit => unit.min * Math.round(unit.xp * 1.2))),
    spawnWindowSeconds: expectedEnemies * (wave.spawnIntervalMs ?? WAVE_CFG.spawnInterval) / 1000,
    averageApproachSeconds: sum(routes.map(({ unit, values }) => unit.expected * sum(values.map(route => route.seconds)) / values.length)) / expectedEnemies,
    laneDistancePixels: range(lanes.map(lane => Math.hypot(lane.x - center.x, lane.y - center.y))),
    terrainDistancePixels: range(routes.flatMap(item => item.values.map(route => route.hazardDistance))),
  };
}

const stages = STAGES.map(stage => {
  const chapter = getStageChapter(stage.id);
  const waves = stage.waves.map((wave, index) => waveBudget(wave, chapter, index));
  const minEnemies = sum(waves.map(wave => wave.minimumEnemies));
  const priorityAvailable = sum(waves.map(wave => wave.minimumPriorityKills));
  const goals = [stage.objective, stage.bonusObjective];
  const goalChecks = goals.map(goal => {
    if (goal.kind === 'priority') return { ...goal, minimumAvailable: priorityAvailable, reachableByContent: priorityAvailable >= goal.target };
    if (goal.kind === 'skill') {
      // Seven 15-charge kills fill a 100-charge bar. Assume immediate spending;
      // exclude the last enemy's charge because combat has already ended.
      const withoutGems = Math.floor((minEnemies - 1) / Math.ceil(100 / HERO_CFG.chargePerKill));
      return { ...goal, killOnlyCastsBeforeFinalEnemy: withoutGems,
        extraGemChargeIfCollected: sum(waves.map(wave => wave.minimumGemCharge)), reachableByContent: withoutGems >= goal.target };
    }
    if (goal.kind === 'terrain') return { ...goal, hazardKind: chapter.hazardKind,
      routedWaves: waves.filter(wave => wave.terrainDistancePixels.max > 0).length,
      reachableByContent: waves.some(wave => wave.terrainDistancePixels.max > 0) };
    return { ...goal, reachableByContent: true };
  });
  const scenarioBudgets = scenarios.map(scenario => ({ id: scenario.id,
    activeSeconds: round(sum(waves.map(wave => Math.max(wave.spawnWindowSeconds + wave.averageApproachSeconds, wave.expectedHp / scenario.effectiveDps))) + waves.length * WAVE_CFG.delayMs / 1000),
    readingSecondsAssumption: ((stage.id === 1 ? 1 : 2) + waves.length - 1) * 10,
  }));
  return { id: stage.id, label: stage.label, chapter: stage.chapter, name: stage.name, kind: stage.kind, targetSeconds: stage.targetSeconds, waves,
    expectedEnemies: sum(waves.map(wave => wave.expectedEnemies)), expectedHp: sum(waves.map(wave => wave.expectedHp)),
    bossHp: sum(waves.map(wave => wave.bossHp)), minimumEnemies: minEnemies,
    spawnWindowSeconds: round(sum(waves.map(wave => wave.spawnWindowSeconds))),
    laneDistancePixels: range(waves.flatMap(wave => [wave.laneDistancePixels.min, wave.laneDistancePixels.max])),
    terrainDistancePixels: range(waves.flatMap(wave => [wave.terrainDistancePixels.min, wave.terrainDistancePixels.max])),
    scenarioBudgets, goalChecks, timeStampTargetSeconds: goals.find(goal => goal.kind === 'time')?.target ?? null,
    supportWarning: stage.waves.some(wave => wave.spawns.some(spawn => ['medic', 'summoner'].includes(spawn.type)))
      ? '治疗与额外召唤未计入生命负载；拖延后排会延长实际战斗。' : null,
  };
});

const chapters = CHAPTERS.map(chapter => {
  const rows = stages.filter(stage => stage.chapter === chapter.id);
  return { chapter: chapter.id, name: chapter.name, stages: rows.length,
    expectedEnemies: sum(rows.map(stage => stage.expectedEnemies)), expectedHp: sum(rows.map(stage => stage.expectedHp)),
    enemiesPerStage: range(rows.map(stage => stage.expectedEnemies)), hpPerStage: range(rows.map(stage => stage.expectedHp)),
    spawnWindowPerStageSeconds: range(rows.map(stage => stage.spawnWindowSeconds)), targetPerStageSeconds: range(rows.map(stage => stage.targetSeconds)),
    scenarioActiveMinutes: Object.fromEntries(scenarios.map(scenario => [scenario.id, round(sum(rows.map(stage => stage.scenarioBudgets.find(item => item.id === scenario.id).activeSeconds)) / 60)])),
    readingMinutesAssumption: round(sum(rows.map(stage => stage.scenarioBudgets[0].readingSecondsAssumption)) / 60),
  };
});
const warnings = [];
for (const stage of stages) {
  const previous = stages.find(item => item.id === stage.id - 1);
  if (previous && stage.expectedHp > previous.expectedHp * 1.6) warnings.push({ stage: stage.label, type: 'hp-step', ratio: round(stage.expectedHp / previous.expectedHp), context: stage.kind });
  const developing = stage.scenarioBudgets.find(item => item.id === 'developing').activeSeconds;
  if (developing > stage.targetSeconds * 1.2) warnings.push({ stage: stage.label, type: 'target-overrun-assumption', modeledSeconds: developing, targetSeconds: stage.targetSeconds });
  if (stage.bossHp / scenarios[1].effectiveDps > 45) warnings.push({ stage: stage.label, type: 'boss-workload-over-45s', seconds: round(stage.bossHp / scenarios[1].effectiveDps) });
  for (const goal of stage.goalChecks) if (!goal.reachableByContent) warnings.push({ stage: stage.label, type: 'goal-content-shortfall', goal });
}
const endlessRotation = LEVEL_WAVES.map((waves, chapterIndex) => {
  const rows = waves.map((wave, index) => waveBudget(wave, CHAPTERS[chapterIndex], index));
  return { chapter: chapterIndex + 1, name: CHAPTERS[chapterIndex].name,
    expectedEnemies: sum(rows.map(wave => wave.expectedEnemies)), expectedHp: sum(rows.map(wave => wave.expectedHp)),
    spawnWindowSeconds: round(sum(rows.map(wave => wave.spawnWindowSeconds))),
    baseWeaponWorkSeconds: round(sum(rows.map(wave => wave.expectedHp)) / scenarios[0].effectiveDps) };
});
const report = { version: 2, generatedAt: new Date().toISOString(),
  disclaimer: '静态遭遇负载与明确假设，不是玩家模拟、实测时长或严格上下界。未模拟治疗、召唤、技能、暴击、溅射、多目标弹射、失败与菜单停留。',
  assumptions: { baseDps, scenarios, interceptRadius: 240, routeSamples: 120, readingSecondsPerChoice: 10,
    budgetFormula: '各波 max(生成窗口+按地形修正的平均抵达240px截击圈时间, 期望生命/假设有效DPS)，累加后加波间等待；读卡时间不计入星章计时。',
    operativeWeaponCeilings: OPERATIVES.map(operative => ({ id: operative.id, name: operative.name,
      nominalProjectileDps: round(baseDps * (operative.id === 'gunner' ? 2.2 : ['warden', 'engineer'].includes(operative.id) ? .92 : 1)),
      skillChargeCost: SKILLS.find(skill => skill.id === operative.signatureSkill).chargeCost,
      note: operative.id === 'gunner' ? '两弹都命中才成立，散射会降低单体有效输出。' : operative.id === 'ranger' ? '未计8%暴击及溅射。' : operative.id === 'engineer' ? '未计追踪和弹射第二目标。' : '未计减速及护盾的站场收益。',
    })),
  }, chapters, stages, warnings, endlessRotation,
};
mkdirSync('release/reports', { recursive: true });
writeFileSync('release/reports/pacing-budget.json', JSON.stringify(report, null, 2) + '\n');
console.table(chapters.map(chapter => ({ chapter: chapter.chapter, name: chapter.name, enemies: chapter.expectedEnemies, hp: chapter.expectedHp,
  cautiousMinutes: chapter.scenarioActiveMinutes.cautious, developingMinutes: chapter.scenarioActiveMinutes.developing,
  fluentMinutes: chapter.scenarioActiveMinutes.fluent, readingMinutes: chapter.readingMinutesAssumption })));
console.table(warnings);
console.log(report.disclaimer);
console.log('已保存 release/reports/pacing-budget.json：50关逐波数据、5章汇总、目标可达性、无尽轮转。');
