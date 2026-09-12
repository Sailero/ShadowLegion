// Isolated Electron/Chromium renderer QA. Uses its own temporary game profile.
// Run while the Vite dev server is available: electron scripts/native-smoke.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.cache', `render-qa-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
let window;
const timeout = setTimeout(() => { console.error('Renderer QA timed out'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({ width: 1024, height: 768, useContentSize: true, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true } });
    window.webContents.setFrameRate(60);
    window.webContents.on('console-message', event => {
      if (event.level === 'error' || event.level === 3) { errors.push(event.message); console.error(event.message); }
    });
    const evaluate = code => window.webContents.executeJavaScript(code, true);
    const snap = async name => {
      await pause(500);
      fs.writeFileSync(path.join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
      console.log(`Captured ${name}`);
    };
    await window.loadURL(process.env.SUNLIT_QA_URL || 'http://127.0.0.1:3000/?renderqa=1');
    for (let i = 0; i < 80; i++) {
      if (await evaluate("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))")) break;
      await pause(250);
    }
    if (!await evaluate("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))")) {
      await snap('startup-failure');
      console.error(await evaluate("JSON.stringify({title:document.title,body:document.body.innerText.slice(0,1000),qa:!!window.__sunlitQA,scenes:window.__sunlitQA?.game.scene.getScenes(false).map(s=>({key:s.scene.key,status:s.sys.settings.status}))})"));
      throw new Error('Menu did not start');
    }
    await snap('01-menu');
    for (const [name, scene, data] of [
      ['02-campaign', 'CampaignScene', {}],
      ['03-loadout', 'LoadoutScene', { mode: 'campaign', stageId: 1 }],
      ['04-workshop', 'WorkshopScene', {}],
      ['04b-research', 'WorkshopScene', {tab:'research'}],
      ['04c-specialization', 'WorkshopScene', {tab:'specialization',operativeId:'ranger'}],
      ['05-shadow-loadout', 'LoadoutScene', { mode: 'shadow', trialTier: 5 }],
    ]) {
      await evaluate(`window.__sunlitQA.game.scene.getScenes(true)[0].scene.start(${JSON.stringify(scene)}, ${JSON.stringify(data)}); void 0`);
      await snap(name);
    }
    await evaluate("localStorage.setItem('shadowlegion_tutorial_v4','done'); window.__sunlitQA.game.scene.getScenes(true)[0].scene.start('ArenaScene',{mode:'campaign',stageId:1,operativeId:'ranger',freshRun:true}); void 0");
    await snap('06-opening-draft');
    await evaluate("{ const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); if(a.upgrading) a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave'); }");
    await pause(3500);
    await snap('07-meadow-battle');
    const battle = await evaluate("{ const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); ({mode:a.mode,stageId:a.stage?.id,wave:a.waveMgr.wave,enemies:a.enemies.countActive(true),hp:a.hero.hp,core:a.defenseHp,gameTime:a.combatTime}) }");
    if (battle.stageId !== 1 || battle.wave !== 1 || battle.enemies < 1) throw new Error(`Campaign failed to begin: ${JSON.stringify(battle)}`);
    window.webContents.focus();
    await evaluate("window.__qaKeys=[]; window.addEventListener('keydown',e=>window.__qaKeys.push({key:e.key,code:e.code,keyCode:e.keyCode,prevented:e.defaultPrevented})); void 0");
    window.webContents.sendInputEvent({type:'mouseDown',x:600,y:420,button:'left',clickCount:1});
    window.webContents.sendInputEvent({type:'mouseUp',x:600,y:420,button:'left',clickCount:1});
    const startX = await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').hero.x");
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'D'});
    await pause(500);
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'D'});
    const movedX = await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').hero.x");
    if (movedX - startX < 10) throw new Error('Native D key did not move the focused hero');
    const shadowBefore = await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').shadow.getStatus().mode");
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'E'});
    await pause(80);
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'E'});
    await pause(300);
    if (await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').shadow.getStatus().mode") === shadowBefore) {
      console.error(await evaluate("JSON.stringify({keys:window.__qaKeys,scene:window.__sunlitQA.game.scene.getScenes(true).map(s=>s.scene.key),state:(()=>{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');return {paused:a.paused,upgrading:a.upgrading,dead:a.dead,tutorial:a.tutorial.isActive,commands:a.stageStats.commands,wave:a.waveMgr.wave}})()})"));
      throw new Error('Native E key did not command shadow');
    }
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
    await pause(100);
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
    const skillFeedback = await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').actionHint.text");
    if (!skillFeedback.includes('还差')) throw new Error('Native SPACE key did not reach skill input');
    // Exercise the real pause handler and ensure combat time does not advance.
    await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').togglePause()");
    const frozen = await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').combatTime");
    await pause(600);
    if (await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').combatTime") !== frozen) throw new Error('Paused combat clock advanced');
    await snap('08-pause');
    await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').scene.start('ArenaScene',{mode:'shadow',trialTier:5,operativeId:'ranger',freshRun:true}); void 0");
    await pause(400);
    for (let i = 0; i < 2; i++) {
      await evaluate("{ const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); if(a.upgrading) a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave'); }");
      await pause(250);
    }
    await pause(2100);
    await snap('09-shadow-duet');
    const trial = await evaluate("{ const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); ({mode:a.mode,wave:a.waveMgr.wave,rivals:a.enemies.getChildren().filter(e=>e.getData('shadowRival')).length}) }");
    if (trial.mode !== 'shadow' || trial.rivals !== 2 || trial.wave !== 1) throw new Error(`Shadow duel failed: ${JSON.stringify(trial)}`);
    // Accelerated flow verification: defeat the real rival entities, then choose
    // an actual upgrade. This does not measure player difficulty or clear time.
    for (let round = 1; round <= 3; round++) {
      await evaluate("{ const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); [...a.enemies.getChildren()].forEach(e=>e.takeDamage(e.hp)); }");
      await pause(300);
      if (round < 3) {
        await evaluate("{ const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); if(a.upgrading) a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave'); }");
        await pause(2600);
      }
    }
    await pause(2200);
    if (!await evaluate("window.__sunlitQA.game.scene.isActive('GameOverScene')")) throw new Error('Three-round shadow trial did not reach result scene');
    await snap('10-shadow-result');
    const report = { engine: process.versions, battle, trial, nativeInput: { movedPixels: movedX-startX, skillFeedback, shadowCommand: true }, errors, output,
      scope: 'Isolated Electron Chromium rendering, scene startup and pause. Not browser compatibility, human playtesting or balance proof.' };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) throw new Error(`${errors.length} renderer console errors`);
    clearTimeout(timeout); app.exit(0);
  } catch (error) {
    console.error(error.stack || error); fs.writeFileSync(path.join(output, 'errors.json'), JSON.stringify(errors, null, 2));
    clearTimeout(timeout); app.exit(1);
  }
});
