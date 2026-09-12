// Real-time isolated Electron renderer soak. No user browser profile is read.
// Start with Vite on :3000, then electron scripts/soak-smoke.cjs (20 minutes).
// Optional SUNLIT_SOAK_MINUTES <20 is diagnostic only and never a release soak.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const minutes = Math.max(1, Number(process.env.SUNLIT_SOAK_MINUTES) || 20);
const diagnosticPhase = minutes < 20 ? process.env.SUNLIT_SOAK_PHASE : undefined;
const durationMs = minutes * 60000;
const output = path.resolve('.cache', `soak-qa-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-precise-memory-info');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : null;
const summary = values => ({ samples: values.length, median: quantile(values, .5), p95: quantile(values, .95), p99: quantile(values, .99), max: values.length ? Math.max(...values) : null });
const errors = [], samples = [], lifecycle = [], gcSamples = [], phaseData = new Map();
const endlessCombatLevels = new Set();
const capturedMilestones = new Set();
const allFrames = [], allEnemyMs = [], allBulletMs = [];
const scriptStarted = Date.now();
let soakStarted = 0, win, sourceHash;
function hashSource() {
  const hash = crypto.createHash('sha256');
  const visit = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file); else if (/\.(ts|json|css|html)$/.test(entry.name)) { hash.update(file); hash.update(fs.readFileSync(file)); }
  } };
  visit(path.resolve('src'));
  return hash.digest('hex');
}
function writeJson(file, value) { fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2)); }
function recordError(type, message) {
  const item = { type, message: String(message), elapsedSec: (Date.now() - scriptStarted) / 1000 };
  errors.push(item); console.error(JSON.stringify(item));
  fs.appendFileSync(path.join(output, 'errors.jsonl'), JSON.stringify(item) + '\n');
}
const watchdog = setTimeout(() => { recordError('watchdog', 'Soak exceeded allotted duration plus setup allowance'); writeJson('failure.json', { errors, samples: samples.length, lifecycle }); app.exit(1); }, durationMs + 300000);

async function installRobot() {
  const { MetaProgressionManager, createDefaultMetaState } = await import('/systems/MetaProgressionManager.ts');
  const { WAVE_UPGRADES, LEVEL_UPGRADES } = await import('/data/upgrades.ts');
  const { SettingsManager } = await import('/systems/SettingsManager.ts');
  const initial = createDefaultMetaState();
  initial.unlockedOperatives = ['ranger', 'gunner', 'warden', 'engineer'];
  initial.unlockedSkills = ['burst', 'barrage', 'timerift', 'sentry'];
  initial.stageProgress = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, { stars: 1, replayRewards: 0, masteryStars: {}, migrated: true }]));
  localStorage.setItem('shadowlegion_meta_v1', JSON.stringify(initial));
  localStorage.setItem('shadowlegion_tutorial_v4', 'done');
  SettingsManager.update({ volume: 0, autoFire: false, reducedMotion: false });
  const game = window.__sunlitQA.game;
  const q = window.__soak = { frames: [], enemyMs: [], bulletMs: [], errors: [], config: {}, scenes: 0, wins: 0, epoch: '', lastAt: performance.now(), robotMs: [], autonomous: true, buildApplied: false };
  window.addEventListener('error', event => q.errors.push({ type: 'window.error', message: event.message }));
  window.addEventListener('unhandledrejection', event => q.errors.push({ type: 'unhandledrejection', message: String(event.reason?.stack ?? event.reason) }));
  const frame = now => { q.frames.push(now - q.lastAt); if (q.frames.length > 5000) q.frames.shift(); q.lastAt = now; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  q.start = config => { q.config = config; q.phaseAt = performance.now(); q.sceneAt = performance.now(); game.scene.getScenes(true)[0].scene.start('ArenaScene', config.launch); };
  q.build = arena => {
    // Seed a reachable capped late-run build. Never raise maxStacks or inject
    // direct damage, fire rate, enemy count, enemy HP or clock acceleration.
    const cards = [...WAVE_UPGRADES, ...LEVEL_UPGRADES].filter(card => card.id !== 'heal' && (!card.path || card.path === arena.upgradeMgr.getBuildPath()));
    for (const card of cards) {
      if (card.requiresSkill && !arena.hero.unlockedSkills.includes(card.requiresSkill)) continue;
      for (let i = arena.upgradeMgr.getStacks(card.id); i < card.maxStacks; i++) arena.upgradeMgr.applyById(arena.hero, card.id);
    }
    q.buildApplied = true;
  };
  const control = () => {
    if (!q.autonomous) return;
    const robotStart = performance.now();
    try {
      if (game.scene.isActive('GameOverScene')) {
        q.wins++; q.sceneAt = performance.now();
        game.scene.getScene('GameOverScene').scene.start('ArenaScene', q.config.launch); return;
      }
      if (!game.scene.isActive('ArenaScene')) return;
      const a = game.scene.getScene('ArenaScene');
      if (a.completionId !== q.epoch) {
        q.epoch = a.completionId; q.scenes++; q.buildApplied = false; q.sceneAt = performance.now(); q.lastDash = 0; q.lastCommand = 0;
        for (const [method, store] of [['updateEnemies', 'enemyMs'], ['updateBullets', 'bulletMs']]) {
          if (!a[`__soakOriginal_${method}`]) {
            const original = a[method]; a[`__soakOriginal_${method}`] = original;
            a[method] = function(...args) { const start = performance.now(); try { return original.apply(this,args); } finally { q[store].push(performance.now()-start); } };
          }
        }
      }
      if (a.dead) return;
      if (a.paused && !a.upgrading && !a.waveMgr.allWavesDone) a.togglePause();
      // Preserve real hit/collision/effect callbacks while preventing the robot
      // from ending stress prematurely. These are pressure-test assists.
      a.hero.hp = a.hero.maxHp; a.defenseHp = a.defenseMaxHp;
      if (a.upgrading) {
        const pool = a.waveMgr.allWavesDone && a.mode === 'endless' ? 'level' : 'wave';
        const choices = a.upgradeMgr.pickThree(pool, a.hero, a.defenseHp / a.defenseMaxHp);
        if (choices[0]) a.selectUpgrade(choices.find(card => card.path === a.upgradeMgr.getBuildPath()) ?? choices[0], pool);
        return;
      }
      const held = performance.now() - q.phaseAt < (q.config.holdMs || 0);
      if (a.shadow?.options) a.shadow.options.spectator = held || a.mode === 'shadow';
      if (!held && q.config.lateBuild && !q.buildApplied) q.build(a);
      const enemies = a.enemies.getChildren().filter(enemy => enemy.active);
      let target = null, best = Infinity;
      for (const enemy of enemies) {
        const priority = ['medic','summoner'].includes(enemy.cfg.key) ? -500 : 0;
        const score = Math.hypot(enemy.x-a.hero.x,enemy.y-a.hero.y) + priority;
        if (score < best) { best=score; target=enemy; }
      }
      a.input.activePointer.isDown = !held;
      if (target) {
        const camera = a.cameras.main;
        // The normal camera has no rotation and zoom=1 during active play.
        a.input.activePointer.position.set((target.x-camera.scrollX)*camera.zoom + camera.x, (target.y-camera.scrollY)*camera.zoom + camera.y);
      }
      const angle = a.combatTime / 6500;
      const tx = held ? 800 : 800 + Math.cos(angle)*260, ty = held ? 740 : 600 + Math.sin(angle)*215;
      for (const [key, value] of Object.entries({ W: a.hero.y > ty+15, S: a.hero.y < ty-15, A: a.hero.x > tx+15, D: a.hero.x < tx-15 })) a.hero.keys[key].isDown = value;
      if (!held && enemies.length && a.hero.charge >= a.hero.getSkillChargeCost()) {
        if (q.config.lateBuild && a.hero.unlockedSkills.includes('barrage')) a.hero.activeSkillId = 'barrage';
        if (a.hero.charge >= a.hero.getSkillChargeCost()) a.hero.useSkill();
      }
      if (!held && a.combatTime - (q.lastDash || 0) > 2400) { a.hero.dash(a.combatTime); q.lastDash=a.combatTime; }
      if (!held && a.combatTime - (q.lastCommand || 0) > 6500) { a.input.keyboard.emit('keydown-E'); q.lastCommand=a.combatTime; }
    } catch(error) { q.errors.push({ type:'robot', message:String(error.stack||error) }); }
    finally { q.robotMs.push(performance.now()-robotStart); }
  };
  q.timer = setInterval(control,200);
  q.read = (reset = true) => {
    const active = game.scene.isActive('ArenaScene');
    const a = active ? game.scene.getScene('ArenaScene') : null;
    const objects = a ? a.children.list : [];
    const emitters = objects.filter(object => typeof object.getAliveParticleCount === 'function');
    const result = { frames:q.frames, enemyMs:q.enemyMs, bulletMs:q.bulletMs, robotMs:q.robotMs, errors:q.errors,
      scenes:q.scenes, results:q.wins, scene:game.scene.getScenes(true)[0]?.scene.key,
      heapBytes:performance.memory?.usedJSHeapSize ?? null, heapLimitBytes:performance.memory?.jsHeapSizeLimit ?? null,
      fps:game.loop.actualFps, mode:a?.mode, level:a?.currentLevel, wave:a?.waveMgr.wave,
      resources:{textures:Object.keys(game.textures.list).length,groundCache:game.textures.exists('sunlit-arena-ground-cache')},
      camp:a?{x:a.defenseCore.x,y:a.defenseCore.y,pushable:a.defenseCore.body.pushable}:null,
      activeMs:a?.activeRunMs, combatTime:a?.combatTime,
      state:a?{epoch:a.completionId,sceneAgeMs:performance.now()-q.sceneAt,paused:a.paused,upgrading:a.upgrading,
        openingDrafts:a.openingDrafts,tutorialActive:a.tutorial.isActive,dead:a.dead,sceneStatus:a.sys.settings.status,
        allWavesDone:a.waveMgr.allWavesDone,waveActive:a.waveMgr.waveActive,spawning:a.waveMgr.spawning}:null,
      counts:a?{ enemies:a.enemies.countActive(true), playerActive:a.playerBullets.countActive(true), playerAllocated:a.playerBullets.getLength(),
        enemyActive:a.enemyBullets.countActive(true), enemyAllocated:a.enemyBullets.getLength(), gems:a.xpGems.getLength(),
        objects:objects.length, physicsBodies:a.physics.world.bodies.size, emitters:emitters.length,
        groundImages:objects.filter(object=>object.name==='static-ground-cache').length,
        particles:emitters.reduce((sum,item)=>sum+item.getAliveParticleCount(),0), particleCounter:a.activeParticleCount,
        timers:(a.time._active?.length??0)+(a.time._pendingInsertion?.length??0), tweens:a.tweens.getTweens().length,
        pendingSpawns:a.waveMgr.pendingSpawns.length, rivals:a.enemies.getChildren().filter(e=>e.getData('shadowRival')).length,
        fireListeners:a.events.listenerCount('heroFire'), deathListeners:a.events.listenerCount('enemyDeath'),
        commandListeners:a.input.keyboard.listenerCount('keydown-E'), pauseListeners:a.input.keyboard.listenerCount('keydown-ESC'),
        gameBlurListeners:game.events.listenerCount('blur'), cards:a.upgradeMgr.getAppliedIds().length }:null };
    if (reset) { q.frames=[];q.enemyMs=[];q.bulletMs=[];q.robotMs=[];q.errors=[]; }
    return result;
  };
  const gl = game.renderer.gl;
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return { seededProgress:'All stages/classes unlocked only in isolated profile', maxEnemyBudget:'Product code only; no direct spawning', helper:'200ms robot, aim/movement/skills/draft, bounded late-run cards, HP/core refills; companion silent only during accumulation', gcAvailable:typeof window.gc==='function', sourceMetaVersion:MetaProgressionManager.getState().version,
    renderer:{phaserType:game.renderer.type,webgl:Boolean(gl),unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null} };
}

app.whenReady().then(async () => {
  try {
    sourceHash=hashSource();
    win = new BrowserWindow({ width:1024,height:768,useContentSize:true,show:false,
      webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true} });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', event => {
      if(event.level==='error'||event.level===3) recordError('console',event.message);
      if(/\[vite\].*(hot updated|page reload)/i.test(event.message)) recordError('source-change',event.message);
    });
    win.webContents.on('render-process-gone',(_event,details)=>recordError('renderer-gone',JSON.stringify(details)));
    win.webContents.on('unresponsive',()=>recordError('unresponsive','Renderer stopped responding'));
    let navigations = 0;
    win.webContents.on('did-finish-load',()=>{if(++navigations>1)recordError('page-reload','Renderer reloaded during soak; this run cannot certify an uninterrupted source revision');});
    const evaluate=code=>win.webContents.executeJavaScript(code,true);
    const waitFor=async(code,label)=>{for(let i=0;i<100;i++){if(await evaluate(code))return;await delay(100);}throw Error(`Timed out: ${label}`);};
    await win.loadURL(process.env.SUNLIT_QA_URL || 'http://127.0.0.1:3000/?renderqa=1');
    await waitFor("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))",'menu startup');
    const assists=await evaluate(`(${installRobot.toString()})()`);
    const hardware={cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,systemMemoryBytes:os.totalmem(),gpu:await app.getGPUInfo('basic'),gpuFeatures:app.getGPUFeatureStatus(),versions:process.versions};
    const metadata={pid:process.pid,rendererPid:win.webContents.getOSProcessId(),output,durationMinutes:minutes,
      evidence:minutes>=20?'Real-time 20+ minute renderer soak':'Diagnostic short run, not release soak',sourceHash,assists,hardware,
      environment:'Hidden offscreen renderer on shared development host; rAF timings are not visible-window or exclusive reference-machine certification.'};
    writeJson('metadata.json',metadata);writeJson('live.json',{...metadata,status:'running'});
    console.log(JSON.stringify({event:'started',...metadata}));
    const phaseDefinitions=[
      {name:'natural-summon-density',share:.2,holdMs:Math.min(125000,durationMs*.11),lateBuild:true,launch:{mode:'campaign',stageId:47,operativeId:'gunner',freshRun:true}},
      {name:'endless-late-build',share:.4,holdMs:0,lateBuild:true,launch:{mode:'endless',level:46,operativeId:'engineer',freshRun:true}},
      {name:'dual-shadow',share:.2,holdMs:Math.min(40000,durationMs*.035),lateBuild:false,launch:{mode:'shadow',trialTier:5,operativeId:'gunner',freshRun:true}},
      {name:'ten-restarts',share:.2,holdMs:0,lateBuild:false,launch:{mode:'campaign',stageId:50,operativeId:'ranger',freshRun:true}},
    ];
    const phases=diagnosticPhase?phaseDefinitions.filter(phase=>phase.name===diagnosticPhase).map(phase=>({...phase,share:1})):phaseDefinitions;
    if(!phases.length)throw Error('Unknown SUNLIT_SOAK_PHASE diagnostic filter');
    soakStarted=Date.now();let previousMinute=-1;
    for (const phase of phases) {
      const phaseAt=Date.now(),phaseMs=durationMs*phase.share;
      phaseData.set(phase.name,{frames:[],enemyMs:[],bulletMs:[],robotMs:[]});
      await evaluate(`window.__soak.start(${JSON.stringify(phase)});void 0`);
      let restart=0,clockState=null;
      while(Date.now()-phaseAt<phaseMs){
        await delay(5000);
        if(phase.name==='ten-restarts' && restart<10 && Date.now()-phaseAt>restart*phaseMs/10){
          const before=await evaluate('window.__soak.read(false)');
          const launch=restart%3===0?{mode:'shadow',trialTier:5,operativeId:'warden',freshRun:true}:restart%3===1?{mode:'endless',level:26,operativeId:'engineer',freshRun:true}:phase.launch;
          await evaluate(`window.__soak.start(${JSON.stringify({...phase,launch})});void 0`);
          await delay(500);
          const after=await evaluate('window.__soak.read(false)');
          lifecycle.push({restart:++restart,before:before.counts,after:after.counts,launch});
          if(after.counts && (after.counts.fireListeners!==1||after.counts.deathListeners!==1||after.counts.commandListeners!==1||after.counts.pauseListeners!==1))recordError('listener-leak',JSON.stringify(lifecycle.at(-1)));
        }
        const sample=await evaluate('window.__soak.read()');
        const metrics=app.getAppMetrics(),processMetric=metrics.find(item=>item.pid===win.webContents.getOSProcessId());
        const bucket=phaseData.get(phase.name);
        for(const key of ['frames','enemyMs','bulletMs','robotMs'])bucket[key].push(...sample[key]);
        allFrames.push(...sample.frames);allEnemyMs.push(...sample.enemyMs);allBulletMs.push(...sample.bulletMs);
        for(const error of sample.errors)recordError(error.type,error.message);
        if(sample.scene==='ArenaScene' && (sample.counts?.groundImages!==1 || !sample.resources?.groundCache))recordError('ground-cache','Expected one owned static ground image in the active Arena');
        if(sample.scene==='ArenaScene' && (!sample.camp || Math.hypot(sample.camp.x-800,sample.camp.y-600)>.01 || sample.camp.pushable))recordError('camp-anchor','The camp must remain anchored at the authored map center');
        const compact={elapsedSec:(Date.now()-soakStarted)/1000,phase:phase.name,frame:summary(sample.frames),enemyUpdate:summary(sample.enemyMs),bulletUpdate:summary(sample.bulletMs),
          ...Object.fromEntries(Object.entries(sample).filter(([key])=>!['frames','enemyMs','bulletMs','robotMs','errors'].includes(key))),rendererProcess:processMetric??null};
        samples.push(compact);fs.appendFileSync(path.join(output,'samples.jsonl'),JSON.stringify(compact)+'\n');
        writeJson('live.json',{pid:process.pid,rendererPid:win.webContents.getOSProcessId(),output,status:'running',latest:compact,errors:errors.length,restarts:lifecycle.length});
        // The controller completes drafts in under a second. A ten-second
        // opening or battle-clock stall must fail, never count as active soak.
        if(sample.scene==='ArenaScene' && !sample.state?.dead){
          if(clockState?.epoch!==sample.state?.epoch || clockState?.time!==sample.combatTime)clockState={epoch:sample.state?.epoch,time:sample.combatTime,since:Date.now()};
          const openingStall=sample.wave===0 && sample.combatTime===0 && sample.state.sceneAgeMs>=10000;
          const clockStall=Date.now()-clockState.since>=10000;
          if(openingStall||clockStall){
            recordError('combat-stall',JSON.stringify({openingStall,clockStall,sample:compact}));
            throw Error('Real-time battle failed to progress for ten seconds under automatic draft/control; see failure screenshot and state');
          }
        }else clockState=null;
        if(phase.name==='endless-late-build' && sample.wave>=1 && sample.activeMs>0 && sample.counts?.enemies>0)endlessCombatLevels.add(sample.level);
        for(const [name,reached] of [['peak-density',sample.counts?.enemies>=150],['peak-projectiles',sample.counts?.playerActive>=150],['dual-shadow-active',sample.counts?.rivals>=2]]){
          if(reached&&!capturedMilestones.has(name)){
            capturedMilestones.add(name);writeJson(`${name}.json`,compact);
            fs.writeFileSync(path.join(output,`${name}.png`),(await win.webContents.capturePage()).toPNG());
          }
        }
        const controlFile=path.join(output,'control.json');
        if(fs.existsSync(controlFile)){
          const control=JSON.parse(fs.readFileSync(controlFile,'utf8').replace(/^\uFEFF/,''));fs.unlinkSync(controlFile);
          if(control.action==='snapshot'){
            writeJson('requested-snapshot.json',compact);fs.writeFileSync(path.join(output,'requested-snapshot.png'),(await win.webContents.capturePage()).toPNG());
          }
        }
        const minute=Math.floor((Date.now()-soakStarted)/60000);
        if(minute!==previousMinute){
          previousMinute=minute;
          if(hashSource()!==sourceHash)recordError('source-change','Source hash changed during official soak');
          console.log(JSON.stringify({event:'minute',minute,phase:phase.name,frame:compact.frame,counts:compact.counts,heapMB:compact.heapBytes/1048576,errors:errors.length}));
        }
      }
      if(phase.name==='endless-late-build' && endlessCombatLevels.size<2)recordError('endless-coverage',`Expected actual wave/enemy activity in at least two endless levels, observed ${[...endlessCombatLevels]}`);
      const gc=await evaluate("({available:typeof window.gc==='function',before:performance.memory?.usedJSHeapSize??null,...(typeof window.gc==='function'?(window.gc(),{after:performance.memory?.usedJSHeapSize??null}):{})})");
      gcSamples.push({phase:phase.name,...gc});
      fs.writeFileSync(path.join(output,`${phase.name}.png`),(await win.webContents.capturePage()).toPNG());
    }
    // Directed terminal ordering checks are separate from real-time soak metrics.
    await evaluate('window.__soak.autonomous=false;void 0');
    const boundaries=[];
    for(const order of ['hero-first','core-first','enemy-death-core-before-clear-check','victory-first-then-core']){
      const before=await evaluate("(async()=>{const{MetaProgressionManager:M}=await import('/systems/MetaProgressionManager.ts');return M.getState().totalRuns})()");
      await evaluate("window.__sunlitQA.game.scene.getScenes(true)[0].scene.start('ArenaScene',{mode:'campaign',stageId:1,operativeId:'ranger',freshRun:true});void 0");
      await waitFor("window.__sunlitQA.game.scene.isActive('ArenaScene')",'boundary start');await delay(400);
      await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');while(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');void 0}");
      await waitFor("window.__sunlitQA.game.scene.getScene('ArenaScene').enemies.countActive(true)>0",'actual final enemy spawn');
      await evaluate(`{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');a.waveMgr.pendingSpawns=[];a.waveMgr.spawning=false;a.waveMgr.wave=a.waveMgr.totalWaves;a.waveMgr.waveActive=true;a.hero.invUntil=0;a.hero.shieldStacks=0;a.hero.dashing=false;a.defenseInvUntil=0;
        const defeatEnemies=()=>{for(const enemy of [...a.enemies.getChildren()])if(enemy.active)enemy.takeDamage(enemy.hp);};
        const clear=()=>{defeatEnemies();a.waveMgr.update(a.combatTime,1);};
        if(${JSON.stringify(order)}==='victory-first-then-core'){clear();a.damageDefense(a.defenseMaxHp+1);}else if(${JSON.stringify(order)}==='enemy-death-core-before-clear-check'){defeatEnemies();a.damageDefense(a.defenseMaxHp+1);a.waveMgr.update(a.combatTime,1);}else if(${JSON.stringify(order)}==='hero-first'){a.hero.takeDamage(a.hero.maxHp+1);clear();}else{a.damageDefense(a.defenseMaxHp+1);clear();}void 0;}`);
      await waitFor("window.__sunlitQA.game.scene.isActive('GameOverScene')",'boundary result');
      const after=await evaluate("(async()=>{const{MetaProgressionManager:M}=await import('/systems/MetaProgressionManager.ts');return{totalRuns:M.getState().totalRuns,victory:window.__sunlitQA.game.scene.getScene('GameOverScene').sys.settings.data.victory===true}})()");
      const result={order,runDelta:after.totalRuns-before,victory:after.victory,expectedVictory:order==='victory-first-then-core'};boundaries.push(result);
      if(result.runDelta!==1||result.victory!==result.expectedVictory)recordError('terminal-order',JSON.stringify(result));
    }
    const keys=[...new Set(samples.flatMap(sample=>Object.keys(sample.counts??{})))];
    const peaks=Object.fromEntries(keys.map(key=>[key,Math.max(...samples.map(sample=>sample.counts?.[key]??0))]));
    if(minutes>=20 && (samples.at(-1)?.elapsedSec<1200 || lifecycle.length!==10))recordError('coverage','Required 20-minute runtime or ten restart checks were not completed');
    if(peaks.enemies>160||peaks.playerAllocated>200||peaks.enemyAllocated>100)recordError('product-budget',JSON.stringify(peaks));
    const report={...metadata,realTimeSoakSeconds:samples.at(-1)?.elapsedSec,scope:'Real-time hidden offscreen Chromium renderer with automation/HP refills and legal capped build seeding. Not human playtesting, ordinary difficulty, minimum-spec certification or all browsers.',
      frameMs:summary(allFrames),enemyUpdateMs:summary(allEnemyMs),bulletUpdateMs:summary(allBulletMs),peaks,
      phases:Object.fromEntries([...phaseData].map(([key,value])=>[key,Object.fromEntries(Object.entries(value).map(([metric,values])=>[metric,summary(values)]))])),
      endlessCombatLevels:[...endlessCombatLevels],gcSamples,peakHeapBytes:Math.max(...samples.map(sample=>sample.heapBytes||0)),lifecycle,boundaries,errors};
    writeJson('report.json',report);writeJson('live.json',{status:errors.length?'failed':'complete',output,realTimeSoakSeconds:report.realTimeSoakSeconds,errors:errors.length,peaks,frameMs:report.frameMs});
    console.log(JSON.stringify({event:'complete',output,seconds:report.realTimeSoakSeconds,errors:errors.length,peaks,frameMs:report.frameMs}));
    clearTimeout(watchdog);app.exit(errors.length?1:0);
  }catch(error){
    recordError('fatal',error.stack||error);
    let state=null;
    try { state=await win?.webContents.executeJavaScript('window.__soak?.read(false)',true);if(win)fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG()); }catch(captureError){recordError('failure-capture',captureError.message);}
    const failure={status:'failed',errors,samples:samples.length,lastSample:samples.at(-1),state,lifecycle,output};
    writeJson('failure.json',failure);writeJson('live.json',failure);clearTimeout(watchdog);app.exit(1);
  }
});
