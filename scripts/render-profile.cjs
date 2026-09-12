// Explicitly gated, isolated development renderer diagnostic. Do not run during the release soak.
// Run after other GPU checks have exited: SUNLIT_RENDER_PROFILE_RUN=1 electron scripts/render-profile.cjs
// This is a CPU-submission / scheduling comparison, not a GPU timer or a player FPS claim.
if (process.env.SUNLIT_RENDER_PROFILE_RUN !== '1') {
  console.log('Prepared only. Set SUNLIT_RENDER_PROFILE_RUN=1 after the soak has ended.');
  process.exit(0);
}

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const sampleMs = Math.max(15000, Number(process.env.SUNLIT_RENDER_SAMPLE_MS) || 20000);
const warmupMs = Math.max(3000, Number(process.env.SUNLIT_RENDER_WARMUP_MS) || 5000);
const output = path.resolve('.cache', `render-profile-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {
  output, sampleMs, warmupMs, startedAt: new Date().toISOString(),
  scope: 'Dedicated hidden offscreen Electron development QA. No user browser, no CDP, no source changes.',
  protocol: [
    'Menu reference, then an active Arena containing actual spawned enemies, with HP/core refills only to hold the encounter.',
    'The live Arena is subsequently paused at the scene-system level without a pause overlay. This freezes physics, timers, animation and gameplay together.',
    'The exact same paused display list is sampled visible / ground-hidden / visible-restored. Only the depth -1 static ground visibility changes (Graphics or cached Image).',
    'Ground-hidden screenshots are diagnostic controls, not the intended player presentation. TileSprite, map labels, trees and other Graphics remain visible.',
    'All timings are inclusive synchronous JavaScript CPU submission spans. Nested spans must not be summed; residuals are calculated per frame.',
    'rAF and paint intervals include browser/offscreen scheduling. No gl.finish, GPU timer queries, capture or inspector is used during samples.'
  ],
  sourceHashes: Object.fromEntries(['src/main.ts', 'src/scenes/ArenaScene.ts'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
  hardware: { cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
  versions: process.versions, phases: [], errors: []
};
const stats = values => {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = percentile => numbers.length ? numbers[Math.min(numbers.length - 1, Math.floor((numbers.length - 1) * percentile))] : null;
  return { count: numbers.length, mean: numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1) };
};

// Function source is evaluated only inside our own isolated QA renderer.
function installProfile() {
  const game = window.__sunlitQA.game;
  const restorers = [];
  const profile = window.__renderProfile = { phase: null, current: null, arena: null, ground: null, frozen: false, rafRunning: true };
  const add = (key, duration) => {
    if (!profile.current) return;
    profile.current[key] = (profile.current[key] || 0) + duration;
    profile.current[`${key}Calls`] = (profile.current[`${key}Calls`] || 0) + 1;
  };
  function wrap(object, method, key, emitter) {
    const original = object[method];
    if (typeof original !== 'function') return;
    const wrapped = function (...args) {
      const started = performance.now();
      try { return original.apply(this, args); }
      finally { add(key, performance.now() - started); }
    };
    object[method] = wrapped;
    restorers.push(() => { object[method] = original; });
    // Phaser stores several callbacks at boot. Replace the exact existing listener,
    // preserving its order/context, rather than measuring an unused object method.
    if (emitter?._events) for (const entries of Object.values(emitter._events)) {
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        if (entry?.fn === original && entry.context === object) {
          entry.fn = wrapped;
          restorers.push(() => { entry.fn = original; });
        }
      }
    }
    return wrapped;
  }
  wrap(game.scene, 'update', 'sceneUpdate');
  wrap(game.scene, 'render', 'sceneRender');
  wrap(game.renderer, 'preRender', 'rendererPre');
  wrap(game.renderer, 'render', 'rendererRender');
  wrap(game.renderer, 'postRender', 'rendererPost');
  const originalStep = game.step, originalCallback = game.loop.callback;
  game.step = function (time, delta) {
    const phase = profile.phase;
    if (!phase) return originalStep.call(this, time, delta);
    const started = performance.now();
    const frame = { offsetMs: started - phase.started, suppliedDelta: delta, callbackInterval: phase.previousStart === null ? null : started - phase.previousStart };
    phase.previousStart = started;
    profile.current = frame;
    try { return originalStep.call(this, time, delta); }
    finally {
      frame.gameStep = performance.now() - started;
      frame.renderCpu = (frame.sceneRender || 0) + (frame.rendererPre || 0) + (frame.rendererPost || 0);
      frame.otherGameStepCpu = Math.max(0, frame.gameStep - (frame.sceneUpdate || 0) - frame.renderCpu);
      frame.sceneUpdateOutsideArena = Math.max(0, (frame.sceneUpdate || 0) - (frame.arenaUpdate || 0));
      frame.sceneUpdateOutsideArenaAndPhysics = Math.max(0, (frame.sceneUpdate || 0) - (frame.arenaUpdate || 0) - (frame.physicsUpdate || 0) - (frame.physicsPost || 0));
      frame.renderOutsideGround = Math.max(0, frame.renderCpu - (frame.groundRender || 0));
      profile.current = null;
      phase.frames.push(frame);
    }
  };
  game.loop.callback = (time, delta) => game.step(time, delta);
  restorers.push(() => { game.step = originalStep; game.loop.callback = originalCallback; });
  let previousRaf = null;
  const raf = timestamp => {
    if (!profile.rafRunning) return;
    const phase = profile.phase;
    if (phase && previousRaf !== null) phase.raf.push(timestamp - previousRaf);
    previousRaf = phase ? timestamp : null;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  let observer;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    observer = new PerformanceObserver(list => {
      const phase = profile.phase;
      if (phase) for (const item of list.getEntries()) {
        if (item.startTime >= phase.started) phase.longTasks.push({ offsetMs: item.startTime - phase.started, duration: item.duration });
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
  }
  profile.attachArena = () => {
    const arena = profile.arena = game.scene.getScene('ArenaScene');
    const candidates = arena.children.getChildren().filter(object => ['Graphics', 'Image'].includes(object.type) && object.depth === -1);
    if (candidates.length !== 1) throw new Error(`Expected one static ground object, found ${candidates.length}`);
    profile.ground = candidates[0];
    const originalSceneUpdate = arena.sys.sceneUpdate;
    wrap(arena, 'update', 'arenaUpdate');
    arena.sys.sceneUpdate = arena.update;
    restorers.push(() => { arena.sys.sceneUpdate = originalSceneUpdate; });
    for (const [method, metric] of Object.entries({ updateEnemies: 'enemyUpdate', updateBullets: 'bulletUpdate', updateUI: 'hudUpdate', updateBgParticles: 'bgParticlesUpdate', updateMapHazards: 'hazardsUpdate' })) wrap(arena, method, metric);
    wrap(arena.hero, 'tick', 'heroUpdate');
    wrap(arena.shadow, 'update', 'shadowUpdate');
    wrap(arena.waveMgr, 'update', 'waveUpdate');
    wrap(arena.physics.world, 'update', 'physicsUpdate', arena.sys.events);
    wrap(arena.physics.world, 'postUpdate', 'physicsPost', arena.sys.events);
    wrap(profile.ground, game.renderer.type === 2 ? 'renderWebGL' : 'renderCanvas', 'groundRender');
    const originalEmit = arena.sys.events.emit;
    arena.sys.events.emit = function (name, ...args) {
      const measured = ['preupdate', 'update', 'postupdate'].includes(name);
      const started = measured ? performance.now() : 0;
      try { return originalEmit.call(this, name, ...args); }
      finally { if (measured) add(`sceneEvent_${name}`, performance.now() - started); }
    };
    restorers.push(() => { arena.sys.events.emit = originalEmit; });
    return { type: profile.ground.type, commandBufferLength: profile.ground.commandBuffer?.length ?? 0, depth: profile.ground.depth, otherGroundLayers: arena.children.getChildren().filter(o => o.depth < 0).map(o => ({ type: o.type, depth: o.depth, visible: o.visible })) };
  };
  profile.snapshot = () => {
    const arena = profile.arena;
    if (!arena) return { scene: 'MenuScene', children: game.scene.getScene('MenuScene').children.length };
    const fingerprint = JSON.stringify({
      children: arena.children.getChildren().map(o => [o.type, o.depth, o.x, o.y, o.scaleX, o.scaleY, o.rotation, o.alpha, o === profile.ground ? 'ground-visibility-excluded' : o.visible, o.text, o.texture?.key, o.commandBuffer]),
      camera: [arena.cameras.main.scrollX, arena.cameras.main.scrollY, arena.cameras.main.zoom],
      enemies: arena.enemies.getChildren().map(o => [o.active, o.x, o.y, o.hp]),
      bullets: [...arena.playerBullets.getChildren(), ...arena.enemyBullets.getChildren()].map(o => [o.active, o.x, o.y]),
      combatTime: arena.combatTime, score: arena.score, kills: arena.kills
    });
    let hash = 2166136261;
    for (let i = 0; i < fingerprint.length; i++) hash = Math.imul(hash ^ fingerprint.charCodeAt(i), 16777619);
    return { scene: 'ArenaScene', frozen: profile.frozen, sceneActive: arena.sys.isActive(), sceneVisible: arena.sys.isVisible(), displayFingerprint: (hash >>> 0).toString(16), fingerprintBytes: fingerprint.length, groundVisible: profile.ground.visible, groundCommands: profile.ground.commandBuffer?.length ?? 0, enemies: arena.enemies.countActive(true), playerBullets: arena.playerBullets.countActive(true), enemyBullets: arena.enemyBullets.countActive(true), children: arena.children.length, combatTime: arena.combatTime, dead: arena.dead, upgrading: arena.upgrading };
  };
  profile.start = name => {
    profile.phase = { name, started: performance.now(), previousStart: null, frames: [], raf: [], longTasks: [], populations: [] };
    previousRaf = null;
    return profile.snapshot();
  };
  profile.stop = () => {
    const phase = profile.phase;
    profile.phase = null;
    return { ...phase, elapsedMs: performance.now() - phase.started, end: profile.snapshot() };
  };
  profile.freeze = () => {
    const arena = profile.arena;
    arena.sys.pause();
    arena.cameras.main.stopFollow();
    profile.frozen = true;
  };
  profile.dispose = () => {
    profile.phase = null; profile.rafRunning = false;
    observer?.disconnect();
    for (const restore of restorers.reverse()) restore();
  };
  const gl = game.renderer.gl;
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return { rendererType: game.renderer.type, webgl: Boolean(gl), rendererName: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, canvas: { width: game.canvas.width, height: game.canvas.height }, timeStep: { targetFps: game.loop.targetFps, fpsLimit: game.loop.fpsLimit, forceSetTimeOut: game.loop.forceSetTimeOut }, performanceClock: 'performance.now(); native precision, no synthetic smoothing', longTaskSupported: Boolean(observer) };
}

let win;
let deadline;
app.whenReady().then(async () => {
  try {
    deadline = setTimeout(() => { report.failure = 'Overall diagnostic deadline exceeded'; fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); win?.destroy(); app.exit(1); }, 5 * (sampleMs + warmupMs) + 60000);
    win = new BrowserWindow({ width: 1024, height: 768, useContentSize: true, frame: false, show: false, webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) report.errors.push(event.message); });
    let paintPhase = null, previousPaint = null;
    win.webContents.on('paint', () => {
      const now = performance.now();
      if (paintPhase && previousPaint !== null) paintPhase.push(now - previousPaint);
      previousPaint = paintPhase ? now : null;
    });
    const evaluate = code => win.webContents.executeJavaScript(code, true);
    const waitFor = async (code, label) => {
      for (let i = 0; i < 250; i++) { if (await evaluate(code)) return; await delay(60); }
      throw new Error(`Timeout: ${label}`);
    };
    const sample = async (name, note) => {
      console.log(`Warmup ${name}: ${warmupMs}ms`);
      await delay(warmupMs);
      const start = await evaluate(`window.__renderProfile.start(${JSON.stringify(name)})`);
      paintPhase = []; previousPaint = null;
      const populations = [];
      const started = performance.now();
      while (performance.now() - started < sampleMs) {
        await delay(Math.min(1000, Math.max(1, sampleMs - (performance.now() - started))));
        populations.push(await evaluate("{const a=window.__renderProfile.arena; a ? {enemies:a.enemies.countActive(true),playerBullets:a.playerBullets.countActive(true),enemyBullets:a.enemyBullets.countActive(true),dead:a.dead,upgrading:a.upgrading,combatTime:a.combatTime} : null}"));
      }
      const raw = await evaluate('window.__renderProfile.stop()');
      const paint = paintPhase; paintPhase = null;
      const cpuKeys = ['gameStep', 'sceneUpdate', 'arenaUpdate', 'physicsUpdate', 'physicsPost', 'sceneEvent_preupdate', 'sceneEvent_update', 'sceneEvent_postupdate', 'heroUpdate', 'shadowUpdate', 'enemyUpdate', 'bulletUpdate', 'waveUpdate', 'hudUpdate', 'bgParticlesUpdate', 'hazardsUpdate', 'renderCpu', 'sceneRender', 'rendererPre', 'rendererRender', 'rendererPost', 'groundRender', 'renderOutsideGround', 'otherGameStepCpu', 'sceneUpdateOutsideArena', 'sceneUpdateOutsideArenaAndPhysics'];
      const phase = { name, note, start, end: raw.end, elapsedMs: raw.elapsedMs, frames: raw.frames.length, frameRate: raw.frames.length / raw.elapsedMs * 1000, raf: stats(raw.raf), callbackInterval: stats(raw.frames.map(frame => frame.callbackInterval)), paintInterval: stats(paint), cpu: Object.fromEntries(cpuKeys.map(key => [key, stats(raw.frames.map(frame => frame[key] || 0))])), groundRenderCalls: raw.frames.reduce((sum, frame) => sum + (frame.groundRenderCalls || 0), 0), rafOver25ms: raw.raf.filter(ms => ms > 25).length, rafOver42ms: raw.raf.filter(ms => ms > 42).length, longTasks: raw.longTasks, populations };
      report.phases.push(phase);
      fs.writeFileSync(path.join(output, `${name}-raw.json`), JSON.stringify({ ...raw, paint, populations }));
      // Captures occur only after both measurement windows have closed.
      fs.writeFileSync(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ name, frameRate: phase.frameRate, rafP95: phase.raf.p95, stepP95: phase.cpu.gameStep.p95, renderP95: phase.cpu.renderCpu.p95, groundP95: phase.cpu.groundRender.p95, arenaP95: phase.cpu.arenaUpdate.p95, fingerprint: phase.end.displayFingerprint }));
    };
    await win.loadURL('http://127.0.0.1:3000/?renderqa=1');
    await waitFor("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))", 'Menu ready');
    report.renderer = await evaluate(`(${installProfile.toString()})()`);
    report.hardware.gpuStatus = app.getGPUFeatureStatus();
    await sample('01-menu', 'Unmodified Menu reference: useful for the offscreen cadence floor, not content-matched to Arena.');
    await evaluate("localStorage.setItem('shadowlegion_tutorial_v4','done');window.__sunlitQA.game.scene.getScene('MenuScene').scene.start('ArenaScene',{mode:'endless',level:5,operativeId:'ranger',freshRun:true});void 0;");
    await waitFor("window.__sunlitQA.game.scene.isActive('ArenaScene')&&window.__sunlitQA.game.scene.getScene('ArenaScene').upgrading", 'Arena opening draft');
    report.arena = await evaluate('window.__renderProfile.attachArena()');
    await evaluate("{const a=window.__renderProfile.arena;for(let i=0;i<3&&a.upgrading;i++)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');a.hero.hp=a.hero.maxHp=1000000;a.defenseHp=a.defenseMaxHp=1000000;window.__renderHold=setInterval(()=>{if(!a.sys.isActive())return;a.hero.hp=a.hero.maxHp;a.defenseHp=a.defenseMaxHp;for(const e of a.enemies.getChildren())if(e.active)e.hp=e.maxHp=1000000;},100);void 0;}");
    await waitFor('window.__renderProfile.arena.enemies.countActive(true)>=8&&!window.__renderProfile.arena.upgrading', 'At least eight actual wave enemies');
    await sample('02-arena-live', 'Actual update/physics/render with automatic enemy spawning and companion actions. QA HP/core/enemy-HP refills prevent defeat or wave transitions. Population may vary and is recorded each second; this is not the ground A/B control.');
    await evaluate('clearInterval(window.__renderHold);window.__renderProfile.freeze();void 0;');
    await sample('03-arena-frozen-visible', 'Frozen scene-system baseline; actual enemies/bullets retained, gameplay CPU intentionally absent.');
    await evaluate('window.__renderProfile.ground.setVisible(false);void 0;');
    await sample('04-arena-frozen-ground-hidden', 'Identical frozen scene, only the static ground object at depth -1 hidden. Diagnostic visual control, not player presentation.');
    await evaluate('window.__renderProfile.ground.setVisible(true);void 0;');
    await sample('05-arena-frozen-restored', 'Same frozen scene and ground visibility restored; detects one-way warmup or scheduling drift.');
    const fixed = report.phases.slice(2), visible = fixed[0], hidden = fixed[1], restored = fixed[2];
    report.checks = {
      webglRenderer: report.renderer.webgl,
      actualLiveEnemies: report.phases[1].populations.every(p => p && p.enemies >= 1 && !p.dead && !p.upgrading),
      liveArenaAndPhysicsMeasured: report.phases[1].cpu.arenaUpdate.mean > 0 && report.phases[1].cpu.physicsUpdate.mean > 0,
      minimumSampleDuration: report.phases.every(p => p.elapsedMs >= sampleMs),
      exactFrozenDisplayState: fixed.every(p => p.start.displayFingerprint === visible.start.displayFingerprint && p.end.displayFingerprint === visible.start.displayFingerprint),
      allFrozenAndVisible: fixed.every(p => p.start.frozen && !p.start.sceneActive && p.start.sceneVisible && !p.end.sceneActive && p.end.sceneVisible),
      onlyGroundSuppressed: visible.groundRenderCalls > 0 && hidden.groundRenderCalls === 0 && restored.groundRenderCalls > 0 && !hidden.start.groundVisible && restored.start.groundVisible,
      noConsoleErrors: report.errors.length === 0
    };
    const averageVisibleMean = key => (visible.cpu[key].mean + restored.cpu[key].mean) / 2;
    report.comparison = {
      staticGroundCpuMeanMs: averageVisibleMean('groundRender'),
      renderCpuSavedMeanMs: averageVisibleMean('renderCpu') - hidden.cpu.renderCpu.mean,
      gameStepCpuSavedMeanMs: averageVisibleMean('gameStep') - hidden.cpu.gameStep.mean,
      groundShareOfVisibleRenderCpu: averageVisibleMean('groundRender') / averageVisibleMean('renderCpu'),
      visibleA_RafP95: visible.raf.p95, hidden_RafP95: hidden.raf.p95, visibleB_RafP95: restored.raf.p95,
      inferenceRule: 'Use per-frame CPU attribution plus reversible state-matched render-cost change to assess a static-cache candidate. Cadence alone cannot separate GPU/compositor/offscreen scheduling; JS submission spans do not measure GPU execution.'
    };
    report.completedAt = new Date().toISOString();
    await evaluate('window.__renderProfile.dispose();void 0;');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, checks: report.checks, comparison: report.comparison, errors: report.errors }, null, 2));
    clearTimeout(deadline); win.destroy(); app.exit(Object.values(report.checks).every(Boolean) ? 0 : 1);
  } catch (error) {
    report.failure = String(error.stack || error);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.error(report.failure);
    clearTimeout(deadline); win?.destroy(); app.exit(1);
  }
});
